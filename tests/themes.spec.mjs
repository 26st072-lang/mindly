import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {mockApp} from './fixture.mjs';

test('theme choice survives routes and reloads without replacing a typed account field',async({page})=>{
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','day');
  await page.getByRole('button',{name:'마인들리 시작하기'}).click();
  const field=page.locator('#auth-username');await field.fill('my_mindy');
  await page.evaluate(()=>{window.__usernameNode=document.getElementById('auth-username');window.__usernameNode.setSelectionRange(2,5);});
  await page.getByRole('button',{name:'나이트 모드 켜기',exact:true}).click();
  await expect(field).toHaveValue('my_mindy');
  expect(await page.evaluate(()=>document.getElementById('auth-username')===window.__usernameNode)).toBe(true);
  expect(await field.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([2,5]);
  await expect(page.locator('.theme-control')).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>enterGuest());await expect(page.locator('.post-card').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','night');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','night');
  await expect(page.locator('.theme-control')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'나이트 모드 끄기',exact:true}).click();
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','day');
});

test('day/night switch reuses the scene, keeps the heart, and works when storage is unavailable',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError');};});
  await mockApp(page);await page.goto('/');
  await expect(page.locator('.entry-webgl[data-scene="day"] canvas')).toBeVisible({timeout:20000});
  await page.evaluate(()=>window.__themeCanvas=document.querySelector('canvas'));
  for(let i=0;i<5;i++)await page.locator('.theme-control').click();
  await expect(page.locator('.entry-webgl')).toHaveAttribute('data-scene','night');
  expect(await page.evaluate(()=>document.querySelector('canvas')===window.__themeCanvas)).toBe(true);
  await expect(page.locator('.chat-heart svg')).toHaveCount(1);
  await page.screenshot({path:'.qa/night-entry-desktop.png'});
  await page.locator('.theme-control').click();
  await page.screenshot({path:'.qa/day-entry-desktop.png'});
});

test('night mode has readable text, forms, errors and controls throughout the app',async({page})=>{
  test.setTimeout(60000);
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  await page.locator('.theme-control').click();
  await page.addScriptTag({content:await readFile('node_modules/axe-core/axe.min.js','utf8')});
  const audit=async name=>{
    const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,message:n.failureSummary}))})));
    expect(violations,name).toEqual([]);
  };
  await audit('night landing');
  await page.evaluate(()=>goto('mypage'));await audit('night login');
  const contrast=await page.locator('#auth-username').evaluate(input=>{
    function luminance(rgb){const c=rgb.match(/[\d.]+/g).slice(0,3).map(x=>Number(x)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
    function ratio(a,b){a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
    const s=getComputedStyle(input),placeholder=getComputedStyle(input,'::placeholder');return {text:ratio(s.color,s.backgroundColor),placeholder:ratio(placeholder.color,s.backgroundColor)};
  });
  expect(contrast.text).toBeGreaterThanOrEqual(4.5);expect(contrast.placeholder).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button',{name:'회원가입',exact:true}).click();await audit('night signup');
  await page.evaluate(()=>{ui.signupError='아이디를 확인해주세요.';render();});await audit('night form error');
  await page.evaluate(()=>{closeAccountModal();window.__test.signIn();});
  await expect(page.locator('.post-card').first()).toBeVisible();
  await page.evaluate(()=>{
    window.__test.records.posts[0].comments=[{id:'theme-comment',authorId:'reader',authorNickname:'포근한 공룡',authorAvatar:1,content:'밤에도 편안하게 읽을 수 있어요.',createdAt:Date.now()}];window.__test.emit('posts');
  });
  for(const route of ['main','postDetail','write','writeEpilogue','epilogueDetail','archive','diary','diaryWrite','myHearts','mypage','adminPanel']){
    await page.evaluate(route=>{session.isAdmin=true;ui.currentPostId='p0';ui.currentEpilogueId='ep0';goto(route);},route);
    await audit('night '+route);
    if(route==='main')await page.screenshot({path:'.qa/night-lounge-desktop.png',fullPage:true});
    if(route==='postDetail'){
      await page.evaluate(()=>startEditComment('p0','theme-comment'));await audit('night comment editor');
      await page.screenshot({path:'.qa/night-comment-desktop.png',fullPage:true});
    }
  }
});

test('night entry fits short phones, tablets and desktops and its header controls do not overlap',async({page})=>{
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();await page.locator('.theme-control').click();
  for(const [width,height] of [[320,480],[360,640],[390,844],[568,320],[667,375],[740,360],[844,390],[600,800],[768,1024],[820,1180],[1024,768],[1280,720],[1440,900],[1920,1080]]){
    await page.setViewportSize({width,height});
    for(const route of ['landing','mypage']){
      await page.evaluate(route=>goto(route),route);
      const bounds=await page.evaluate(()=>({x:document.documentElement.scrollWidth-document.documentElement.clientWidth,y:document.documentElement.scrollHeight-innerHeight,controls:[...document.querySelectorAll('.entry-header-tools button')].map(el=>el.getBoundingClientRect().toJSON())}));
      expect(bounds.x,`${width} ${route}`).toBeLessThanOrEqual(1);expect(bounds.y,`${width} ${route}`).toBeLessThanOrEqual(1);
      for(let i=0;i<bounds.controls.length;i++){const r=bounds.controls[i];expect(r.right).toBeLessThanOrEqual(width);if(i)expect(r.left).toBeGreaterThanOrEqual(bounds.controls[i-1].right);}
    }
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>goto('landing'));await expect(page.locator('#activity-indicator')).toBeHidden();await page.screenshot({path:'.qa/night-entry-mobile.png'});
  await page.evaluate(()=>enterGuest());await expect(page.locator('.post-card').first()).toBeVisible();
  await page.screenshot({path:'.qa/night-lounge-mobile.png',fullPage:true});
});

test('night fallback keeps the original character, heart and login usable without WebGL',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('mindly-color-theme','night');
    const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'||type==='webgl2'?null:getContext.call(this,type,...args);};
  });
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  await expect(page.locator('.entry-mindy img')).toBeVisible();await expect(page.locator('.chat-heart')).toBeVisible();await expect(page.locator('.entry-lamp')).toBeVisible();
  await page.getByRole('button',{name:'마인들리 시작하기'}).click();await expect(page.locator('#auth-username')).toBeEditable();
  await page.locator('.theme-control').click();await expect(page.locator('html')).toHaveAttribute('data-theme','day');await expect(page.locator('.entry-mindy img')).toBeVisible();
});
