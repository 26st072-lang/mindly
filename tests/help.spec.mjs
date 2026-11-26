import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';

test('contacts and guidance are public on every screen, with responsive day and night layouts',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  const footer=page.getByRole('contentinfo');
  for(const route of ['landing','mypage','loading','connectionError','main','debate','search','help']){
    await page.evaluate(route=>goto(route),route);
    await expect(footer.getByRole('link',{name:'자살예방상담전화 109'})).toHaveAttribute('href','tel:+82109?oai_link_source=model_response_hotline');
    await expect(footer.getByRole('link',{name:'청소년상담 1388'})).toHaveAttribute('href','tel:1388');
    await expect(footer.getByRole('link',{name:'kickinmindly@gmail.com'})).toHaveAttribute('href','mailto:kickinmindly@gmail.com');
  }
  await page.evaluate(()=>goto('landing'));
  await footer.getByRole('button',{name:'이용 안내 및 FAQ'}).click();
  await expect(page.locator('h1')).toContainText('이용 안내 및 FAQ');
  await expect(page.locator('.help-section')).toHaveCount(6);
  await expect(page.getByRole('button',{name:'안내 및 FAQ 수정',exact:true})).toHaveCount(0);
  await page.evaluate(()=>{startHelpEdit();return saveHelp();});
  expect(await page.evaluate(()=>window.__test.writes.length)).toBe(0);
  for(const theme of ['day','night']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      await footer.scrollIntoViewIfNeeded();
      for(const link of await footer.getByRole('link').all())await expect(link).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({path:`.qa/help-${theme}-${width}.png`,fullPage:true});
    }
  }
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  expect(audit.violations.filter(item=>['serious','critical'].includes(item.impact))).toEqual([]);
  expect(errors).toEqual([]);
});

test('privacy advice stays below the concern input when creating and editing without changing drafts',async({page})=>{
  await mockApp(page,{user:true});await page.goto('/');await expect(page.locator('.home-welcome')).toBeVisible();
  await page.evaluate(()=>{resetWriteDraft();goto('write');});
  for(const width of [320,1440]){
    await page.setViewportSize({width,height:900});
    const input=page.locator('.content-textarea');await input.fill('나누고 싶은 고민이에요.');
    await expect(input).toHaveAttribute('aria-describedby','concern-privacy-note');
    await expect(page.locator('#concern-privacy-note')).toHaveText('안전한 익명 활동을 위해 실명, 학교명, 전화번호 등 개인정보를 작성하지 말아 주세요.');
    expect(await page.locator('#concern-privacy-note').evaluate(el=>el.previousElementSibling.matches('.content-textarea'))).toBe(true);
    await page.evaluate(()=>window.__test.emit('posts'));await expect(input).toHaveValue('나누고 싶은 고민이에요.');
  }
  await page.evaluate(()=>{ui.editingPostId='p0';goto('write');});
  await expect(page.locator('#concern-privacy-note')).toBeVisible();
});

test('admin guidance edits save once and reach logged-out readers through the existing public document',async({page,context})=>{
  await mockApp(page,{user:true,admin:true});await page.goto('/');await expect(page.locator('.home-welcome')).toBeVisible();
  await page.evaluate(()=>goto('adminPanel'));
  await page.getByRole('button',{name:'이용 안내 및 FAQ 수정하기'}).click();
  await page.getByRole('button',{name:'안내 및 FAQ 수정',exact:true}).click();
  await page.locator('#help-edit-usage').fill('새 이용 안내입니다. <img src=x onerror=alert(1)>');
  await page.locator('#help-edit-faq').fill('Q. 어디로 문의하나요?\nA. 운영자 이메일로 문의해주세요.');
  await page.evaluate(()=>window.__test.setWrites({delay:200}));
  await page.getByRole('button',{name:'변경 내용 저장'}).click();
  await expect(page.getByRole('button',{name:'변경 내용 저장'})).toBeDisabled();
  await expect(page.locator('#help-edit-faq')).toHaveAttribute('readonly','');
  await page.evaluate(()=>saveHelp());
  await expect(page.locator('#help-edit-faq')).toHaveCount(0);
  const saved=await page.evaluate(()=>window.__test.records.meta.find(item=>item.id==='help').sections);
  expect(await page.evaluate(()=>window.__test.writes.filter(item=>item.name==='meta'&&item.id==='help').length)).toBe(1);
  const reader=await context.newPage();await mockApp(reader,{help:saved});await reader.goto('/');await expect(reader.locator('.landing')).toBeVisible();
  await reader.getByRole('contentinfo').getByRole('button',{name:'이용 안내 및 FAQ'}).click();
  await expect(reader.locator('.help-wrap')).toContainText('새 이용 안내입니다. <img src=x onerror=alert(1)>');
  await expect(reader.locator('.help-wrap img')).toHaveCount(0);
  await expect(reader.locator('.help-wrap')).toContainText('Q. 어디로 문의하나요?');
  await expect(reader.getByRole('button',{name:'안내 및 FAQ 수정',exact:true})).toHaveCount(0);
  await reader.close();
});

test('failed saves and live updates preserve the admin draft; empty sections are rejected and logout clears editing',async({page})=>{
  await mockApp(page,{user:true,admin:true});await page.goto('/');await expect(page.locator('.home-welcome')).toBeVisible();
  await page.evaluate(()=>goto('help'));await page.getByRole('button',{name:'안내 및 FAQ 수정',exact:true}).click();
  await page.locator('#help-edit-faq').fill('');await page.getByRole('button',{name:'변경 내용 저장'}).click();
  await expect(page.getByRole('alert')).toContainText('1~6000자');expect(await page.evaluate(()=>window.__test.writes.length)).toBe(0);
  await page.locator('#help-edit-faq').fill('작성 중인 FAQ입니다.');
  await page.evaluate(()=>{window.__test.records.meta.push({id:'help',sections:{faq:'다른 곳에서 수정한 FAQ'}});window.__test.emit('meta');});
  await expect(page.locator('#help-edit-faq')).toHaveValue('작성 중인 FAQ입니다.');
  await page.evaluate(()=>window.__test.setWrites({failure:true}));await page.getByRole('button',{name:'변경 내용 저장'}).click();
  await expect(page.getByRole('alert')).toContainText('저장하지 못했어요');await expect(page.locator('#help-edit-faq')).toHaveValue('작성 중인 FAQ입니다.');
  await page.getByRole('button',{name:'취소',exact:true}).click();await expect(page.locator('.help-wrap')).toContainText('다른 곳에서 수정한 FAQ');
  await page.getByRole('button',{name:'안내 및 FAQ 수정',exact:true}).click();await page.evaluate(()=>window.__test.signOut());
  await expect(page.locator('.landing')).toBeVisible();expect(await page.evaluate(()=>helpState.draft)).toBeNull();
});
