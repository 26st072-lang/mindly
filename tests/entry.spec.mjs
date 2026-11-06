import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';

test('entry and login fit phone, tablet and desktop heights with two complete copy lines',async({page})=>{
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[320,480],[360,640],[375,667],[390,844],[412,915],[500,800],[568,320],[667,375],[740,360],[844,390],[600,800],[768,1024],[820,1180],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]){
    await page.setViewportSize({width,height});
    for(const route of ['landing','mypage']){
      await page.evaluate(route=>{ui.authMode='login';ui.authError='';goto(route);},route);
      const bounds=await page.evaluate(()=>{
        const selectors=ui.route==='landing'?['h1','.landing-copy>p','.landing-actions','.landing-values']:['.auth-wrap','form button[type="submit"]'];
        return {x:document.documentElement.scrollWidth-document.documentElement.clientWidth,y:document.documentElement.scrollHeight-innerHeight,items:selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,left:r.left,right:r.right};})};
      });
      expect(bounds.x,`${width}×${height}, ${route}`).toBeLessThanOrEqual(1);
      expect(bounds.y,`${width}×${height}, ${route}`).toBeLessThanOrEqual(1);
      for(const r of bounds.items){expect(r.top,r.selector).toBeGreaterThanOrEqual(0);expect(r.bottom,r.selector).toBeLessThanOrEqual(height+1);expect(r.left).toBeGreaterThanOrEqual(0);expect(r.right).toBeLessThanOrEqual(width+1);}
      if(route==='landing'){
        const lines=await page.locator('.entry-copy-line').evaluateAll(nodes=>nodes.map(n=>{const range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect(),column=n.closest('.landing-copy').getBoundingClientRect();return {height:n.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(n).lineHeight),centerOffset:Math.abs(text.x+text.width/2-column.x-column.width/2)};}));
        for(const line of lines){expect(line.height).toBeLessThanOrEqual(line.lineHeight+1);expect(line.centerOffset).toBeLessThanOrEqual(1);}
        await expect(page.getByText('YOUR LITTLE COMPANION, MINDY')).toHaveCount(0);
        await expect(page.getByText('A LITTLE SPACE FOR YOUR MIND')).toHaveCount(0);
      }
    }
  }
});

test('3D plays automatically, survives live renders, and releases the canvas on leaving entry',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await mockApp(page);await page.goto('/');
  await expect(page.locator('.entry-webgl[data-ready="true"] canvas')).toBeVisible({timeout:20000});
  const first=await page.locator('canvas').screenshot();await page.waitForTimeout(700);
  const second=await page.locator('canvas').screenshot();expect(first.equals(second)).toBe(false);
  await expect(page.getByRole('button',{name:/재생|정지/})).toHaveCount(0);
  await expect(page.getByText('있는 그대로, 괜찮아.')).toHaveCount(0);
  expect(await page.evaluate(()=>{window.__entryCanvas=document.querySelector('canvas');window.__test.emit('posts');return document.querySelector('canvas')===window.__entryCanvas;})).toBe(true);
  await page.getByRole('button',{name:'마인들리 시작하기'}).click();
  await expect(page.locator('.auth-wrap')).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('canvas')===window.__entryCanvas)).toBe(true);
  await page.evaluate(()=>enterGuest());await expect(page.locator('.post-card').first()).toBeVisible();await expect(page.locator('canvas')).toHaveCount(0);
  await page.evaluate(()=>goto('landing'));await expect(page.locator('.entry-webgl[data-ready="true"] canvas')).toBeVisible();
});

test('reduced motion keeps a still 3D pose and browser preference changes take effect',async({page})=>{
  await page.addInitScript(()=>{
    window.__sceneDraws=0;
    const draw=WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements=function(...args){window.__sceneDraws++;return draw.apply(this,args);};
  });
  await mockApp(page);await page.goto('/');await expect(page.locator('.entry-webgl[data-ready="true"] canvas')).toBeVisible({timeout:20000});
  await page.evaluate(()=>document.fonts.ready);
  // Count real GPU draws: screenshots can differ slightly due to subpixel
  // compositing even when the canvas has not rendered another frame.
  await page.waitForTimeout(150);const draws=await page.evaluate(()=>window.__sceneDraws);
  expect(draws).toBeGreaterThan(0);await page.waitForTimeout(350);
  expect(await page.evaluate(()=>window.__sceneDraws)).toBe(draws);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect.poll(()=>page.evaluate(()=>window.__sceneDraws)).toBeGreaterThan(draws);
});

test('the original character and login remain available without WebGL',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'||type==='webgl2'?null:original.call(this,type,...args);};});
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  await expect(page.locator('.entry-mindy img')).toBeVisible();
  await page.getByRole('button',{name:'마인들리 시작하기'}).click();
  await page.getByRole('textbox',{name:'아이디',exact:true}).fill('reader@example.test');
  await page.locator('#auth-password').fill('secret123');await page.locator('[data-action="login"]').click();
  await expect(page.locator('.home-welcome')).toBeVisible();
});
