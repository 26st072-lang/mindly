import ipaddr from 'ipaddr.js';
import {ApiError} from './security.js';

// Unknown publishers are never fetched. This allowlist plus per-hop DNS checks
// avoids handing an attacker-controlled hostname to the platform resolver.
const publishers=['doi.org','api.crossref.org','vertexaisearch.cloud.google.com','who.int','worldbank.org','oecd.org','un.org','unesco.org','unicef.org','imf.org','ourworldindata.org','kosis.kr','kostat.go.kr','kdi.re.kr','kihasa.re.kr','kicce.re.kr','arxiv.org','ncbi.nlm.nih.gov','nature.com','science.org','sciencedirect.com','springer.com','link.springer.com','wiley.com','plos.org','frontiersin.org','mdpi.com','tandfonline.com','sagepub.com','jamanetwork.com','thelancet.com','bmj.com','reuters.com','apnews.com','upi.com','bbc.com','bbc.co.uk','theguardian.com','nytimes.com','yna.co.kr','hani.co.kr','khan.co.kr','donga.com','chosun.com','fnnews.com','seoul.co.kr','kbs.co.kr','imnews.imbc.com','news.sbs.co.kr','news.naver.com','n.news.naver.com','news.daum.net'];
export function evidenceURL(value){
  let url;try{if(typeof value!=='string'||value.length>2000||/[\u0000-\u0020\\]/.test(value))throw Error();url=new URL(value);}catch{throw new ApiError(400,'EVIDENCE_URL_INVALID','공개된 자료의 올바른 http 또는 https 주소를 입력해주세요.');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port)||ipaddr.isValid(host.replace(/^\[|\]$/g,''))||!host.includes('.')||/^(?:localhost|metadata)(?:\.|$)|\.(?:localhost|local|internal|test|invalid|onion)$/.test(host)||host==='metadata.google.internal')throw new ApiError(400,'EVIDENCE_URL_UNSAFE','공개 자료의 일반 웹 주소만 첨부할 수 있어요. 내부 주소나 IP 주소는 사용할 수 없어요.');
  for(const key of url.searchParams.keys())if(/^(?:access_token|api_key|apikey|authorization|x-amz-signature|x-goog-signature)$/i.test(key))throw new ApiError(400,'EVIDENCE_URL_PRIVATE','인증 정보가 포함된 주소 대신 공개 자료 주소를 입력해주세요.');
  url.hostname=host;url.hash='';for(const key of [...url.searchParams.keys()])if(/^(?:utm_|fbclid$|gclid$)/i.test(key))url.searchParams.delete(key);
  return url;
}
export function publicAddress(value){try{return ipaddr.process(value).range()==='unicast';}catch{return false;}}
export function supportedPublisher(host){return publishers.some(domain=>host===domain||host.endsWith('.'+domain))||/\.(?:go\.kr|gov|gov\.uk|gov\.au|gc\.ca)$/.test(host);}
export async function publicDNS(host,fetcher=fetch){
  const records=await Promise.all(['A','AAAA'].map(async type=>{
    const response=await fetcher('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(host)+'&type='+type,{headers:{Accept:'application/dns-json'},redirect:'manual',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new ApiError(422,'EVIDENCE_DNS_UNAVAILABLE','자료 주소를 안전하게 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
    const result=await response.json();if(result.Status!==0)throw new ApiError(422,'EVIDENCE_DNS_UNAVAILABLE','자료의 공개 주소를 확인하지 못했어요.');
    return (result.Answer||[]).filter(record=>record.type===1||record.type===28).map(record=>record.data);
  }));
  const addresses=records.flat();if(!addresses.length||addresses.some(address=>!publicAddress(address)))throw new ApiError(400,'EVIDENCE_URL_UNSAFE','내부 네트워크로 연결되는 주소는 확인할 수 없어요.');
}
export function plain(value,max=500){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,n)=>{try{return String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10));}catch{return '';}}).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[n]).replace(/\s+/g,' ').trim().slice(0,max);}
export function publishedDate(value){
  const match=String(value||'').match(/^((?:19|20)\d{2})(?:-(\d{2})(?:-(\d{2}))?)?/);if(!match)return null;
  const date=match[1]+(match[2]?'-'+match[2]:'')+(match[3]?'-'+match[3]:'');
  const stamp=Date.parse(date);return Number.isFinite(stamp)&&new Date(stamp).toISOString().startsWith(date)&&stamp<=Date.now()+172800000?date:null;
}
export function parseMetadata(html,url){
  const meta=new Map();
  for(const tag of html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)){
    const attrs={};for(const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[attr[1].toLowerCase()]=attr[2]??attr[3]??attr[4];
    const key=attrs.property||attrs.name;if(key&&attrs.content)meta.set(key.toLowerCase(),plain(attrs.content,600));
  }
  let structured=[];for(const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const data=JSON.parse(block[1]);structured.push(...(Array.isArray(data)?data:[data]));}catch{}}
  structured=structured.flatMap(item=>Array.isArray(item?.['@graph'])?item['@graph']:[item]).filter(item=>item&&typeof item==='object');
  const article=structured.find(item=>/Article|Report|Dataset|CreativeWork/.test(String(item['@type'])))||{};
  const publisher=typeof article.publisher==='string'?article.publisher:article.publisher?.name;
  const type=String(article['@type']||'');
  const main=html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1]||html.match(/<[^>]+(?:id|class)=["'][^"']*(?:article-body|sf-detail-body-wrapper|story-body|article-content)[^"']*["'][^>]*>([\s\S]*)/i)?.[1];
  const excerpt=plain((main||meta.get('og:description')||meta.get('description')||'').replace(/<(script|style|nav|footer|header|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' '),2600);
  return {title:plain(meta.get('og:title')||meta.get('twitter:title')||article.headline||article.name||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||url.hostname,300),publisher:plain(meta.get('og:site_name')||publisher||url.hostname,160),publishedAt:publishedDate(meta.get('article:published_time')||meta.get('date')||meta.get('citation_publication_date')?.replaceAll('/','-')||article.datePublished),type:/ScholarlyArticle/.test(type)?'paper':/Dataset/.test(type)?'statistics':/Report/.test(type)?'report':/Article/.test(type)||meta.get('og:type')==='article'?'article':'web',excerpt,verification:main&&excerpt.length>=200?'excerpt_checked':'metadata_only'};
}
async function boundedBody(response){
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let size=0;try{while(size<524288){const {done,value}=await reader.read();if(done)break;const piece=value.subarray(0,524288-size);chunks.push(piece);size+=piece.length;}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
export async function inspectEvidence(value,{fetcher=fetch,resolveDNS=publicDNS,hintTitle='',budget={remaining:30}}={}){
  let url=evidenceURL(value);const visited=new Set();
  for(let hop=0;hop<4;hop++){
    const fallback={url:url.href,title:plain(hintTitle||url.hostname,300),publisher:url.hostname,publishedAt:null,type:'web',excerpt:'',verification:'unverified',notice:'원문 정보를 자동 확인하지 못했어요. 원문을 직접 확인해주세요.'};
    if(!supportedPublisher(url.hostname)||budget.remaining<3)return fallback;
    if(visited.has(url.href))throw new ApiError(422,'EVIDENCE_REDIRECT_LOOP','자료 주소가 반복 이동하여 확인하지 못했어요.');visited.add(url.href);
    budget.remaining-=3;try{await resolveDNS(url.hostname,fetcher);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(422,'EVIDENCE_DNS_UNAVAILABLE','자료의 공개 주소를 안전하게 확인하지 못했어요. 잠시 후 다시 시도해주세요.');}
    let response;try{response=await fetcher(url.href,{method:'GET',headers:{Accept:'text/html,application/pdf;q=0.9','User-Agent':'Mindly-Evidence/1.0'},redirect:'manual',signal:AbortSignal.timeout(6500)});}catch{return fallback;}
    if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('Location');await response.body?.cancel();if(!next)throw new ApiError(422,'EVIDENCE_URL_UNAVAILABLE','자료의 원문 주소를 확인하지 못했어요.');url=evidenceURL(new URL(next,url).href);continue;}
    if([404,410].includes(response.status))throw new ApiError(422,'EVIDENCE_NOT_FOUND','이 주소에서 자료를 찾을 수 없어요.');
    if(!response.ok){await response.body?.cancel();return {...fallback,notice:'원문 사이트의 접근 제한으로 내용을 확인하지 못했어요.'};}
    const contentType=response.headers.get('Content-Type')||'';
    if(/application\/pdf/i.test(contentType)){await response.body?.cancel();return {...fallback,type:'report',verification:'metadata_only',notice:'PDF 주소는 확인했지만 원문 내용은 검증하지 못했어요.'};}
    if(!/text\/html|application\/xhtml\+xml/i.test(contentType)){await response.body?.cancel();return {...fallback,verification:'metadata_only'};}
    return {...parseMetadata(await boundedBody(response),url),url:url.href,notice:'원문의 일부와 메타데이터를 확인했으며, 사실 여부를 보증하는 것은 아니에요.'};
  }
  throw new ApiError(422,'EVIDENCE_TOO_MANY_REDIRECTS','이동이 너무 많은 주소예요. 최종 원문 주소를 입력해주세요.');
}
