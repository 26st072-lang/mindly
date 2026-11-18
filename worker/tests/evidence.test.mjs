import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers.mjs';
import {evidenceURL,inspectEvidence,publicAddress,publicDNS,parseMetadata} from '../src/evidence-metadata.js';
import {findEvidence,evidenceModel} from '../src/evidence-ai.js';
const source={url:'https://www.who.int/news/report',title:'실제 자료',publisher:'WHO',publishedAt:'2025-06-01',type:'report',verification:'unverified',notice:'원문 미검증'};
const input={content:'휴대전화 사용 제한과 학습 집중 사이의 관계를 살펴보고 싶어요.',context:'학교 휴대전화 사용',consent:true};
test('URL inspection blocks private addresses, credentials, redirect pivots and mixed DNS answers',async()=>{
  for(const url of ['http://127.0.0.1/','http://2130706433','http://[::1]/','http://[::ffff:127.0.0.1]/','http://localhost','http://metadata.google.internal/','https://user:pass@who.int/','https://who.int:8080/','file:///etc/passwd','https://who.int/?api_key=secret'])assert.throws(()=>evidenceURL(url));
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.0.1','::1','fc00::1','fe80::1','::ffff:10.0.0.1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  await assert.rejects(()=>publicDNS('who.int',async url=>Response.json({Status:0,Answer:url.endsWith('AAAA')?[]:[{type:1,data:'8.8.8.8'},{type:1,data:'10.0.0.1'}]})),e=>e.code==='EVIDENCE_URL_UNSAFE');
  let calls=0;const unverified=await inspectEvidence('https://attacker.example/data',{fetcher:async()=>{calls++;throw Error();}});assert.equal(calls,0);assert.equal(unverified.verification,'unverified');
  await assert.rejects(()=>inspectEvidence(source.url,{resolveDNS:async()=>{},fetcher:async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}})}),e=>e.code==='EVIDENCE_URL_UNSAFE');
});
test('metadata uses publisher fields, preserves unknown dates and marks inaccessible original content',async()=>{
  const html='<title>Fallback</title><meta property="og:title" content="통계 &amp; 보고서"><meta property="og:site_name" content="연구기관"><meta property="article:published_time" content="2025-06-01"><script type="application/ld+json">{"@type":"Report"}</script><main>'+('확인 가능한 본문입니다. '.repeat(30))+'</main>';
  const metadata=parseMetadata(html,new URL(source.url));assert.equal(metadata.title,'통계 & 보고서');assert.equal(metadata.publisher,'연구기관');assert.equal(metadata.publishedAt,'2025-06-01');assert.equal(metadata.verification,'excerpt_checked');
  const blocked=await inspectEvidence(source.url,{resolveDNS:async()=>{},fetcher:async()=>new Response('blocked',{status:403})});assert.equal(blocked.verification,'unverified');assert.equal(blocked.publishedAt,null);
});
test('AI accepts only real grounding catalog IDs, keeps contrary evidence and never promotes unread originals',async()=>{
  let call=0;const models=[];
  const result=await findEvidence({GEMINI_API_KEY:'secret'},input,async()=>{},{inspect:async url=>({...source,url}),generate:async request=>{
    models.push(request.model);call++;
    if(call===1)return {text:JSON.stringify({claims:[{text:'학습 집중의 변화',queryKo:'휴대전화 학교 집중 연구',queryEn:'school phone ban learning study'}]})};
    if(call===2){assert.ok(request.config.tools[0].googleSearch);assert.equal(request.config.responseMimeType,undefined);return {text:'Invented https://fake.example/paper',candidates:[{groundingMetadata:{groundingChunks:[{web:{uri:source.url,title:source.title}},{web:{uri:'https://www.who.int/news/counter',title:'반대 근거'}}],webSearchQueries:['actual query'],searchEntryPoint:{renderedContent:'<div>Google search suggestions</div>'}}}]};}
    return {text:JSON.stringify({sources:[{id:'invented',summary:'made up',relation:'supports',trust:'high',relevance:100},{id:'1',summary:'일부 관계를 다룹니다.',relation:'partial',relationReason:'조건이 달라요.',trust:'high',trustReason:'원문 미확인',relevance:80},{id:'2',summary:'반대 결과입니다.',relation:'contradicts',relationReason:'반대되는 결과',trust:'high',trustReason:'원문 미확인',relevance:70}]})};
  }});
  assert.equal(result.sources.length,2);assert.ok(result.sources.every(s=>s.trust==='unverified'));assert.equal(result.sources[1].relation,'contradicts');assert.ok(!JSON.stringify(result).includes('fake.example'));assert.ok(result.searchSuggestions.includes('Google'));
  assert.ok(models.every(model=>model.startsWith('gemini-2.5-')));
  assert.equal(evidenceModel({},Date.UTC(2026,11,1)),'gemini-2.5-flash-lite');assert.throws(()=>evidenceModel({EVIDENCE_GEMINI_MODEL:'gemini-3.5-flash-lite'}));
});
test('search requires consent, caches per account, streams real phases and persists authorized receipts in replies and edits',async()=>{
  let searches=0;const h=harness({evidenceSearch:async(env,body,phase)=>{searches++;for(const p of ['analyzing','searching','reviewing'])await phase(p);return {claims:[],sources:[source],provider:'google'};},evidenceInspect:async()=>source});
  assert.equal((await h.request('/v1/evidence/search',{method:'POST',body:input,user:null})).status,401);
  assert.equal((await h.request('/v1/evidence/search',{method:'POST',body:{...input,consent:false}})).status,400);
  const first=await h.request('/v1/evidence/search',{method:'POST',body:input});assert.deepEqual(first.events.map(e=>e.phase),['analyzing','searching','reviewing','done']);
  const cached=await h.request('/v1/evidence/search',{method:'POST',body:input});assert.equal(cached.data.cached,true);assert.equal(searches,1);
  assert.equal((await h.request('/v1/evidence/jobs/'+first.data.jobId,{user:'other'})).status,404);
  const debate=await h.publish(),id=crypto.randomUUID(),receipt=first.data.sources[0].id;
  const body={requestId:id,content:input.content,stance:'agree',evidenceIds:[receipt]};
  const posted=await h.request(`/v1/debates/${debate.id}/opinions`,{method:'POST',body});assert.equal(posted.status,201);assert.equal(posted.data.opinion.evidence[0].url,source.url);
  const retry=await h.request(`/v1/debates/${debate.id}/opinions`,{method:'POST',body});assert.equal(retry.status,200);
  assert.equal((await h.request(`/v1/debates/${debate.id}/opinions`,{method:'POST',body:{...body,evidenceIds:[]}})).status,409);
  const foreign=await h.request(`/v1/debates/${debate.id}/opinions`,{method:'POST',user:'other',body:{...body,requestId:crypto.randomUUID()}});assert.equal(foreign.data.code,'EVIDENCE_INVALID');
  const reply=await h.request(`/v1/debates/${debate.id}/opinions`,{method:'POST',body:{...body,requestId:crypto.randomUUID(),parentId:id}});assert.equal(reply.data.opinion.evidence.length,1);
  const changed=await h.request(`/v1/debates/${debate.id}/opinions/${id}`,{method:'PATCH',body:{content:body.content,revision:0,evidenceIds:[]}});assert.deepEqual(changed.data.opinion.evidence,[]);assert.equal(changed.data.opinion.revision,1);
  const deleted=await h.request(`/v1/debates/${debate.id}/opinions/${reply.data.opinion.id}`,{method:'DELETE',body:{revision:0}});assert.deepEqual(deleted.data.opinion.evidence,[]);
});
test('search errors and site limits fail closed without paid fallbacks or loss of existing comments',async()=>{
  const h=harness({env:{EVIDENCE_SITE_DAILY_LIMIT:'1'},evidenceSearch:async()=>{throw Object.assign(Error('sensitive upstream detail'),{status:429});}});
  const failed=await h.request('/v1/evidence/search',{method:'POST',body:input});assert.equal(failed.data.code,'EVIDENCE_API_QUOTA');assert.ok(!JSON.stringify(failed.data).includes('sensitive'));
  const limited=await h.request('/v1/evidence/search',{method:'POST',body:{...input,content:input.content+' 다른 주장'}});assert.equal(limited.status,429);assert.equal(limited.data.code,'EVIDENCE_RATE_LIMIT');
  assert.equal(h.calls.length,0);
});
test('identical concurrent searches share one job, cache expiry allows renewal, and manual previews reuse metadata',async()=>{
  let release,started,searches=0,inspections=0;const blocked=new Promise(resolve=>release=resolve),begun=new Promise(resolve=>started=resolve);
  const h=harness({evidenceSearch:async(env,input,phase)=>{searches++;await phase('analyzing');started();await blocked;return {claims:[],sources:[source],provider:'google'};},evidenceInspect:async()=>{inspections++;return source;}});
  const running=h.request('/v1/evidence/search',{method:'POST',body:input});await begun;
  const duplicate=await h.request('/v1/evidence/search',{method:'POST',body:input});assert.equal(duplicate.status,202);assert.equal(duplicate.data.phase,'analyzing');assert.equal(searches,1);
  release();const done=await running;const polled=await h.request('/v1/evidence/jobs/'+done.data.jobId);assert.equal(polled.data.phase,'done');
  await h.request('/v1/evidence/url',{method:'POST',body:{url:'https://www.who.int/news/another'}});await h.request('/v1/evidence/url',{method:'POST',body:{url:source.url}});assert.equal(inspections,1);
  h.DB.sqlite.prepare('UPDATE evidence_jobs SET expires_at=0').run();await h.request('/v1/evidence/search',{method:'POST',body:input});assert.equal(searches,2);
});
test('academic fallback uses actual Crossref records, multilingual queries and analysis without a Google Search tool',async()=>{
  const queries=[],requests=[];let call=0;
  const result=await findEvidence({GEMINI_API_KEY:'secret'}, {...input,provider:'academic'},async()=>{}, {fetcher:async url=>{queries.push(new URL(url).searchParams.get('query.bibliographic'));return Response.json({message:{items:[{DOI:'10.1000/existing',title:['Actual API title'],publisher:'Actual publisher',published:{'date-parts':[[2025,4,1]]},abstract:'A supplied abstract'}]}});},generate:async request=>{requests.push(request);return {text:JSON.stringify(++call===1?{claims:[{text:'수면과 집중',queryKo:'청소년 수면 집중',queryEn:'adolescent sleep concentration'}]}:{sources:[{id:'1',summary:'서지 정보에 포함된 연구',relation:'related',relationReason:'전체 내용 미확인',trust:'high',trustReason:'원문 미검증',relevance:70}]})};}});
  assert.deepEqual(queries,['adolescent sleep concentration','청소년 수면 집중']);assert.ok(requests.every(r=>r.model==='gemini-3.5-flash-lite'&&!r.config.tools));assert.equal(result.sources[0].url,'https://doi.org/10.1000/existing');assert.equal(result.sources[0].publishedAt,'2025-04-01');assert.equal(result.sources[0].trust,'unverified');assert.equal(result.provider,'crossref');
});
