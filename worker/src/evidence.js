import {ApiError,identifier,readJSON,text} from './security.js';
import {evidenceURL,inspectEvidence} from './evidence-metadata.js';
import {findEvidence,evidenceModel,providerError} from './evidence-ai.js';

export async function storeEvidence(env,user,source,stamp=Date.now()){
  const data={...source,id:crypto.randomUUID()};delete data.excerpt;delete data.snippets;
  await env.DB.prepare('INSERT INTO evidence_sources(id,user_id,data,created_at) VALUES(?,?,?,?)').bind(data.id,user.uid,JSON.stringify(data),stamp).run();return data;
}
export async function resolveEvidence(env,user,ids,current=[]){
  if(ids===undefined)return current;
  if(!Array.isArray(ids)||ids.length>8||new Set(ids).size!==ids.length)throw new ApiError(400,'EVIDENCE_INVALID','근거는 중복 없이 최대 8개까지 첨부할 수 있어요.');
  const result=[];
  for(const value of ids){const id=identifier(value),existing=current.find(item=>item.id===id);if(existing){result.push(existing);continue;}
    const row=await env.DB.prepare('SELECT data FROM evidence_sources WHERE id=? AND user_id=?').bind(id,user.uid).first();
    if(!row)throw new ApiError(400,'EVIDENCE_INVALID','첨부 자료를 다시 선택해주세요. 다른 사용자의 검색 결과는 첨부할 수 없어요.');
    result.push(JSON.parse(row.data));
  }return result;
}
async function quota(env,key,max,expiry){
  const row=await env.DB.prepare('INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(key,expiry,max).first();
  if(!row)throw new ApiError(429,'EVIDENCE_RATE_LIMIT','무료 근거 검색 사용량에 도달했어요. 잠시 후 다시 시도하거나 직접 링크를 첨부해주세요.',{retryAt:new Date(expiry).toISOString()});
}
async function cacheKey(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function jobValue(row){
  if(row.phase==='done')return {...JSON.parse(row.result),cached:true};
  if(row.phase==='error')return {jobId:row.id,phase:'error',code:row.error_code,message:row.error_message};
  return {jobId:row.id,phase:row.phase};
}
export async function evidenceRoute({request,path,env,user,stamp,cors,respond,search=findEvidence,inspect=inspectEvidence}){
  if(!path.startsWith('/v1/evidence/'))return null;
  if(path==='/v1/evidence/config'&&request.method==='GET')return respond({ready:Boolean(env.GEMINI_API_KEY),googleReady:Boolean(env.GEMINI_API_KEY)&&env.EVIDENCE_GOOGLE_AVAILABLE!=='false',model:evidenceModel(env),maxSources:8,provider:'google',academicFallback:'crossref',billing:'unbilled-project-required',dailyUserLimit:Math.min(10,Number(env.EVIDENCE_USER_DAILY_LIMIT)||3)});
  if(!user)throw new ApiError(401,'LOGIN_REQUIRED','로그인 후 근거를 첨부해주세요.');
  if(path.startsWith('/v1/evidence/jobs/')&&request.method==='GET'){
    const id=identifier(path.split('/').at(-1)),row=await env.DB.prepare('SELECT * FROM evidence_jobs WHERE id=? AND user_id=? AND expires_at>?').bind(id,user.uid,stamp).first();
    if(!row)throw new ApiError(404,'EVIDENCE_JOB_EXPIRED','검색 결과가 만료됐어요. 다시 검색해주세요.');
    if(!['done','error'].includes(row.phase)&&stamp-row.updated_at>180000)throw new ApiError(504,'EVIDENCE_SEARCH_TIMEOUT','검색 시간이 초과됐어요. 다시 검색해주세요.');
    return respond(jobValue(row));
  }
  if(path==='/v1/evidence/url'&&request.method==='POST'){
    const body=await readJSON(request),url=evidenceURL(body.url);
    const cached=await env.DB.prepare("SELECT data FROM evidence_sources WHERE user_id=? AND created_at>? AND json_extract(data,'$.url')=? ORDER BY created_at DESC LIMIT 1").bind(user.uid,stamp-3600000,url.href).first();
    if(cached)return respond({source:JSON.parse(cached.data),cached:true});
    await quota(env,'evidence-url:'+Math.floor(stamp/60000)+':'+user.uid,8,stamp+120000);
    const source=await inspect(url.href,{budget:{remaining:12}});
    return respond({source:await storeEvidence(env,user,source,stamp)});
  }
  if(path!=='/v1/evidence/search'||request.method!=='POST')throw new ApiError(404,'NOT_FOUND','요청한 기능을 찾을 수 없어요.');
  const body=await readJSON(request);
  if(body.consent!==true)throw new ApiError(400,'CONSENT_REQUIRED','작성한 내용의 Google AI 전송에 동의해주세요.');
  const input={content:text(body.content,'댓글',5,1000),context:text(body.context||'','문맥',0,3000),provider:body.provider==='academic'?'academic':'google'};
  const model=evidenceModel(env),key=await cacheKey({uid:user.uid,...input,model,version:1});
  let previous=await env.DB.prepare('SELECT * FROM evidence_jobs WHERE user_id=? AND cache_key=?').bind(user.uid,key).first();
  if(previous&&previous.expires_at>stamp&&previous.phase==='done')return respond(jobValue(previous));
  if(previous&&!['done','error'].includes(previous.phase)&&stamp-previous.updated_at<180000)return respond(jobValue(previous),202);
  if(input.provider==='google'&&env.EVIDENCE_GOOGLE_AVAILABLE==='false')throw new ApiError(503,'EVIDENCE_GOOGLE_UNAVAILABLE','현재 연결된 Google 프로젝트에서 무료 Google 검색을 사용할 수 없어요. 무료 학술자료 검색 (Crossref)을 선택해주세요.');
  if(!env.GEMINI_API_KEY)throw new ApiError(503,'EVIDENCE_NOT_CONFIGURED','서버의 Gemini 연결을 준비 중이에요. 직접 링크 첨부를 이용해주세요.');
  if(previous)await env.DB.prepare('DELETE FROM evidence_jobs WHERE id=?').bind(previous.id).run();
  const id=crypto.randomUUID();
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO evidence_jobs(id,user_id,cache_key,phase,updated_at,expires_at) VALUES(?,?,?,'analyzing',?,?) RETURNING id").bind(id,user.uid,key,stamp,stamp+21600000).first();
  if(!inserted){previous=await env.DB.prepare('SELECT * FROM evidence_jobs WHERE user_id=? AND cache_key=?').bind(user.uid,key).first();return respond(jobValue(previous),202);}
  try{
    const day=Math.floor(stamp/86400000),expiry=(day+1)*86400000;
    await quota(env,'evidence-minute:'+Math.floor(stamp/60000)+':'+user.uid,2,stamp+120000);
    await quota(env,'evidence-user:'+day+':'+user.uid,Math.max(1,Math.min(10,Number(env.EVIDENCE_USER_DAILY_LIMIT)||3)),expiry);
    await quota(env,'evidence-site:'+day,Math.max(1,Math.min(100,Number(env.EVIDENCE_SITE_DAILY_LIMIT)||5)),expiry);
  }catch(error){await env.DB.prepare('DELETE FROM evidence_jobs WHERE id=?').bind(id).run();throw error;}
  const encoder=new TextEncoder();let connected=true;
  const stream=new ReadableStream({
    async start(controller){
      const send=value=>{if(connected)try{controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));}catch{connected=false;}};
      try{
        const result=await search(env,input,async phase=>{await env.DB.prepare('UPDATE evidence_jobs SET phase=?,updated_at=? WHERE id=?').bind(phase,Date.now(),id).run();send({phase,jobId:id});});
        const sources=[];for(const source of result.sources||[])sources.push(await storeEvidence(env,user,source));
        const final={...result,sources,phase:'done',jobId:id,cached:false,searchedAt:new Date().toISOString()};
        await env.DB.prepare("UPDATE evidence_jobs SET phase='done',result=?,updated_at=? WHERE id=?").bind(JSON.stringify(final),Date.now(),id).run();send(final);
      }catch(error){
        const failure=providerError(error);
        await env.DB.prepare("UPDATE evidence_jobs SET phase='error',error_code=?,error_message=?,updated_at=? WHERE id=?").bind(failure.code,failure.message,Date.now(),id).run().catch(()=>{});
        send({phase:'error',code:failure.code,message:failure.message});
      }finally{if(connected)try{controller.close();}catch{}}
    },cancel(){connected=false;},
  });
  return new Response(stream,{headers:{...cors,'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
