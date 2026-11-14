import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,sampleTextAnalysis} from './helpers.mjs';
import {callAI} from '../src/ai.js';
import {ApiError} from '../src/security.js';
const content='학교에서 휴대전화는 긴급 연락을 위해 허용해야 한다는 의견과 수업 집중을 위해 제한해야 한다는 의견이 있어요.';

test('text import requires the existing website origin, login, explicit consent and bounded content',async()=>{
  const h=harness(),body={content,context:'수업 중 휴대전화 사용',consent:true};
  for(const path of ['/v1/analyze-text','/v1/rewrite']){
    assert.equal((await h.request(path,{method:'POST',user:null,body})).status,401);
    assert.equal((await h.request(path,{method:'POST',origin:'https://www.youtube.com',body})).status,403);
    assert.equal((await h.request(path,{method:'POST',body:{...body,consent:false}})).status,400);
    assert.equal((await h.request(path,{method:'POST',body:{...body,context:'가'.repeat(1001)}})).status,400);
  }
  assert.equal((await h.request('/v1/analyze-text',{method:'POST',body:{...body,content:'짧음'}})).status,400);
  assert.equal((await h.request('/v1/analyze-text',{method:'POST',body:{...body,content:'가'.repeat(8001)}})).status,400);
  assert.equal(h.calls.length,0);
});

test('text analysis produces a same-account publishable record without storing source text or source URLs',async()=>{
  const h=harness(),body={content,consent:true,sourceUrl:'https://example.test/private?token=secret'};
  const analysis=await h.request('/v1/analyze-text',{method:'POST',body});assert.equal(analysis.status,200);
  assert.deepEqual(analysis.data.agreeReasons,sampleTextAnalysis.agreeReasons);
  assert.deepEqual(analysis.data.preview,sampleTextAnalysis.preview);
  assert.equal(h.calls[0][2],'analyzeText');assert.deepEqual(h.calls[0][3],{content,context:''});
  const stored=h.DB.sqlite.prepare('SELECT * FROM analyses').get();
  assert.deepEqual(Object.keys(stored).sort(),['id','user_id','created_at','expires_at'].sort());
  const draft={...sampleTextAnalysis,id:crypto.randomUUID(),analysisId:analysis.data.analysisId};
  assert.equal((await h.request('/v1/debates',{method:'POST',user:'other-account',body:draft})).status,400);
  assert.equal((await h.request('/v1/debates',{method:'POST',body:draft})).status,201);
  assert.equal((await h.request('/v1/debates',{method:'POST',body:draft})).status,200);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM debates').get().n,1);
});

test('insufficient text context does not create an analysis and refunds the member allowance',async()=>{
  const h=harness({ai:()=>({...sampleTextAnalysis,readable:false,limitations:'서로 다른 주장이 담긴 댓글을 더 추가해주세요.'})});
  const response=await h.request('/v1/analyze-text',{method:'POST',body:{content,consent:true}});
  assert.equal(response.status,422);assert.equal(response.data.code,'CONTEXT_REQUIRED');
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM analyses').get().n,0);
  assert.equal(h.DB.sqlite.prepare("SELECT count FROM quotas WHERE key LIKE 'day:%:text:reader'").get().count,0);
});

test('rewrite is a metered suggestion only and never creates a vote, comment, debate or analysis',async()=>{
  const feedback={allowed:false,reason:'상대를 비하하는 표현이 있어요.',suggestion:'그 의견에는 동의하기 어렵습니다. 근거를 설명해주세요.',flags:['비하']};
  const h=harness({ai:()=>feedback});
  const response=await h.request('/v1/rewrite',{method:'POST',body:{content:'너 진짜 멍청하구나. 그런 주장에는 동의 못 하겠다.',consent:true}});
  assert.equal(response.status,200);assert.deepEqual(response.data.feedback,feedback);assert.equal(h.calls[0][2],'rewrite');
  for(const table of ['opinions','votes','debates','analyses'])assert.equal(h.DB.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
  assert.equal(h.DB.sqlite.prepare("SELECT count FROM quotas WHERE key LIKE 'day:%:text:reader'").get().count,1);
});

test('extension AI failures preserve existing quotas and stop at the global limit',async()=>{
  const h=harness({env:{AI_DAILY_LIMIT:'1'},ai:()=>{throw new ApiError(503,'AI_TIMEOUT','AI 응답 시간이 초과됐어요.');}});
  const body={content,consent:true};
  assert.equal((await h.request('/v1/rewrite',{method:'POST',body})).status,503);
  assert.equal(h.DB.sqlite.prepare("SELECT count FROM quotas WHERE key LIKE 'day:%:text:reader'").get().count,0);
  assert.equal((await h.request('/v1/analyze-text',{method:'POST',body})).status,429);
  assert.equal(h.calls.length,1);
});

test('both AI providers use a text-only schema; malformed extra fields are rejected',async()=>{
  const env={GEMINI_API_KEY:'gemini-secret',OPENROUTER_API_KEY:'router-secret'};
  for(const mode of ['free','paid']){
    let request;
    const fetcher=async(_url,options)=>{request=JSON.parse(options.body);return Response.json(mode==='free'?{candidates:[{content:{parts:[{text:JSON.stringify(sampleTextAnalysis)}]}}]}:{choices:[{message:{content:JSON.stringify(sampleTextAnalysis)}}]});};
    const result=await callAI(env,mode,'analyzeText',{content,context:'수업',images:[{data:'must-not-send'}]},fetcher);
    assert.equal(result.title,sampleTextAnalysis.title);assert.ok(!JSON.stringify(request).includes('must-not-send'));
    const schema=mode==='free'?request.generationConfig.responseFormat.text.schema:request.response_format.json_schema.schema;
    assert.ok(schema.required.includes('limitations'));assert.ok(schema.required.includes('agreeReasons'));assert.ok(schema.required.includes('preview'));
  }
  await assert.rejects(()=>callAI(env,'free','analyzeText',{content},async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({...sampleTextAnalysis,agreeReasons:['가'.repeat(251)]})}]}}]})),error=>error.code==='AI_RESPONSE_INVALID');
  await assert.rejects(()=>callAI(env,'free','analyzeText',{content},async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({...sampleTextAnalysis,analysisId:'forged-id'})}]}}]})),error=>error.code==='AI_RESPONSE_INVALID');
  await assert.rejects(()=>callAI(env,'free','analyzeText',{content},async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({...sampleTextAnalysis,preview:{...sampleTextAnalysis.preview,issues:['가'.repeat(41)]}}) }]}}]})),error=>error.code==='AI_RESPONSE_INVALID');
});
