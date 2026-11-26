import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';
const id='aaaabbbb-1111-4111-8111-111111111111',mine='aaaabbbb-2222-4222-8222-222222222222',other='aaaabbbb-3333-4333-8333-333333333333';
async function setup(page){
  await mockApp(page,{user:true});
  await page.route('**/site-config.js',route=>route.fulfill({body:"window.MINDLY_CONFIG={workerUrl:'https://worker.test'};",contentType:'text/javascript'}));
  const debate={id,title:'학교에서 휴대전화 사용을 허용해야 할까요?',summary:'학교생활에서 학생의 자율성과 수업 집중을 함께 지키기 위한 이야기입니다.',issues:['자율성과 수업 집중을 어떻게 보장할까요?','긴급 연락은 어떻게 할까요?'],agreeLabel:'사용 허용',disagreeLabel:'사용 제한',createdAt:Date.now(),heartCount:0,commentCount:2,agreeCount:1,disagreeCount:1,hearted:false};
  const opinions=[{id:mine,debateId:id,alias:'익명 1',stance:'agree',content:'서로의 입장을 존중하며 논의하면 좋겠습니다.',createdAt:Date.now(),isMine:true,revision:0},{id:other,debateId:id,alias:'익명 2',stance:'disagree',content:'수업 집중을 위해 적절한 기준이 필요합니다.',createdAt:Date.now(),isMine:false,revision:0}],calls=[];
  await page.route('https://worker.test/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();calls.push({path:url.pathname,query:url.searchParams.get('q'),method:request.method(),body});
    const send=(json,status=200)=>route.fulfill({json,status,headers:{'Access-Control-Allow-Origin':'*'}});
    if(url.pathname==='/v1/config')return send({mode:'free',provider:'Gemini',ready:true});
    if(url.pathname==='/v1/debates'){const q=url.searchParams.get('q')||'';return send({items:!q||[debate.title,debate.summary].join(' ').includes(q)?[debate]:[],hasMore:false});}
    if(url.pathname.endsWith('/opinions')){
      if(body.content.includes('멍청'))return send({code:'REVISE',message:'표현을 다듬어주세요.',feedback:{reason:'비하하는 표현이에요.',suggestion:'구체적인 근거를 함께 살펴보면 좋겠습니다.'}},422);
      const opinion={id:body.requestId,debateId:id,alias:'익명 1',content:body.content,stance:body.stance,parentId:body.parentId,createdAt:Date.now(),isMine:true,revision:0};opinions.push(opinion);return send({debate,opinion},201);
    }
    const item=opinions.find(item=>url.pathname.endsWith('/'+item.id));
    if(item&&request.method()==='DELETE'){Object.assign(item,{deleted:true,deletedByAdmin:!item.isMine,content:'',revision:item.revision+1});return send({debate,opinion:item});}
    return send({debate,opinions,hasMore:false});
  });
  await page.goto('/');await page.locator('.home-welcome').waitFor();return {debate,opinions,calls};
}

test('inline replies have independent drafts, moderation focus and the full 1000-character allowance',async({page})=>{
  const state=await setup(page);await page.evaluate(id=>goto('debateDetail',{currentDebateId:id}),id);
  await page.locator('#debate-opinion').fill('일반 의견 초안은 답글을 작성해도 유지되어야 합니다.');
  await page.locator(`[data-key="opinion-${other}"]`).getByRole('button',{name:'답글',exact:true}).click();
  const inline=page.locator(`[data-key="opinion-${other}"] .inline-reply`),input=inline.locator('textarea');
  await expect(inline).toBeVisible();await inline.getByRole('radio',{name:'반대',exact:true}).check();
  const colors=await page.locator('.opinion-card').evaluateAll(cards=>cards.map(card=>getComputedStyle(card).backgroundColor));
  const blue=colors[0].match(/\d+/g).map(Number);expect(blue[2]).toBeGreaterThan(blue[0]);expect(colors[1]).toBe('rgb(255, 255, 255)');
  await page.locator('.debate-opinions').screenshot({path:'.qa/comments-inline-desktop.png'});
  await page.setViewportSize({width:390,height:900});await page.locator('.debate-opinions').screenshot({path:'.qa/comments-inline-mobile.png'});
  await input.fill('멍청하다는 표현은 다시 수정해야 합니다.');await inline.getByRole('button',{name:'답글 제출'}).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'확인하고 직접 수정하기'}).click();
  await expect(input).toBeFocused();await expect(input).toHaveValue('멍청하다는 표현은 다시 수정해야 합니다.');
  await input.fill('가'.repeat(1000));await expect(input).toHaveAttribute('maxlength','1000');await expect(inline.locator('.comment-limit')).toContainText('1000 / 1000');
  await inline.getByRole('button',{name:'답글 제출'}).click();await expect(inline).toHaveCount(0);
  expect(state.opinions.at(-1).parentId).toBe(other);expect(state.opinions.at(-1).content.length).toBe(1000);expect(state.opinions.at(-1).stance).toBe('disagree');
  await expect(page.locator('#debate-opinion')).toHaveValue('일반 의견 초안은 답글을 작성해도 유지되어야 합니다.');
  const before=state.calls.filter(call=>call.method==='POST').length;
  await page.evaluate(async id=>{opinionDraft(id).stance='agree';opinionDraft(id).content='가'.repeat(1001);await submitDebateOpinion(id);},id);
  expect(state.calls.filter(call=>call.method==='POST').length).toBe(before);await expect(page.locator('#toast')).toContainText('1000');
});

test('admins can delete others anonymous opinions but only edit their own and see moderation tombstones',async({page})=>{
  await setup(page);await page.evaluate(id=>{session.isAdmin=true;goto('debateDetail',{currentDebateId:id});},id);
  const otherRow=page.locator(`[data-key="opinion-${other}"]`);
  await expect(otherRow.getByRole('button',{name:/수정/})).toHaveCount(0);await expect(otherRow.getByRole('button',{name:'토론 댓글 삭제',exact:true})).toBeVisible();
  await expect(page.locator(`[data-key="opinion-${mine}"]`).getByRole('button',{name:'내 토론 댓글 수정'})).toBeVisible();
  await page.evaluate(({id,other})=>startDebateCommentEdit(id,other),{id,other});await expect(otherRow.locator('textarea')).toHaveCount(0);
  page.once('dialog',dialog=>dialog.accept());await otherRow.getByRole('button',{name:'토론 댓글 삭제',exact:true}).click();
  await expect(otherRow).toContainText('관리자에 의해 삭제된 댓글입니다');await expect(otherRow.getByRole('button')).toHaveCount(0);
});

test('comments fold after five visible lines, expand without altering content, and keep actions on the right',async({page})=>{
  await setup(page);await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{window.__test.records.posts[0].comments=[{id:'long',authorId:'reader',authorNickname:'내 댓글',authorAvatar:0,content:Array.from({length:6},(_,i)=>'댓글의 '+(i+1)+'번째 줄입니다.').join('\n'),createdAt:Date.now()},{id:'five',authorId:'reader',authorNickname:'다섯 줄',authorAvatar:0,content:'첫째\n둘째\n셋째\n넷째\n다섯째',createdAt:Date.now()}];window.__test.emit('posts');goto('postDetail',{currentPostId:'p0'});});
  const row=page.locator('[data-key="comment-p0-long"]'),text=row.locator('.comment-text'),more=row.getByRole('button',{name:'더보기',exact:true});
  await expect(more).toBeVisible();await expect(page.locator('[data-key="comment-p0-five"] .comment-more')).toBeHidden();
  const collapsed=(await text.boundingBox()).height;await more.click();await expect(row.getByRole('button',{name:'접기',exact:true})).toHaveAttribute('aria-expanded','true');
  expect((await text.boundingBox()).height).toBeGreaterThan(collapsed+10);await expect(text).toContainText('6번째');await row.getByRole('button',{name:'접기',exact:true}).click();
  expect((await text.boundingBox()).height).toBeCloseTo(collapsed,0);
  const placement=await row.locator('.comment-actions').evaluate(actions=>({rightGap:actions.getBoundingClientRect().right-actions.lastElementChild.getBoundingClientRect().right,padding:parseFloat(getComputedStyle(actions.closest('.comment-item')).paddingTop)}));
  expect(Math.abs(placement.rightGap)).toBeLessThanOrEqual(1);expect(placement.padding).toBeLessThanOrEqual(12);
  expect(await page.evaluate(()=>window.__test.writes.length)).toBe(0);
  await page.evaluate(({id,mine})=>{const state=debateState.details.get(id)||{debate:debateState.list[0],opinions:[],loaded:true};state.opinions=[{id:mine,debateId:id,alias:'익명 1',stance:'agree',content:'이유를 함께 살펴보면 좋겠습니다. '.repeat(35),createdAt:Date.now(),isMine:true}];debateState.details.set(id,state);goto('debateDetail',{currentDebateId:id});},{id,mine});
  await expect(page.locator('.opinion-card .comment-more')).toBeVisible();
});

test('home search shows concern and debate tabs with independent result sets',async({page})=>{
  await setup(page);await page.locator('#search-input').fill('학교');await page.locator('#search-input').press('Enter');
  await expect(page.getByRole('tab').first()).toHaveAttribute('id','search-tab-debate');
  await expect(page.getByRole('tab',{name:/익명 토론/})).toHaveAttribute('aria-selected','true');await expect(page.locator('#search-panel .debate-card')).toHaveCount(1);await expect(page.locator('#search-panel')).toContainText('휴대전화');
  await page.getByRole('tab',{name:/고민상담/}).click();await expect(page.locator('#search-panel .post-card')).toHaveCount(8);
  await page.getByRole('tab',{name:/익명 토론/}).click();
  await page.locator('#search-input').fill('찾을수없는검색어');await page.locator('#search-input').press('Enter');await expect(page.locator('#search-panel')).toContainText('검색 결과가 없어요');
  await page.getByRole('tab',{name:/고민상담/}).click();await expect(page.locator('#search-panel')).toContainText('검색 결과가 없어요');
});

test('slower older search responses cannot replace newer search results',async({page})=>{
  const state=await setup(page);let release;const held=new Promise(resolve=>release=resolve);
  await page.route('https://worker.test/v1/debates?**',async route=>{
    const q=new URL(route.request().url()).searchParams.get('q');if(q===null)return route.fallback();if(q==='먼저')await held;
    return route.fulfill({json:{items:[{...state.debate,title:q+' 검색 결과'}],hasMore:false}});
  });
  await page.locator('#search-input').fill('먼저');await page.locator('#search-input').press('Enter');
  await page.locator('#search-input').fill('나중');await page.locator('#search-input').press('Enter');await page.getByRole('tab',{name:/익명 토론/}).click();
  await expect(page.locator('#search-panel')).toContainText('나중 검색 결과');release();
  await page.waitForResponse(response=>response.url().includes(encodeURIComponent('먼저')));await expect(page.locator('#search-panel')).toContainText('나중 검색 결과');
});

test('sidebar touches the left viewport and phone logos stay centered without overlapping controls',async({page})=>{
  await mockApp(page);await page.goto('/');await page.locator('.landing').waitFor();
  for(const width of [320,360,390,600,768]){
    await page.setViewportSize({width,height:900});
    for(const route of ['landing','mypage','main']){
      await page.evaluate(route=>goto(route,{mainTab:'home'}),route);
      if(width>700&&route!=='main')continue;
      const result=await page.evaluate(route=>{
        const header=document.querySelector(route==='main'?'.topbar':route==='landing'?'.landing-header':'.auth-brand'),brand=header.querySelector(route==='main'?'.mobile-brand':route==='landing'?'.brand':'button:first-child');
        const h=header.getBoundingClientRect(),b=brand.getBoundingClientRect();
        const overlaps=[...header.querySelectorAll('button,summary')].filter(el=>el!==brand&&!el.contains(brand)&&!brand.contains(el)).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height&&r.left<b.right-1&&r.right>b.left+1&&r.top<b.bottom-1&&r.bottom>b.top+1);
        return {offset:Math.abs(b.left+b.width/2-h.left-h.width/2),overlaps:overlaps.length,overflow:document.documentElement.scrollWidth-innerWidth};
      },route);
      expect(result.offset,`${width} ${route}`).toBeLessThanOrEqual(1);expect(result.overlaps,`${width} ${route}`).toBe(0);expect(result.overflow).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>goto('main',{mainTab:'home'}));expect((await page.locator('.sidebar').boundingBox()).x).toBe(0);
});

test('saved concern comments use the same five-line expand and collapse behavior',async({page})=>{
  await setup(page);await page.evaluate(()=>{window.__test.records.posts[0].comments=[{id:'archive-long',authorId:'reader',authorNickname:'나',content:'첫 줄\n두 번째\n세 번째\n네 번째\n다섯 번째\n마지막 여섯 번째',createdAt:Date.now()}];window.__test.emit('posts');goto('archive',{archiveGroup:'concern',archiveTab:'comments'});});
  const row=page.locator('[data-key="my-comment-archive-long"]');await expect(row.getByRole('button',{name:'더보기',exact:true})).toBeVisible();
  await row.getByRole('button',{name:'더보기',exact:true}).click();await expect(row.getByRole('button',{name:'접기',exact:true})).toHaveAttribute('aria-expanded','true');await expect(row).toContainText('마지막 여섯 번째');
  expect(await page.evaluate(()=>window.__test.writes.length)).toBe(0);
});
