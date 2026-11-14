import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';
const analysisId='aaaabbbb-2222-4222-8222-222222222222';
const analysis={analysisId,readable:true,ocrText:'개인정보를 가린 댓글입니다.',title:'학교에서 휴대전화를 자유롭게 사용해도 될까요?',summary:'자율적인 사용이 필요하다는 의견과 수업 집중을 위해 사용을 제한해야 한다는 의견이 있어요.',issues:['학습 집중과 자율성을 어떻게 조화시킬까요?','긴급 연락은 어떻게 허용할까요?'],agreeLabel:'자율적인 사용을 허용해요',disagreeLabel:'수업 중 사용을 제한해요',agreeReasons:['긴급한 연락을 할 수 있어야 해요.'],disagreeReasons:['수업 중 학습에 집중해야 해요.'],questions:['서로의 필요를 존중할 방법은 무엇일까요?'],limitations:'선택한 댓글과 추가 문맥만 분석했어요.'};
const clips=[{text:'휴대전화는 긴급한 연락을 위해 사용할 수 있어야 합니다. 수업에 집중하려면 사용을 제한해야 한다는 의견도 있습니다.',url:'https://www.youtube.com/watch?v=abc123',title:'휴대전화 사용 토론'}];
async function bridge(page,operation,payload={}){
  return page.evaluate(({operation,payload})=>new Promise(resolve=>{
    const id=crypto.randomUUID();
    const listener=event=>{if(event.data?.direction==='to-extension'&&event.data.id===id){window.removeEventListener('message',listener);resolve(event.data);}};
    window.addEventListener('message',listener);window.postMessage({channel:'mindly-extension-v1',direction:'to-page',id,operation,payload},location.origin);
  }),{operation,payload});
}
async function setup(page,{user=true}={}){
  const calls=[];await mockApp(page,{user});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.route('**/site-config.js',route=>route.fulfill({body:"window.MINDLY_CONFIG={workerUrl:'https://worker.test'};",contentType:'text/javascript'}));
  await page.route('https://worker.test/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname;calls.push({path,method:request.method(),body:request.postDataJSON()});
    if(path==='/v1/config')return route.fulfill({json:{ready:true,mode:'free',provider:'Gemini',capabilities:{textAnalysis:true,rewrite:true}}});
    if(path==='/v1/analyze-text')return route.fulfill({json:analysis});
    if(path==='/v1/analyze')return route.fulfill({json:{...analysis,title:'사진에서 만든 토론의 제목입니다.'}});
    if(path==='/v1/debates'&&request.method()==='POST')return route.fulfill({json:{debate:{...request.postDataJSON(),createdAt:Date.now(),heartCount:0,commentCount:0,agreeCount:0,disagreeCount:0,isMine:true}}});
    return route.fulfill({json:{items:[],opinions:[],hasMore:false}});
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});await expect.poll(()=>page.evaluate(()=>sync.authReady)).toBe(true);return calls;
}
test('normal writing still opens only the existing image flow; imported text has its own screen',async({page})=>{
  const calls=await setup(page);await page.evaluate(()=>startDebateWriting());
  await expect(page.locator('#debate-images')).toBeVisible();await expect(page.locator('#extension-text')).toHaveCount(0);
  await bridge(page,'import',{clips,context:''});
  await expect(page.locator('#extension-text')).toHaveValue(clips[0].text);await expect(page.locator('#debate-images')).toHaveCount(0);
  expect(calls.some(call=>call.method==='POST')).toBe(false);
  await page.locator('#extension-consent').check();await page.getByRole('button',{name:'가져온 글 분석하기'}).click();
  await expect(page.locator('#extension-title')).toHaveValue(analysis.title);
  expect(calls.filter(call=>call.path==='/v1/analyze')).toHaveLength(0);
  await page.evaluate(()=>startDebateWriting());await expect(page.locator('#debate-images')).toBeVisible();
});
test('an image attachment and its draft survive importing and publishing a text-based debate',async({page})=>{
  const calls=await setup(page);await page.evaluate(()=>startDebateWriting());
  await page.locator('#debate-images').setInputFiles('assets/mascot.png');await expect(page.locator('.image-previews img')).toBeVisible();
  await page.locator('#debate-consent').check();await page.getByRole('button',{name:'사진 읽고 토론 초안 만들기'}).click();
  await expect(page.locator('#debate-title')).toHaveValue('사진에서 만든 토론의 제목입니다.');
  const result=await bridge(page,'analyzeText',{content:clips[0].text,context:'',consent:true});expect(result.ok).toBe(true);
  await bridge(page,'import',{clips,context:'',analysisId:result.result.analysisId,bridgeSession:result.result.bridgeSession});
  await expect(page.locator('#extension-title')).toHaveValue(analysis.title);
  expect(calls.filter(call=>call.path==='/v1/debates'&&call.method==='POST')).toHaveLength(0);
  await page.locator('#extension-title').fill('학교 휴대전화 사용의 적절한 기준은 무엇일까요?');
  await page.getByRole('button',{name:'표현 확인 후 토론 게시하기'}).click();
  await expect(page.locator('.debate-detail h1')).toHaveText('학교 휴대전화 사용의 적절한 기준은 무엇일까요?');
  await page.evaluate(()=>startDebateWriting());await expect(page.locator('.image-previews img')).toBeVisible();
  await expect(page.locator('#debate-title')).toHaveValue('사진에서 만든 토론의 제목입니다.');
  expect(calls.filter(call=>call.path==='/v1/analyze-text')).toHaveLength(1);
});
test('raw import survives the first login while logout clears imported private state',async({page})=>{
  const calls=await setup(page,{user:false});await bridge(page,'import',{clips});
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
  await page.evaluate(()=>window.__test.signIn());await expect(page.locator('#extension-text')).toHaveValue(clips[0].text);
  expect(calls.some(call=>call.method==='POST')).toBe(false);
  await page.evaluate(()=>window.__test.signOut());expect(await page.evaluate(()=>extensionImportState.text)).toBe('');
});
test('forged analysis results cannot skip the server analysis and data is escaped as text',async({page})=>{
  await setup(page);const text='<img src=x onerror="window.injection=true"> 서로 다른 의견이 있는 토론입니다.';
  await bridge(page,'import',{clips:[{text,url:'javascript:alert(1)',title:'<script>alert(1)</script>'}],analysisId,analysis,bridgeSession:'forged'});
  await expect(page.locator('#extension-text')).toHaveValue(text);await expect(page.locator('#extension-title')).toHaveCount(0);
  await expect(page.locator('.import-sources a')).toHaveCount(0);expect(await page.evaluate(()=>window.injection)).toBeUndefined();
});
test('a second unrelated import preserves the existing imported draft and incoming text',async({page})=>{
  await setup(page);await bridge(page,'import',{clips});
  const response=await bridge(page,'import',{clips:[{text:'다른 주제를 가진 새로운 댓글이며 기존 초안과 서로 관계가 없는 토론입니다.'}]});
  expect(response.error.code).toBe('DRAFT_EXISTS');await expect(page.locator('#extension-text')).toHaveValue(clips[0].text);
});
