/* Authentication and realtime data have one owner. No private disk cache. */
function backgroundRender(){
  if(renderFrame!==null) return;
  renderFrame=requestAnimationFrame(()=>{renderFrame=null;render({background:true});});
}
function normalizeRecord(doc){
  const data=doc.data();
  return {...data,id:doc.id,title:String(data.title||''),content:String(data.content||''),
    authorNickname:String(data.authorNickname||'익명 공룡'),authorAvatar:Number(data.authorAvatar)||0,
    hearts:Array.isArray(data.hearts)?data.hearts:[],comments:Array.isArray(data.comments)?data.comments:[],
    hashtags:Array.isArray(data.hashtags)?data.hashtags:[],commentsAllowed:data.commentsAllowed!==false,
    createdAt:typeof data.createdAt?.toMillis==='function'?data.createdAt.toMillis():Number(data.createdAt)||0};
}
function stopSubscription(key){
  const sub=subscriptions.get(key);
  if(sub){sub.unsubscribe?.();clearTimeout(sub.timer);clearTimeout(sub.retry);subscriptions.delete(key);}
}
function listen(key,query,receive,attempt=0){
  stopSubscription(key);
  const generation=authGeneration;
  const state=sync.channels[key]||{ready:false};
  Object.assign(state,{status:'loading',error:null});sync.channels[key]=state;
  const sub={query,receive,attempt,startedAt:Date.now()};subscriptions.set(key,sub);
  const active=()=>generation===authGeneration&&subscriptions.get(key)===sub;
  sub.timer=setTimeout(()=>{if(active()&&state.status==='loading'){state.status='slow';backgroundRender();}},8000);
  sub.unsubscribe=query.onSnapshot({includeMetadataChanges:true},snap=>{
    if(!active()) return;
    const fromCache=!!snap.metadata?.fromCache;
    const empty=snap.docs?snap.empty:!snap.exists;
    // An empty local cache is not an empty server collection.
    if(!fromCache||!empty){receive(snap);state.ready=true;}
    state.status=fromCache?(Date.now()-sub.startedAt>=8000?'slow':'loading'):'ready';state.error=null;
    if(!fromCache){clearTimeout(sub.timer);sub.attempt=0;}
    backgroundRender();
  },error=>{
    if(!active()) return;
    clearTimeout(sub.timer);state.status='error';state.error=error.code||'unknown';
    console.warn('Mindly sync:',key,state.error);
    // Firestore retries disconnections itself; terminal listener errors need
    // a new subscription. Do not loop on permission or configuration errors.
    if(attempt<3&&!['permission-denied','unauthenticated','failed-precondition'].includes(error.code)){
      sub.retry=setTimeout(()=>{if(active())listen(key,query,receive,attempt+1);},1000*2**attempt);
    }
    backgroundRender();
  });
}
function attachGlobalListeners(){
  listen('posts',db.collection('posts'),snap=>{DB.posts=snap.docs.map(normalizeRecord);});
  listen('epilogues',db.collection('epilogues'),snap=>{DB.epilogues=snap.docs.map(normalizeRecord);});
  listen('banner',db.collection('meta').doc('banner'),snap=>{if(snap.exists)DB.banner={text:String(snap.data().text||DB.banner.text)};});
  if(session.isAdmin)listen('users',db.collection('users'),snap=>{DB.users=snap.docs.map(d=>({...d.data(),id:d.id}));});
}
function attachDiaryListener(userId){
  listen('diary',db.collection('diary').where('userId','==',userId),snap=>{DB.diary=snap.docs.map(normalizeRecord);});
}
function retryData(key){
  const sub=subscriptions.get(key);
  if(sub)listen(key,sub.query,sub.receive);
  else if(!sync.authReady)initApp();
  render();
}
function reconnect(){
  sync.offline=!navigator.onLine;
  if(!sync.offline)for(const [key,sub] of subscriptions){
    if(['error','slow'].includes(sync.channels[key]?.status))listen(key,sub.query,sub.receive);
  }
  backgroundRender();
}
function resetPrivateState(){
  DB.diary=[];DB.users=[];
  if(!pendingActions.has('login'))ui.loginDraft.pw='';
  if(!pendingActions.has('signup'))ui.signupDraft.pw='';
  ui.commentDrafts={};ui.epilogueDraft={content:''};
  ui.editingCommentId=null;ui.editingCommentPostId=null;ui.commentEditDraft='';ui.commentEditOriginal='';
  ui.diaryDraft={date:localDate(),weather:0,title:'',content:''};resetWriteDraft();
}
function initApp(){
  if(!FIREBASE_CONFIGURED){ui.route='setupNeeded';render();return;}
  if(!window.firebase?.auth||!window.firebase?.firestore){sync.authError=true;ui.route='connectionError';render();return;}
  try{
    if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
    auth=firebase.auth();db=firebase.firestore();
    if(!firestoreConfigured){
      // Streaming responses were buffered on the affected network, leaving
      // listeners waiting >10s. Long polling returns each response promptly.
      // Must be configured before any Firestore operation (and only once).
      db.settings({experimentalForceLongPolling:true});
      firestoreConfigured=true;
    }
    authUnsubscribe?.();clearTimeout(authWatchdog);
    sync.authError=false;ui.route='loading';render();
    authWatchdog=setTimeout(()=>{if(!sync.authReady){sync.authError=true;ui.route='connectionError';render();}},10000);
    authUnsubscribe=auth.onAuthStateChanged(user=>{
      clearTimeout(authWatchdog);authGeneration++;
      const previousId=session.userId;
      for(const key of [...subscriptions.keys()])stopSubscription(key);
      sync.authReady=true;sync.authError=false;sync.channels={};
      if(previousId!==(user?.uid||null)){resetPrivateState();DB.posts=[];DB.epilogues=[];}
      session={userId:user?.uid||null,isGuest:!user&&session.isGuest,email:user?.email||null,username:usernameFromEmail(user?.email),nickname:user?.displayName||'익명 공룡',avatar:0,ageGroup:'middle',isAdmin:user?.email===ADMIN_EMAIL};
      // Never block the entire app on a profile document network round trip.
      if(user){
        if(!pendingActions.has('signup')&&['landing','loading','connectionError','mypage'].includes(ui.route)){ui.route='main';beginNavigation();}
        listen('profile',db.collection('users').doc(user.uid),snap=>{
          if(snap.exists){const p=snap.data();Object.assign(session,{username:usernameFromEmail(user.email)||p.username||null,nickname:p.nickname||'익명 공룡',avatar:Number(p.avatar)||0,ageGroup:p.ageGroup||'middle'});}
        });
      }else if(['loading','connectionError'].includes(ui.route)||previousId)ui.route=session.isGuest?'main':'landing';
      attachGlobalListeners();document.dispatchEvent(new Event('mindly:session-changed'));render();
    },()=>{clearTimeout(authWatchdog);sync.authError=true;ui.route='connectionError';render();});
  }catch{sync.authError=true;ui.route='connectionError';render();}
}
