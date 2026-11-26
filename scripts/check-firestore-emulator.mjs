import assert from 'node:assert/strict';
import {concernCases} from '../tests/concern-cases.mjs';
import {firestoreRuleCases} from '../tests/firestore-rules-cases.mjs';
import {readFileSync} from 'node:fs';
const project='demo-mindly',base=`http://127.0.0.1:8180/v1/projects/${project}/databases/(default)/documents`;
const ruleResponse=await fetch(`http://127.0.0.1:8180/emulator/v1/projects/${project}:securityRules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}]}})});
assert.ok(ruleResponse.ok,'Rules compilation failed: '+(await ruleResponse.text()).slice(0,1500));
function value(data){
  if(data===null)return {nullValue:null};
  if(Array.isArray(data))return {arrayValue:{values:data.map(value)}};
  if(typeof data==='object')return {mapValue:{fields:fields(data)}};
  if(typeof data==='string')return {stringValue:data};
  if(typeof data==='boolean')return {booleanValue:data};
  return Number.isInteger(data)?{integerValue:String(data)}:{doubleValue:data};
}
const fields=data=>Object.fromEntries(Object.entries(data).map(([key,data])=>[key,value(data)]));
function token(user,email){
  const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
  return encode({alg:'none',typ:'JWT'})+'.'+encode({aud:project,iss:`https://securetoken.google.com/${project}`,sub:user,user_id:user,email:email||user+'@example.test',firebase:{sign_in_provider:'password'},iat:Math.floor(Date.now()/1000)-10,exp:Math.floor(Date.now()/1000)+3600})+'.';
}
async function request(path,{data,user,admin=false,email,method='PATCH'}={}){
  const headers={'Content-Type':'application/json'};
  if(admin)headers.Authorization='Bearer owner';else if(user)headers.Authorization='Bearer '+token(user,email);
  return fetch(base+'/'+path,{method,headers,body:data&&JSON.stringify({fields:fields(data)})});
}
let count=0;
async function check(name,path,before,after,allowed,{user='alice',method='PATCH',email}={}){
  const seed=await request(path,{admin:true,method:before?'PATCH':'DELETE',data:before});
  assert.ok(seed.ok||seed.status===404,`Could not seed ${name}: ${seed.status}`);
  const response=await request(path,{user,email,method,data:method==='GET'||method==='DELETE'?undefined:after});
  assert.equal(response.status,allowed?200:403,`${name}: ${response.status} ${(await response.text()).slice(0,450)}`);
  count++;
}
for(const item of firestoreRuleCases()){
  const t=item.test,auth=t.request.auth;
  await check(item.name,'posts/rules-test',t.resource.data,t.request.resource.data,t.expectation==='ALLOW',{user:auth?.uid||null,email:auth?.token.email});
}
const comment={id:'old',authorId:'alice',authorNickname:'익명',authorAvatar:0,createdAt:1000,content:'이전에 작성한 댓글'};
const before={authorId:'alice',ageGroup:'middle',title:'고민',content:'기존 고민',comments:[comment],hearts:[]};
for(const [kind,contents] of Object.entries(concernCases)){
  for(const content of contents){
    const next={...comment,id:'new',content};
    await check('direct write '+kind+': '+content,'posts/language',before,{...before,comments:[comment,next]},kind==='allowed');
  }
}
for(const content of [...['병신','ㅂㅅ','너 못생김'].map(text=>text.normalize('NFD')),'병신','병신','너ㅂᄉ','ﾲﾵ']){
  await check('decomposed direct write','posts/language',before,{...before,comments:[comment,{...comment,id:'new',content}]},false);
}
await check('admin attacks cannot bypass language rules','posts/language',before,{...before,comments:[{...comment,content:'너 병신'}]},false,{user:'admin',email:'kickin_mindly@gmail.com'});
await check('author edit is checked','posts/language',before,{...before,comments:[{...comment,content:'병.신'}]},false);
await check('cannot disguise an attack as a deletion','posts/language',before,{...before,comments:[{...comment,content:'병신',deleted:true,deletedAt:2000}]},false);
const legacy={...before,ageGroup:'elem',comments:[{...comment,content:'병신'}]};
await check('legacy age and comments remain when editing a post','posts/legacy',legacy,{...legacy,title:'수정한 제목'},true);
await check('new allowed comment retains an old abusive comment unchanged','posts/legacy',legacy,{...legacy,comments:[...legacy.comments,{...comment,id:'new',content:'개같네'}]},true);
for(const ageGroup of ['middle','high','elem']){
  await check('new post age '+ageGroup,'posts/new-age',null,{...before,comments:[],ageGroup},ageGroup!=='elem');
  await check('new profile age '+ageGroup,'users/alice',null,{nickname:'별명',ageGroup},ageGroup!=='elem');
}
await check('legacy profile can remain unchanged','users/alice',{nickname:'예전별명',ageGroup:'elem'},{nickname:'새별명',ageGroup:'elem'},true);
await check('new profile cannot switch to elem','users/alice',{nickname:'별명',ageGroup:'middle'},{nickname:'별명',ageGroup:'elem'},false);
await check('public guidance remains readable','meta/help',{sections:{usage:'공개안내'}},null,true,{user:null,method:'GET'});
await check('guidance stays admin-only','meta/help',{sections:{usage:'공개안내'}},{sections:{usage:'변조'}},false);
console.log(JSON.stringify({passed:count,emulator:'127.0.0.1:8180',project,productionDataChanged:false}));
