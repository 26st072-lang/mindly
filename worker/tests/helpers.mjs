import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { createApp } from '../src/index.js';
import { ApiError } from '../src/security.js';
export const ORIGIN='https://26st072-lang.github.io';
export const sampleAnalysis={readable:true,ocrText:'개인정보를 가린 두 가지 의견입니다.',title:'학교에서 휴대전화 사용을 허용해야 할까요?',summary:'수업 중 집중을 위해 사용을 제한하자는 입장과 필요할 때 자율적으로 사용하자는 입장이 있어요.',issues:['학습 집중과 자율성 중 무엇을 우선해야 할까요?','긴급한 연락이 필요할 때는 어떻게 해야 할까요?'],agreeLabel:'자율적인 사용을 허용해야 해요',disagreeLabel:'학습을 위해 제한해야 해요'};
export const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='};
export class D1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())this.sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));}
  prepare(sql){const db=this;return {args:[],bind(...args){this.args=args;return this;},execute(){const stmt=db.sqlite.prepare(sql);if(stmt.columns().length)return {results:stmt.all(...this.args)};return {results:[],meta:stmt.run(...this.args)};},async first(){return this.execute().results[0]||null;},async all(){return this.execute();},async run(){return this.execute();}};}
  async batch(statements){this.sqlite.exec('BEGIN');try{const result=statements.map(stmt=>stmt.execute());this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
export function harness(options={}){
  const calls=[],DB=new D1(),env={DB,ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'mindly1-52859',ADMIN_UIDS:'admin',ANON_SECRET:'a-test-only-secret-longer-than-32-characters',GEMINI_API_KEY:'test-gemini-key',OPENROUTER_API_KEY:'test-openrouter-key',GEMINI_MODEL:'gemini-3.5-flash-lite',OPENROUTER_MODEL:'openai/gpt-6-luna',...options.env};
  const app=createApp({verifyUser:async request=>{const uid=request.headers.get('Authorization')?.replace('Bearer ','');if(!uid)throw new ApiError(401,'LOGIN_REQUIRED','로그인이 필요해요');return {uid};},ai:async(...args)=>{calls.push(args);return options.ai?options.ai(...args):args[2]==='analyze'?sampleAnalysis:{allowed:true,reason:'',suggestion:'',flags:[]};},now:()=>Date.now()});
  async function request(path,{method='GET',body,user='reader',origin=ORIGIN}={}){const headers={};if(user)headers.Authorization='Bearer '+user;if(origin)headers.Origin=origin;if(body!==undefined)headers['Content-Type']='application/json';const response=await app.fetch(new Request('https://worker.test'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env,{waitUntil:promise=>promise.catch(()=>{})});return {status:response.status,headers:response.headers,data:await response.json()};}
  async function publish(user='reader'){
    const analysis=await request('/v1/analyze',{method:'POST',user,body:{images:[image],consent:true}});
    if(analysis.status!==200)throw Error(JSON.stringify(analysis.data));
    const id=crypto.randomUUID();
    const result=await request('/v1/debates',{method:'POST',user,body:{...sampleAnalysis,id,analysisId:analysis.data.analysisId}});
    if(result.status!==201)throw Error(JSON.stringify(result.data));
    return result.data.debate;
  }
  return {env,DB,calls,request,publish};
}
