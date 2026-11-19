import test from 'node:test';
import assert from 'node:assert/strict';
import {newsFeedSources,newsSources} from '../src/evidence-news.js';
import {findEvidence} from '../src/evidence-ai.js';
import {harness} from './helpers.mjs';
const target='https://www.yna.co.kr/view/AKR20261119000100001';
const rss=`<rss><channel><item><title><![CDATA[교복 가격 차이와 학부모 부담]]></title><link>https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(target)}&amp;ref=FexRss</link><description>교복 가격과 학부모의 경제적 부담을 조사한 기사입니다.</description><News:Source>연합뉴스</News:Source><pubDate>Wed, 18 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
test('news feed candidates retain actual original URLs and reject unsafe or invented redirect targets',()=>{
  const [source]=newsFeedSources(rss);assert.equal(source.url,target);assert.equal(source.publisher,'연합뉴스');assert.equal(source.publishedAt,'2026-11-18');assert.equal(source.verification,'search_confirmed');
  for(const url of ['http://127.0.0.1/','javascript:alert(1)','https://user:pass@example.org/'])assert.equal(newsFeedSources(rss.replace(encodeURIComponent(target),encodeURIComponent(url))).length,0);
  assert.equal(newsFeedSources('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+rss).length,0);
});
test('free news lookup uses fixed RSS endpoints and keeps unknown originals explicitly unverified',async()=>{
  const urls=[],result=await newsSources([{queryKo:'교복비 부담',queryEn:'school uniform cost'}],{fetcher:async url=>{urls.push(url);return new Response(rss);},inspect:async url=>({url,title:new URL(url).hostname,publisher:new URL(url).hostname,verification:'unverified',excerpt:'',publishedAt:null})});
  assert.equal(result.sources.length,1);assert.equal(result.sources[0].title,'교복 가격 차이와 학부모 부담');assert.equal(result.sources[0].verification,'unverified');assert.equal(result.sources[0].excerpt,'');assert.ok(result.sources[0].searchSnippet.includes('학부모'));
  assert.ok(urls.every(url=>url.startsWith('https://www.bing.com/news/search?format=rss')));
});
test('combined search finds actual news for a non-academic claim without fabricating proof or sources',async()=>{
  let generated=0;
  const result=await findEvidence({GEMINI_API_KEY:'test'},{content:'교복 비용은 학생과 학부모에게 경제적인 부담이 됩니다.',context:'교복 토론',provider:'combined'},async()=>{},{fetcher:async url=>url.startsWith('https://www.bing.com/')?new Response(rss):Response.json({message:{items:[]}}),inspect:async url=>({url,title:'교복 가격 차이와 학부모 부담',publisher:'연합뉴스',publishedAt:null,excerpt:'',verification:'unverified'}),generate:async()=>({text:JSON.stringify(++generated===1?{claims:[{text:'교복 비용이 부담이다',queryKo:'교복비 학부모 부담',queryEn:'school uniform financial burden'}]}:{sources:[{id:'1',summary:'검색 정보상 교복비 부담을 다룬 기사입니다.',relation:'supports',relationReason:'본문을 읽었다는 잘못된 판단',evidenceQuote:'An invented quote never retrieved',trust:'high',trustReason:'원문을 확인하지 못했어요.',relevance:95}]})})});
  assert.equal(result.provider,'news-crossref');assert.equal(result.sources.length,1);assert.equal(result.sources[0].url,target);assert.equal(result.sources[0].relation,'related');assert.equal(result.sources[0].trust,'unverified');assert.equal(result.sources[0].originalChecked,false);
});
test('empty results are retryable and do not use up successful-search allowance',async()=>{
  let calls=0;const h=harness({evidenceSearch:async()=>{calls++;return {claims:[],sources:[],provider:'news-crossref'};}}),body={content:'교복 가격 때문에 경제적 부담이 생깁니다.',consent:true,provider:'combined'};
  const first=await h.request('/v1/evidence/search',{method:'POST',body});const second=await h.request('/v1/evidence/search',{method:'POST',body});assert.equal(first.data.phase,'done');assert.equal(second.data.phase,'done');assert.equal(calls,2);assert.equal(h.DB.sqlite.prepare("SELECT count FROM quotas WHERE key LIKE 'evidence-user:%'").get().count,0);
});
test('official GenAI SDK sends the actual draft and JSON schema with a server-only key',async()=>{
  const requests=[];
  const result=await findEvidence({GEMINI_API_KEY:'server-test-key'},{content:'교복비가 학부모에게 경제적 부담이 됩니다.',context:'교복 토론',provider:'combined'},async()=>{},{fetcher:async(url,init)=>{
    if(String(url).includes('generativelanguage.googleapis.com')){
      const body=JSON.parse(init.body);requests.push({url:String(url),headers:new Headers(init.headers),body});
      const value=requests.length===1?{claims:[{text:'교복비 부담',queryKo:'교복비 학부모 부담',queryEn:'school uniform cost'}]}:{sources:[{id:'1',summary:'교복비 부담 관련 뉴스',relation:'related',relationReason:'원문 미검증',evidenceQuote:'',trust:'unverified',trustReason:'원문 미검증',relevance:90}]};
      return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(value)}]},finishReason:'STOP'}]});
    }
    return String(url).startsWith('https://www.bing.com/')?new Response(rss):Response.json({message:{items:[]}});
  },inspect:async url=>({url,title:'교복 가격과 학부모 부담',publisher:'연합뉴스',excerpt:'',verification:'unverified'})});
  assert.equal(requests.length,2);assert.equal(requests[0].headers.get('x-goog-api-key'),'server-test-key');assert.ok(!requests[0].url.includes('server-test-key'));assert.ok(requests[0].body.contents[0].parts[0].text.includes('교복비'));assert.ok(requests[0].body.generationConfig.responseJsonSchema.properties.claims);assert.equal(result.sources.length,1);
});
