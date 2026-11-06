import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {verifyFirebaseUser,anonymousAlias} from '../src/security.js';
import {callAI,moderate,providerInfo} from '../src/ai.js';
import {sampleAnalysis} from './helpers.mjs';
test('Firebase verification checks signature, project, expiry and rejects anonymous auth',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='test-key';
  const keys=createLocalJWKSet({keys:[jwk]}),env={FIREBASE_PROJECT_ID:'mindly1-52859'};
  const token=async overrides=>new SignJWT({auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'password'},...overrides}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('actual-user').setIssuer('https://securetoken.google.com/mindly1-52859').setAudience('mindly1-52859').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const request=jwt=>new Request('https://worker.test',{headers:{Authorization:'Bearer '+jwt}});
  assert.equal((await verifyFirebaseUser(request(await token()),env,keys)).uid,'actual-user');
  await assert.rejects(()=>verifyFirebaseUser(request('forged-token'),env,keys),error=>error.status===401);
  const valid=await token();
  await assert.rejects(()=>verifyFirebaseUser(request(valid),{FIREBASE_PROJECT_ID:'other-project'},keys),error=>error.status===401);
  const anonymous=await token({firebase:{sign_in_provider:'anonymous'}});
  await assert.rejects(()=>verifyFirebaseUser(request(anonymous),env,keys),error=>error.status===401);
  const expired=await new SignJWT({auth_time:1}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('actual-user').setIssuer('https://securetoken.google.com/mindly1-52859').setAudience('mindly1-52859').setIssuedAt(1).setExpirationTime(2).sign(privateKey);
  await assert.rejects(()=>verifyFirebaseUser(request(expired),env,keys),error=>error.status===401);
});
test('anonymous aliases are stable only within one debate and never expose the UID',async()=>{
  const a=await anonymousAlias('secret-user','debate-1','a-secret-at-least-24-characters');
  assert.equal(a,await anonymousAlias('secret-user','debate-1','a-secret-at-least-24-characters'));
  assert.notEqual(a,await anonymousAlias('secret-user','debate-2','a-secret-at-least-24-characters'));
  assert.ok(!a.includes('secret-user'));
});
test('Gemini and OpenRouter send keys only in upstream headers and request constrained JSON',async()=>{
  const env={GEMINI_API_KEY:'gemini-secret',OPENROUTER_API_KEY:'router-secret',GEMINI_MODEL:'gemini-3.5-flash-lite',OPENROUTER_MODEL:'openai/gpt-6-luna'};
  for(const mode of ['free','paid']){
    let captured;
    const result=await callAI(env,mode,'analyze',{images:[]},async(url,options)=>{captured={url,options,body:JSON.parse(options.body)};return Response.json(mode==='free'?{candidates:[{content:{parts:[{text:JSON.stringify(sampleAnalysis)}]}}]}:{choices:[{message:{content:JSON.stringify(sampleAnalysis)}}]});});
    assert.equal(result.title,sampleAnalysis.title);assert.ok(!captured.url.includes('secret'));assert.ok(!captured.options.body.includes('secret'));
    if(mode==='paid'){assert.equal(captured.body.model,'openai/gpt-6-luna');assert.equal(captured.body.response_format.type,'json_schema');}
    else {assert.equal(captured.options.headers['x-goog-api-key'],'gemini-secret');assert.equal(captured.body.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');assert.equal(captured.body.generationConfig.responseFormat.text.schema.type,'object');}
  }
});
test('malformed AI decisions and quota errors never become allowed content',async()=>{
  const env={GEMINI_API_KEY:'test',GEMINI_MODEL:'gemini-3.5-flash-lite'};
  await assert.rejects(()=>callAI(env,'free','moderate',{content:'안녕하세요'},async()=>Response.json({candidates:[{content:{parts:[{text:'{"allowed":"true"}'}]}}]})),error=>error.status===503);
  await assert.rejects(()=>callAI(env,'free','moderate',{content:'안녕하세요'},async()=>new Response('',{status:429})),error=>error.status===429);
});
test('legitimate Korean words are reviewed in context instead of blocked by matching part of a word',async()=>{
  let reviewed='';
  await moderate({},'free','도시 발전과 이번 논쟁의 시발점을 함께 살펴보면 좋겠어요.','토론',async(_env,_mode,_task,input)=>{reviewed=input.content;return {allowed:true,reason:'',suggestion:'',flags:[]};});
  assert.ok(reviewed.includes('시발점'));
});
test('provider restrictions, key problems and retired models have distinct safe errors',async()=>{
  const env={GEMINI_API_KEY:'private-key',GEMINI_MODEL:'gemini-3.5-flash-lite'};
  for(const [status,message,code] of [[403,'The Gemini API free tier is not available for this project.','GEMINI_FREE_TIER_UNAVAILABLE'],[404,'Model is not available for new users.','AI_MODEL_UNAVAILABLE'],[400,'API key not valid.','AI_KEY_INVALID'],[403,'This API is disabled.','AI_PERMISSION_DENIED']]){
    await assert.rejects(()=>callAI(env,'free','moderate',{content:'안녕하세요'},async()=>Response.json({error:{message}},{status})),error=>error.code===code&&!error.message.includes('private-key'));
  }
});
test('a secret accidentally placed in a model setting is never returned in metadata',()=>{
  const info=providerInfo({OPENROUTER_MODEL:'sk-or-v1-private-model-setting',OPENROUTER_API_KEY:'test'},'paid');
  assert.equal(info.model,'openai/gpt-6-luna');assert.ok(!JSON.stringify(info).includes('private-model-setting'));
});

test('AI failures distinguish request, provider, response, connection and timeout stages without exposing upstream details',async()=>{
  const env={GEMINI_API_KEY:'private-key',GEMINI_MODEL:'gemini-3.5-flash-lite'};
  const failed=(status)=>async()=>Response.json({error:{message:'private-key with internal upstream details'}},{status});
  const cases=[
    [failed(400),'AI_REQUEST_INVALID'],
    [failed(503),'AI_PROVIDER_UNAVAILABLE'],
    [async()=>{throw new TypeError('private-key network failure');},'AI_CONNECTION_FAILED'],
    [async()=>{throw new DOMException('private-key timeout','TimeoutError');},'AI_TIMEOUT'],
    [async()=>new Response('not JSON'),'AI_RESPONSE_INVALID'],
    [async()=>Response.json({candidates:[{content:{parts:[{text:'{"allowed":"true"}'}]}}]}),'AI_RESPONSE_INVALID'],
    [async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{"allowed":'}]}}]}),'AI_RESPONSE_INCOMPLETE'],
    [async()=>Response.json({promptFeedback:{blockReason:'SAFETY'}}),'AI_RESPONSE_BLOCKED'],
  ];
  for(const [fetcher,code] of cases){
    await assert.rejects(()=>callAI(env,'free','moderate',{content:'안녕하세요'},fetcher),error=>error.code===code&&!JSON.stringify(error).includes('private-key')&&!error.message.includes('internal'));
  }
});
