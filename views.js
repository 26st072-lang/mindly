const HOME_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 10 9-7 9 7v10H3z" stroke-linejoin="round"/><path d="M9 20v-7h6v7"/></svg>';
const ARROW_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12h14m-5-5 5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let renderedRoute=null;
function brandHTML(){return '<span class="brand">mindly<span>✦</span></span>';}
function navigationHTML(scope='sidebar'){
  const links=[['main',HOME_ICON,'마음 라운지'],['diary',ICONS.book,'나의 일기장'],['archive',ICONS.box,'나의 보관함'],['myHearts',ICONS.heart,'공감한 이야기']];
  return `<nav class="side-nav" aria-label="주 메뉴">${links.map(([route,icon,label])=>`<button data-key="${scope}-nav-${route}" class="nav-item ${ui.route===route?'active':''}" ${ui.route===route?'aria-current="page"':''} onclick="goto('${route}')">${icon}<span>${label}</span>${ui.route===route?'<i aria-hidden="true"></i>':''}</button>`).join('')}${session.isAdmin?`<button class="nav-item" onclick="goto('adminPanel')">${ICONS.shield}관리자</button>`:''}</nav>`;
}
function sidebarHTML(){
  return `<aside class="sidebar" aria-label="마인들리 탐색"><button class="brand-button" onclick="goto('main',{mainTab:'home'})" aria-label="mindly 마인들리 홈">${brandHTML()}</button>${navigationHTML()}<div class="side-companion">${mascotScene('mini')}<strong>혼자가 아닌, 우리.</strong><p>작은 이야기도 괜찮아요.<br>마인디가 여기서 기다릴게요.</p></div><div class="sidebar-bottom"><span class="little-dot"></span>함께 만드는 다정한 공간</div></aside>`;
}
function topBarHTML(){
  return `<header class="topbar"><button id="menu-button" class="icon-btn mobile-menu" onclick="ui.menuOpen=true;render();" aria-label="메뉴 열기" aria-expanded="${ui.menuOpen}" aria-controls="menu-drawer">${ICONS.menu}</button><button class="mobile-brand" onclick="goto('main')" aria-label="마인들리 홈">${brandHTML()}</button><div class="topbar-title">${ui.route==='main'?'마음 라운지':'나의 마인들리'}<span>조금 더 다정한 오늘</span></div><form class="search-box" role="search" onsubmit="event.preventDefault();doSearch();"><input id="search-input" type="search" aria-label="이야기 검색" placeholder="어떤 이야기를 찾고 있나요?" value="${escapeHtml(ui.searchQuery)}" oninput="ui.searchQuery=this.value"><button class="search-icon-btn" type="submit" aria-label="검색">${ICONS.search}</button></form><div class="topbar-account">${themeControlHTML()}${musicControlHTML()}<button class="profile-chip" onclick="goto('mypage')" aria-label="${session.userId?escapeHtml(session.nickname)+' 내 프로필':'로그인'}"><span class="avatar">${session.userId?avatarSVG(session.avatar):ICONS.user}</span><span>${session.userId?escapeHtml(session.nickname):'로그인'}</span></button></div></header>`;
}
function render(options={}){
  if(typeof composing!=='undefined'&&composing&&options.background){compositionRenderPending=true;return;}
  const root=document.getElementById('root');
  const routeChanged=renderedRoute!==ui.route;
  const oldY=window.scrollY;
  const wasMenuOpen=!!document.getElementById('menu-drawer');
  const views={loading:renderLoading,connectionError:renderConnectionError,setupNeeded:renderConnectionError,landing:renderLanding,main:renderMain,write:renderWrite,postDetail:renderPostDetail,writeEpilogue:renderWriteEpilogue,epilogueDetail:renderEpilogueDetail,archive:renderArchive,mypage:renderMyPage,diary:renderDiaryList,diaryWrite:renderDiaryWrite,myHearts:renderMyHearts,adminPanel:renderAdminPanel};
  const standalone=['landing','loading','connectionError','setupNeeded'].includes(ui.route)||(ui.route==='mypage'&&(!session.userId||pendingActions.has('signup')));
  const content=(views[ui.route]||renderLanding)();
  const pageHTML=standalone?`<main id="main-content" tabindex="-1">${content}</main>`:`<div class="app-shell">${sidebarHTML()}<div class="workspace">${topBarHTML()}<main id="main-content" class="page-content ${ui.route==='main'?'lounge':'inner-page'}" tabindex="-1">${content}</main></div></div>${ui.menuOpen?renderDrawer():''}`;
  const html=pageHTML+(ui.accountModal?renderAccountModal():'');
  if(!routeChanged&&window.morphdom){
    const target=document.createElement('div');target.id='root';target.innerHTML=html;
    // Give both trees the same field IDs BEFORE reconciliation, so a realtime
    // update keeps the actual focused input node, selection and IME buffer.
    enhanceAccessibility(target);
    morphdom(root,target,{childrenOnly:true,getNodeKey:node=>node.id||node.dataset?.key,onBeforeElUpdated:(from,to)=>{
      if(from.classList.contains('entry-webgl'))return false;
      if(from===document.activeElement&&from.matches('input,textarea,select'))return false;
      return !from.isEqualNode(to);
    }});
  }else root.innerHTML=html;
  renderedRoute=ui.route;
  enhanceAccessibility();
  updateBusyIndicator();
  document.dispatchEvent(new Event('mindly:view-rendered'));
  document.body.classList.toggle('menu-is-open',ui.menuOpen);
  document.body.classList.toggle('account-modal-open',!!ui.accountModal);
  for(const child of root.children)child.inert=!!ui.accountModal&&!child.classList.contains('account-overlay');
  const shell=document.querySelector('.app-shell');if(shell)shell.inert=ui.menuOpen||!!ui.accountModal;
  if(ui.menuOpen&&!wasMenuOpen)document.querySelector('#menu-drawer button')?.focus({preventScroll:true});
  else if(options.navigation||routeChanged&&ui.route!=='loading')document.getElementById('main-content')?.focus({preventScroll:true});
  if(!options.navigation&&!routeChanged)window.scrollTo({top:oldY,behavior:'instant'});
}
function renderLoading(){return `<div class="boot-screen">${brandHTML()}${mascotScene('small')}<p class="loading-copy" role="status"><span class="spinner" aria-hidden="true"></span>마음이 쉬어갈 공간을 준비하고 있어요.</p></div>`;}
function renderConnectionError(){return `<div class="boot-screen">${brandHTML()}${mascotScene('small')}<h1>연결이 잠시 쉬어가고 있어요</h1><p>인터넷 연결을 확인해주세요. 저장된 이야기는 삭제되지 않았어요.</p><button class="btn-primary" onclick="${!window.firebase?'location.reload()':'initApp()'}">다시 연결하기</button></div>`;}
function entryScene(){
  return `<div class="entry-art">
    <div class="entry-diorama" aria-hidden="true">
      <div class="entry-depth">
        <div class="entry-aura"></div><div class="entry-room"></div>
        <div class="entry-platform"></div><div class="entry-lamp"></div><div class="entry-contact-shadow"></div>
        <div class="entry-mindy">${logoSVG()}</div>
        <span class="entry-chat chat-listening"><i></i><i></i><i></i></span>
        <span class="entry-chat chat-heart">${ICONS.heart}</span>
        <span class="entry-leaf leaf-one"></span><span class="entry-leaf leaf-two"></span>
      </div><div class="entry-webgl" data-key="entry-webgl"></div>
    </div>
  </div>`;
}
function renderLanding(){
  return `<div class="landing entry-screen">
    <header class="landing-header">${brandHTML()}<div class="entry-header-tools">${themeControlHTML()}${musicControlHTML()}</div></header>
    <div class="landing-grid">
      <div class="landing-copy"><h1>마음에도,<br><span class="entry-title-accent">쉼표가 필요하니까.</span></h1><p><span class="entry-copy-line">말하지 못한 고민부터 소소한 하루까지,</span><span class="entry-copy-line">마인들리와 함께 나눠요.</span></p><div class="landing-actions"><button class="btn-primary" onclick="goto('mypage')">마인들리 시작하기 ${ARROW_ICON}</button><button class="btn-ghost" onclick="enterGuest()">먼저 둘러볼게요 ${ARROW_ICON}</button></div></div>
      <div class="landing-visual">${entryScene()}</div>
    </div>
    <div class="landing-values"><div>${ICONS.shield}<strong>편안한 익명</strong></div><div>${ICONS.heart}<strong>따뜻한 공감</strong></div><div>${ICONS.book}<strong>나만의 기록</strong></div></div>
  </div>`;
}
function doSearch(){
  beginNavigation();
  ui.mainTab='concern';ui.ageSubTab='all';ui.sort='recent';
  if(ui.route!=='main')goto('main');else render();
}
function renderDrawer(){
  return `<div class="overlay" onclick="if(event.target===this)closeMenu();"><section class="drawer" id="menu-drawer" role="dialog" aria-modal="true" aria-label="마인들리 메뉴"><div class="drawer-head">${brandHTML()}<button class="icon-btn" onclick="closeMenu()" aria-label="메뉴 닫기">✕</button></div>${navigationHTML('drawer')}<button class="nav-item" onclick="goto('mypage')">${ICONS.user}${session.userId?'내 프로필':'로그인 / 회원가입'}</button><div class="drawer-companion">${mascotScene('small')}</div></section></div>`;
}
function matchSearch(p){
  const q=ui.searchQuery.trim().toLocaleLowerCase();
  return !q||[p.title,p.content,...(p.hashtags||[])].some(text=>String(text||'').toLocaleLowerCase().includes(q));
}
function syncNotice(key){
  const s=sync.channels[key];
  if(sync.offline)return `<div class="sync-notice" role="status"><span>인터넷 연결이 끊겼어요. 연결되면 자동으로 다시 불러올게요.</span><button onclick="retryData('${key}')">다시 시도</button></div>`;
  if(!s||s.status==='loading')return s?.ready?'<div class="sync-inline loading-copy" role="status"><span class="spinner" aria-hidden="true"></span>최신 이야기를 확인하고 있어요.</div>':'';
  if(['error','slow'].includes(s.status)){
    const message=s.error==='permission-denied'?(session.userId?'이야기를 읽을 권한을 확인하지 못했어요. 잠시 후 다시 시도해주세요.':'이야기를 읽으려면 로그인이 필요해요.'):s.status==='slow'?'연결이 지연되고 있어요. 저장된 이야기를 기다리고 있어요.':'이야기를 불러오지 못했어요. 다시 연결해주세요.';
    return `<div class="sync-notice" role="status"><span>${message}</span><button onclick="${s.error==='permission-denied'&&!session.userId?"goto('mypage')":`retryData('${key}')`}">${s.error==='permission-denied'&&!session.userId?'로그인':'다시 불러오기'}</button></div>`;
  }
  return '';
}
function collectionPlaceholder(key,emptyText='아직 이야기가 없어요.'){
  const s=sync.channels[key];
  if(s?.ready)return `<div class="empty-state">${logoSVG()}<h3>${ui.searchQuery?'검색 결과가 없어요':emptyText}</h3><p>${ui.searchQuery?'다른 단어나 나이대로 찾아보세요.':'당신의 이야기가 이곳의 시작이 될 수 있어요.'}</p></div>`;
  if(s?.status==='error'||s?.status==='slow'||sync.offline)return `<div class="empty-state">${logoSVG()}<h3>이야기를 기다리고 있어요</h3><p>위의 연결 안내를 확인해주세요.</p></div>`;
  return `<div class="skeleton-list" role="status" aria-label="이야기 불러오는 중">${[0,1,2].map(()=>'<div class="skeleton-card"><i></i><i></i><i></i></div>').join('')}<span class="sr-only">이야기를 불러오고 있어요.</span></div>`;
}
function renderMain(){
  const tabs=[['home','추천'],['concern','고민 나누기'],['epilogue','그 후 이야기']];
  let content='';
  if(ui.mainTab==='home')content=renderHomeDashboard();
  else{
    const ageMatch=p=>ui.ageSubTab==='all'||p?.ageGroup===ui.ageSubTab;
    const isEpilogue=ui.mainTab==='epilogue';
    const list=isEpilogue?DB.epilogues.map(ep=>({ep,post:DB.posts.find(p=>p.id===ep.postId)})).filter(({ep,post})=>ageMatch(post)&&matchSearch({...ep,title:post?.title||'',hashtags:post?.hashtags||[]})).sort((a,b)=>b.ep.createdAt-a.ep.createdAt):DB.posts.filter(p=>ageMatch(p)&&matchSearch(p)).sort((a,b)=>ui.sort==='popular'?b.hearts.length-a.hearts.length||b.createdAt-a.createdAt:b.createdAt-a.createdAt);
    content=`<section class="feed-section"><div class="filter-row"><div class="tabs-sub" aria-label="나이대 필터">${[{key:'all',label:'전체'},...AGE_GROUPS].map(a=>`<button data-key="age-${a.key}" class="tab-sub ${ui.ageSubTab===a.key?'active':''}" aria-pressed="${ui.ageSubTab===a.key}" onclick="ui.ageSubTab='${a.key}';render();">${a.label}</button>`).join('')}</div>${!isEpilogue?`<label class="sort-control"><span class="sr-only">이야기 정렬</span><select onchange="ui.sort=this.value;render();"><option value="recent" ${ui.sort==='recent'?'selected':''}>최신순</option><option value="popular" ${ui.sort==='popular'?'selected':''}>공감순</option></select></label>`:''}</div>${ui.searchQuery?`<div class="search-summary">‘${escapeHtml(ui.searchQuery)}’ 검색 결과 <button onclick="ui.searchQuery='';render();" aria-label="검색 초기화">초기화</button></div>`:''}${syncNotice(isEpilogue?'epilogues':'posts')}${isEpilogue?renderEpilogueFeed(list):renderPostFeed(list)}</section>`;
  }
  return `<section class="lounge-intro"><div><span class="eyebrow">YOUR MIND, OUR LITTLE SPACE</span><h1>마음을 나누면,<br class="mobile-break"> 조금 가벼워질 거예요.</h1><p>어떤 이야기든 괜찮아요. 우리, 함께 들어요.</p></div><button class="btn-primary write-desktop" onclick="startWriting()">${ICONS.pencil}고민 나누기</button></section><div class="community-nav"><div class="banner">${ICONS.heart}<p>${escapeHtml(DB.banner.text)}</p></div><div class="tabs-shell"><div class="tabs-main" role="tablist" aria-label="이야기 종류">${tabs.map(([key,label])=>`<button id="tab-${key}" class="tab-main ${ui.mainTab===key?'active':''}" role="tab" aria-selected="${ui.mainTab===key}" aria-controls="feed-panel" tabindex="${ui.mainTab===key?0:-1}" onclick="setMainTab('${key}')">${label}</button>`).join('')}</div><button class="mobile-write" onclick="startWriting()" aria-label="고민 쓰기">${ICONS.pencil}</button></div></div><div id="feed-panel" role="tabpanel" aria-labelledby="tab-${ui.mainTab}" tabindex="0">${content}</div>`;
}
function renderHomeDashboard(){
  const popular=DB.posts.filter(p=>p.hearts.length>0).sort((a,b)=>b.hearts.length-a.hearts.length).slice(0,2);
  const recent=DB.posts.slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,4);
  return `<div class="dashboard"><section class="home-hero"><div class="home-hero-text"><span class="eyebrow">A MOMENT FOR YOU</span><h2>오늘 마음의 날씨는<br>어떤가요?</h2><p>맑은 날도, 조금 흐린 날도.<br>마인디는 언제나 당신의 편이에요.</p><button class="text-link" onclick="goto('diaryWrite')">나만의 일기 남기기 ${ARROW_ICON}</button></div>${mascotScene('hero')}</section><aside class="gentle-note" aria-label="마인디의 한마디"><span class="eyebrow">A LITTLE REMINDER</span><span class="quote-mark" aria-hidden="true">“</span><p>잘하고 있지 않아도,<br>잘 지내고 있지 않아도<br><strong>여기서는 괜찮아요.</strong></p><span class="note-sign">마인디가 건네는 한마디 ✦</span></aside></div><section class="home-section"><div class="home-section-head"><div><span class="eyebrow">WARM CONNECTIONS</span><h2>지금, 함께 공감하는 이야기 <span class="hot-badge">HOT</span></h2></div><button class="text-link" onclick="setMainTab('concern','popular')">모두 보기 ${ARROW_ICON}</button></div>${syncNotice('posts')}${popular.length?`<div class="post-grid">${popular.map(p=>postCardHTML(p,true)).join('')}</div>`:collectionPlaceholder('posts','첫 공감을 기다리는 이야기들')}</section><section class="home-section"><div class="home-section-head"><div><span class="eyebrow">NEW STORIES</span><h2>방금 도착한 마음</h2></div><button class="text-link" onclick="setMainTab('concern')">모두 보기 ${ARROW_ICON}</button></div>${recent.length?`<div class="post-grid">${recent.map(p=>postCardHTML(p)).join('')}</div>`:collectionPlaceholder('posts','첫 이야기를 들려주세요')}</section>`;
}
function postCardHTML(p,showHot=false){
  const hearted=!!session.userId&&p.hearts.includes(session.userId);
  const ep=!!findEpilogueByPost(p.id);
  return `<article class="post-card" data-key="${showHot?'hot':'post'}-${escapeHtml(p.id)}"><div class="meta-row"><span class="avatar">${avatarSVG(p.authorAvatar)}</span><span class="author-name">${escapeHtml(p.authorNickname)}</span><span class="age-pill">${ageLabel(p.ageGroup)}</span><time>${timeAgo(p.createdAt)}</time></div><h3><button class="post-title-link" onclick="goto('postDetail',{currentPostId:'${p.id}'})">${escapeHtml(p.title)}</button></h3><p class="content-preview">${escapeHtml(p.content)}</p><div class="tag-row">${p.hashtags.map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div><div class="card-foot"><button class="heart-btn ${hearted?'hearted':''}" aria-label="공감 ${p.hearts.length}개${hearted?', 취소하기':', 공감하기'}" aria-pressed="${hearted}" data-action="heart-${p.id}" onclick="toggleHeart('${p.id}')">${ICONS.heart}<span>${p.hearts.length}</span></button><button class="comment-cnt" onclick="goto('postDetail',{currentPostId:'${p.id}'});document.getElementById('comment-input')?.focus();" aria-label="댓글 ${p.comments.length}개 보기">${ICONS.comment}<span>${p.commentsAllowed?p.comments.length:'닫힘'}</span></button>${ep?`<button class="epilogue-link" onclick="viewEpilogue('${p.id}')">후일담 ${ARROW_ICON}</button>`:''}</div></article>`;
}
function renderPostFeed(list){return list.length?`<div class="feed">${list.map(p=>postCardHTML(p)).join('')}</div>`:collectionPlaceholder('posts','아직 나눈 고민이 없어요');}
function renderEpilogueFeed(list){
  return list.length?`<div class="feed">${list.map(({ep,post})=>`<article class="post-card" data-key="ep-${ep.id}"><div class="meta-row"><span class="avatar">${avatarSVG(ep.authorAvatar)}</span><span>${escapeHtml(ep.authorNickname)}</span><time>${timeAgo(ep.createdAt)}</time></div><span class="story-label">그 후, 나의 이야기</span><h3><button class="post-title-link" onclick="goto('epilogueDetail',{currentEpilogueId:'${ep.id}'})">${escapeHtml(post?.title||'그 후의 이야기')}</button></h3><p class="content-preview">${escapeHtml(ep.content)}</p></article>`).join('')}</div>`:collectionPlaceholder('epilogues','아직 도착한 후일담이 없어요');
}

function renderAuth(){
  const draft=ui.loginDraft;
  return `<div class="auth-page entry-screen" data-mode="login" data-has-error="${!!ui.authError}">
    <header class="auth-brand"><button onclick="goto('landing')" aria-label="mindly 마인들리 홈">${brandHTML()}</button><div class="entry-header-tools">${themeControlHTML()}${musicControlHTML()}<button class="back-btn" onclick="goto('landing')" aria-label="뒤로 가기">${ICONS.back}</button></div></header>
    <div class="auth-layout">
      <section class="auth-intro">${entryScene()}<div class="auth-intro-copy"><h1>반가워요,<br>기다리고 있었어요.</h1><p>마인디와 함께, 나다운 이야기의 시작.</p></div></section>
      <section class="auth-wrap" aria-label="로그인">
        <form class="login-form" onsubmit="event.preventDefault();doLogin()" aria-busy="${pendingActions.has('login')}">
          <div class="input-group"><label for="auth-username">아이디</label><input id="auth-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="아이디를 입력해주세요" data-lock-action="login" value="${escapeHtml(draft.identifier)}" oninput="ui.loginDraft.identifier=this.value" aria-describedby="username-help"><span id="username-help" class="sr-only">기존 이메일 계정은 이메일로 로그인할 수 있어요.</span></div>
          <div class="input-group"><label for="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="6" data-lock-action="login" placeholder="비밀번호를 입력해주세요" value="${escapeHtml(draft.pw)}" oninput="ui.loginDraft.pw=this.value"></div>
          ${ui.authError?`<p class="form-error" role="alert">${escapeHtml(ui.authError)}</p>`:''}
          <button type="submit" data-action="login" class="btn-primary account-submit">로그인 ${ARROW_ICON}</button>
        </form>
        <div class="account-links"><button id="open-signup" class="account-signup-link" type="button" data-disable-while="login" onclick="openAccountModal()">회원가입</button></div>
        <p class="account-id-note">아이디나 비밀번호가 기억나지 않으면 관리자에게 문의해주세요.</p>
      </section>
    </div>
  </div>`;
}
