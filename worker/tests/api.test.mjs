import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,image,sampleAnalysis,ORIGIN} from './helpers.mjs';
import {ApiError} from '../src/security.js';

test('mutations require a verified session and allowed origin before calling AI',async()=>{
  const h=harness();
  assert.equal((await h.request('/v1/analyze',{method:'POST',user:null,body:{}})).status,401);
  assert.equal((await h.request('/v1/analyze',{method:'POST',origin:'https://evil.test',body:{}})).status,403);
  assert.equal((await h.request('/v1/analyze',{method:'POST',origin:null,body:{}})).status,403);
  assert.equal(h.calls.length,0);
  const config=await h.request('/v1/config',{user:null});assert.equal(config.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  assert.ok(!JSON.stringify(config.data).includes('test-gemini-key'));
});
test('only an allowlisted Firebase UID changes the global provider and unconfigured paid mode is refused',async()=>{
  const h=harness();
  assert.equal((await h.request('/v1/admin/settings',{method:'PATCH',body:{mode:'paid',userId:'admin'}})).status,403);
  const changed=await h.request('/v1/admin/settings',{method:'PATCH',user:'admin',body:{mode:'paid'}});assert.equal(changed.data.mode,'paid');
  assert.equal((await h.request('/v1/config',{user:null})).data.mode,'paid');
  h.env.OPENROUTER_API_KEY='';
  assert.equal((await h.request('/v1/admin/settings',{method:'PATCH',user:'admin',body:{mode:'paid'}})).status,409);
});
test('image analysis requires consent and validates file bytes; raw OCR and screenshots are not persisted',async()=>{
  const h=harness();
  assert.equal((await h.request('/v1/analyze',{method:'POST',body:{images:[image]}})).status,400);
  assert.equal((await h.request('/v1/analyze',{method:'POST',body:{images:[{mimeType:'image/png',data:btoa('not an image at all')}],consent:true}})).status,400);
  const result=await h.request('/v1/analyze',{method:'POST',body:{images:[image],consent:true}});assert.equal(result.status,200);
  const stored=h.DB.sqlite.prepare('SELECT * FROM analyses').get();assert.deepEqual(Object.keys(stored).sort(),['id','user_id','created_at','expires_at'].sort());
  assert.equal(h.calls.length,1);
});
test('unreadable photos cannot become a publishable analysis',async()=>{
  const h=harness({ai:()=>({...sampleAnalysis,readable:false})});
  assert.equal((await h.request('/v1/analyze',{method:'POST',body:{images:[image],consent:true}})).status,422);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM analyses').get().n,0);
});
test('publishing requires the submitting user’s unexpired analysis and validates edited draft',async()=>{
  const h=harness();const result=await h.request('/v1/analyze',{method:'POST',body:{images:[image],consent:true}});
  const body={...sampleAnalysis,id:crypto.randomUUID(),analysisId:result.data.analysisId};
  assert.equal((await h.request('/v1/debates',{method:'POST',user:'other',body})).status,400);
  assert.equal((await h.request('/v1/debates',{method:'POST',body:{...body,title:'x'}})).status,400);
  assert.equal((await h.request('/v1/debates',{method:'POST',body})).status,201);
  assert.equal((await h.request('/v1/debates',{method:'POST',body})).status,200);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM debates').get().n,1);
});
test('rejected wording creates neither an opinion nor a vote; manual revision is rechecked and votes remain unique',async()=>{
  let reject=false;const h=harness({ai:(_env,_mode,task)=>task==='analyze'?sampleAnalysis:reject?{allowed:false,reason:'상대를 조롱하는 표현이에요.',suggestion:'저는 다른 이유로 반대해요.',flags:['조롱']}:{allowed:true,reason:'',suggestion:'',flags:[]}});
  const debate=await h.publish();reject=true;
  const bad={requestId:crypto.randomUUID(),stance:'agree',content:'그렇게 생각하는 사람은 우스워요'};
  const rejected=await h.request('/v1/debates/'+debate.id+'/opinions',{method:'POST',body:bad});assert.equal(rejected.status,422);assert.ok(rejected.data.feedback.suggestion);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM votes').get().n,0);assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM opinions').get().n,0);
  reject=false;const good={requestId:crypto.randomUUID(),stance:'agree',content:'스스로 책임지고 사용하는 연습이 필요하다고 생각해요.'};
  const accepted=await h.request('/v1/debates/'+debate.id+'/opinions',{method:'POST',body:good});assert.equal(accepted.status,201);assert.equal(accepted.data.debate.agreeCount,1);
  const calls=h.calls.length;assert.equal((await h.request('/v1/debates/'+debate.id+'/opinions',{method:'POST',body:good})).status,200);assert.equal(h.calls.length,calls);
  const changed=await h.request('/v1/debates/'+debate.id+'/opinions',{method:'POST',body:{...good,requestId:crypto.randomUUID(),stance:'disagree',content:'수업 집중을 위해 쉬는 시간에만 허용하면 좋겠어요.'}});
  assert.equal(changed.data.debate.agreeCount,0);assert.equal(changed.data.debate.disagreeCount,1);assert.equal(changed.data.debate.commentCount,2);
});
test('AI errors fail closed and never publish an unchecked opinion',async()=>{
  let fail=false;const h=harness({ai:(_env,_mode,task)=>{if(fail)throw new ApiError(503,'AI_UNAVAILABLE','AI 검사를 완료하지 못했어요.');return task==='analyze'?sampleAnalysis:{allowed:true,reason:'',suggestion:'',flags:[]};}});
  const debate=await h.publish();fail=true;
  const result=await h.request('/v1/debates/'+debate.id+'/opinions',{method:'POST',body:{requestId:crypto.randomUUID(),stance:'agree',content:'서로를 존중하며 이야기하면 좋겠어요.'}});
  assert.equal(result.status,503);assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM opinions').get().n,0);
});
test('public DTOs contain no account identifiers; archives and deletions enforce ownership',async()=>{
  const h=harness(),debate=await h.publish('private-author-uid');
  const first=await h.request('/v1/debates/'+debate.id+'/heart',{method:'PUT',body:{hearted:true}});assert.equal(first.data.debate.heartCount,1);
  assert.equal((await h.request('/v1/debates/'+debate.id+'/heart',{method:'PUT',body:{hearted:true}})).data.debate.heartCount,1);
  const publicResult=await h.request('/v1/debates',{user:null});assert.ok(!JSON.stringify(publicResult.data).includes('private-author-uid'));assert.ok(!JSON.stringify(publicResult.data).includes('user_id'));
  assert.equal((await h.request('/v1/me?tab=posts')).data.items.length,0);assert.equal((await h.request('/v1/me?tab=hearts')).data.items.length,1);
  assert.equal((await h.request('/v1/debates/'+debate.id,{method:'DELETE'})).status,403);
  assert.equal((await h.request('/v1/debates/'+debate.id,{method:'DELETE',user:'private-author-uid'})).status,200);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM hearts').get().n,0);
});
test('a global AI quota stops calls rather than silently switching to a paid provider',async()=>{
  const h=harness({env:{AI_DAILY_LIMIT:'1'}});
  assert.equal((await h.request('/v1/analyze',{method:'POST',body:{images:[image],consent:true}})).status,200);
  assert.equal((await h.request('/v1/analyze',{method:'POST',user:'second',body:{images:[image],consent:true}})).status,429);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0][1],'free');
});
