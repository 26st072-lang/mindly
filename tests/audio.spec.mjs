import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';

test('music starts from the sound button, continues across routes, and can be muted anywhere',async({page})=>{
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  expect(await page.evaluate(()=>musicState.context)).toBeNull();
  await page.getByRole('button',{name:'배경음악 켜기',exact:true}).click();
  await expect(page.getByRole('button',{name:'배경음악 끄기',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>musicState.context.state)).toBe('running');
  await page.evaluate(()=>{window.__musicContext=musicState.context;});
  await page.getByRole('button',{name:'먼저 둘러볼게요'}).click();
  await expect(page.locator('.post-card').first()).toBeVisible();
  expect(await page.evaluate(()=>musicState.context===window.__musicContext&&musicState.context.state==='running')).toBe(true);
  await page.getByRole('button',{name:'배경음악 끄기',exact:true}).click();
  await expect(page.getByRole('button',{name:'배경음악 켜기',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect.poll(()=>page.evaluate(()=>musicState.context.state)).toBe('suspended');
  expect(await page.evaluate(()=>musicState.timer)).toBeNull();
  await expect.poll(()=>page.evaluate(()=>musicState.instrument.activeVoices)).toBe(0);
});

test('audio startup failure leaves the button usable for retry',async({page})=>{
  await page.addInitScript(()=>{const resume=AudioContext.prototype.resume;let rejectOnce=true;AudioContext.prototype.resume=function(){if(rejectOnce){rejectOnce=false;return Promise.reject(new Error('Audio unavailable'));}return resume.call(this);};});
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  await page.getByRole('button',{name:'배경음악 켜기',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('음악을 시작하지 못했어요');
  await expect(page.getByRole('button',{name:'배경음악 켜기',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'배경음악 켜기',exact:true}).click();
  await expect(page.getByRole('button',{name:'배경음악 끄기',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>musicState.context.state)).toBe('running');
});

test('the ambient score produces audible unclipped audio with a soft opening',async({page})=>{
  await mockApp(page);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  const levels=await page.evaluate(async()=>{
    const context=new OfflineAudioContext(2,22050*20,22050),instrument=createAmbientInstrument(context);
    instrument.fade(.22,1.4);scheduleAmbientBar(instrument,0,0);
    const output=await context.startRendering(),data=output.getChannelData(0);let sum=0,peak=0,opening=0;
    for(let i=0;i<data.length;i++){sum+=data[i]**2;peak=Math.max(peak,Math.abs(data[i]));if(i<2205)opening=Math.max(opening,Math.abs(data[i]));}
    return {rms:Math.sqrt(sum/data.length),peak,opening};
  });
  expect(levels.rms).toBeGreaterThan(.002);expect(levels.rms).toBeLessThan(.06);
  expect(levels.peak).toBeLessThan(.35);expect(levels.opening).toBeLessThan(.005);
});
