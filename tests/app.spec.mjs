import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';
import {readFile} from 'node:fs/promises';
test('auth restoration starts subscriptions once and does not wait for a slow profile',async({page})=>{
  await mockApp(page,{user:true,authDelay:250,delayCollections:['users']});
  await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  const calls=await page.evaluate(()=>window.__test.calls);
  expect(calls.every(call=>call.authResolved)).toBe(true);
  expect(calls.filter(call=>call.name==='users')).toHaveLength(1);
  expect(calls.find(call=>call.name==='users').id).toBe('reader');
  expect(await page.evaluate(()=>window.__test.count('diary'))).toBe(0);
});
test('late snapshots render even while search is focused, preserving text and caret',async({page})=>{
  await mockApp(page,{user:true,manual:true});await page.goto('/');
  await expect(page.locator('#search-input')).toBeVisible();
  await page.locator('#search-input').fill('친구');
  await page.evaluate(()=>window.__test.emit('posts'));
  await expect(page.locator('.post-card').first()).toBeVisible();
  await expect(page.locator('#search-input')).toBeFocused();
  await expect(page.locator('#search-input')).toHaveValue('친구');
  expect(await page.locator('#search-input').evaluate(el=>el.selectionStart)).toBe(2);
});
test('writing fields retain their DOM node, selection and draft through snapshots',async({page})=>{
  await mockApp(page,{user:true});await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  await page.evaluate(()=>{resetWriteDraft();goto('write');});
  const field=page.locator('.content-textarea');await field.fill('친구에게 전하고 싶은 마음');
  await field.evaluate(el=>{window.__originalField=el;el.setSelectionRange(3,5);});
  await page.evaluate(()=>window.__test.emit('posts'));
  await expect(field).toBeFocused();
  await expect.poll(()=>field.evaluate(el=>el===window.__originalField)).toBe(true);
  expect(await field.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([3,5]);
  await page.getByRole('button',{name:'#인간관계',exact:true}).click();
  await expect(field).toHaveValue('친구에게 전하고 싶은 마음');
});
test('empty cache, permission errors, retries and real empty results are distinct',async({page})=>{
  await mockApp(page,{user:true,manual:true});await page.goto('/');
  await page.locator('#tab-concern').click();
  await page.evaluate(()=>{window.__test.records.posts=[];window.__test.emit('posts',true);});
  await expect(page.locator('.skeleton-list')).toBeVisible();
  await page.evaluate(()=>window.__test.fail('posts','permission-denied'));
  await expect(page.locator('.sync-notice')).toContainText('권한');
  await page.getByRole('button',{name:'다시 불러오기'}).click();
  await page.evaluate(()=>window.__test.emit('posts'));
  await expect(page.locator('.empty-state')).toContainText('아직 나눈 고민이 없어요');
});
test('tabs keep the banner and tabs stationary, including after scrolling',async({page})=>{
  await mockApp(page,{user:true});await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  const original=await page.locator('.tabs-main').boundingBox();
  for(const id of ['concern','epilogue','home']){
    await page.locator('#tab-'+id).click();
    expect((await page.locator('.tabs-main').boundingBox()).y).toBeCloseTo(original.y,0);
  }
  await page.evaluate(()=>window.scrollTo(0,300));
  const scrolled=await page.locator('.tabs-main').boundingBox();
  // A real pointer click avoids Playwright scrolling a sticky element into its
  // un-stuck document position before dispatching the input event.
  const target=await page.locator('#tab-epilogue').boundingBox();
  await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
  expect((await page.locator('.tabs-main').boundingBox()).y).toBeCloseTo(scrolled.y,0);
  await page.locator('#tab-epilogue').press('ArrowLeft');
  await expect(page.locator('#tab-concern')).toBeFocused();
});
test('failed comment preserves draft; rapid saves create only one record',async({page})=>{
  await mockApp(page,{user:true});await page.goto('/');
  await page.locator('.post-title-link').first().click();
  await page.locator('#comment-input').fill('소중한 댓글 초안');
  await page.evaluate(()=>window.__test.setWrites({failure:true}));
  await page.getByRole('button',{name:'댓글 보내기'}).click();
  await expect(page.locator('#toast')).toContainText('오류');
  await expect(page.locator('#comment-input')).toHaveValue('소중한 댓글 초안');
  await page.evaluate(()=>window.__test.setWrites({delay:250}));
  await page.getByRole('button',{name:'댓글 보내기'}).click();
  await expect(page.locator('#comment-input')).toHaveValue('');
  await page.evaluate(()=>{resetWriteDraft();goto('write');});
  await page.locator('.title-input').fill('새로운 고민');
  await page.locator('.content-textarea').fill('저장 요청 중에는 중복 게시가 되지 않아야 해요.');
  await page.evaluate(()=>{submitPost();submitPost();});
  await expect(page.locator('.detail-title')).toHaveText('새로운 고민');
  expect(await page.evaluate(()=>window.__test.writes.filter(w=>w.method==='add'&&w.name==='posts').length)).toBe(1);
});
test('logout clears private data and drafts; switching accounts does not duplicate subscriptions',async({page})=>{
  await mockApp(page,{user:true});await page.goto('/');
  await page.evaluate(()=>{ui.diaryDraft.content='private draft';DB.diary=[{id:'old-diary',content:'previous private data'}];});
  await page.evaluate(()=>window.__test.signOut());
  expect(await page.evaluate(()=>({diary:DB.diary.length,draft:ui.diaryDraft.content}))).toEqual({diary:0,draft:''});
  expect(await page.evaluate(()=>window.__test.count('diary'))).toBe(0);
  await page.evaluate(()=>window.__test.signIn());
  expect(await page.evaluate(()=>window.__test.count('posts'))).toBe(1);
  expect(await page.evaluate(()=>window.__test.count('diary'))).toBe(0);
});
for(const width of [320,375,390,600,768,1024,1440])test(`responsive layout ${width}px: landing, feed, auth, writing, detail`,async({page})=>{
  await page.setViewportSize({width,height:900});await mockApp(page);await page.goto('/');
  await expect(page.locator('.landing')).toBeVisible();
  const checkOverflow=async()=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);};
  await checkOverflow();
  await page.getByRole('button',{name:'먼저 둘러볼게요'}).click();
  await expect(page.locator('.post-card').first()).toBeVisible();await checkOverflow();
  const heart=await page.locator('.heart-btn svg').first().boundingBox();expect(heart.width).toBe(heart.height);
  const tabY=(await page.locator('.tabs-main').boundingBox()).y;
  await page.locator('#tab-epilogue').click();expect((await page.locator('.tabs-main').boundingBox()).y).toBeCloseTo(tabY,0);await checkOverflow();
  await page.evaluate(()=>goto('mypage'));await checkOverflow();
  await page.getByRole('button',{name:'회원가입',exact:true}).click();await checkOverflow();
  await page.evaluate(()=>window.__test.signIn());await page.evaluate(()=>{resetWriteDraft();goto('write');});await checkOverflow();
  await page.evaluate(()=>goto('postDetail',{currentPostId:'p0'}));await checkOverflow();
  if(width===390||width===1440){await page.evaluate(()=>{ui.mainTab='home';goto('main');});await page.screenshot({path:`.qa/home-${width}.png`,fullPage:true});}
});
test('mobile menu traps focus, closes with Escape and returns focus',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mockApp(page,{user:true});await page.goto('/');
  await page.getByRole('button',{name:'메뉴 열기'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>document.activeElement.closest('#menu-drawer')!==null)).toBe(true);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#menu-button')).toBeFocused();
});
test('key views have no serious accessibility violations',async({page})=>{
  await mockApp(page);await page.goto('/');
  await page.addScriptTag({content:await readFile('node_modules/axe-core/axe.min.js','utf8')});
  for(const route of ['landing','main','mypage']){
    await page.evaluate(route=>goto(route),route);
    const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));
    expect(violations).toEqual([]);
  }
});
