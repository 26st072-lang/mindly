import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';
test('new age choices and public introductions include only middle and high school students',async({page})=>{
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing-copy')).toContainText('중학생과 고등학생');
  await page.evaluate(()=>goto('mypage'));await page.locator('#open-signup').click();
  await expect(page.locator('.account-age .seg-opt')).toHaveText(['중학생','고등학생']);
  await expect(page.getByRole('button',{name:'초등학생',exact:true})).toHaveCount(0);
  await page.evaluate(()=>{ui.signupDraft={...ui.signupDraft,username:'newreader',pw:'secret123',ageGroup:'elem'};return doSignup();});
  await expect(page.getByRole('alert')).toContainText('중학생 또는 고등학생');
  expect(await page.evaluate(()=>window.__test.authCalls.length)).toBe(0);
  await page.getByRole('button',{name:'창 닫기'}).click();await page.evaluate(()=>goto('help'));
  await expect(page.locator('.help-intro')).toContainText('중학생과 고등학생');await expect(page.locator('#help-title-faq').locator('..')).toContainText('누가 이용할 수 있나요?');
});
test('legacy accounts and posts stay unchanged while new drafts use an available age group',async({page})=>{
  await mockApp(page,{user:true,legacyAge:true});await page.goto('/');await expect(page.locator('.home-welcome')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>session.ageGroup)).toBe('elem');
  await page.evaluate(()=>goto('main',{mainTab:'concern'}));
  await expect(page.locator('.tabs-sub button')).toHaveText(['전체','중학생','고등학생']);
  await expect(page.locator('[data-key="post-p2"]')).toBeVisible();
  await page.evaluate(()=>{resetWriteDraft();goto('write');});await expect(page.locator('.option-card .seg-opt')).toHaveText(['중학생','고등학생']);
  expect(await page.evaluate(()=>ui.writeDraft.ageGroup)).toBe('middle');
  await page.evaluate(()=>{resetWriteDraft(DB.posts.find(post=>post.id==='p2'));goto('write');});
  await expect(page.locator('.write-wrap')).toContainText('이 글의 기존 나이대는 그대로 유지돼요.');
  await page.getByRole('button',{name:'수정 완료',exact:true}).click();
  expect(await page.evaluate(()=>window.__test.records.posts.find(post=>post.id==='p2').ageGroup)).toBe('elem');
  expect(await page.evaluate(()=>window.__test.records.users[0].ageGroup)).toBe('elem');
  expect(await page.evaluate(()=>window.__test.writes.filter(write=>write.name==='users').length)).toBe(0);
});
