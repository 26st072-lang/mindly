import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';
const id='aaaabbbb-1111-4111-8111-111111111111',analysisId='aaaabbbb-2222-4222-8222-222222222222';
const debate={id,title:'학교에서 휴대전화를 자유롭게 사용해도 될까요?',summary:'자율적으로 사용할 권리가 중요하다는 의견과 수업 집중을 위해 제한해야 한다는 의견이 있어요.',issues:['수업 중 집중과 자율성을 어떻게 조화시킬까요?','긴급한 연락을 위한 사용은 어떻게 정할까요?'],agreeLabel:'자율적으로 사용해도 돼요',disagreeLabel:'수업 중에는 제한해야 해요',createdAt:Date.now(),heartCount:2,commentCount:0,agreeCount:0,disagreeCount:0,hearted:false,myStance:null,isMine:false};
async function setup(page,{reject=false,fail=false,restricted=false}={}){
  await mockApp(page,{user:true});
  await page.route('**/site-config.js',route=>route.fulfill({body:"window.MINDLY_CONFIG={workerUrl:'https://worker.test'};",contentType:'text/javascript'}));
  const calls=[],opinions=[];let current={...debate};
  await page.route('https://worker.test/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();calls.push({path:url.pathname,method:request.method(),body});
    const send=(json,status=200)=>route.fulfill({json,status,headers:{'Access-Control-Allow-Origin':'*'}});
    if(url.pathname==='/v1/config')return send({mode:'free',provider:'Gemini',model:'gemini-3.5-flash-lite',ready:true});
    if(url.pathname==='/v1/admin/settings')return send({mode:'free',available:{free:true,paid:true},models:{free:'gemini-3.5-flash-lite',paid:'openai/gpt-6-luna'}});
    if(url.pathname==='/v1/admin/check-ai')return restricted?send({code:'GEMINI_FREE_TIER_UNAVAILABLE',message:'Google이 이 프로젝트의 무료 Gemini API 사용을 허용하지 않고 있어요.'},403):send({ok:true,provider:'Gemini',model:'gemini-3.5-flash-lite'});
    if(url.pathname==='/v1/analyze'&&restricted)return send({code:'GEMINI_FREE_TIER_UNAVAILABLE',message:'Google이 이 프로젝트의 무료 Gemini API 사용을 허용하지 않고 있어요.'},403);
    if(url.pathname==='/v1/analyze')return send({analysisId,readable:true,ocrText:'개인정보를 가린 댓글 내용입니다.',...debate});
    if(url.pathname==='/v1/me')return send({items:[],hasMore:false});
    if(url.pathname==='/v1/debates'&&request.method()==='POST'){current={...current,...body,isMine:true};return send({debate:current},201);}
    if(url.pathname==='/v1/debates')return send({items:[current],hasMore:false});
    if(url.pathname.endsWith('/opinions')){
      if(fail)return send({code:'AI_UNAVAILABLE',message:'AI 검사를 완료하지 못했어요. 잠시 후 다시 시도해주세요.'},503);
      if(reject&&body.content.includes('우스워'))return send({code:'REVISE',message:'표현을 다듬어주세요.',feedback:{reason:'상대를 조롱하는 표현이 포함되어 있어요.',suggestion:'저는 다른 이유로 반대해요.',flags:['조롱']}},422);
      const opinion={id:body.requestId,debateId:id,alias:'익명 A1B2',content:body.content,stance:body.stance,createdAt:Date.now(),isMine:true};opinions.push(opinion);current={...current,commentCount:opinions.length,agreeCount:body.stance==='agree'?1:0,disagreeCount:body.stance==='disagree'?1:0,myStance:body.stance};return send({opinion,debate:current},201);
    }
    if(url.pathname.endsWith('/heart')){current={...current,hearted:body.hearted,heartCount:body.hearted?3:2};return send({debate:current});}
    return send({debate:current,opinions,hasMore:false});
  });
  await page.goto('/');await expect(page.locator('.post-card').first()).toBeVisible();return {calls,opinions};
}
test('home links to both communities; navigation removes diary and moves hearts into organized archives',async({page})=>{
  await setup(page);
  await expect(page.getByRole('heading',{name:'따뜻한 고민상담'})).toBeVisible();await expect(page.getByRole('heading',{name:'익명 토론 게시판',exact:true})).toBeVisible();
  await expect(page.locator('.side-nav')).not.toContainText('일기장');await expect(page.locator('.side-nav')).not.toContainText('공감한 이야기');await expect(page.locator('body')).not.toContainText('마인디');
  await page.evaluate(()=>{window.__test.records.posts[0].comments=[{id:'mine',authorId:'reader',content:'제가 남긴 의견이에요.',createdAt:Date.now()}];window.__test.emit('posts');goto('archive');});
  await expect(page.getByRole('tab',{name:'고민상담',exact:true})).toBeVisible();await page.getByRole('tab',{name:/내가 쓴 댓글/}).click();await expect(page.locator('#archive-list-panel')).toContainText('제가 남긴 의견이에요.');
  await page.getByRole('tab',{name:/공감한 이야기/}).click();await expect(page.getByRole('tab',{name:/공감한 이야기/})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'익명 토론',exact:true}).click();await expect(page.getByRole('tab',{name:'내가 쓴 후일담',exact:false})).toHaveCount(0);await expect(page.getByRole('tab',{name:'내가 쓴 댓글',exact:true})).toBeVisible();
});
test('screenshots produce an editable neutral draft and publishing is an explicit second step',async({page})=>{
  const state=await setup(page);await page.evaluate(()=>startDebateWriting());
  await page.locator('#debate-images').setInputFiles('assets/mascot.png');
  await expect(page.locator('.image-previews img')).toBeVisible();await page.locator('#debate-consent').check();await page.getByRole('button',{name:'사진 읽고 토론 초안 만들기'}).click();
  await expect(page.locator('#debate-title')).toHaveValue(debate.title);expect(state.calls.filter(call=>call.method==='POST'&&call.path==='/v1/debates')).toHaveLength(0);
  await page.locator('#debate-title').fill('학교 휴대전화 사용, 어떤 기준이 필요할까요?');await page.getByRole('button',{name:'표현 확인 후 토론 게시하기'}).click();
  await expect(page.locator('.debate-detail h1')).toHaveText('학교 휴대전화 사용, 어떤 기준이 필요할까요?');expect(state.calls.find(call=>call.path==='/v1/analyze').body.images).toHaveLength(1);
});
test('stance and reason are mandatory; moderation modal preserves draft and requires a manual edit and resubmit',async({page})=>{
  const state=await setup(page,{reject:true});await page.evaluate(id=>goto('debateDetail',{currentDebateId:id}),id);await expect(page.locator('#debate-opinion')).toBeVisible();
  await page.getByRole('button',{name:'입장과 의견 제출'}).click();expect(state.opinions).toHaveLength(0);
  await page.getByRole('radio',{name:/찬성/}).check();await page.locator('#debate-opinion').fill('그렇게 생각하는 사람은 우스워요.');await page.getByRole('button',{name:'입장과 의견 제출'}).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();await expect(page.getByRole('alertdialog')).toContainText('저는 다른 이유로 반대해요.');expect(state.opinions).toHaveLength(0);
  await page.getByRole('button',{name:'확인하고 직접 수정하기'}).click();await expect(page.locator('#debate-opinion')).toHaveValue('그렇게 생각하는 사람은 우스워요.');await expect(page.locator('#debate-opinion')).toBeFocused();
  await page.locator('#debate-opinion').fill('스스로 책임지는 연습도 필요하다고 생각해요.');await page.getByRole('button',{name:'입장과 의견 제출'}).click();
  await expect(page.locator('.debate-opinions')).toContainText('스스로 책임지는 연습도 필요하다고 생각해요.');expect(state.opinions).toHaveLength(1);await expect(page.locator('#debate-opinion')).toHaveValue('');
});
test('provider errors keep the opinion and do not bypass moderation',async({page})=>{
  const state=await setup(page,{fail:true});await page.evaluate(id=>goto('debateDetail',{currentDebateId:id}),id);await page.getByRole('radio',{name:/반대/}).check();await page.locator('#debate-opinion').fill('집중을 위해 사용 시간을 정하면 좋겠어요.');await page.getByRole('button',{name:'입장과 의견 제출'}).click();await expect(page.getByRole('alert')).toContainText('AI 검사를 완료하지 못했어요');await expect(page.locator('#debate-opinion')).toHaveValue('집중을 위해 사용 시간을 정하면 좋겠어요.');expect(state.opinions).toHaveLength(0);
});
test('new debate, archive and music controls fit small screens and dark mode',async({page})=>{
  await setup(page);
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const route of ['main','debate','debateDetail','archive','debateWrite']){
      await page.evaluate(({route,id})=>{ui.currentDebateId=id;goto(route);},{route,id});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    }
  }
  await page.evaluate(()=>{goto('debateDetail');});await page.locator('.theme-control').click();
  const axe=await import('node:fs/promises').then(fs=>fs.readFile('node_modules/axe-core/axe.min.js','utf8'));await page.addScriptTag({content:axe});
  const results=await page.evaluate(()=>axe.run(document.querySelector('#root'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(results.violations.filter(item=>['serious','critical'].includes(item.impact))).toEqual([]);
  await page.locator('.music-info summary').click();await expect(page.locator('.music-popover')).toContainText('마인들리의 작은 쉼표');await page.getByRole('slider',{name:'배경음악 음량'}).evaluate(input=>{input.value='80';input.dispatchEvent(new Event('input',{bubbles:true}));});expect(await page.evaluate(()=>musicState.volume)).toBe(80);
  await page.screenshot({path:'.qa/debate-desktop.png',fullPage:true});
});
test('admin inference check distinguishes a configured key from a restricted Gemini project',async({page})=>{
  const state=await setup(page,{restricted:true});
  await page.evaluate(()=>{session.isAdmin=true;goto('adminPanel');});
  await page.getByRole('button',{name:'AI 실제 연결 확인'}).click();
  await expect(page.locator('.ai-connection-check')).toContainText('무료 Gemini API 사용을 허용하지 않고');
  await expect(page.locator('.ai-connection-check')).toContainText('GEMINI_FREE_TIER_UNAVAILABLE');
  expect(state.calls.filter(call=>call.path==='/v1/admin/check-ai')).toHaveLength(1);
});

test('admin check reports success only after the actual inference request completes',async({page})=>{
  const state=await setup(page);
  await page.evaluate(()=>{session.isAdmin=true;goto('adminPanel');});
  await expect(page.locator('.ai-connection-check')).not.toContainText('실제 응답을 확인했어요');
  await page.getByRole('button',{name:'AI 실제 연결 확인'}).click();
  await expect(page.locator('.ai-connection-check')).toContainText('Gemini의 실제 응답을 확인했어요. (gemini-3.5-flash-lite)');
  expect(state.calls.filter(call=>call.path==='/v1/admin/check-ai')).toHaveLength(1);
});
test('a photo provider restriction preserves attachments and input for a retry after access is fixed',async({page})=>{
  await setup(page,{restricted:true});await page.evaluate(()=>startDebateWriting());
  await page.locator('#debate-images').setInputFiles('assets/mascot.png');await expect(page.locator('.image-previews img')).toBeVisible();
  await page.locator('#debate-consent').check();await page.getByRole('button',{name:'사진 읽고 토론 초안 만들기'}).click();
  await expect(page.getByRole('alert')).toContainText('무료 Gemini API 사용을 허용하지 않고');
  await expect(page.locator('.image-previews img')).toBeVisible();await expect(page.locator('#debate-consent')).toBeChecked();
});
