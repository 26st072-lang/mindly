import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';
const debateId='ddddaaaa-1111-4111-8111-111111111111',parentId='ddddaaaa-2222-4222-8222-222222222222';
const source={id:'ddddaaaa-3333-4333-8333-333333333333',url:'https://www.who.int/news/report',title:'청소년 학습 환경 연구',publisher:'연구기관',publishedAt:'2025-06-01',type:'report',summary:'학습 환경과 집중에 관한 자료입니다.',relation:'partial',relationReason:'일부 환경에서의 효과를 다룹니다.',trust:'unverified',trustReason:'원문 전체와 연구 방법을 확인하지 못했습니다.',originalChecked:false,notice:'원문 내용은 미검증 상태예요.'};
const contrary={...source,id:'ddddaaaa-4444-4444-8444-444444444444',url:'https://www.who.int/news/counter',title:'다른 결과를 보인 연구',relation:'contradicts'};
async function setup(page){
  await mockApp(page,{user:true});await page.route('**/site-config.js',route=>route.fulfill({body:"window.MINDLY_CONFIG={workerUrl:'https://worker.test'};",contentType:'text/javascript'}));
  const calls=[],debate={id:debateId,title:'학교 휴대전화 사용과 학습 집중',summary:'학습 집중과 자율성의 균형을 이야기해요.',issues:['어떤 기준이 필요할까요?'],agreeLabel:'허용',disagreeLabel:'제한',createdAt:Date.now(),heartCount:0,commentCount:1,agreeCount:0,disagreeCount:1},opinions=[{id:parentId,debateId,alias:'익명 1',stance:'disagree',content:'수업 중에는 학습에 집중할 수 있는 환경이 중요해요.',createdAt:Date.now(),isMine:false,evidence:[]}];
  await page.route('https://worker.test/**',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname,body=r.postDataJSON();calls.push({path,body,method:r.method()});
    if(path==='/v1/config')return route.fulfill({json:{ready:true,mode:'free'}});
    if(path==='/v1/debates')return route.fulfill({json:{items:[debate],hasMore:false}});
    if(path==='/v1/evidence/url')return route.fulfill({json:{source:{...source,url:body.url}}});
    if(path==='/v1/evidence/search')return route.fulfill({contentType:'application/x-ndjson',body:[{phase:'analyzing'},{phase:'searching'},{phase:'reviewing'},{phase:'done',provider:'google',claims:[{text:'휴대전화와 학습 집중의 관계',queryKo:'학교 휴대전화 집중 연구',queryEn:'school phone concentration study'}],sources:[source,contrary],searchSuggestions:'<div>Google Search suggestions</div>'}].map(e=>JSON.stringify(e)+'\n').join('')});
    if(path.endsWith('/opinions')&&r.method()==='POST'){const opinion={id:body.requestId,debateId,alias:'익명 2',content:body.content,stance:body.stance,parentId:body.parentId,isMine:true,createdAt:Date.now(),evidence:(body.evidenceIds||[]).map(id=>[source,contrary].find(s=>s.id===id))};opinions.push(opinion);return route.fulfill({json:{debate,opinion}});}
    return route.fulfill({json:{debate,opinions,hasMore:false}});
  });
  await page.goto('/');await page.locator('.home-welcome').waitFor();return {calls,opinions};
}
async function manual(page){await page.getByRole('button',{name:'직접 링크 추가'}).click();await page.locator('#evidence-url').fill(source.url);await page.getByRole('button',{name:'정보 확인',exact:true}).click();await expect(page.locator('.evidence-preview')).toContainText(source.title);await page.getByRole('button',{name:'이 근거 첨부',exact:true}).click();}
test('concern comments preserve drafts through link preview, persist evidence and allow attachment-only edits',async({page})=>{
  await setup(page);await page.evaluate(()=>goto('postDetail',{currentPostId:'p0'}));const input=page.locator('#comment-input');await input.fill('자료를 함께 확인하며 대화하고 싶어요.');
  await page.getByRole('button',{name:'📎 근거 첨부',exact:true}).click();await manual(page);
  await expect(input).toHaveValue('자료를 함께 확인하며 대화하고 싶어요.');await expect(page.locator('.evidence-chips')).toContainText(source.title);
  await page.getByRole('button',{name:'댓글 보내기',exact:true}).click();const row=page.locator('.comment-item').last();await expect(row.locator('.comment-evidence')).toBeVisible();await row.locator('.comment-evidence summary').click();await expect(row.getByRole('link',{name:/청소년 학습/})).toHaveAttribute('href',source.url);
  const saved=await page.evaluate(()=>window.__test.records.posts[0].comments.at(-1));expect(saved.evidence[0].publisher).toBe(source.publisher);expect(saved.evidence[0].trust).toBeUndefined();
  await row.getByRole('button',{name:'내 댓글 수정',exact:true}).click();await row.getByRole('button',{name:/첨부 삭제/}).click();await row.getByRole('button',{name:'수정 저장',exact:true}).click();await expect(row.locator('.comment-evidence')).toHaveCount(0);expect(await page.evaluate(()=>window.__test.records.posts[0].comments.at(-1).evidence)).toEqual([]);
});
test('AI evidence supports multiple selections and counter-evidence in an inline reply without clearing the root draft',async({page})=>{
  const state=await setup(page);await page.evaluate(id=>goto('debateDetail',{currentDebateId:id}),debateId);await page.locator('#debate-opinion').fill('일반 댓글 초안은 그대로 유지되어야 합니다.');
  const parent=page.locator(`[data-key="opinion-${parentId}"]`);await parent.getByRole('button',{name:'답글',exact:true}).click();const inline=parent.locator('.inline-reply');await inline.getByRole('radio',{name:'찬성',exact:true}).check();await inline.locator('textarea').fill('휴대전화와 학습 집중 사이의 연구 결과를 함께 확인하고 싶어요.');
  await inline.getByRole('button',{name:'📎 근거 첨부',exact:true}).click();await page.getByRole('button',{name:'AI로 근거 찾기'}).click();await page.locator('#evidence-consent').check();await page.getByRole('button',{name:'무료 통합 검색'}).click();
  await expect(page.locator('.evidence-result')).toHaveCount(2);await expect(page.locator('.evidence-counter')).toBeVisible();await expect(page.locator('.evidence-verification').first()).toContainText('미검증');await expect(page.locator('.evidence-google-suggestions')).toHaveAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');
  const axe=await import('node:fs/promises').then(fs=>fs.readFile('node_modules/axe-core/axe.min.js','utf8'));await page.addScriptTag({content:axe});
  const audit=await page.evaluate(()=>axe.run(document.querySelector('#evidence-dialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(audit.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);
  await page.locator('.evidence-result input').nth(0).check();await page.locator('.evidence-result input').nth(1).check();await expect(page.locator('.evidence-selection')).toContainText('2개 선택');
  await page.locator('#evidence-dialog').screenshot({path:'.qa/evidence-desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('#evidence-dialog').screenshot({path:'.qa/evidence-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button',{name:'선택한 근거 첨부'}).click();await expect(inline.locator('.evidence-chips li')).toHaveCount(2);await inline.getByRole('button',{name:'답글 제출'}).click();
  const posted=state.calls.find(call=>call.path.endsWith('/opinions')&&call.method==='POST');expect(posted.body.parentId).toBe(parentId);expect(posted.body.evidenceIds).toEqual([source.id,contrary.id]);
  await expect(page.locator('#debate-opinion')).toHaveValue('일반 댓글 초안은 그대로 유지되어야 합니다.');await expect(page.locator('.comment-evidence summary')).toContainText('📚 첨부된 근거 2개');
});
test('quota errors preserve writing and attachments; modal is keyboard accessible and respects night colors',async({page})=>{
  await setup(page);await page.route('https://worker.test/v1/evidence/search',route=>route.fulfill({status:429,json:{code:'EVIDENCE_API_QUOTA',message:'무료 사용량을 초과했어요. 직접 링크를 이용해주세요.'}}));
  await page.evaluate(()=>goto('postDetail',{currentPostId:'p0'}));await page.locator('#comment-input').fill('검색에 실패해도 이 글은 남아 있어야 합니다.');await page.getByRole('button',{name:'📎 근거 첨부',exact:true}).click();await page.getByRole('button',{name:'AI로 근거 찾기'}).click();await page.locator('#evidence-consent').check();await page.getByRole('button',{name:'무료 통합 검색'}).click();await expect(page.getByRole('alert')).toContainText('무료 사용량');
  await page.evaluate(()=>{document.documentElement.dataset.theme='night';});const color=await page.locator('#evidence-dialog').evaluate(el=>getComputedStyle(el).backgroundColor);expect(color).toBe('rgb(34, 50, 75)');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#comment-input')).toHaveValue('검색에 실패해도 이 글은 남아 있어야 합니다.');
  await expect(page.getByRole('button',{name:'📎 근거 첨부',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'📎 근거 첨부',exact:true}).click();await manual(page);await expect(page.locator('.evidence-chips li')).toHaveCount(1);
});
test('Google restrictions never disable free combined search and academic-only search remains available',async({page})=>{
  const state=await setup(page);await page.route('https://worker.test/v1/evidence/config',route=>route.fulfill({json:{ready:true,googleReady:false}}));
  await page.evaluate(()=>goto('postDetail',{currentPostId:'p0'}));await page.locator('#comment-input').fill('학습 집중력에 관한 실제 연구 자료를 함께 살펴보고 싶어요.');await page.getByRole('button',{name:'📎 근거 첨부',exact:true}).click();await page.getByRole('button',{name:'AI로 근거 찾기'}).click();
  await expect(page.getByRole('button',{name:'무료 통합 검색'})).toBeEnabled();await expect(page.getByRole('button',{name:'Google 검색으로 근거 찾기'})).toHaveCount(0);
  await page.locator('#evidence-consent').check();await page.getByRole('button',{name:'무료 학술자료 검색 (Crossref)',exact:true}).click();await expect(page.locator('.evidence-result')).toHaveCount(2);expect(state.calls.find(c=>c.path==='/v1/evidence/search').body.provider).toBe('academic');
});
test('empty academic results can be expanded to news without losing the draft',async({page})=>{
  await setup(page);const providers=[];
  await page.route('https://worker.test/v1/evidence/search',route=>{const body=route.request().postDataJSON();providers.push(body.provider);return route.fulfill({json:{phase:'done',provider:body.provider==='academic'?'crossref':'news-crossref',claims:[],sources:body.provider==='academic'?[]:[{...source,type:'article'}]}});});
  await page.evaluate(()=>goto('postDetail',{currentPostId:'p0'}));await page.locator('#comment-input').fill('교복 가격이 학부모에게 경제적 부담이 됩니다.');await page.getByRole('button',{name:'📎 근거 첨부',exact:true}).click();await page.getByRole('button',{name:'AI로 근거 찾기'}).click();await page.locator('#evidence-consent').check();
  await page.getByRole('button',{name:'무료 학술자료 검색 (Crossref)',exact:true}).click();await expect(page.getByRole('button',{name:'기사까지 검색 넓히기'})).toBeVisible();await page.getByRole('button',{name:'기사까지 검색 넓히기'}).click();await expect(page.locator('.evidence-result')).toHaveCount(1);expect(providers).toEqual(['academic','combined']);
  await page.getByRole('button',{name:'근거 첨부 닫기'}).click();await expect(page.locator('#comment-input')).toHaveValue('교복 가격이 학부모에게 경제적 부담이 됩니다.');
});
