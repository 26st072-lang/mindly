import {ApiError} from './security.js';
import {evidenceURL,plain,publishedDate,inspectEvidence} from './evidence-metadata.js';

function field(item,name){return item.match(new RegExp('<(?:[\\w-]+:)?'+name+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?'+name+'>','i'))?.[1]?.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/,'$1')||'';}
export function newsFeedSources(xml){
  if(typeof xml!=='string'||xml.length>400000||/<!DOCTYPE|<!ENTITY/i.test(xml))return [];
  const sources=[];
  for(const [,item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
    try{
      let url=evidenceURL(plain(field(item,'link'),2000));
      if((url.hostname==='bing.com'||url.hostname.endsWith('.bing.com'))&&url.pathname==='/news/apiclick.aspx')url=evidenceURL(url.searchParams.get('url'));
      if(/(^|\.)(bing\.com|google\.com)$/.test(url.hostname))continue;
      const title=plain(field(item,'title'),300);if(!title)continue;
      const rawDate=plain(field(item,'pubDate'),100),stamp=Date.parse(rawDate);
      sources.push({url:url.href,title,publisher:plain(field(item,'Source')||field(item,'author'),160)||url.hostname,publishedAt:Number.isFinite(stamp)?publishedDate(new Date(stamp).toISOString()):null,type:'article',excerpt:'',searchSnippet:plain(field(item,'description'),1600),verification:'search_confirmed',notice:'공개 뉴스 검색에 실린 자료예요. 원문 내용은 별도로 확인해주세요.'});
    }catch{}
  }
  return [...new Map(sources.map(source=>[source.url,source])).values()];
}
export async function newsSources(claims,{fetcher=fetch,inspect=inspectEvidence}={}){
  const sources=[],queries=[],warnings=[];let completed=0;
  const deadline=Date.now()+30000;
  // Consume public topic feeds as a small news reader; never scrape search HTML
  // or circumvent a challenge. Every recommendation retains the original URL.
  const searches=claims.slice(0,3).flatMap(c=>[{query:c.queryKo,market:'ko-kr'},{query:c.queryEn,market:'en-us'}]);
  for(const {query,market} of searches){
    if(Date.now()>deadline-1000)break;
    const url='https://www.bing.com/news/search?format=rss&mkt='+market+'&q='+encodeURIComponent(query);
    try{
      const response=await fetcher(url,{headers:{Accept:'application/rss+xml,application/xml,text/xml','User-Agent':'Mindly-Evidence/1.0 (https://26st072-lang.github.io/mindly/)'},redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(7000,deadline-Date.now())))});
      if(!response.ok){await response.body?.cancel();continue;}
      const xml=await response.text();if(!/<rss\b/i.test(xml))continue;
      completed++;queries.push(query);sources.push(...newsFeedSources(xml).slice(0,4));
    }catch{}
  }
  if(!completed)warnings.push('뉴스 검색 연결이 지연되어 학술자료 위주로 검색했어요.');
  const unique=[...new Map(sources.map(s=>[s.url,s])).values()].slice(0,8),budget={remaining:15};
  for(let i=0;i<unique.length;i++){
    const source=unique[i];
    if(Date.now()>deadline+10000||budget.remaining<3)break;
    try{
      const original=await inspect(source.url,{hintTitle:source.title,budget});
      unique[i]={...source,...original,title:original.title===new URL(source.url).hostname?source.title:original.title,publisher:original.publisher===new URL(source.url).hostname?source.publisher:original.publisher,publishedAt:original.publishedAt||source.publishedAt,type:'article',searchSnippet:source.searchSnippet};
    }catch(error){if(error instanceof ApiError&&['EVIDENCE_URL_UNSAFE','EVIDENCE_NOT_FOUND'].includes(error.code)){unique.splice(i--,1);}}
  }
  return {sources:unique,queries,warnings};
}
