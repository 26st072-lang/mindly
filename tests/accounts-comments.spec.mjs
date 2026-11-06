import {test,expect} from '@playwright/test';
import {mockApp} from './fixture.mjs';

async function openComments(page){
  await mockApp(page,{user:true});await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  await page.evaluate(()=>{
    window.__test.records.posts[0].comments=[
      {id:'mine',authorId:'reader',authorNickname:'포근한 공룡',authorAvatar:1,content:'내가 쓴 댓글',createdAt:Date.now()},
      {id:'other',authorId:'friend',authorNickname:'다른 친구',authorAvatar:2,content:'다른 사람이 쓴 댓글',createdAt:Date.now()}
    ];
    window.__test.emit('posts');goto('postDetail',{currentPostId:'p0'});
  });
}

test('comment authors can edit their own comment; post ownership does not grant editing others',async({page})=>{
  await openComments(page);
  await expect(page.getByRole('button',{name:'내 댓글 수정',exact:true})).toHaveCount(1);
  await expect(page.locator('[data-key="comment-p0-other"]').getByRole('button',{name:/수정|삭제/})).toHaveCount(0);
  await page.evaluate(()=>{startEditComment('p0','other');});
  await expect(page.locator('.admin-comment-edit')).toHaveCount(0);
  await page.evaluate(()=>{ui.editingCommentId='other';ui.editingCommentPostId='p0';ui.commentEditDraft='변조 시도';return saveEditComment('p0','other');});
  expect(await page.evaluate(()=>window.__test.writes.length)).toBe(0);
});

test('comment edit keeps a concurrently added comment and shows saving progress',async({page})=>{
  await openComments(page);
  await page.getByRole('button',{name:'내 댓글 수정',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'댓글 수정 내용'});
  await expect(editor).toBeFocused();await editor.fill('수정한 내 댓글');
  await page.evaluate(()=>{
    window.__test.setWrites({delay:350});
    window.__test.beforeCommit=()=>window.__test.addComment('p0',{id:'concurrent',authorId:'friend2',authorNickname:'새 친구',authorAvatar:0,content:'편집 중 도착한 댓글',createdAt:Date.now()});
  });
  await page.getByRole('button',{name:'수정 저장'}).click();
  await expect(page.locator('[data-action="edit-comment-mine"] .spinner')).toBeVisible();
  await expect(editor).toHaveAttribute('readonly','');
  await expect(page.locator('#activity-indicator')).toContainText('댓글을 수정');
  await expect(page.locator('[data-key="comment-p0-mine"]')).toContainText('수정한 내 댓글');
  await expect(page.locator('[data-key="comment-p0-concurrent"]')).toContainText('편집 중 도착한 댓글');
  await expect(page.locator('.admin-comment-edit')).toHaveCount(0);
  const comments=await page.evaluate(()=>window.__test.records.posts[0].comments);
  expect(comments).toHaveLength(3);expect(comments[0].authorId).toBe('reader');expect(comments[0].editedByAdmin).toBe(false);
  await expect(page.locator('#activity-indicator')).toBeHidden();
});

test('failed comment edit keeps the draft and removes loading state for retry',async({page})=>{
  await openComments(page);await page.getByRole('button',{name:'내 댓글 수정'}).click();
  const editor=page.getByRole('textbox',{name:'댓글 수정 내용'});await editor.fill('실패해도 남아야 하는 초안');
  await page.evaluate(()=>{window.__test.setWrites({failure:true,delay:200});window.__test.emit('posts');});
  await expect(editor).toHaveValue('실패해도 남아야 하는 초안');
  await page.getByRole('button',{name:'수정 저장'}).click();
  await expect(page.locator('#toast')).toContainText('작성한 내용은 유지');
  await expect(editor).toHaveValue('실패해도 남아야 하는 초안');await expect(editor).toBeEditable();
  await expect(page.locator('#activity-indicator')).toBeHidden();
  await page.evaluate(()=>window.__test.setWrites({}));
  await page.getByRole('button',{name:'수정 저장'}).click();
  await expect(page.locator('.admin-comment-edit')).toHaveCount(0);
});

test('a stale edit does not overwrite another edit of the same comment',async({page})=>{
  await openComments(page);await page.getByRole('button',{name:'내 댓글 수정'}).click();
  await page.getByRole('textbox',{name:'댓글 수정 내용'}).fill('오래된 화면에서 수정');
  await page.evaluate(()=>{window.__test.records.posts[0].comments[0].content='다른 기기에서 먼저 저장';});
  await page.getByRole('button',{name:'수정 저장'}).click();
  await expect(page.locator('#toast')).toContainText('다른 곳에서 댓글이 수정');
  expect(await page.evaluate(()=>window.__test.records.posts[0].comments[0].content)).toBe('다른 기기에서 먼저 저장');
  await expect(page.getByRole('textbox',{name:'댓글 수정 내용'})).toHaveValue('오래된 화면에서 수정');
});

async function openAuth(page,options={}){
  await mockApp(page,options);await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  await page.getByRole('button',{name:'마인들리 시작하기'}).click();
}

test('username signup normalizes case, stores no password, and can log back in',async({page})=>{
  await openAuth(page,{authActionDelay:300});await page.getByRole('button',{name:'회원가입',exact:true}).click();
  await page.locator('#signup-username').fill('Mindy_01');await page.locator('#signup-password').fill('secret123');
  await page.getByRole('button',{name:'회원가입 완료하기',exact:true}).click();
  await expect(page.locator('[data-action="signup"] .spinner')).toBeVisible();
  await expect(page.locator('#activity-indicator')).toContainText('계정을 만들');
  await expect(page.locator('.home-welcome')).toBeVisible();
  expect(await page.evaluate(()=>session.username)).toBe('mindy_01');
  const profile=await page.evaluate(()=>window.__test.records.users.find(u=>u.id===session.userId));
  expect(profile.username).toBe('mindy_01');expect(profile).not.toHaveProperty('pw');expect(profile).not.toHaveProperty('password');
  const originalId=profile.id;
  await page.evaluate(()=>doLogout());await expect(page.locator('.landing')).toBeVisible();
  await page.getByRole('button',{name:'마인들리 시작하기'}).click();
  await page.locator('#auth-username').fill('MINDY_01');await page.locator('#auth-password').fill('secret123');
  await page.locator('button[data-action="login"]').click();await expect(page.locator('.home-welcome')).toBeVisible();
  expect(await page.evaluate(()=>session.userId)).toBe(originalId);
});

test('invalid and duplicate usernames fail clearly without leaving a spinner running',async({page})=>{
  await openAuth(page);await page.getByRole('button',{name:'회원가입',exact:true}).click();
  await page.locator('#signup-username').fill('not an id');await page.locator('#signup-password').fill('secret123');
  await page.evaluate(()=>doSignup());await expect(page.getByRole('alert')).toContainText('4~20자');
  expect(await page.evaluate(()=>window.__test.authCalls.length)).toBe(0);
  await page.locator('#signup-username').fill('TAKEN');await page.getByRole('button',{name:'회원가입 완료하기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('이미 사용 중인 아이디');
  await expect(page.locator('#signup-username')).toHaveValue('TAKEN');
  await expect(page.locator('#activity-indicator')).toBeHidden();
  await expect(page.locator('button[data-action="signup"]')).toBeEnabled();
});

test('legacy email accounts still sign in and incorrect passwords recover cleanly',async({page})=>{
  await openAuth(page,{authActionDelay:250});
  await page.locator('#auth-username').fill('reader@example.test');await page.locator('#auth-password').fill('wrong123');
  await page.locator('button[data-action="login"]').click();await expect(page.locator('[data-action="login"] .spinner')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
  await expect(page.locator('#activity-indicator')).toBeHidden();
  await page.locator('#auth-password').fill('secret123');await page.locator('button[data-action="login"]').click();
  await expect(page.locator('.home-welcome')).toBeVisible();
  expect(await page.evaluate(()=>session.userId)).toBe('reader');
});

test('a failed profile write rolls back the new account so the username can be retried',async({page})=>{
  await openAuth(page);await page.getByRole('button',{name:'회원가입',exact:true}).click();
  await page.locator('#signup-username').fill('retry_user');await page.locator('#signup-password').fill('secret123');
  await page.evaluate(()=>window.__test.setWrites({failure:true}));
  await page.getByRole('button',{name:'회원가입 완료하기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('프로필을 저장하지 못했어요');
  expect(await page.evaluate(()=>auth.currentUser)).toBeNull();
  await page.evaluate(()=>window.__test.setWrites({}));
  await page.getByRole('button',{name:'회원가입 완료하기',exact:true}).click();
  await expect(page.locator('.home-welcome')).toBeVisible();
  expect(await page.evaluate(()=>session.username)).toBe('retry_user');
});

test('navigation and waiting data show a spinner that stops when data arrives',async({page})=>{
  await mockApp(page,{delayCollections:['posts']});await page.goto('/');await expect(page.locator('.landing')).toBeVisible();
  const showedTransition=await page.evaluate(()=>{goto('mypage');return !document.getElementById('activity-indicator').hidden;});
  expect(showedTransition).toBe(true);await expect(page.locator('#activity-indicator')).toBeHidden();
  await page.evaluate(()=>enterGuest());
  await expect(page.locator('#activity-indicator')).toContainText('이야기를 불러오');
  await page.evaluate(()=>window.__test.emit('posts'));
  await expect(page.locator('.post-card').first()).toBeVisible();await expect(page.locator('#activity-indicator')).toBeHidden();
});

test('login and signup dialog fit short phones, tablets and desktops, including errors',async({page})=>{
  await openAuth(page);await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[320,480],[667,375],[390,844],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});
    for(const withError of [false,true]){
      await page.evaluate(withError=>{ui.authError=withError?'아이디 또는 비밀번호를 확인해주세요.':'';render();},withError);
      const login=await page.evaluate(()=>({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight,bottom:document.querySelector('.account-id-note').getBoundingClientRect().bottom}));
      expect(login.x).toBeLessThanOrEqual(1);expect(login.y).toBeLessThanOrEqual(1);expect(login.bottom).toBeLessThanOrEqual(height);
      await page.locator('#open-signup').click();
      await page.evaluate(withError=>{ui.signupError=withError?'이미 사용 중인 아이디예요. 다른 아이디를 입력해주세요':'';render();},withError);
      const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
      const bounds=await dialog.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(height);
      const submit=dialog.locator('[data-action="signup"]');await submit.scrollIntoViewIfNeeded();await expect(submit).toBeInViewport();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({path:'.qa/signup-'+width+'-'+withError+'.png'});
      await page.getByRole('button',{name:'창 닫기'}).click();
    }
  }
});

test('signup modal traps focus, preserves login draft and clears signup password when closed',async({page})=>{
  await openAuth(page);
  await expect(page.locator('.login-form input')).toHaveCount(2);
  await expect(page.locator('.account-id-note')).toContainText('관리자에게 문의해주세요');
  await expect(page.getByRole('button',{name:/아이디 찾기|비밀번호 찾기|비밀번호 재설정/})).toHaveCount(0);
  await page.locator('#auth-username').fill('login_draft');await page.locator('#auth-password').fill('login-secret');
  await page.locator('#open-signup').click();
  await expect(page.locator('#signup-username')).toBeFocused();
  await expect(page.locator('#main-content')).toHaveAttribute('inert','');
  await expect(page.getByRole('dialog').locator('input')).toHaveCount(2);
  await page.locator('#signup-username').fill('new_user');await page.locator('#signup-password').fill('private-secret');
  await page.evaluate(()=>{window.__signupField=document.getElementById('signup-password');window.__signupField.setSelectionRange(2,5);window.__test.emit('posts');});
  expect(await page.evaluate(()=>document.getElementById('signup-password')===window.__signupField)).toBe(true);
  await expect(page.locator('#signup-password')).toHaveValue('private-secret');
  await page.getByRole('button',{name:'창 닫기'}).focus();await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-action="signup"]')).toBeFocused();await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'창 닫기'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#open-signup')).toBeFocused();await expect(page.locator('#main-content')).not.toHaveAttribute('inert');
  await expect(page.locator('#auth-username')).toHaveValue('login_draft');await expect(page.locator('#auth-password')).toHaveValue('login-secret');
  await page.locator('#open-signup').click();await expect(page.locator('#signup-password')).toHaveValue('');await expect(page.locator('#signup-username')).toHaveValue('new_user');
});
