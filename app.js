/* ============ 데이터 & 상수 ============ */
const HASHTAGS = ['연애','인간관계','외모','가정환경','학업/입시','일반고민','일상','우울/스트레스','학교생활'];
const AGE_GROUPS = [{key:'elem',label:'초등학생'},{key:'middle',label:'중학생'},{key:'high',label:'고등학생'}];
const WEATHERS = ['☀️','⛅','☁️','🌧️','❄️','🌬️'];
const ADJECTIVES = ['용감한','수줍은','엉뚱한','몽글몽글한','씩씩한','느긋한','상큼한','포근한','반짝이는','졸린','호기심많은','새침한','든든한','말랑한','조용한','씩씩한','다정한','엉성한'];
const ANIMALS = ['고양이','강아지','토끼','여우','수달','다람쥐','판다','펭귄','부엉이','고슴도치','오리','거북이','너구리','두더지','사슴'];

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function nowTs(){ return Date.now(); }
function randomProfile(){
  const nickname = ADJECTIVES[Math.floor(Math.random()*ADJECTIVES.length)]+' '+ANIMALS[Math.floor(Math.random()*ANIMALS.length)];
  const avatar = Math.floor(Math.random()*5);
  return { nickname, avatar };
}
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function timeAgo(ts){
  const diff = Date.now() - ts;
  const min = Math.floor(diff/60000);
  if(min < 1) return '방금 전';
  if(min < 60) return min+'분 전';
  const hr = Math.floor(min/60);
  if(hr < 24) return hr+'시간 전';
  const day = Math.floor(hr/24);
  if(day < 7) return day+'일 전';
  const d = new Date(ts);
  return (d.getMonth()+1)+'월 '+d.getDate()+'일';
}
function ageLabel(key){ const f = AGE_GROUPS.find(a=>a.key===key); return f? f.label : ''; }


const MASCOT_IMG = "assets/mascot.png";
const AVATAR_IMGS = [
  "assets/avatar-0.png",
  "assets/avatar-1.png",
  "assets/avatar-2.png",
  "assets/avatar-3.png",
  "assets/avatar-4.png"
];

function avatarSVG(idx){
  const src = AVATAR_IMGS[Math.abs(Number(idx) || 0) % AVATAR_IMGS.length];
  return `<img src="${src}" alt="" width="64" height="64" decoding="async">`;
}
function logoSVG(){
  return `<span class="mascot-crop"><img src="${MASCOT_IMG}" alt="마음을 들어주는 공룡, 마인디" class="mascot-img" width="560" height="523" decoding="async"></span>`;
}
function mascotScene(size=''){
  return `<div class="mascot-scene ${size}" aria-label="당신의 이야기를 기다리는 마인디"><span class="scene-window" aria-hidden="true"></span><span class="scene-foliage foliage-left" aria-hidden="true"></span><span class="scene-foliage foliage-right" aria-hidden="true"></span><span class="scene-shadow" aria-hidden="true"></span><div class="mascot-character">${logoSVG()}</div></div>`;
}
function localDate(){
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

/* ============ 상태 및 저장소 ============ */
/* ============ Firebase 설정 ============ */
/* 1) https://console.firebase.google.com 에서 무료 프로젝트를 만드세요.
   2) 프로젝트 설정 > 일반 > "웹 앱 추가"로 나오는 설정 값을 아래에 그대로 붙여넣으세요.
   3) Authentication > Sign-in method 에서 "이메일/비밀번호"를 사용 설정하세요.
   4) Firestore Database를 만드세요 (프로덕션 모드 또는 테스트 모드 모두 가능, 아래 규칙 참고). */
const firebaseConfig = {
  apiKey: "AIzaSyAQpzNdZEoTif2nvLML06TAWf3ev3CKRug",
  authDomain: "mindly1-52859.firebaseapp.com",
  projectId: "mindly1-52859",
  storageBucket: "mindly1-52859.firebasestorage.app",
  messagingSenderId: "831901811932",
  appId: "1:831901811932:web:2ee0031ee85034d6582019"
};
const ADMIN_EMAIL = 'kickin_mindly@gmail.com';
// A deterministic, app-owned login namespace keeps Firebase Authentication's
// uniqueness/password protection without asking members for an email address.
const USERNAME_AUTH_DOMAIN = 'users.mindly1-52859.firebaseapp.com';
const USERNAME_PATTERN = /^[a-z][a-z0-9_]{3,19}$/;
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function usernameFromEmail(email){
  const suffix='@'+USERNAME_AUTH_DOMAIN;
  const value=String(email||'').toLowerCase();
  return value.endsWith(suffix)?value.slice(0,-suffix.length):null;
}
function loginAddress(identifier){
  const value=normalizeUsername(identifier);
  return value.includes('@')?value:`${value}@${USERNAME_AUTH_DOMAIN}`;
}
const FIREBASE_CONFIGURED = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
let auth = null, db = null, firestoreConfigured=false;

/* ============ 데이터 & 상수 ============ */
let DB = { users:[], posts:[], epilogues:[], diary:[], banner:{text:'Mindly는 서로의 이야기를 조심스레 듣는 공간이에요. 따뜻한 말 한마디 부탁드려요 💙'} };
let session = { userId:null, isGuest:false, email:null, username:null, nickname:null, avatar:0, ageGroup:null, isAdmin:false };
const sync = { authReady:false, authError:false, offline:!navigator.onLine, channels:{} };
const subscriptions = new Map();
let authUnsubscribe = null, authWatchdog = null, authGeneration = 0, renderFrame = null;
const pendingActions = new Set();

/* ============ UI 상태 ============ */
let ui = {
  route:'loading', mainTab:'home', ageSubTab:'all', sort:'recent', currentPostId:null, currentEpilogueId:null,
  authMode:'login', searchQuery:'', menuOpen:false, archiveTab:'posts', editingPostId:null, editingCommentId:null,
  signupDraft:{ username:'', pw:'', nickname:'', avatar:0, ageGroup:'middle' },
  loginDraft:{ identifier:'', pw:'' }, authError:'',
  accountModal:null,signupError:'',
  editingCommentPostId:null, commentEditDraft:'', commentEditOriginal:'',
  writeDraft:{ title:'', content:'', hashtags:[], commentsAllowed:true, ageGroup:'middle' },
  epilogueDraft:{ content:'' }, commentDrafts:{},
  diaryDraft:{ date:localDate(), weather:0, title:'', content:'' }
};

function currentUser(){
  return session.userId ? { id:session.userId, email:session.email, username:session.username, nickname:session.nickname, avatar:session.avatar, ageGroup:session.ageGroup } : null;
}
function emailOf(userId){
  if(!userId) return null;
  const u = DB.users.find(x=>x.id===userId);
  return u ? (u.username||usernameFromEmail(u.email)||u.email) : null;
}
function requireLogin(){
  if(session.isGuest || !session.userId){ toast('로그인 후 이용할 수 있어요'); goto('mypage'); return false; }
  return true;
}
function toast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ============ 액션 ============ */
function goto(route, extra){
  if(['write','writeEpilogue','archive','diary','diaryWrite','myHearts'].includes(route) && !session.userId){
    toast('로그인 후 이용할 수 있어요'); route='mypage';
  }
  if(ui.accountModal&&route!==ui.route){ui.accountModal=null;clearAccountSecrets();}
  ui.route=route; ui.menuOpen=false;
  if(extra) Object.assign(ui,extra);
  beginNavigation();
  render({navigation:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function setMainTab(tab, sort='recent'){
  beginNavigation();
  ui.mainTab=tab; ui.sort=sort; ui.ageSubTab='all'; ui.searchQuery='';
  render();
}
function startWriting(){ if(requireLogin()){ resetWriteDraft(); goto('write'); } }
function closeMenu(){ ui.menuOpen=false; render(); document.getElementById('menu-button')?.focus({preventScroll:true}); }
async function runAction(key, action){
  if(pendingActions.has(key)) return;
  if(!db || !auth || !sync.authReady){ toast('연결을 확인한 후 다시 시도해주세요'); return; }
  if(!navigator.onLine){ toast('인터넷 연결 후 다시 시도해주세요. 작성한 내용은 유지돼요.'); return; }
  pendingActions.add(key); render(); updateBusyIndicator();
  try { return await action(); }
  finally { pendingActions.delete(key); render(); updateBusyIndicator(); }
}

function authErrorMessage(e){
  const map = {
    'auth/email-already-in-use':'이미 사용 중인 아이디예요. 다른 아이디를 입력해주세요',
    'auth/invalid-email':'아이디를 확인해주세요. 기존 회원은 가입한 이메일을 입력할 수 있어요',
    'auth/weak-password':'비밀번호는 6자 이상이어야 해요',
    'auth/user-not-found':'아이디 또는 비밀번호가 일치하지 않아요',
    'auth/wrong-password':'아이디 또는 비밀번호가 일치하지 않아요',
    'auth/invalid-credential':'아이디 또는 비밀번호가 일치하지 않아요',
    'auth/too-many-requests':'시도가 너무 많아요. 잠시 후 다시 시도해주세요',
    'auth/network-request-failed':'연결이 원활하지 않아요. 잠시 후 다시 시도해주세요'
  };
  return map[e.code] || '요청을 완료하지 못했어요. 잠시 후 다시 시도해주세요';
}

async function doSignup(){
  const username=normalizeUsername(ui.signupDraft.username),email=loginAddress(username),pw=ui.signupDraft.pw;
  ui.signupError='';
  if(!USERNAME_PATTERN.test(username)){ui.signupError='아이디는 영문으로 시작하는 4~20자의 영문·숫자·밑줄로 입력해주세요';render();return;}
  if(pw.length<6||pw.length>128){ui.signupError='비밀번호는 6~128자로 입력해주세요';render();return;}
  return runAction('signup',async()=>{
    try{
      if(!ui.signupDraft.nickname)Object.assign(ui.signupDraft,randomProfile());
      const profile={username,email,nickname:ui.signupDraft.nickname,avatar:ui.signupDraft.avatar,ageGroup:ui.signupDraft.ageGroup,createdAt:Date.now()};
      const cred=await auth.createUserWithEmailAndPassword(email,pw);
      try{await db.collection('users').doc(cred.user.uid).set(profile);}
      catch(error){
        try{await cred.user.delete();}
        catch{ui.accountModal=null;clearAccountSecrets();toast('계정은 생성됐지만 프로필 저장을 완료하지 못했어요. 같은 아이디로 다시 로그인할 수 있어요.');goto('main');return;}
        ui.route='mypage';ui.accountModal='signup';ui.signupError='프로필을 저장하지 못했어요. 연결을 확인하고 다시 가입해주세요';return;
      }
      if(auth.currentUser?.uid!==cred.user.uid)return;
      Object.assign(session,{username,nickname:profile.nickname,avatar:profile.avatar,ageGroup:profile.ageGroup});
      ui.accountModal=null;clearAccountSecrets();toast('회원가입 완료! 환영해요 '+profile.nickname+'님');goto('main');
    }catch(error){ui.signupError=authErrorMessage(error);}
  });
}

async function doLogin(){
  const identifier=normalizeUsername(ui.loginDraft.identifier);const pw=ui.loginDraft.pw;
  ui.authError='';
  if(!identifier||!pw){toast('아이디와 비밀번호를 입력해주세요');return;}
  if(!identifier.includes('@')&&!USERNAME_PATTERN.test(identifier)){ui.authError='아이디를 확인해주세요. 영문으로 시작하는 4~20자예요';render();return;}
  return runAction('login',async()=>{ try{
    await auth.signInWithEmailAndPassword(loginAddress(identifier), pw);
    ui.loginDraft.pw='';
    toast('다시 만나서 반가워요!');
    // Authentication observer owns session and listener setup.
  } catch(e){ui.authError=authErrorMessage(e);render();} });
}
async function doLogoutImpl(){
  try { await auth?.signOut(); toast('로그아웃 되었어요'); goto('landing'); }
  catch { toast('로그아웃하지 못했어요. 다시 시도해주세요'); }
}
function enterGuest(){ if(!session.userId) session.isGuest=true; goto('main'); }

function resetWriteDraft(post){
  if(post){ ui.writeDraft = { title:post.title, content:post.content, hashtags:[...post.hashtags], commentsAllowed:post.commentsAllowed, ageGroup:post.ageGroup }; ui.editingPostId = post.id; }
  else { ui.writeDraft = { title:'', content:'', hashtags:[], commentsAllowed:true, ageGroup: session.ageGroup || 'middle' }; ui.editingPostId = null; }
}
function toggleHashtag(tag){
  const i = ui.writeDraft.hashtags.indexOf(tag);
  if(i>-1) ui.writeDraft.hashtags.splice(i,1); else ui.writeDraft.hashtags.push(tag);
  render();
}
async function submitPostImpl(){
  if(!requireLogin()) return;
  const d = ui.writeDraft;
  if(!d.title.trim() || !d.content.trim()){ toast('제목과 내용을 모두 입력해주세요'); return; }
  try{
    if(ui.editingPostId){
      await db.collection('posts').doc(ui.editingPostId).update({ title:d.title, content:d.content, hashtags:[...d.hashtags], commentsAllowed:d.commentsAllowed, ageGroup:d.ageGroup });
      const existing=DB.posts.find(p=>p.id===ui.editingPostId);if(existing)Object.assign(existing,d,{hashtags:[...d.hashtags]});
      toast('글이 수정되었어요');
      goto('postDetail', {currentPostId:ui.editingPostId});
      return;
    }
    const u = currentUser();
    const post = { authorId:u.id, authorNickname:u.nickname, authorAvatar:u.avatar, category:'concern', title:d.title, content:d.content, hashtags:[...d.hashtags], ageGroup:d.ageGroup, commentsAllowed:d.commentsAllowed, hearts:[], comments:[], createdAt:Date.now(), hasEpilogue:false };
    const ref = await db.collection('posts').add(post);
    if(!DB.posts.some(p=>p.id===ref.id))DB.posts.unshift({...post,id:ref.id});
    toast('글이 게시되었어요');
    goto('postDetail', {currentPostId:ref.id});
  } catch(e){ console.error(e); toast('저장 중 오류가 발생했어요'); }
}
async function deletePostImpl(id){
  if(!confirm('이 글을 삭제할까요? 되돌릴 수 없어요.')) return;
  try{
    await db.collection('posts').doc(id).delete();
    const epSnap = await db.collection('epilogues').where('postId','==',id).get();
    const batch = db.batch();
    epSnap.forEach(docu=>batch.delete(docu.ref));
    await batch.commit();
    toast('삭제되었어요'); goto('main');
  } catch(e){ console.error(e); toast('삭제 중 오류가 발생했어요'); }
}
async function toggleHeartImpl(postId){
  if(!requireLogin()) return;
  const p = DB.posts.find(x=>x.id===postId);
  if(!p) return;
  const hearted = p.hearts.includes(session.userId);
  try{
    await db.collection('posts').doc(postId).update({
      hearts: hearted ? firebase.firestore.FieldValue.arrayRemove(session.userId) : firebase.firestore.FieldValue.arrayUnion(session.userId)
    });
    p.hearts=hearted?p.hearts.filter(id=>id!==session.userId):[...new Set([...p.hearts,session.userId])];
    render();
  } catch(e){ console.error(e); toast('공감을 저장하지 못했어요. 다시 시도해주세요'); }
}
async function submitCommentImpl(postId){
  if(!requireLogin()) return;
  const input = document.getElementById('comment-input');
  const text = (ui.commentDrafts[postId]||input?.value||'').trim();
  if(!text) return;
  const comment = { id:uid(), authorId:session.userId, authorNickname:session.nickname, authorAvatar:session.avatar, content:text, createdAt:Date.now() };
  try{
    await db.collection('posts').doc(postId).update({ comments: firebase.firestore.FieldValue.arrayUnion(comment) });
    const p=DB.posts.find(p=>p.id===postId);if(p&&!p.comments.some(c=>c.id===comment.id))p.comments.push(comment);
    if((ui.commentDrafts[postId]||'').trim()===text)ui.commentDrafts[postId]='';
    if(input&&input.value.trim()===text)input.value='';
    render();
  } catch(e){ console.error(e); toast('댓글 등록 중 오류가 발생했어요'); }
}
async function deleteCommentImpl(postId, commentId){
  if(!session.isAdmin) return;
  if(!confirm('이 댓글을 삭제할까요?')) return;
  const p = DB.posts.find(x=>x.id===postId);
  if(!p) return;
  const newComments = p.comments.filter(c=>c.id!==commentId);
  try{ await db.collection('posts').doc(postId).update({ comments:newComments }); render(); }
  catch(e){ console.error(e); }
}
function canEditComment(comment){return !!session.userId&&(comment.authorId===session.userId||session.isAdmin);}
function startEditComment(postId,commentId){
  const comment=DB.posts.find(p=>p.id===postId)?.comments.find(c=>c.id===commentId);
  if(!comment||!canEditComment(comment))return;
  ui.editingCommentId=commentId;ui.editingCommentPostId=postId;
  ui.commentEditDraft=comment.content;ui.commentEditOriginal=comment.content;render();
  const input=document.getElementById('edit-comment-'+commentId);
  input?.focus({preventScroll:true});input?.setSelectionRange(input.value.length,input.value.length);
}
function cancelEditComment(){
  if(pendingActions.has('edit-comment-'+ui.editingCommentId))return;
  ui.editingCommentId=null;ui.editingCommentPostId=null;ui.commentEditDraft='';ui.commentEditOriginal='';render();
}
async function saveEditComment(postId, commentId){
  const comment=DB.posts.find(p=>p.id===postId)?.comments.find(c=>c.id===commentId);
  if(!comment||!canEditComment(comment)||ui.editingCommentId!==commentId||ui.editingCommentPostId!==postId)return;
  const text=ui.commentEditDraft.trim(),original=ui.commentEditOriginal;
  if(!text){toast('댓글 내용을 입력해주세요');return;}
  if(text===original){cancelEditComment();return;}
  const actor=session.userId,generation=authGeneration,isAdmin=session.isAdmin;
  return runAction('edit-comment-'+commentId,async()=>{
    try{
      const ref=db.collection('posts').doc(postId);
      const updated=await db.runTransaction(async transaction=>{
        const snapshot=await transaction.get(ref);
        if(!snapshot.exists)throw {code:'comment/not-found'};
        const comments=snapshot.data().comments||[];
        const target=comments.find(c=>c.id===commentId);
        if(!target)throw {code:'comment/not-found'};
        if(generation!==authGeneration||actor!==session.userId||(!isAdmin&&target.authorId!==actor))throw {code:'permission-denied'};
        if(target.content!==original)throw {code:'comment/conflict'};
        const next={...target,content:text,editedAt:Date.now(),editedByAdmin:isAdmin&&target.authorId!==actor};
        transaction.update(ref,{comments:comments.map(c=>c.id===commentId?next:c)});
        return next;
      });
      if(generation!==authGeneration)return;
      const post=DB.posts.find(p=>p.id===postId);
      if(post)post.comments=post.comments.map(c=>c.id===commentId?updated:c);
      if(ui.editingCommentId===commentId&&ui.editingCommentPostId===postId){ui.editingCommentId=null;ui.editingCommentPostId=null;ui.commentEditDraft='';ui.commentEditOriginal='';}
      toast('댓글이 수정되었어요');
    }catch(error){
      const messages={'permission-denied':'이 댓글을 수정할 권한이 없어요','comment/not-found':'이미 삭제된 댓글이에요','comment/conflict':'다른 곳에서 댓글이 수정됐어요. 내용을 복사한 뒤 편집을 다시 열어주세요'};
      toast(messages[error.code]||'댓글을 수정하지 못했어요. 작성한 내용은 유지돼요');
    }
  });
}
async function saveBannerImpl(){
  const ta = document.getElementById('banner-edit-input');
  const text = ta.value.trim();
  if(!text){ toast('배너 문구를 입력해주세요'); return; }
  try{ await db.collection('meta').doc('banner').set({text}); toast('배너가 업데이트되었어요'); render(); }
  catch(e){ console.error(e); }
}
async function submitEpilogueImpl(postId){
  if(!requireLogin()) return;
  if(!ui.epilogueDraft.content.trim()){ toast('후일담 내용을 입력해주세요'); return; }
  const p = DB.posts.find(x=>x.id===postId);
  if(!p||p.authorId!==session.userId) return;
  const ep = { postId, authorId:p.authorId, authorNickname:p.authorNickname, authorAvatar:p.authorAvatar, content:ui.epilogueDraft.content, createdAt:Date.now() };
  try{
    const ref=db.collection('epilogues').doc();
    const batch=db.batch();batch.set(ref,ep);batch.update(db.collection('posts').doc(postId),{hasEpilogue:true});await batch.commit();
    if(!DB.epilogues.some(e=>e.id===ref.id))DB.epilogues.unshift({...ep,id:ref.id});
    p.hasEpilogue=true;
    toast('후일담이 게시되었어요');
    ui.epilogueDraft.content='';
    goto('epilogueDetail', {currentEpilogueId:ref.id});
  } catch(e){ console.error(e); toast('저장 중 오류가 발생했어요'); }
}
function findEpilogueByPost(postId){ return DB.epilogues.find(e=>e.postId===postId); }
function viewEpilogue(postId){
  const ep = findEpilogueByPost(postId);
  if(ep) goto('epilogueDetail', {currentEpilogueId:ep.id});
  else toast('아직 후일담이 작성되지 않았어요');
}
function needsReminder(post){
  const DAY=1000*60*60*24;
  return post.authorId===session.userId && !post.hasEpilogue && (Date.now()-post.createdAt) > 14*DAY;
}
async function submitDiaryImpl(){
  if(!requireLogin()) return;
  const d = ui.diaryDraft;
  if(!d.title.trim() || !d.content.trim()){ toast('제목과 내용을 입력해주세요'); return; }
  try{
    const entry={userId:session.userId,date:d.date,weather:d.weather,title:d.title,content:d.content,createdAt:Date.now()};
    const ref=await db.collection('diary').add(entry);
    if(!DB.diary.some(e=>e.id===ref.id))DB.diary.unshift({...entry,id:ref.id});
    toast('일기가 저장되었어요');
    ui.diaryDraft = { date:localDate(), weather:0, title:'', content:'' };
    goto('diary');
  } catch(e){ console.error(e); toast('저장 중 오류가 발생했어요'); }
}
async function deleteDiaryImpl(id){
  if(!confirm('이 일기를 삭제할까요?')) return;
  try{ await db.collection('diary').doc(id).delete(); render(); }
  catch(e){ console.error(e); }
}

/* ============ Firestore 실시간 동기화 ============ */
const ICONS = {
  menu:'<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="#33465C" stroke-width="2" stroke-linecap="round"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#33465C" stroke-width="2"/><path d="M21 21l-4-4" stroke="#33465C" stroke-width="2" stroke-linecap="round"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="#8298AC" stroke-width="2"/></svg>',
  comment:'<svg viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 01-11.3 7.3L4 20l1-4.6A8 8 0 1121 12z" stroke="#8298AC" stroke-width="2"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none"><path d="M15 19l-7-7 7-7" stroke="#33465C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none"><path d="M4 4v6h6M20 20v-6h-6" stroke="#4E7AA8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14a8 8 0 0014 3M19 10A8 8 0 005 7" stroke="#4E7AA8" stroke-width="2" stroke-linecap="round"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none"><path d="M3 8l9-5 9 5-9 5-9-5z" stroke="#4E7AA8" stroke-width="2" stroke-linejoin="round"/><path d="M3 8v8l9 5 9-5V8" stroke="#4E7AA8" stroke-width="2" stroke-linejoin="round"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#4E7AA8" stroke-width="2"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="#4E7AA8" stroke-width="2" stroke-linecap="round"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="none"><path d="M4 5c3-1.5 6-1.5 8 0v14c-2-1.5-5-1.5-8 0V5z" stroke="#4E7AA8" stroke-width="2" stroke-linejoin="round"/><path d="M20 5c-3-1.5-6-1.5-8 0v14c2-1.5 5-1.5 8 0V5z" stroke="#4E7AA8" stroke-width="2" stroke-linejoin="round"/></svg>',
  heartFilled:'<svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="#4E7AA8" stroke-width="2"/></svg>',
  empty:'<svg width="70" height="70" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="55" r="38" fill="#DEE8F1"/><circle cx="40" cy="50" r="3" fill="#8298AC"/><path d="M32 68 Q50 78 68 68" stroke="#8298AC" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="#4E7AA8" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="#4E7AA8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* ============ 렌더링 ============ */
function renderPostDetail(){
  const p = DB.posts.find(x=>x.id===ui.currentPostId);
  if(!p) return `<div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>고민</h2></div>${syncNotice('posts')}${collectionPlaceholder('posts','이 이야기를 찾을 수 없어요')}`;
  const hearted = session.userId && p.hearts.includes(session.userId);
  const isOwner = session.userId && p.authorId===session.userId;
  const canManage = isOwner || session.isAdmin;
  const authorEmail = session.isAdmin ? emailOf(p.authorId) : null;
  const ep = findEpilogueByPost(p.id);
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>고민</h2></div>
  <div class="detail-wrap">
    <div class="meta-row"><span class="age-pill">${ageLabel(p.ageGroup)}</span><span>${escapeHtml(p.authorNickname)}</span>${authorEmail?`<span class="admin-email-tag">✉ ${escapeHtml(authorEmail)}</span>`:''}<span>·</span><span>${timeAgo(p.createdAt)}</span>
      ${canManage? `<span class="owner-actions">${session.isAdmin && !isOwner ? '<span class="admin-badge">관리자</span>':''}<button onclick="resetWriteDraft(DB.posts.find(x=>x.id==='${p.id}')); goto('write')">수정</button><button data-action="delete-post-${p.id}" onclick="deletePost('${p.id}')">삭제</button></span>`:''}
    </div>
    <div class="detail-title">${escapeHtml(p.title)}</div>
    <div class="tag-row">${p.hashtags.map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>
    <div class="detail-content">${escapeHtml(p.content)}</div>
    <div class="detail-actions">
      <button class="action-pill ${hearted?'hearted':''}" aria-pressed="${!!hearted}" data-action="heart-${p.id}" onclick="toggleHeart('${p.id}')">${ICONS.heart} 공감 ${p.hearts.length}</button>
      <span class="action-pill">${ICONS.comment} 댓글 ${p.commentsAllowed? p.comments.length : '비허용'}</span>
      ${ep?`<button class="action-pill" onclick="viewEpilogue('${p.id}')">${ICONS.book} 후일담 보기</button>`:''}
    </div>
    ${isOwner && !ep ? `<div class="epilogue-cta"><p>이 고민, 그 후 어떻게 됐나요?<br>후일담을 남겨 다른 친구들에게도 힘이 되어주세요.</p><button class="small-btn" onclick="ui.epilogueDraft.content=''; goto('writeEpilogue',{currentPostId:'${p.id}'})">후일담 쓰기</button></div>`:''}
    ${p.commentsAllowed ? `
      <div class="comments-block">
        <h4>댓글 ${p.comments.length}</h4>
        ${p.comments.map(c=>{
          const cEmail = session.isAdmin ? emailOf(c.authorId) : null;
          const isEditing=ui.editingCommentId===c.id&&ui.editingCommentPostId===p.id;
          const canEdit=canEditComment(c),isMine=c.authorId===session.userId;
          return `<div class="comment-item" data-key="comment-${p.id}-${c.id}"><span class="avatar">${avatarSVG(c.authorAvatar)}</span><div class="comment-body" style="flex:1;">
            <strong>${escapeHtml(c.authorNickname)}${cEmail?` <span class="admin-email-tag">✉ ${escapeHtml(cEmail)}</span>`:''}</strong>
            ${isEditing? `
              <textarea id="edit-comment-${c.id}" class="admin-comment-edit" aria-label="댓글 수정 내용" data-lock-action="edit-comment-${c.id}" oninput="ui.commentEditDraft=this.value">${escapeHtml(ui.commentEditDraft)}</textarea>
              <div class="comment-edit-actions"><button class="admin-mini-btn" data-action="edit-comment-${c.id}" onclick="saveEditComment('${p.id}','${c.id}')">수정 저장</button><button class="admin-mini-btn ghost" data-disable-while="edit-comment-${c.id}" onclick="cancelEditComment()">취소</button></div>
            ` : `<p>${escapeHtml(c.content)}</p>${c.editedAt?'<span class="edited-label">수정됨</span>':''}`}
            ${canEdit&&!isEditing?`<div class="admin-comment-actions">${session.isAdmin&&!isMine?'<span class="admin-badge">관리자</span>':''}<button aria-label="${isMine?'내 댓글 수정':'댓글 수정'}" onclick="startEditComment('${p.id}','${c.id}')">수정</button>${session.isAdmin?`<button data-action="delete-comment-${c.id}" onclick="deleteComment('${p.id}','${c.id}')">삭제</button>`:''}</div>`:''}
          </div></div>`;
        }).join('') || '<p style="font-size:12.5px;color:var(--ink-faint);">첫 댓글을 남겨보세요.</p>'}
        <div class="comment-input-row">
          <input id="comment-input" aria-label="댓글 내용" value="${escapeHtml(ui.commentDrafts[p.id]||'')}" placeholder="${session.userId? '따뜻한 댓글을 남겨주세요' : '로그인 후 댓글을 남길 수 있어요'}" oninput="ui.commentDrafts['${p.id}']=this.value" onkeydown="if(event.key==='Enter'&&!event.isComposing){event.preventDefault();submitComment('${p.id}');}">
          <button class="comment-send" data-action="comment" onclick="submitComment('${p.id}')">${ICONS.send}</button>
        </div>
      </div>` : `<div class="locked-note">작성자가 댓글을 허용하지 않은 글이에요</div>`}
  </div>`;
}

function renderWrite(){
  const d = ui.writeDraft;
  const isEdit = !!ui.editingPostId;
  return `
  <div class="page-header"><button class="back-btn" onclick="goto(ui.editingPostId?'postDetail':'main')">${ICONS.back}</button><h2>${isEdit?'글 수정':'고민 쓰기'}</h2></div>
  <div class="write-wrap">
    <input class="title-input" placeholder="제목을 입력해주세요" value="${escapeHtml(d.title)}" oninput="ui.writeDraft.title=this.value">
    <div>
      <span class="field-label">해시태그 (여러 개 선택 가능)</span>
      <div class="hashtag-grid">${HASHTAGS.map(t=>`<button class="hashtag-opt ${d.hashtags.includes(t)?'sel':''}" onclick="toggleHashtag('${t}')">#${t}</button>`).join('')}</div>
    </div>
    <textarea class="content-textarea" placeholder="어떤 고민이든 편하게 적어보세요..." oninput="ui.writeDraft.content=this.value">${escapeHtml(d.content)}</textarea>
    <div class="option-card">
      <div class="option-row"><span class="lbl">댓글 허용</span><button class="toggle ${d.commentsAllowed?'on':''}" onclick="ui.writeDraft.commentsAllowed=!ui.writeDraft.commentsAllowed; render();"><span class="knob"></span></button></div>
      <div>
        <span class="field-label" style="margin-bottom:10px;">나이대 선택</span>
        <div class="seg">${AGE_GROUPS.map(a=>`<button class="seg-opt ${d.ageGroup===a.key?'sel':''}" onclick="ui.writeDraft.ageGroup='${a.key}'; render();">${a.label}</button>`).join('')}</div>
      </div>
    </div>
  </div>
  <div class="submit-bar"><div class="inner"><button class="submit-btn" data-action="post" onclick="submitPost()">${isEdit?'수정 완료':'게시하기'}</button></div></div>
  `;
}

function renderWriteEpilogue(){
  const p = DB.posts.find(x=>x.id===ui.currentPostId);
  if(!p) return renderPostDetail();
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('postDetail',{currentPostId:'${p.id}'})">${ICONS.back}</button><h2>후일담 쓰기</h2></div>
  <div class="write-wrap">
    <div class="post-card" style="opacity:0.85;"><div class="meta-row"><span class="age-pill">${ageLabel(p.ageGroup)}</span><span>원글</span></div><h3>${escapeHtml(p.title)}</h3></div>
    <span class="field-label">그 고민은 지금 어떻게 됐나요?</span>
    <textarea class="content-textarea" placeholder="그 이후 이야기를 들려주세요..." oninput="ui.epilogueDraft.content=this.value">${escapeHtml(ui.epilogueDraft.content)}</textarea>
  </div>
  <div class="submit-bar"><div class="inner"><button class="submit-btn" data-action="epilogue" onclick="submitEpilogue('${p.id}')">후일담 게시하기</button></div></div>
  `;
}

function renderEpilogueDetail(){
  const ep = DB.epilogues.find(x=>x.id===ui.currentEpilogueId);
  if(!ep) return `<div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>후일담</h2></div>${syncNotice('epilogues')}${collectionPlaceholder('epilogues','이 후일담을 찾을 수 없어요')}`;
  const p = DB.posts.find(x=>x.id===ep.postId);
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>후일담</h2></div>
  <div class="detail-wrap">
    <div class="meta-row"><span class="age-pill">${p?ageLabel(p.ageGroup):''}</span><span>${escapeHtml(ep.authorNickname)}</span><span>·</span><span>${timeAgo(ep.createdAt)}</span></div>
    ${p?`<div class="post-card" style="margin-bottom:14px;" onclick="goto('postDetail',{currentPostId:'${p.id}'})"><div class="meta-row"><span>원글 보기</span></div><h3>${escapeHtml(p.title)}</h3></div>`:''}
    <div class="detail-content">${escapeHtml(ep.content)}</div>
  </div>`;
}

function renderArchive(){
  if(!session.userId) return renderAuth();
  const myPosts = DB.posts.filter(p=>p.authorId===session.userId).sort((a,b)=>b.createdAt-a.createdAt);
  const myEpilogues = DB.epilogues.filter(e=>e.authorId===session.userId);
  const remindPosts = myPosts.filter(needsReminder);
  const items = ui.archiveTab==='posts' ? myPosts : myEpilogues;
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>나의 보관함</h2></div>
  <div class="archive-tabs">
    <button class="tab-sub ${ui.archiveTab==='posts'?'active':''}" onclick="ui.archiveTab='posts'; render();">내가 쓴 글 (${myPosts.length})</button>
    <button class="tab-sub ${ui.archiveTab==='epilogues'?'active':''}" onclick="ui.archiveTab='epilogues'; render();">내가 쓴 후일담 (${myEpilogues.length})</button>
  </div>
  ${remindPosts.length ? `<div class="reminder-note">📮 "${escapeHtml(remindPosts[0].title)}" 글을 올린 지 2주가 지났어요. 그 이야기의 후일담을 남겨보는 건 어떨까요? </div>`:''}
  <div class="list-wrap">
    ${syncNotice(ui.archiveTab==='posts'?'posts':'epilogues')}
    ${!items.length ? collectionPlaceholder(ui.archiveTab==='posts'?'posts':'epilogues','아직 작성한 이야기가 없어요') : ''}
    ${ui.archiveTab==='posts' ? items.map(p=>postCardHTML(p)).join('') : items.map(ep=>{
      const p = DB.posts.find(x=>x.id===ep.postId);
      return `<div class="post-card" onclick="goto('epilogueDetail',{currentEpilogueId:'${ep.id}'})"><div class="meta-row"><span>${timeAgo(ep.createdAt)}</span></div><h3>원글: ${p?escapeHtml(p.title):''}</h3><p class="content-preview">${escapeHtml(ep.content)}</p></div>`;
    }).join('')}
  </div>`;
}

function renderMyHearts(){
  if(!session.userId) return renderAuth();
  const list = DB.posts.filter(p=>p.hearts.includes(session.userId)).sort((a,b)=>b.createdAt-a.createdAt);
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>내 공감</h2></div>
  <div class="list-wrap">
    ${syncNotice('posts')}${!list.length?collectionPlaceholder('posts','아직 공감한 글이 없어요'):list.map(p=>postCardHTML(p)).join('')}
  </div>`;
}

function renderAdminPanel(){
  if(!session.isAdmin)return `<div class="empty-state"><h2>관리자 전용 공간이에요</h2><button class="btn-primary" onclick="goto('main')">라운지로 돌아가기</button></div>`;
  const users = DB.users.filter(u=>!u.isAdmin).sort((a,b)=>(a.nickname||'').localeCompare(b.nickname||''));
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>관리자 페이지</h2></div>
  <div class="admin-wrap">
    <div class="admin-section">
      <h3>홈 배너 문구 관리</h3>
      <textarea id="banner-edit-input" class="banner-edit-area">${escapeHtml(DB.banner.text)}</textarea>
      <button class="admin-mini-btn" data-action="banner" onclick="saveBanner()">배너 저장</button>
    </div>
    <div class="admin-section">
      <h3>가입 회원 (${users.length}명) · 계정 조회</h3>${syncNotice('users')}
      ${!users.length? `<p style="font-size:12.5px;color:var(--ink-faint);">아직 가입한 회원이 없어요.</p>` : users.map(u=>`
        <div class="admin-user-row">
          <span class="avatar">${avatarSVG(u.avatar)}</span>
          <div class="u-info"><strong>${escapeHtml(u.nickname)}</strong><span>${escapeHtml(u.username||usernameFromEmail(u.email)||u.email)}</span></div>
          <div class="u-meta">${ageLabel(u.ageGroup)}</div>
        </div>`).join('')}
    </div>
    <div class="admin-section">
      <h3>운영 안내</h3>
      <p style="font-size:12px; color:var(--ink-soft); line-height:1.7; margin:0;">관리자 계정으로 모든 게시글·댓글의 수정과 삭제가 가능해요. 각 게시글과 댓글에서 작성자 계정과 "관리자" 표시를 확인할 수 있어요.</p>
    </div>
  </div>`;
}

function renderMyPage(){
  const backRoute = 'main';
  if(session.userId && !session.isGuest && !pendingActions.has('signup')){
    const u = currentUser();
    return `
    <div class="page-header"><button class="back-btn" onclick="goto('${backRoute}')">${ICONS.back}</button><h2>마이페이지</h2></div>
    <div class="auth-wrap">
      <div class="profile-card">
        <div class="avatar">${avatarSVG(u.avatar)}</div>
        <h3>${escapeHtml(u.nickname)} ${session.isAdmin?'<span class="admin-badge">관리자</span>':''}</h3>
        <div class="email">${escapeHtml(u.username||u.email)}</div>
        <div class="info-row"><span>${u.username?'아이디':'기존 이메일 계정'}</span><span>${escapeHtml(u.username||u.email)}</span></div>
        <div class="info-row"><span>나이대</span><span>${ageLabel(u.ageGroup)}</span></div>
        <div class="info-row"><span>가입 프로필</span><span>랜덤 공룡 아바타</span></div>
        <button class="logout-btn" data-action="logout" onclick="doLogout()">로그아웃</button>
      </div>
      ${session.isAdmin? `<button class="drawer-item" style="background:var(--surface); box-shadow:var(--shadow); border-radius:14px; padding:14px; margin-bottom:8px;" onclick="goto('adminPanel')">${ICONS.shield} 관리자 페이지 바로가기</button>`:''}
      <button class="drawer-item" style="background:var(--surface); box-shadow:var(--shadow); border-radius:14px; padding:14px;" onclick="goto('archive')">${ICONS.box} 나의 보관함 바로가기</button>
    </div>`;
  }
  return renderAuth();
}

function renderDiaryList(){
  if(!session.userId) return renderAuth();
  const list = DB.diary.filter(d=>d.userId===session.userId).sort((a,b)=>b.createdAt-a.createdAt);
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>일기장</h2><button class="btn-primary header-action" onclick="goto('diaryWrite')">${ICONS.pencil}일기 쓰기</button></div>
  <div class="diary-list">
    ${syncNotice('diary')}${!list.length?collectionPlaceholder('diary','오늘의 첫 기록을 남겨보세요'):list.map(d=>`
      <div class="diary-card" >
        <div class="d-head"><span class="d-date">${d.date}</span><span class="d-weather">${WEATHERS[d.weather]}</span></div>
        <h4>${escapeHtml(d.title)}</h4>
        <p>${escapeHtml(d.content)}</p>
        <div style="text-align:right; margin-top:8px;"><button style="font-size:11px; color:var(--ink-faint); text-decoration:underline;" data-action="delete-diary-${d.id}" onclick="deleteDiary('${d.id}')">삭제</button></div>
      </div>`).join('')}
  </div>
  `;
}
function renderDiaryWrite(){
  const d = ui.diaryDraft;
  return `
  <div class="page-header"><button class="back-btn" onclick="goto('diary')">${ICONS.back}</button><h2>새 일기 쓰기</h2></div>
  <div class="write-wrap diary-write">
    <div class="input-group"><label>날짜</label><input type="date" value="${d.date}" oninput="ui.diaryDraft.date=this.value"></div>
    <div>
      <span class="field-label">오늘의 날씨</span>
      <div class="weather-grid">${WEATHERS.map((w,i)=>`<button class="weather-opt ${d.weather===i?'sel':''}" onclick="ui.diaryDraft.weather=${i}; render();">${w}</button>`).join('')}</div>
    </div>
    <input class="title-input" placeholder="제목" value="${escapeHtml(d.title)}" oninput="ui.diaryDraft.title=this.value">
    <textarea class="content-textarea" placeholder="오늘 하루를 기록해보세요..." oninput="ui.diaryDraft.content=this.value">${escapeHtml(d.content)}</textarea>
  </div>
  <div class="submit-bar"><div class="inner"><button class="submit-btn" data-action="diary" onclick="submitDiary()">저장하기</button></div></div>
  `;
}

/* ============ 초기화 ============ */

function submitPost(...args){return runAction('post',()=>submitPostImpl(...args));}

function submitEpilogue(...args){return runAction('epilogue',()=>submitEpilogueImpl(...args));}

function submitDiary(...args){return runAction('diary',()=>submitDiaryImpl(...args));}

function submitComment(...args){return runAction('comment',()=>submitCommentImpl(...args));}

function toggleHeart(...args){return runAction('heart'+'-'+args[0],()=>toggleHeartImpl(...args));}

function doLogout(...args){return runAction('logout',()=>doLogoutImpl(...args));}

function deletePost(...args){return runAction('delete-post'+'-'+args[0],()=>deletePostImpl(...args));}

function deleteComment(...args){return runAction('delete-comment'+'-'+args[1],()=>deleteCommentImpl(...args));}

function saveBanner(...args){return runAction('banner',()=>saveBannerImpl(...args));}

function deleteDiary(...args){return runAction('delete-diary'+'-'+args[0],()=>deleteDiaryImpl(...args));}
