import test from 'node:test';
import assert from 'node:assert/strict';
import {callAI} from '../src/ai.js';
import {harness,sampleAnalysis} from './helpers.mjs';

const informal='저는 교복이 불편해서 반대해.',polite='저는 교복이 불편해서 반대합니다.';
const feedback={allowed:false,reason:'서로 존댓말을 사용해주세요.',suggestion:polite,flags:['반말']};
test('both providers send the same polite-speech rule to moderation and the expression helper',async()=>{
  const env={GEMINI_API_KEY:'test',OPENROUTER_API_KEY:'test'};
  for(const mode of ['free','paid'])for(const task of ['moderate','rewrite']){
    let prompt;
    const result=await callAI(env,mode,task,{content:informal,context:'교복 착용 토론'},async(_url,options)=>{const body=JSON.parse(options.body);prompt=mode==='free'?body.systemInstruction.parts[0].text:body.messages[0].content;return Response.json(mode==='free'?{candidates:[{content:{parts:[{text:JSON.stringify(feedback)}]}}]}:{choices:[{message:{content:JSON.stringify(feedback)}}]});});
    assert.ok(prompt.includes('욕설이나 인신공격이 없어도 allowed=false'));assert.ok(prompt.includes('인용문 속 반말만으로 거절하지'));assert.equal(result.allowed,false);assert.deepEqual(result.flags,['반말']);assert.equal(result.suggestion,polite);
  }
});
test('non-abusive informal comments, replies and edits wait for a manual polite revision',async()=>{
  const h=harness({ai:(_env,_mode,task,input)=>task==='analyze'?sampleAnalysis:input.content===informal?feedback:{allowed:true,reason:'',suggestion:'',flags:[]}}),debate=await h.publish();
  const path='/v1/debates/'+debate.id+'/opinions',rootId=crypto.randomUUID();
  const rejected=await h.request(path,{method:'POST',body:{requestId:rootId,content:informal,stance:'disagree'}});
  assert.equal(rejected.status,422);assert.equal(rejected.data.code,'REVISE');assert.deepEqual(rejected.data.feedback.flags,['반말']);assert.equal(h.DB.sqlite.prepare('SELECT count(*) n FROM opinions').get().n,0);assert.equal(h.DB.sqlite.prepare('SELECT count(*) n FROM votes').get().n,0);
  const posted=await h.request(path,{method:'POST',body:{requestId:rootId,content:polite,stance:'disagree'}});assert.equal(posted.status,201);
  const reply=await h.request(path,{method:'POST',body:{requestId:crypto.randomUUID(),content:informal,stance:'agree',parentId:rootId}});assert.equal(reply.status,422);assert.equal(h.DB.sqlite.prepare('SELECT count(*) n FROM opinions').get().n,1);
  const edit=await h.request(path+'/'+rootId,{method:'PATCH',body:{content:informal,revision:0}});assert.equal(edit.status,422);assert.equal(h.DB.sqlite.prepare('SELECT content FROM opinions WHERE id=?').get(rootId).content,polite);
});
