import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,sampleAnalysis} from './helpers.mjs';
import {callAI} from '../src/ai.js';
import {debateSources} from '../src/debate-sources.js';

const topic='학교에서 자유복을 허용해야 할까요?';
const topicAnalysis={...sampleAnalysis,ocrText:''};
function topicHarness(){return harness({ai:(_env,_mode,task)=>task==='analyzeTopic'?topicAnalysis:{allowed:true,reason:'',suggestion:'',flags:[]}});}

test('topic creation needs login, consent and a bounded topic, but no image or existing comment',async()=>{
  const h=topicHarness(),body={topic,consent:true};
  assert.equal((await h.request('/v1/analyze-topic',{method:'POST',user:null,body})).status,401);
  assert.equal((await h.request('/v1/analyze-topic',{method:'POST',body:{...body,consent:false}})).status,400);
  for(const value of ['', '가', '가'.repeat(501)])assert.equal((await h.request('/v1/analyze-topic',{method:'POST',body:{...body,topic:value}})).status,400);
  assert.equal((await h.request('/v1/analyze-topic',{method:'POST',body:{...body,context:'가'.repeat(1001)}})).status,400);
  assert.equal(h.calls.length,0);
  const result=await h.request('/v1/analyze-topic',{method:'POST',body:{...body,context:'학생의 활동성과 비용을 고려해주세요.'}});
  assert.equal(result.status,200);assert.equal(h.calls[0][2],'analyzeTopic');assert.deepEqual(h.calls[0][3],{topic,context:'학생의 활동성과 비용을 고려해주세요.'});
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM debates').get().n,0);
  assert.ok(!JSON.stringify(h.DB.sqlite.prepare('SELECT * FROM analyses').get()).includes(topic));
  assert.equal((await h.request('/v1/config')).data.capabilities.topicAnalysis,true);
  assert.equal((await h.request('/v1/analyze-topic',{method:'POST',body:{topic:'교복',consent:true}})).status,200);
});

test('a topic analysis binds publishing to its author and saves attribution across detail, list and retries',async()=>{
  const h=topicHarness();
  const result=await h.request('/v1/analyze-topic',{method:'POST',body:{topic,consent:true}});
  const sources=[{title:'사진의 원문 영상',url:'https://www.youtube.com/watch?v=abc123&utm_source=extension#comments'},{title:'학교생활 안내서 2026년판',url:''}];
  const body={...topicAnalysis,id:crypto.randomUUID(),analysisId:result.data.analysisId,sources};
  assert.equal((await h.request('/v1/debates',{method:'POST',user:'other',body})).status,400);
  const published=await h.request('/v1/debates',{method:'POST',body});assert.equal(published.status,201);
  const expected=[{title:sources[0].title,url:'https://www.youtube.com/watch?v=abc123'},sources[1]];
  assert.deepEqual(published.data.debate.sources,expected);
  assert.deepEqual((await h.request('/v1/debates/'+body.id,{user:null})).data.debate.sources,expected);
  assert.deepEqual((await h.request('/v1/debates',{user:null})).data.items[0].sources,expected);
  assert.deepEqual(JSON.parse(h.DB.sqlite.prepare('SELECT sources_json FROM debates').get().sources_json),expected);
  assert.deepEqual((await h.request('/v1/debates',{method:'POST',body:{...body,sources:[]}})).data.debate.sources,expected);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM debates').get().n,1);
});

test('source URLs are validated before AI or publication; source-free debates stay compatible',async()=>{
  for(const url of ['javascript:alert(1)','file:///etc/passwd','http://127.0.0.1/admin','https://localhost/private','https://user:secret@example.com/','https://example.com/?api_key=secret'])assert.throws(()=>debateSources([{title:'원문',url}]));
  assert.throws(()=>debateSources(Array.from({length:11},()=>({title:'출처',url:''}))));
  assert.throws(()=>debateSources([{title:'',url:''}]));
  assert.deepEqual(debateSources([{url:'https://example.com/article'},{title:'중복',url:'https://example.com/article'}]),[{title:'example.com',url:'https://example.com/article'}]);
  const h=harness(),old=await h.publish();assert.deepEqual(old.sources,[]);
  const analysis=await h.request('/v1/analyze-text',{method:'POST',body:{content:'학교에서 휴대전화 사용을 허용할지 제한할지 토론하고 싶어요.',consent:true}});
  const previousCalls=h.calls.length;
  const invalid=await h.request('/v1/debates',{method:'POST',body:{...sampleAnalysis,id:crypto.randomUUID(),analysisId:analysis.data.analysisId,sources:[{url:'javascript:alert(1)'}]}});
  assert.equal(invalid.status,400);assert.equal(h.calls.length,previousCalls);assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM debates').get().n,1);
});

test('an unclear topic creates no analysis and refunds the member allowance',async()=>{
  const h=harness({ai:()=>({...topicAnalysis,readable:false})});
  const result=await h.request('/v1/analyze-topic',{method:'POST',body:{topic,consent:true}});
  assert.equal(result.status,422);assert.equal(result.data.code,'TOPIC_REQUIRED');
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM analyses').get().n,0);
  assert.equal(h.DB.sqlite.prepare("SELECT count FROM quotas WHERE key LIKE 'day:%:text:reader'").get().count,0);
});

test('both AI providers get the topic-specific balanced drafting instructions and no images',async()=>{
  const env={GEMINI_API_KEY:'test',OPENROUTER_API_KEY:'test'};
  for(const mode of ['free','paid']){
    let sent;
    const fetcher=async(_url,options)=>{sent=JSON.parse(options.body);return Response.json(mode==='free'?{candidates:[{content:{parts:[{text:JSON.stringify(topicAnalysis)}]}}]}:{choices:[{message:{content:JSON.stringify(topicAnalysis)}}]});};
    const result=await callAI(env,mode,'analyzeTopic',{topic,context:'비용과 편의성',images:[{data:'NEVER_SEND'}]},fetcher);
    assert.equal(result.title,topicAnalysis.title);
    assert.ok(JSON.stringify(sent).includes(topic));assert.ok(!JSON.stringify(sent).includes('NEVER_SEND'));
    const prompt=mode==='free'?sent.systemInstruction.parts[0].text:sent.messages[0].content;
    assert.ok(prompt.includes('사진이나 기존 댓글은 필요하지 않습니다'));assert.ok(prompt.includes('확인되지 않은 사건·수치·논문·통계·URL·출처를 만들지 마세요'));
  }
  await assert.rejects(()=>callAI(env,'free','analyzeTopic',{topic},async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({...topicAnalysis,sources:['invented']})}]}}]})),error=>error.code==='AI_RESPONSE_INVALID');
});
