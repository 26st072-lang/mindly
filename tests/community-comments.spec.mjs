import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';
const debateId='aaaabbbb-1111-4111-8111-111111111111',mineId='aaaabbbb-2222-4222-8222-222222222222',otherId='aaaabbbb-3333-4333-8333-333333333333';
async function setup(page){
  await mockApp(page,{user:true});
  await page.route('**/site-config.js',route=>route.fulfill({body:"window.MINDLY_CONFIG={workerUrl:'https://worker.test'};",contentType:'text/javascript'}));
  const opinions=[{id:mineId,debateId,alias:'익명 1',stance:'agree',content:'자율적으로 선택할 기회를 주면 좋겠습니다.',createdAt:Date.now()-2000,isMine:true,revision:0,parentId:null},{id:otherId,debateId,alias:'익명 2',stance:'disagree',content:'수업 집중을 위해 사용 기준이 필요합니다.',createdAt:Date.now()-1000,isMine:false,revision:0,parentId:null}],calls=[];
  let debate={id:debateId,title:'학교에서 휴대전화 사용을 허용해야 할까요?',summary:'자율적인 사용을 허용하자는 의견과 수업 집중을 위해 사용 기준을 정하자는 의견이 있어요.',issues:['학생의 자율성과 수업 집중을 어떻게 함께 보장할까요?','긴급한 연락이 필요한 상황에는 어떻게 해야 할까요?'],agreeLabel:'자율적으로 사용해요',disagreeLabel:'사용 기준이 필요해요',createdAt:Date.now(),heartCount:0,commentCount:2,agreeCount:1,disagreeCount:1,hearted:false,myStance:'agree',isMine:false};
  await page.route('https://worker.test/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();calls.push({path:url.pathname,method:request.method(),body});
    const send=(json,status=200)=>route.fulfill({json,status,headers:{'Access-Control-Allow-Origin':'*'}});
    if(url.pathname==='/v1/config')return send({mode:'free',provider:'Gemini',model:'gemini-3.5-flash-lite',ready:true});
    if(url.pathname==='/v1/debates')return send({items:[debate],hasMore:false});
    if(url.pathname==='/v1/me')return send({items:opinions.filter(item=>item.isMine&&!item.deleted).map(item=>({...item,title:debate.title})),hasMore:false});
    if(url.pathname.endsWith('/opinions')){
      const opinion={id:body.requestId,debateId,alias:'익명 1',stance:body.stance,content:body.content,parentId:body.parentId,revision:0,createdAt:Date.now(),isMine:true};opinions.push(opinion);debate={...debate,commentCount:debate.commentCount+1};return send({debate,opinion},201);
    }
    const item=opinions.find(item=>url.pathname.endsWith('/'+item.id));
    if(item&&request.method()==='PATCH'){
      if(body.content.includes('멍청'))return send({code:'REVISE',message:'표현을 다듬어주세요.',feedback:{reason:'상대를 비하하는 표현이 포함되어 있어요.',suggestion:'구체적인 근거를 설명해 주시면 좋겠습니다.',flags:['비하']}},422);
      Object.assign(item,{content:body.content,revision:item.revision+1,editedAt:Date.now()});return send({debate,opinion:item});
    }
    if(item&&request.method()==='DELETE'){Object.assign(item,{content:'',deleted:true,revision:item.revision+1});debate={...debate,commentCount:debate.commentCount-1};return send({debate,opinion:item});}
    return send({debate,opinions,hasMore:false});
  });
  await page.goto('/');await page.locator('.home-welcome').waitFor();await page.locator('.post-card').first().waitFor();return {opinions,calls};
}

test('home has a large dinosaur, one recommendation of each kind and no lounge tabs; sidebar stays in place across routes',async({page})=>{
  await setup(page);await page.setViewportSize({width:1920,height:1080});
  await expect(page.locator('.home-welcome .mascot-img')).toBeVisible();
  expect((await page.locator('.home-welcome .mascot-scene').boundingBox()).width).toBeGreaterThanOrEqual(240);
  await expect(page.locator('.home-recommendations .post-card')).toHaveCount(2);
  await expect(page.locator('.home-recommendations .debate-card')).toHaveCount(1);
  await expect(page.locator('.tabs-main')).toHaveCount(0);
  const names=await page.locator('.sidebar .side-nav .nav-item span').allTextContents();
  expect(names.indexOf('익명 토론 게시판')).toBeLessThan(names.indexOf('마음 라운지'));
  const before=await page.locator('.sidebar .side-nav').boundingBox();
  for(const route of ['debate','archive','main','postDetail']){
    await page.evaluate(route=>goto(route,{mainTab:'concern',currentPostId:'p0'}),route);
    const after=await page.locator('.sidebar .side-nav').boundingBox();expect(after.x).toBeCloseTo(before.x,0);expect(after.y).toBeCloseTo(before.y,0);
  }
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>goto('main',{mainTab:'home'}));expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);}
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.qa/new-community-home.png',fullPage:true});
});

test('concern authors can reply, edit and delete their own comment while replies and other comments survive',async({page})=>{
  await setup(page);await page.evaluate(()=>{window.__test.records.posts[0].comments=[{id:'mine',authorId:'reader',authorNickname:'내 공룡',authorAvatar:0,content:'처음 남긴 댓글입니다.',createdAt:Date.now()},{id:'other',authorId:'friend',authorNickname:'다른 친구',authorAvatar:1,content:'다른 사람의 의견입니다.',createdAt:Date.now()}];window.__test.emit('posts');goto('postDetail',{currentPostId:'p0'});});
  await expect(page.getByRole('button',{name:'내 댓글 삭제',exact:true})).toHaveCount(1);
  await expect(page.locator('[data-key="comment-p0-other"]').getByRole('button',{name:/수정|삭제/})).toHaveCount(0);
  await page.getByRole('button',{name:'내 공룡 댓글에 답글'}).click();await page.locator('#comment-input').fill('답글을 통해 마음을 나누고 싶어요.');await page.getByRole('button',{name:'답글 보내기',exact:true}).click();
  await expect(page.locator('.comment-reply')).toContainText('답글을 통해 마음을 나누고 싶어요.');
  expect(await page.evaluate(()=>window.__test.records.posts[0].comments.at(-1).parentId)).toBe('mine');
  await page.locator('[data-key="comment-p0-mine"]').getByRole('button',{name:'내 댓글 수정'}).click();await page.getByRole('textbox',{name:'댓글 수정 내용'}).fill('수정한 원래 댓글입니다.');await page.getByRole('button',{name:'수정 저장',exact:true}).click();
  await expect(page.locator('[data-key="comment-p0-mine"]')).toContainText('수정한 원래 댓글입니다.');
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-key="comment-p0-mine"]').getByRole('button',{name:'내 댓글 삭제'}).click();
  await expect(page.locator('[data-key="comment-p0-mine"]')).toContainText('삭제된 댓글입니다.');await expect(page.locator('.comment-reply')).toContainText('답글을 통해 마음을 나누고 싶어요.');
  expect(await page.evaluate(()=>window.__test.records.posts[0].comments[0].content)).toBe('');
});

test('debate replies keep parent IDs, use the same anonymous number and have distinct stance colors',async({page})=>{
  const state=await setup(page);await page.evaluate(id=>goto('debateDetail',{currentDebateId:id}),debateId);
  await page.locator(`[data-key="opinion-${otherId}"]`).getByRole('button',{name:'답글',exact:true}).click();await expect(page.locator('.reply-context')).toContainText('익명 2');
  await page.getByRole('radio',{name:/반대/}).check();await page.locator('#debate-opinion').fill('사용 기준을 함께 논의하는 것이 좋겠어요.');await page.getByRole('button',{name:'입장과 의견 제출'}).click();
  await expect(page.locator('.comment-reply')).toContainText('사용 기준을 함께 논의하는 것이 좋겠어요.');
  expect(state.opinions.at(-1).parentId).toBe(otherId);expect(state.opinions.at(-1).alias).toBe('익명 1');
  const colors=await page.evaluate(()=>['.stance-agree','.stance-disagree'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor));expect(colors[0]).not.toBe(colors[1]);
  const reply=state.opinions.at(-1),row=page.locator(`[data-key="opinion-${reply.id}"]`);
  await row.getByRole('button',{name:'내 토론 댓글 수정'}).click();await page.getByRole('textbox',{name:'토론 댓글 수정 내용'}).fill('서로 동의할 수 있는 사용 기준을 함께 정해봐요.');await page.getByRole('button',{name:'표현 확인 후 수정 저장'}).click();
  await expect(row).toContainText('함께 정해봐요.');expect(reply.parentId).toBe(otherId);
  page.once('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:'내 토론 댓글 삭제'}).click();await expect(row).toContainText('삭제된 댓글입니다.');
  await expect(page.locator('.debate-opinions .post-title-link')).toHaveCount(0);await page.locator('.sidebar').getByRole('button',{name:'홈',exact:true}).click();await expect(page.locator('.home-welcome')).toBeVisible();
});

test('debate edits are moderated with a manual correction, and deleting the author comment retains its replies',async({page})=>{
  const state=await setup(page);await page.evaluate(id=>goto('debateDetail',{currentDebateId:id}),debateId);
  await expect(page.locator(`[data-key="opinion-${otherId}"]`).getByRole('button',{name:/수정|삭제/})).toHaveCount(0);
  await page.getByRole('button',{name:'내 토론 댓글 수정',exact:true}).click();await page.getByRole('textbox',{name:'토론 댓글 수정 내용'}).fill('그렇게 생각하다니 정말 멍청하네요.');await page.getByRole('button',{name:'표현 확인 후 수정 저장'}).click();
  await expect(page.getByRole('alertdialog')).toContainText('구체적인 근거를 설명해 주시면 좋겠습니다.');expect(state.opinions[0].revision).toBe(0);
  await page.getByRole('button',{name:'확인하고 직접 수정하기'}).click();await expect(page.getByRole('textbox',{name:'토론 댓글 수정 내용'})).toHaveValue('그렇게 생각하다니 정말 멍청하네요.');
  await page.getByRole('textbox',{name:'토론 댓글 수정 내용'}).fill('구체적인 근거를 설명해 주시면 좋겠습니다.');await page.getByRole('button',{name:'표현 확인 후 수정 저장'}).click();await expect(page.locator(`[data-key="opinion-${mineId}"]`)).toContainText('수정됨');expect(state.opinions[0].revision).toBe(1);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'내 토론 댓글 삭제',exact:true}).click();await expect(page.locator(`[data-key="opinion-${mineId}"]`)).toContainText('삭제된 댓글입니다.');expect(state.opinions[0].content).toBe('');
});
