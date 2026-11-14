export const APP_URLS=Object.freeze({production:'https://26st072-lang.github.io/mindly/',local:'http://127.0.0.1:4173/',localhost:'http://localhost:4173/'});
export const WORKSPACE_TTL=60*60*1000;
export function failure(code,message){return Object.assign(new Error(message),{code});}
export function isMindlyURL(value,base){
  try{const url=new URL(value),app=new URL(base);return url.origin===app.origin&&(url.pathname===app.pathname||url.pathname===app.pathname+'index.html');}catch{return false;}
}
export function sourceURL(value){
  try{
    const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return '';
    url.username='';url.password='';url.hash='';
    const kept=new URLSearchParams();
    for(const key of ['v','id','aid','oid','article_id']){const item=url.searchParams.get(key);if(item&&/^[\w-]{1,150}$/.test(item))kept.set(key,item);}
    url.search=kept.toString();return url.href.slice(0,2000);
  }catch{return '';}
}
export function clipFrom(input){
  if(typeof input?.text!=='string'||!input.text.trim())throw failure('NO_SELECTION','댓글을 드래그해 선택한 뒤 가져와주세요.');
  const text=input.text.trim();if(text.length>8000)throw failure('TOO_LONG','선택한 글을 8,000자 이내로 줄여주세요.');
  return {id:crypto.randomUUID(),text,url:sourceURL(input.url),title:String(input.title||'').slice(0,300)};
}
export function selectedText(workspace){return workspace.clips.map(clip=>clip.text).join('\n\n');}
export function fingerprint(workspace){return JSON.stringify([selectedText(workspace),workspace.context]);}
export function emptyWorkspace(){return {clips:[],context:'',analysis:null,rewrite:null,lastError:'',expiresAt:Date.now()+WORKSPACE_TTL};}
export function addClip(workspace,clip){
  if(workspace.clips.some(item=>item.text===clip.text&&item.url===clip.url))return workspace;
  if(workspace.clips.length>=10)throw failure('TOO_MANY','댓글은 최대 10개까지 모을 수 있어요.');
  const clips=[...workspace.clips,clip];
  if(selectedText({clips}).length>8000)throw failure('TOO_LONG','모은 댓글을 합쳐 8,000자 이내로 줄여주세요.');
  return {...workspace,clips,analysis:null,lastError:''};
}
