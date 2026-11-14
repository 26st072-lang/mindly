import {APP_URLS,WORKSPACE_TTL,failure,isMindlyURL,clipFrom,selectedText,fingerprint,emptyWorkspace,addClip} from './shared.mjs';

let writeQueue=Promise.resolve();
async function workspace(){
  const stored=(await chrome.storage.session.get('workspace')).workspace;
  if(stored&&stored.expiresAt<=Date.now())await chrome.storage.session.remove('workspace');
  return stored?.expiresAt>Date.now()?stored:emptyWorkspace();
}
function changeWorkspace(change){
  const task=writeQueue.then(async()=>{const next=await change(await workspace());next.expiresAt=Date.now()+WORKSPACE_TTL;await chrome.storage.session.set({workspace:next});return next;});
  writeQueue=task.catch(()=>{});return task;
}
async function settings(){const stored=await chrome.storage.local.get('environment');return {environment:APP_URLS[stored.environment]?stored.environment:'production'};}
async function appURL(){return APP_URLS[(await settings()).environment];}
function panelSender(sender){return sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('sidepanel.html');}
function youtubeSender(sender){try{return Boolean(sender.id===chrome.runtime.id&&sender.tab?.id&&sender.frameId===0&&new URL(sender.url).origin==='https://www.youtube.com');}catch{return false;}}
async function openPanel(tab){
  if(tab?.windowId!==undefined)return chrome.sidePanel.open({windowId:tab.windowId});
}
async function mindlyTab(active=false){
  const base=await appURL(),app=new URL(base);
  const tabs=await chrome.tabs.query({url:app.origin+'/*'});
  let tab=tabs.find(item=>isMindlyURL(item.url,base));
  if(!tab)tab=await chrome.tabs.create({url:base+'#mindly-extension',active});
  else if(active)tab=await chrome.tabs.update(tab.id,{active:true});
  return tab;
}
async function relay(tab,operation,payload={}){
  // Recheck the destination immediately before every relay, including tab reuse.
  const base=await appURL(),current=await chrome.tabs.get(tab.id);
  if(!isMindlyURL(current.url||current.pendingUrl,base))throw failure('WRONG_PAGE','마인들리 탭의 주소가 바뀌었어요. 다시 연결해주세요.');
  let answer;
  try{answer=await chrome.tabs.sendMessage(tab.id,{type:'MINDLY_BRIDGE',operation,payload},{frameId:0});}
  catch{throw failure('PAGE_NOT_READY','마인들리 탭을 새로고침한 뒤 다시 실행해주세요.');}
  if(!answer?.ok)throw failure(answer?.error?.code||'BRIDGE_ERROR',answer?.error?.message||'마인들리 웹사이트 연결을 확인해주세요.');
  return answer.result;
}
async function connectedTab(active=false){
  const tab=await mindlyTab(active),deadline=Date.now()+12_000;
  do{
    try{
      const current=await chrome.tabs.get(tab.id);
      if(!isMindlyURL(current.pendingUrl||current.url,await appURL()))throw failure('WRONG_PAGE','마인들리 탭의 주소가 바뀌었어요. 다시 연결해주세요.');
      if(current.status==='complete'){
        // Also works with an already-open tab that predates extension installation.
        await chrome.scripting.executeScript({target:{tabId:tab.id},files:['mindly-content.js']});
        const status=await relay(current,'status');if(status?.version===1&&status.authReady)return {tab:current,status};
      }
    }catch(error){if(error.code==='WRONG_PAGE')throw error;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }while(Date.now()<deadline);
  throw failure('PAGE_NOT_READY','마인들리 웹사이트를 새로고침해주세요. 확장 프로그램 연결 코드가 반영되어 있어야 해요.');
}
async function callAI(operation,payload){
  const {tab,status}=await connectedTab();
  if(!status.loggedIn){await chrome.tabs.update(tab.id,{active:true});throw failure('LOGIN_REQUIRED','열린 마인들리 탭에서 로그인한 뒤 다시 실행해주세요. 가져온 글은 유지돼요.');}
  return relay(tab,operation,payload);
}
async function captureSelection(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw failure('UNSUPPORTED_PAGE','일반 웹페이지에서 댓글을 선택해 가져와주세요.');
  let result;
  try{[result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({text:window.getSelection()?.toString()||'',title:document.title,url:location.href})});}
  catch{throw failure('SITE_PERMISSION','이 페이지에서 확장 프로그램 아이콘을 한 번 누른 뒤 다시 가져와주세요.');}
  return changeWorkspace(state=>addClip(state,clipFrom(result?.result)));
}
async function syncYoutube(){
  const granted=await chrome.permissions.contains({origins:['https://www.youtube.com/*']});
  const registered=await chrome.scripting.getRegisteredContentScripts({ids:['mindly-youtube']});
  if(granted&&!registered.length)await chrome.scripting.registerContentScripts([{id:'mindly-youtube',matches:['https://www.youtube.com/*'],js:['youtube.js'],runAt:'document_idle',persistAcrossSessions:true}]);
  if(!granted&&registered.length)await chrome.scripting.unregisterContentScripts({ids:['mindly-youtube']});
  return granted;
}
async function handlePanel(message){
  if(message.type==='GET_STATE')return {workspace:await workspace(),settings:await settings(),youtubeEnabled:await chrome.permissions.contains({origins:['https://www.youtube.com/*']})};
  if(message.type==='CAPTURE_SELECTION')return captureSelection();
  if(message.type==='CLEAR')return changeWorkspace(()=>emptyWorkspace());
  if(message.type==='REMOVE_CLIP')return changeWorkspace(state=>({...state,clips:state.clips.filter(clip=>clip.id!==message.id),analysis:null,lastError:''}));
  if(message.type==='EDIT_CLIP')return changeWorkspace(state=>{
    if(typeof message.text!=='string'||!message.text.trim()||message.text.length>8000)throw failure('INVALID_INPUT','댓글 내용을 확인해주세요.');
    const clips=state.clips.map(clip=>clip.id===message.id?{...clip,text:message.text.trim()}:clip);
    if(selectedText({clips}).length>8000)throw failure('TOO_LONG','댓글을 합쳐 8,000자 이내로 줄여주세요.');
    return {...state,clips,analysis:null,lastError:''};
  });
  if(message.type==='SET_CONTEXT')return changeWorkspace(state=>{
    if(typeof message.context!=='string'||message.context.length>1000)throw failure('INVALID_INPUT','추가 문맥은 1,000자 이내로 입력해주세요.');
    return {...state,context:message.context,analysis:state.context===message.context?state.analysis:null,lastError:''};
  });
  if(message.type==='SET_ENVIRONMENT'){
    if(!APP_URLS[message.environment])throw failure('INVALID_INPUT','연결할 마인들리 주소를 확인해주세요.');
    await chrome.storage.local.set({environment:message.environment});await changeWorkspace(state=>({...state,analysis:null,rewrite:state.rewrite?{...state.rewrite,feedback:null}:null}));return {saved:true};
  }
  if(message.type==='OPEN_MINDLY'){const tab=await mindlyTab(true);return {opened:true,tabId:tab.id};}
  if(message.type==='ANALYZE'){
    if(message.consent!==true)throw failure('CONSENT_REQUIRED','가져온 글의 AI 전송에 동의해주세요.');
    const state=await workspace(),signature=fingerprint(state),content=selectedText(state);
    if(content.length<20)throw failure('CONTEXT_REQUIRED','서로 다른 입장을 알 수 있도록 댓글을 20자 이상 모아주세요.');
    const analysis=await callAI('analyzeText',{content,context:state.context,consent:true});
    return changeWorkspace(current=>{if(fingerprint(current)!==signature)throw failure('CONTENT_CHANGED','분석 중 가져온 글이 바뀌었어요. 다시 분석해주세요.');return {...current,analysis,lastError:''};});
  }
  if(message.type==='IMPORT'){
    const state=await workspace();if(!state.clips.length)throw failure('NO_SELECTION','토론할 댓글을 먼저 가져와주세요.');
    const {tab}=await connectedTab(true);
    return relay(tab,'import',{clips:state.clips,context:state.context,analysisId:state.analysis?.analysisId,bridgeSession:state.analysis?.bridgeSession});
  }
  if(message.type==='REWRITE'){
    if(message.consent!==true)throw failure('CONSENT_REQUIRED','작성한 댓글의 AI 전송에 동의해주세요.');
    const state=await workspace(),rewrite=state.rewrite;
    const content=typeof message.content==='string'?message.content:'';
    if(!content.trim()||content.length>2000)throw failure('INVALID_INPUT','작성한 댓글을 1~2,000자로 입력해주세요.');
    const originalMatches=rewrite?.original===content;
    const target=originalMatches?rewrite.target:null;
    const draftId=crypto.randomUUID();
    await changeWorkspace(current=>({...current,rewrite:{id:draftId,original:content,target,feedback:null},lastError:''}));
    const result=await callAI('rewrite',{content,context:state.context,consent:true});
    return changeWorkspace(current=>{if(current.rewrite?.id!==draftId)throw failure('CONTENT_CHANGED','검사 중 댓글이 바뀌었어요. 새 댓글로 다시 실행해주세요.');return {...current,rewrite:{...current.rewrite,feedback:result.feedback},lastError:''};});
  }
  if(message.type==='APPLY_REWRITE'){
    const state=await workspace(),rewrite=state.rewrite;
    if(!rewrite?.target||!rewrite.feedback?.suggestion)throw failure('NO_TARGET','유튜브 댓글 입력창의 말투 다듬기 버튼으로 먼저 가져와주세요.');
    let result;
    try{result=await chrome.tabs.sendMessage(rewrite.target.tabId,{type:'APPLY_REWRITE',requestId:rewrite.target.requestId,original:rewrite.original,text:rewrite.feedback.suggestion},{frameId:rewrite.target.frameId});}
    catch{throw failure('INPUT_GONE','유튜브 댓글 입력창을 다시 열고 말투 다듬기를 눌러주세요.');}
    if(!result?.ok)throw failure(result?.error?.code||'INPUT_GONE',result?.error?.message||'유튜브 입력창을 확인해주세요.');
    await changeWorkspace(current=>current.rewrite?.id===rewrite.id?{...current,rewrite:{...current.rewrite,target:null}}:current);
    return {applied:true};
  }
  if(message.type==='YOUTUBE_ENABLED'){
    const granted=await syncYoutube();
    if(granted){const tabs=await chrome.tabs.query({url:'https://www.youtube.com/*'});await Promise.allSettled(tabs.map(tab=>chrome.scripting.executeScript({target:{tabId:tab.id},files:['youtube.js']})));}
    return {enabled:granted};
  }
  if(message.type==='YOUTUBE_DISABLED'){
    const tabs=await chrome.tabs.query({url:'https://www.youtube.com/*'});
    await Promise.allSettled(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'YOUTUBE_DISABLE'})));
    await chrome.scripting.unregisterContentScripts({ids:['mindly-youtube']}).catch(()=>{});
    await chrome.permissions.remove({origins:['https://www.youtube.com/*']});
    await changeWorkspace(state=>({...state,rewrite:state.rewrite?.target?null:state.rewrite}));return {disabled:true};
  }
  throw failure('UNKNOWN_ACTION','지원하지 않는 요청이에요.');
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  let task;
  if(message?.type==='YOUTUBE_DRAFT'&&youtubeSender(sender)){
    // Opening stays directly inside the user-gesture message handler.
    openPanel(sender.tab).catch(()=>{});
    task=(async()=>{
      if(!await chrome.permissions.contains({origins:['https://www.youtube.com/*']}))throw failure('SITE_PERMISSION','설정에서 유튜브 교정 버튼을 켜주세요.');
      return changeWorkspace(state=>{
      if(typeof message.original!=='string'||!message.original.trim()||message.original.length>2000||typeof message.requestId!=='string'||message.requestId.length>100)throw failure('INVALID_INPUT','댓글을 1~2,000자로 작성해주세요.');
      return {...state,rewrite:{id:crypto.randomUUID(),original:message.original,feedback:null,target:{tabId:sender.tab.id,frameId:sender.frameId,requestId:message.requestId}},lastError:''};
      });
    })();
  }else if(panelSender(sender))task=handlePanel(message);
  else return;
  Promise.resolve(task).then(result=>sendResponse({ok:true,result}),error=>sendResponse({ok:false,error:{code:error.code||'EXTENSION_ERROR',message:error.message||'다시 시도해주세요.'}}));
  return true;
});
async function setup(){
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id:'mindly-collect',title:'마인들리에 선택한 댓글 모으기',contexts:['selection'],documentUrlPatterns:['http://*/*','https://*/*']});
  chrome.contextMenus.create({id:'mindly-import',title:'선택한 댓글로 마인들리에서 토론하기',contexts:['selection'],documentUrlPatterns:['http://*/*','https://*/*']});
  await syncYoutube();
}
chrome.runtime.onInstalled.addListener(()=>setup().catch(()=>{}));
chrome.runtime.onStartup.addListener(()=>setup().catch(()=>{}));
chrome.permissions.onRemoved.addListener(()=>syncYoutube().catch(()=>{}));
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  if(!['mindly-collect','mindly-import'].includes(info.menuItemId))return;
  openPanel(tab).catch(()=>{});
  (async()=>{
    await changeWorkspace(state=>addClip(state,clipFrom({text:info.selectionText,url:info.pageUrl,title:tab?.title})));
    if(info.menuItemId==='mindly-import')await handlePanel({type:'IMPORT'});
  })().catch(error=>changeWorkspace(state=>({...state,lastError:error.message||'가져오기를 다시 실행해주세요.'})).catch(()=>{}));
});
