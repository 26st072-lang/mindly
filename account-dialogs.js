/* Signup stays separate from the compact login form. */
let accountReturnFocus=null;
const accountBusy=()=>pendingActions.has('signup');
function openAccountModal(){
  if(accountBusy()||pendingActions.has('login'))return;
  accountReturnFocus=document.activeElement;ui.accountModal='signup';ui.signupError='';
  if(!ui.signupDraft.nickname)Object.assign(ui.signupDraft,randomProfile());
  render();document.getElementById('signup-username')?.focus({preventScroll:true});
}
function clearAccountSecrets(){ui.signupDraft.pw='';}
function closeAccountModal(){
  if(accountBusy())return;
  ui.accountModal=null;ui.signupError='';clearAccountSecrets();render();
  if(accountReturnFocus?.isConnected)accountReturnFocus.focus({preventScroll:true});
  else document.getElementById('open-signup')?.focus({preventScroll:true});
  accountReturnFocus=null;
}
function renderAccountModal(){
  return `<div class="account-overlay" data-key="account-overlay" onclick="if(event.target===this)closeAccountModal()"><section class="account-dialog" id="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" tabindex="-1">
    <header class="account-dialog-head"><div><span class="account-dialog-kicker">새로운 마음의 시작</span><h2 id="account-dialog-title">마인들리 회원가입</h2></div><button class="icon-btn account-close" type="button" data-disable-while="signup" onclick="closeAccountModal()" aria-label="창 닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div class="account-dialog-body">${renderSignupForm()}</div>
  </section></div>`;
}
function renderSignupForm(){
  const draft=ui.signupDraft;
  return `<form class="signup-form" onsubmit="event.preventDefault();doSignup()" aria-busy="${pendingActions.has('signup')}">
    <div class="profile-preview"><span class="avatar">${avatarSVG(draft.avatar)}</span><div class="info"><strong>${escapeHtml(draft.nickname)}</strong><span>이야기에는 이 닉네임만 보여요</span></div><button class="regen-btn" type="button" data-disable-while="signup" aria-label="닉네임과 공룡 다시 생성" onclick="Object.assign(ui.signupDraft,randomProfile());render();">${ICONS.refresh}다시 뽑기</button></div>
    <div class="account-field-grid">
      <div class="input-group"><label for="signup-username">아이디</label><input id="signup-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="4" maxlength="20" pattern="[a-zA-Z][a-zA-Z0-9_]{3,19}" aria-describedby="signup-username-help" placeholder="예: mindy_01" data-lock-action="signup" value="${escapeHtml(draft.username)}" oninput="ui.signupDraft.username=this.value"><small id="signup-username-help" class="account-field-help">영문으로 시작하는 4~20자 · 영문, 숫자, _</small></div>
      <div class="input-group"><label for="signup-password">비밀번호</label><input id="signup-password" name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="128" placeholder="6자 이상 입력해주세요" data-lock-action="signup" value="${escapeHtml(draft.pw)}" oninput="ui.signupDraft.pw=this.value"></div>
    </div>
    <fieldset class="account-age"><legend>나이대</legend><div class="seg">${AGE_GROUPS.map(a=>`<button type="button" class="seg-opt ${draft.ageGroup===a.key?'sel':''}" data-disable-while="signup" onclick="ui.signupDraft.ageGroup='${a.key}';render();">${a.label}</button>`).join('')}</div></fieldset>
    ${ui.signupError?`<p class="form-error" role="alert">${escapeHtml(ui.signupError)}</p>`:''}
    <button type="submit" data-action="signup" class="btn-primary account-submit">회원가입 완료하기 ${ARROW_ICON}</button>
    <p class="account-small-note">아이디와 비밀번호가 기억나지 않으면 관리자에게 문의해주세요.</p>
  </form>`;
}
document.addEventListener('keydown',event=>{
  if(event.isComposing||!ui.accountModal)return;
  if(event.key==='Escape'){event.preventDefault();closeAccountModal();return;}
  if(event.key!=='Tab')return;
  const dialog=document.getElementById('account-dialog');if(!dialog)return;
  const items=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&!el.closest('[inert]')&&el.getClientRects().length);
  const first=items[0],last=items.at(-1);
  if(!first){event.preventDefault();dialog.focus();return;}
  if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
});
