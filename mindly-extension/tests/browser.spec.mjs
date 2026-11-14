import {test,expect,chromium} from '@playwright/test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mockApp} from '../../tests/fixture.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),extension=path.join(root,'mindly-extension');
const text='휴대전화는 긴급 연락을 위해 사용할 수 있어야 합니다. 수업에 집중하려면 사용을 제한해야 한다는 반대 의견도 있습니다.';
const analysis={analysisId:'aaaabbbb-2222-4222-8222-222222222222',readable:true,ocrText:text,title:'학교에서 휴대전화 사용을 허용해야 할까요?',summary:'긴급 연락을 위해 사용을 허용하자는 입장과 학습 집중을 위해 제한하자는 입장이 있어요.',issues:['긴급 연락과 학습 집중을 어떻게 조화시킬까요?','어떤 시간과 장소에서 사용할 수 있을까요?'],agreeLabel:'사용을 허용해야 해요',disagreeLabel:'사용을 제한해야 해요',agreeReasons:['긴급한 연락을 할 수 있어야 해요.'],disagreeReasons:['학습에 집중해야 해요.'],questions:['서로의 필요를 존중하는 기준은 무엇일까요?'],limitations:'선택한 댓글만 분석했어요. 영상 전체를 확인하지 않았어요.'};
analysis.preview={title:'학교 휴대전화 사용',agreeLabel:'긴급 연락을 위해 사용 허용',disagreeLabel:'수업 집중을 위해 사용 제한',issues:['자율성과 학습 집중','긴급 연락의 필요성']};
const suggestion='그 의견에는 동의하기 어렵습니다. 근거를 설명해 주시면 좋겠습니다.';
async function launch({youtube=false}={}){
  mkdirSync(path.join(root,'.qa'),{recursive:true});
  const sandbox=mkdtempSync(path.join(root,'.qa','extension-test-'));
  let loadPath=extension;
  if(youtube){
    loadPath=path.join(sandbox,'extension');mkdirSync(loadPath);
    // The test profile grants this optional origin up front. Shipped permissions stay optional.
    for(const file of ['manifest.json','background.js','shared.mjs','mindly-content.js','youtube.js','sidepanel.html','sidepanel.js','sidepanel.css','mascot.png'])cpSync(path.join(extension,file),path.join(loadPath,file));
    const manifest=JSON.parse(readFileSync(path.join(loadPath,'manifest.json'),'utf8'));
    manifest.host_permissions.push('https://www.youtube.com/*');writeFileSync(path.join(loadPath,'manifest.json'),JSON.stringify(manifest));
  }
  const context=await chromium.launchPersistentContext(path.join(sandbox,'profile'),{headless:true,channel:'chromium',args:['--disable-extensions-except='+loadPath,'--load-extension='+loadPath],viewport:{width:400,height:950}});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>chrome.storage.local.set({environment:'local'}));
  const id=worker.url().split('/')[2],panel=await context.newPage();
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);await expect(panel.locator('#capture')).toBeVisible();
  return {context,worker,panel};
}
async function app(context){
  const page=await context.newPage(),calls=[];await mockApp(page,{user:true});
  await page.route('**/site-config.js',route=>route.fulfill({body:"window.MINDLY_CONFIG={workerUrl:'https://worker.test'};",contentType:'text/javascript'}));
  await page.route('https://worker.test/**',route=>{
    const request=route.request(),url=new URL(request.url());calls.push({path:url.pathname,method:request.method(),body:request.postDataJSON()});
    if(url.pathname==='/v1/config')return route.fulfill({json:{ready:true,provider:'Gemini',mode:'free',capabilities:{textAnalysis:true,rewrite:true}}});
    if(url.pathname==='/v1/analyze-text')return route.fulfill({json:analysis});
    if(url.pathname==='/v1/rewrite')return route.fulfill({json:{feedback:{allowed:false,reason:'상대를 비하하는 표현이 있어요.',suggestion,flags:['비하']}}});
    return route.fulfill({json:{items:[],hasMore:false}});
  });
  await page.goto('http://127.0.0.1:4173/');await expect.poll(()=>page.evaluate(()=>sync.authReady)).toBe(true);
  return {page,calls};
}
test('the unpacked release extension captures a selection, analyzes through the logged-in app, and imports a draft without posting',async()=>{
  const {context,panel}=await launch();
  try{
    const {page:mindly,calls}=await app(context),source=await context.newPage();
    await source.route('http://127.0.0.1:4173/extension-source',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><title>댓글 출처</title><p id="selected">${text}</p>`}));
    await source.goto('http://127.0.0.1:4173/extension-source');
    await source.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.getElementById('selected'));window.getSelection().removeAllRanges();window.getSelection().addRange(range);});
    await source.bringToFront();await panel.evaluate(()=>document.getElementById('capture').click());
    await expect(panel.locator('[data-clip]')).toHaveValue(text);expect(calls.some(call=>call.method==='POST')).toBe(false);
    await panel.locator('#analysis-consent').check();await panel.locator('#analyze').click();
    await expect(panel.locator('#analysis-result h3')).toHaveText(analysis.preview.title);
    await expect(panel.locator('.compact-stances dd')).toHaveText([analysis.preview.agreeLabel,analysis.preview.disagreeLabel]);
    await expect(panel.locator('.compact-issues li')).toHaveText(analysis.preview.issues);
    await expect(panel.locator('#analysis-result')).not.toContainText(analysis.summary);
    await expect(panel.locator('#analysis-result')).not.toContainText(analysis.agreeReasons[0]);
    await expect(panel.locator('#analysis-result')).not.toContainText(analysis.questions[0]);
    expect(calls.filter(call=>call.path==='/v1/analyze-text')).toHaveLength(1);
    await panel.locator('#import').click();await expect(mindly.locator('#extension-title')).toHaveValue(analysis.title);
    await expect(mindly.locator('#extension-summary')).toHaveValue(analysis.summary);
    await expect(mindly.locator('#extension-issue-0')).toHaveValue(analysis.issues[0]);
    expect(calls.filter(call=>call.path==='/v1/debates'&&call.method==='POST')).toHaveLength(0);
    await panel.screenshot({path:path.join(root,'.qa','extension-topic.png'),fullPage:true});
  }finally{await context.close();}
});
test('the real YouTube adapter on a simulated page requires consent, preserves edits, applies only on approval, and never clicks publish',async()=>{
  const {context,panel,worker}=await launch({youtube:true});
  try{
    const {calls}=await app(context),youtube=await context.newPage();
    await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>유튜브 댓글 테스트</title><ytd-commentbox><div><div id="contenteditable-root" role="textbox" contenteditable="true">너 진짜 멍청하구나. 그 주장에는 동의할 수 없다.</div></div><button id="publish" onclick="window.published=(window.published||0)+1">댓글 게시</button></ytd-commentbox>'}));
    await youtube.goto('https://www.youtube.com/watch?v=fixture');
    await worker.evaluate(async()=>{await chrome.scripting.registerContentScripts([{id:'test-youtube',matches:['https://www.youtube.com/*'],js:['youtube.js'],runAt:'document_idle'}]);const tabs=await chrome.tabs.query({url:'https://www.youtube.com/*'});for(const tab of tabs)await chrome.scripting.executeScript({target:{tabId:tab.id},files:['youtube.js']});});
    const button=youtube.getByRole('button',{name:'✦ 마인들리 말투 다듬기'});await expect(button).toBeVisible();await button.click();
    await expect(panel.locator('#original')).toHaveValue('너 진짜 멍청하구나. 그 주장에는 동의할 수 없다.');
    expect(calls.filter(call=>call.path==='/v1/rewrite')).toHaveLength(0);
    await panel.locator('#rewrite-consent').check();await panel.locator('#rewrite').click();await expect(panel.locator('.suggestion')).toHaveText(suggestion);
    await expect(youtube.locator('#contenteditable-root')).toHaveText('너 진짜 멍청하구나. 그 주장에는 동의할 수 없다.');
    await youtube.locator('#contenteditable-root').fill('사용자가 검사 후 추가로 수정한 댓글입니다.');
    await panel.locator('#apply').click();await expect(panel.locator('#notice')).toContainText('댓글을 추가로 수정');
    await expect(youtube.locator('#contenteditable-root')).toHaveText('사용자가 검사 후 추가로 수정한 댓글입니다.');
    await button.click();await expect(panel.locator('#original')).toHaveValue('사용자가 검사 후 추가로 수정한 댓글입니다.');
    await panel.locator('#rewrite-consent').check();await panel.locator('#rewrite').click();await expect(panel.locator('#apply')).toBeVisible();
    await panel.locator('#apply').click();await expect(youtube.locator('#contenteditable-root')).toHaveText(suggestion);
    expect(await youtube.evaluate(()=>window.published||0)).toBe(0);
    await panel.screenshot({path:path.join(root,'.qa','extension-tone.png'),fullPage:true});
  }finally{await context.close();}
});
