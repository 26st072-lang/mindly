/* Keep inputs and keyboard navigation usable during live updates. */
function enhanceAccessibility(root=document.getElementById('root')){
  root.querySelectorAll('svg').forEach(svg=>{svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');});
  root.querySelectorAll('button:not([type])').forEach(button=>button.type='button');
  root.querySelectorAll('.back-btn').forEach(button=>button.setAttribute('aria-label','뒤로 가기'));
  root.querySelectorAll('.comment-send').forEach(button=>button.setAttribute('aria-label','댓글 보내기'));
  root.querySelectorAll('.fab').forEach(button=>{
    if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',ui.route==='diary'?'일기 쓰기':'고민 쓰기');
  });
  root.querySelectorAll('.input-group').forEach((group,index)=>{
    const field=group.querySelector('input,select,textarea'),label=group.querySelector('label');
    if(field&&label){if(!field.id)field.id=`field-${ui.route}-${index}`;label.htmlFor=field.id;}
  });
  root.querySelectorAll('input,textarea').forEach((field,index)=>{
    if(!field.id)field.id=`input-${ui.route}-${index}`;
    if(!field.hasAttribute('aria-label')&&!root.querySelector(`label[for="${field.id}"]`))field.setAttribute('aria-label',field.placeholder||'내용');
  });
  root.querySelectorAll('.hashtag-opt,.seg-opt,.weather-opt').forEach(button=>button.setAttribute('aria-pressed',button.classList.contains('sel')));
  const weatherNames=['맑음','구름 조금','흐림','비','눈','바람'];
  root.querySelectorAll('.weather-opt').forEach((button,index)=>button.setAttribute('aria-label',weatherNames[index]));
  root.querySelectorAll('.toggle').forEach(button=>{button.setAttribute('role','switch');button.setAttribute('aria-checked',button.classList.contains('on'));button.setAttribute('aria-label','댓글 허용');});
  root.querySelectorAll('[data-action]').forEach(button=>{
    const pending=pendingActions.has(button.dataset.action);button.disabled=pending;button.setAttribute('aria-busy',pending);
    button.classList.toggle('is-pending',pending);
    if(pending&&!button.querySelector('.button-spinner')){
      const spinner=document.createElement('span');spinner.className='spinner button-spinner';spinner.setAttribute('aria-hidden','true');button.append(spinner);
    }else if(!pending)button.querySelector('.button-spinner')?.remove();
  });
  root.querySelectorAll('[data-disable-while]').forEach(button=>{button.disabled=button.dataset.disableWhile.split(' ').some(key=>pendingActions.has(key));});
  root.querySelectorAll('[data-lock-action]').forEach(field=>{field.readOnly=pendingActions.has(field.dataset.lockAction);});
  // Old inner-page article links also work with a keyboard.
  root.querySelectorAll('.post-card[onclick]').forEach(card=>{
    card.tabIndex=0;card.setAttribute('role','link');
    card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();card.click();}};
  });
}
document.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if(ui.menuOpen){
    if(event.key==='Escape'){event.preventDefault();closeMenu();return;}
    if(event.key==='Tab'){
      const items=[...document.querySelectorAll('#menu-drawer button,#menu-drawer a')].filter(el=>!el.disabled);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }
  const tab=event.target.closest('[role="tab"]');
  if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();
    const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')];
    let index=tabs.indexOf(tab);
    index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    const id=tabs[index].id;tabs[index].click();document.getElementById(id)?.focus({preventScroll:true});
  }
});
// Avoid replacing composition text while Korean IME is composing.
let composing=false,compositionRenderPending=false;
document.addEventListener('compositionstart',()=>{composing=true;});
document.addEventListener('compositionend',()=>{composing=false;if(compositionRenderPending){compositionRenderPending=false;backgroundRender();}});
window.addEventListener('online',reconnect);
window.addEventListener('offline',reconnect);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconnect();});

let navigationPending=false,navigationTimer=null;
function beginNavigation(){
  navigationPending=true;clearTimeout(navigationTimer);
  document.body.classList.add('route-changing');updateBusyIndicator();
  // Match the short page entrance transition; content renders immediately.
  navigationTimer=setTimeout(()=>{navigationPending=false;document.body.classList.remove('route-changing');updateBusyIndicator();},180);
}
function busyMessage(){
  const action=[...pendingActions][0];
  if(action){
    if(action==='login')return '로그인하고 있어요';
    if(action==='signup')return '계정을 만들고 있어요';
    if(action==='logout')return '로그아웃하고 있어요';
    if(action.startsWith('delete-'))return '삭제하고 있어요';
    if(action.startsWith('edit-comment-'))return '댓글을 수정하고 있어요';
    if(action==='comment')return '댓글을 보내고 있어요';
    if(action.startsWith('heart-'))return '공감을 저장하고 있어요';
    return '저장하고 있어요';
  }
  if(ui.route==='loading')return '로그인 상태를 확인하고 있어요';
  const channel=ui.route==='main'?(ui.mainTab==='epilogue'?'epilogues':'posts'):
    ui.route==='postDetail'||ui.route==='myHearts'?'posts':ui.route==='epilogueDetail'?'epilogues':
    ui.route==='archive'?(ui.archiveTab==='posts'?'posts':'epilogues'):ui.route==='diary'?'diary':null;
  if(channel&&!sync.offline){const state=sync.channels[channel];if(!state||!state.ready&&['loading','slow'].includes(state.status))return '이야기를 불러오고 있어요';}
  return navigationPending?'화면을 열고 있어요':'';
}
function updateBusyIndicator(){
  const indicator=document.getElementById('activity-indicator');if(!indicator)return;
  const message=busyMessage();
  indicator.hidden=!message;
  const label=indicator.querySelector('.activity-label');if(label.textContent!==message)label.textContent=message;
}
// Pointer movement only updates the decorative depth planes, once per frame.
// Touch scrolling and form focus are never intercepted.
const entryMotionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
let entryTiltFrame=0,entryTiltScene=null,entryPointer=null;
function resetEntryTilt(){
  cancelAnimationFrame(entryTiltFrame);entryTiltFrame=0;
  if(entryTiltScene){entryTiltScene.style.removeProperty('--tilt-x');entryTiltScene.style.removeProperty('--tilt-y');}
  entryTiltScene=null;entryPointer=null;
}
document.addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse'||entryMotionPreference.matches)return;
  const art=event.target.closest('.entry-art');
  if(!art){resetEntryTilt();return;}
  const depth=art.querySelector('.entry-depth');if(!depth)return;
  if(entryTiltScene&&entryTiltScene!==depth)resetEntryTilt();
  entryTiltScene=depth;entryPointer={x:event.clientX,y:event.clientY,art};
  if(entryTiltFrame)return;
  entryTiltFrame=requestAnimationFrame(()=>{
    entryTiltFrame=0;
    if(!entryTiltScene?.isConnected||!entryPointer){resetEntryTilt();return;}
    const bounds=entryPointer.art.getBoundingClientRect();
    const x=Math.max(-.5,Math.min(.5,(entryPointer.x-bounds.left)/bounds.width-.5));
    const y=Math.max(-.5,Math.min(.5,(entryPointer.y-bounds.top)/bounds.height-.5));
    entryTiltScene.style.setProperty('--tilt-x',`${(-y*9).toFixed(2)}deg`);
    entryTiltScene.style.setProperty('--tilt-y',`${(x*13).toFixed(2)}deg`);
  });
},{passive:true});
document.addEventListener('pointerout',event=>{if(!event.relatedTarget?.closest?.('.entry-art'))resetEntryTilt();},{passive:true});
window.addEventListener('blur',resetEntryTilt);
entryMotionPreference.addEventListener('change',resetEntryTilt);
document.addEventListener('visibilitychange',()=>{
  document.body.classList.toggle('entry-motion-suspended',document.hidden);
  if(document.hidden)resetEntryTilt();
});
initApp();
