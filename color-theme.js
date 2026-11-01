/* Apply the saved preference before CSS paints. Storage may be unavailable in
   private browsing; the selected mode still works for the current session. */
(()=>{
  const key='mindly-color-theme',root=document.documentElement;
  const moon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.4 14.3A8.8 8.8 0 0 1 9.7 3.6 8.8 8.8 0 1 0 20.4 14.3Z" stroke-linejoin="round"/></svg>';
  const sun='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3.6"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round"/></svg>';
  const night=()=>root.dataset.theme==='night';
  const label=()=>night()?'나이트 모드 끄기':'나이트 모드 켜기';
  function apply(mode,{persist=false,notify=true}={}){
    mode=mode==='night'?'night':'day';root.dataset.theme=mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',night()?'#172239':'#f0f4f7');
    document.querySelectorAll('.theme-control').forEach(button=>{
      button.innerHTML=night()?sun:moon;button.setAttribute('aria-label',label());button.title=label();button.setAttribute('aria-pressed',String(night()));
    });
    if(persist)try{localStorage.setItem(key,mode);}catch{}
    if(notify)document.dispatchEvent(new CustomEvent('mindly:theme-changed',{detail:{theme:mode}}));
  }
  let saved='day';try{saved=localStorage.getItem(key)||'day';}catch{}
  apply(saved,{notify:false});
  window.themeControlHTML=()=>`<button class="theme-control" data-key="theme-control" type="button" onclick="toggleColorTheme()" aria-label="${label()}" title="${label()}" aria-pressed="${night()}">${night()?sun:moon}</button>`;
  window.toggleColorTheme=()=>apply(night()?'day':'night',{persist:true});
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue);});
})();
