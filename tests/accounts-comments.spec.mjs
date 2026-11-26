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

async function expectLanguageWarning(page,submit){
  const nativeDialogs=[];
  const handleDialog=async dialog=>{nativeDialogs.push(dialog.type());await dialog.dismiss();};
  page.on('dialog',handleDialog);
  await submit();
  const dialog=page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('다른 사람에게 상처를 주는 표현은 수정해 주세요.');
  await expect(dialog.locator('.suggestion-box')).toHaveCount(0);
  await expect(dialog).not.toContainText('이렇게 표현해볼 수 있어요');
  await expect(page.locator('#feedback-confirm')).toBeFocused();
  expect(await page.locator('#site-footer').evaluate(el=>el.inert)).toBe(true);
  await page.getByRole('button',{name:'확인하고 직접 수정하기'}).click();
  await expect(dialog).toHaveCount(0);
  expect(nativeDialogs).toEqual([]);page.off('dialog',handleDialog);
}

test('lounge blocks clear insults with a warning, keeps the exact draft and never writes or rewrites it',async({page})=>{
  await openComments(page);
  const input=page.getByRole('textbox',{name:'댓글 내용',exact:true});
  for(const content of ['시발새끼야','못생겼어','죽어','바보','미친년','너 바보야','너 진짜 못생겼어','너는 죽어라','개새끼','  시발새끼야  ',
    '개새꺄','미친아','미친새꺄','바보같아','니가 뒤져','니가뒤져','아이 개같은 것들','아니 바보같아 진짜',
    '너는 개같아','작성자는 진짜 바보같아','글쓴이는 정말 한심해','다른 친구 정말 멍청하네',
    '포근한 공룡 쓰레기 같은 사람이네','너 바보 아냐?','바보 같은 작성자','개 새 꺄','미\u200b친아',
    '미친아^^','바보같아😊','너는 못생겼어🙄','너개같아','정신병 있냐','찐따 같아','너 못생김','ㅂㅅ','븅신','병.신']){
    await input.fill(content);
    await expectLanguageWarning(page,()=>input.press('Enter'));
    await expect(input).toHaveValue(content);await expect(input).toBeFocused();
    expect(await page.evaluate(()=>ui.commentDrafts.p0)).toBe(content);
    expect(await page.evaluate(()=>window.__test.writes.length)).toBe(0);
    await expect(page.locator('#activity-indicator')).toBeHidden();
  }
  await input.fill('네 마음이 조금은 가벼워졌으면 좋겠어.');
  await page.getByRole('button',{name:'댓글 보내기',exact:true}).click();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(()=>window.__test.records.posts[0].comments.at(-1).content)).toBe('네 마음이 조금은 가벼워졌으면 좋겠어.');
});

test('lounge allows informal disagreement, ordinary complaints and harmless words containing similar syllables',async({page})=>{
  await openComments(page);
  const warnings=[];page.on('dialog',async dialog=>{warnings.push(dialog.message());await dialog.dismiss();});
  for(const content of [
    '개같네','아 개빡쳐','존나 힘들겠다','진짜 거지 같은 상황이네','씨 발',
    '친구가 나한테 "병신"이라고 했어. 너무 속상해.','나는 "개새끼"라는 말을 들었어.',
    '그건 아닌 것 같아. 난 좀 다르게 생각해.',
    '아 진짜 짜증나고 힘들다 ㅋㅋ',
    '미친 듯이 열심히 했는데 결과가 아쉬워.',
    '새끼 고양이를 보니 마음이 풀렸어.',
    '문제의 시발점을 같이 찾아보자.',
    '이번 기차의 시발역은 서울이야.',
    '죽어도 포기하지 마. 네 편이야.',
    '죽어가는 식물을 살려냈어.',
    '내가 바보 같았어. 그래도 괜찮아.',
    '나는 못생겼어도 내가 좋아.',
    '너 바보 아니야. 충분히 잘하고 있어.',
    '내 생각에는 그 행동은 잘못됐어.',
    '죽어버리고 싶을 만큼 힘들었지만 오늘은 조금 나아졌어.',
    '개같아',
    '오늘 하루가 정말 개같아.',
    '미친 아이디어가 떠올랐어.',
    '너는 바보가 아니야. 충분히 잘하고 있어.',
    '너처럼 나도 바보같아 보일 때가 있어.',
    '내가 바보같아. 오늘도 똑같은 실수를 했어.',
    '네가 겪은 상황은 정말 개같아.',
    '너 가방을 뒤져 보면 열쇠가 있을 거야.',
    '네이버 검색 결과가 진짜 쓰레기 같아.'
  ]){
    await page.locator('#comment-input').fill(content);
    await page.getByRole('button',{name:'댓글 보내기',exact:true}).click();
    expect(warnings).toEqual([]);
    expect(await page.evaluate(()=>window.__test.records.posts[0].comments.at(-1).content)).toBe(content);
    await expect(page.locator('#comment-input')).toHaveValue('');
  }
});

test('lounge replies and edits use the same loose check and accept a manual correction',async({page})=>{
  await openComments(page);
  await page.getByRole('button',{name:'다른 친구 댓글에 답글'}).click();
  await page.locator('#comment-input').fill('미친아');
  await expectLanguageWarning(page,()=>page.getByRole('button',{name:'답글 보내기',exact:true}).click());
  await expect(page.locator('#comment-input')).toHaveValue('미친아');
  expect(await page.evaluate(()=>ui.concernReply.commentId)).toBe('other');
  expect(await page.evaluate(()=>window.__test.writes.length)).toBe(0);
  await page.locator('#comment-input').fill('내 생각은 다르지만 네 이야기도 들어볼게.');
  await page.getByRole('button',{name:'답글 보내기',exact:true}).click();
  expect(await page.evaluate(()=>window.__test.records.posts[0].comments.at(-1).parentId)).toBe('other');
  const original=page.locator('[data-key="comment-p0-mine"]');
  await original.getByRole('button',{name:'내 댓글 수정',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'댓글 수정 내용'});
  await editor.fill('개새꺄');
  await expectLanguageWarning(page,()=>page.getByRole('button',{name:'수정 저장',exact:true}).click());
  await expect(editor).toHaveValue('개새꺄');await expect(editor).toBeFocused();
  expect(await page.evaluate(()=>window.__test.records.posts[0].comments[0].content)).toBe('내가 쓴 댓글');
  expect(await page.evaluate(()=>window.__test.writes.length)).toBe(1);
  await editor.fill('앞으로는 네 마음도 편해지길 바라.');
  await page.getByRole('button',{name:'수정 저장',exact:true}).click();
  await expect(original).toContainText('앞으로는 네 마음도 편해지길 바라.');
  await expect(original.locator('textarea')).toHaveCount(0);
});

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
      const login=await page.evaluate(()=>({x:document.documentElement.scrollWidth-innerWidth,y:document.getElementById('root').getBoundingClientRect().height-innerHeight,bottom:document.querySelector('.account-id-note').getBoundingClientRect().bottom}));
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
