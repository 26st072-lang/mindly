// Isolated in-browser Firestore double. No production data is written in tests.
export async function mockApp(page,options={}){
  await page.route('**/site-config.js',route=>route.fulfill({body:"window.MINDLY_CONFIG={workerUrl:''};",contentType:'text/javascript'}));
  await page.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.addInitScript(options=>{
    const listeners=new Map(),calls=[],writes=[],authCalls=[];
    let revision=0;
    const base={authorId:'reader',authorNickname:'포근한 공룡',authorAvatar:0,ageGroup:'middle',commentsAllowed:true,hashtags:['인간관계','학교생활'],comments:[],createdAt:Date.now()-600000,content:'마음을 털어놓고 나니 조금은 가벼워졌어요. 누군가에게도 이 이야기가 작은 위로가 되었으면 좋겠어요.'};
    const records={
      posts:Array.from({length:8},(_,i)=>({...base,id:'p'+i,title:['친구에게 먼저 다가갈 용기가 필요해요','잘하고 싶은 마음이 너무 커질 때','오늘은 나에게 다정한 말을 해주고 싶어요','새로운 시작이 조금 두려워요'][i%4],hearts:Array.from({length:16-i},(_,j)=>'u'+j),authorAvatar:i%5,ageGroup:['middle','high','elem'][i%3]})),
      epilogues:[{...base,id:'ep0',postId:'p0',content:'용기를 내어 말을 걸었어요. 함께 들어줘서 고마워요.'}],
      diary:[{id:'d0',userId:'reader',date:'2026-10-31',title:'나의 조용한 하루',content:'내게만 보이는 오늘의 마음 기록.',createdAt:Date.now(),weather:1}],
      users:[{id:'reader',nickname:'포근한 공룡',avatar:1,ageGroup:'middle',email:'reader@example.test'}],
      meta:[{id:'banner',text:'Mindly는 서로의 이야기를 조심스레 듣는 공간이에요. 따뜻한 말 한마디 부탁드려요 💙'}]
    };
    const accounts=new Map([['reader@example.test',{uid:'reader',email:'reader@example.test',password:'secret123'}],['taken@users.mindly1-52859.firebaseapp.com',{uid:'taken',email:'taken@users.mindly1-52859.firebaseapp.com',password:'secret123'}]]);
    let authCallback,authResolved=false,currentUser=options.user?{uid:'reader',email:'reader@example.test',getIdToken:async()=> 'test-id-token'}:null;
    let writeFailure=false,writeDelay=0;
    const snapshot=(name,id,fromCache=false)=>{
      const rows=records[name]||[],docs=rows.filter(row=>!id||id===row.id).map(row=>{const data=structuredClone(row);return {id:row.id,exists:true,data:()=>structuredClone(data),ref:ref(name,row.id)};});
      if(id)return {exists:docs.length>0,data:()=>docs[0]?.data(),metadata:{fromCache}};
      return {docs,empty:!docs.length,metadata:{fromCache},forEach:fn=>docs.forEach(fn)};
    };
    const emit=(name,fromCache=false)=>{
      for(const [key,entry] of listeners)if(entry.name===name)entry.next(snapshot(name,entry.id,fromCache));
    };
    const write=async(name,id,data,method)=>{
      writes.push({name,id,method});
      if(writeDelay)await new Promise(resolve=>setTimeout(resolve,writeDelay));
      if(writeFailure)throw {code:'unavailable'};
      let item=records[name].find(row=>row.id===id);
      if(method==='delete')records[name]=records[name].filter(row=>row.id!==id);
      else{
        if(!item){item={id};records[name].push(item);}
        for(const [key,value] of Object.entries(data||{})){
          if(value?.op==='union')item[key]=[...(item[key]||[]),...value.values.filter(v=>!item[key]?.includes(v))];
          else if(value?.op==='remove')item[key]=(item[key]||[]).filter(v=>!value.values.includes(v));
          else item[key]=value;
        }
      }
      revision++;emit(name);
    };
    const ref=(name,id)=>({
      id,onSnapshot(...args){
        const next=args.find(v=>typeof v==='function'),error=args.filter(v=>typeof v==='function')[1],key=Symbol();
        calls.push({name,id,authResolved});listeners.set(key,{name,id,next,error});
        if(!options.manual&&!options.delayCollections?.includes(name))setTimeout(()=>{if(listeners.has(key))next(snapshot(name,id));},options.dataDelay||10);
        return ()=>listeners.delete(key);
      },
      doc(nextId='generated-'+writes.length){return ref(name,nextId);},where(){return this;},
      get:async()=>snapshot(name,id),
      add:async data=>{const newId='generated-'+writes.length;await write(name,newId,data,'add');return ref(name,newId);},
      set:data=>write(name,id,data,'set'),update:data=>write(name,id,data,'update'),delete:()=>write(name,id,null,'delete')
    });
    const delayAuth=()=>new Promise(resolve=>setTimeout(resolve,options.authActionDelay||10));
    const makeUser=account=>({uid:account.uid,email:account.email,getIdToken:async()=> 'test-id-token',async delete(){authCalls.push({method:'delete',email:account.email});accounts.delete(account.email);currentUser=null;authCallback(null);}});
    const auth={
      get currentUser(){return currentUser;},
      onAuthStateChanged(callback){authCallback=callback;setTimeout(()=>{authResolved=true;callback(currentUser);},options.authDelay||10);return ()=>{};},
      async signInWithEmailAndPassword(email,password){authCalls.push({method:'login',email});await delayAuth();const account=accounts.get(email);if(!account||account.password!==password)throw {code:'auth/invalid-credential'};currentUser=makeUser(account);authCallback(currentUser);return {user:currentUser};},
      async createUserWithEmailAndPassword(email,password){authCalls.push({method:'signup',email});await delayAuth();if(accounts.has(email))throw {code:'auth/email-already-in-use'};const account={uid:'new-user-'+accounts.size,email,password};accounts.set(email,account);currentUser=makeUser(account);authCallback(currentUser);return {user:currentUser};},
      async signOut(){await delayAuth();currentUser=null;authCallback(null);}
    };
    const db={settings:()=>{},collection:name=>ref(name),batch(){const tasks=[];return {set:(r,d)=>tasks.push(()=>r.set(d)),update:(r,d)=>tasks.push(()=>r.update(d)),delete:r=>tasks.push(()=>r.delete()),commit:async()=>{for(const task of tasks)await task();}};},
      async runTransaction(callback){
        for(let attempt=0;attempt<5;attempt++){
          const version=revision,tasks=[];
          const result=await callback({get:async r=>r.get(),update:(r,data)=>tasks.push(()=>r.update(data))});
          if(window.__test.beforeCommit){const hook=window.__test.beforeCommit;window.__test.beforeCommit=null;await hook();}
          if(revision!==version)continue;
          for(const task of tasks)await task();return result;
        }
        throw {code:'aborted'};
      }
    };
    window.firebase={apps:[],initializeApp(){this.apps.push({});},auth:()=>auth,firestore:Object.assign(()=>db,{FieldValue:{arrayUnion:(...values)=>({op:'union',values}),arrayRemove:(...values)=>({op:'remove',values})}})};
    window.__test={records,calls,writes,authCalls,emit,addComment(postId,comment){return write('posts',postId,{comments:{op:'union',values:[comment]}},'update');},fail(name,code='unavailable'){for(const entry of listeners.values())if(entry.name===name)entry.error({code});},setWrites({failure=false,delay=0}){writeFailure=failure;writeDelay=delay;},signIn(){currentUser={uid:'reader',email:'reader@example.test'};authCallback(currentUser);},signOut(){currentUser=null;authCallback(null);},count(name){return [...listeners.values()].filter(e=>e.name===name).length;}};
  },options);
}
