/* Only explicit extension actions reach these operations. No credentials leave this page. */
const extensionImportState={text:'',context:'',clips:[],analysis:null,draft:null,consent:false,owner:null,pendingOpen:false};
const extensionAnalyses=new Map();
let extensionBridgeSession=crypto.randomUUID();

function extensionBridgeError(code,message){return Object.assign(new Error(message),{code});}
function importedSignature(content,context){return JSON.stringify([content,context]);}
function importedDraft(analysis){
  return {id:crypto.randomUUID(),analysisId:analysis.analysisId,title:analysis.title,summary:analysis.summary,issues:[...analysis.issues],agreeLabel:analysis.agreeLabel,disagreeLabel:analysis.disagreeLabel};
}
function cleanImportClips(clips){
  if(!Array.isArray(clips)||!clips.length||clips.length>10)throw extensionBridgeError('INVALID_INPUT','가져올 댓글을 1~10개 선택해주세요.');
  return clips.map(clip=>{
    if(!clip||typeof clip.text!=='string'||!clip.text.trim()||clip.text.length>8000)throw extensionBridgeError('INVALID_INPUT','가져온 댓글을 확인해주세요.');
    let url='';
    try{const parsed=new URL(clip.url);if(['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password){parsed.hash='';url=parsed.href.slice(0,2000);}}catch{}
    return {text:clip.text.trim(),url,title:typeof clip.title==='string'?clip.title.slice(0,300):''};
  });
}
function resetExtensionImport(){
  Object.assign(extensionImportState,{text:'',context:'',clips:[],analysis:null,draft:null,consent:false,owner:null,pendingOpen:false});
}
function editImportedText(value,field='text'){
  extensionImportState[field]=value;extensionImportState.analysis=null;extensionImportState.draft=null;extensionImportState.consent=false;debateState.error='';render();
}
async function extensionAI(operation,payload){
  if(!sync.authReady||!auth?.currentUser||!session.userId)throw extensionBridgeError('LOGIN_REQUIRED','마인들리 탭에서 로그인한 뒤 다시 실행해주세요.');
  if(payload?.consent!==true)throw extensionBridgeError('CONSENT_REQUIRED','AI로 보낼 내용을 확인하고 전송에 동의해주세요.');
  const epoch=debateState.epoch,bridgeSession=extensionBridgeSession;
  const config=await debateRequest('/v1/config');
  const capability=operation==='analyzeText'?'textAnalysis':'rewrite';
  if(!config.capabilities?.[capability])throw extensionBridgeError('UPDATE_REQUIRED','마인들리 서버에 확장 프로그램 연결 업데이트가 필요해요.');
  if(epoch!==debateState.epoch)throw extensionBridgeError('SESSION_CHANGED','로그인 상태가 바뀌었어요. 다시 실행해주세요.');
  const path=operation==='analyzeText'?'/v1/analyze-text':'/v1/rewrite';
  const content=typeof payload.content==='string'?payload.content:'',context=typeof payload.context==='string'?payload.context:'';
  const result=await debateRequest(path,{method:'POST',body:{content,context,consent:true}});
  if(epoch!==debateState.epoch)throw extensionBridgeError('SESSION_CHANGED','로그인 상태가 바뀌었어요. 다시 실행해주세요.');
  if(operation==='analyzeText'){
    // Only server results received in this authenticated page can prefill a publishable draft.
    extensionAnalyses.set(result.analysisId,{result,signature:importedSignature(content,context),expires:Date.now()+86_400_000});
    for(const [key,value] of extensionAnalyses)if(value.expires<Date.now())extensionAnalyses.delete(key);
    while(extensionAnalyses.size>10)extensionAnalyses.delete(extensionAnalyses.keys().next().value);
  }
  return {...result,bridgeSession};
}
function receiveImportedDebate(payload){
  if(pendingActions.has('extension-analysis')||pendingActions.has('extension-post'))throw extensionBridgeError('BUSY','가져온 토론 작업이 끝난 뒤 다시 보내주세요.');
  const clips=cleanImportClips(payload.clips),text=clips.map(clip=>clip.text).join('\n\n');
  const context=typeof payload.context==='string'?payload.context:'';
  if(text.length>8000||context.length>1000)throw extensionBridgeError('INVALID_INPUT','댓글은 8,000자, 추가 문맥은 1,000자 이내로 줄여주세요.');
  const signature=importedSignature(text,context),state=extensionImportState;
  if(state.text&&importedSignature(state.text,state.context)!==signature)throw extensionBridgeError('DRAFT_EXISTS','마인들리에 가져온 초안이 남아 있어요. 확인하거나 비운 뒤 다시 보내주세요.');
  const stored=extensionAnalyses.get(payload.analysisId);
  const analysis=payload.bridgeSession===extensionBridgeSession&&stored?.expires>Date.now()&&stored.signature===signature?stored.result:null;
  if(!state.text){Object.assign(state,{text,context,clips,analysis,draft:analysis?importedDraft(analysis):null,consent:false,owner:session.userId||null});}
  else if(analysis&&!state.draft){state.analysis=analysis;state.draft=importedDraft(analysis);}
  state.pendingOpen=true;
  if(sync.authReady&&session.userId){state.pendingOpen=false;state.owner=session.userId;goto('debateImport');}
  else if(sync.authReady)goto('mypage');
  return {imported:true,loginRequired:!session.userId,hasAnalysis:Boolean(state.draft)};
}
async function analyzeImportedDebate(){
  if(!extensionImportState.consent){toast('가져온 글의 AI 전송에 동의해주세요.');return;}
  return debateAction('extension-analysis',async epoch=>{
    const state=extensionImportState,signature=importedSignature(state.text,state.context);
    const result=await extensionAI('analyzeText',{content:state.text,context:state.context,consent:true});
    if(epoch!==debateState.epoch||signature!==importedSignature(state.text,state.context))return;
    state.analysis=result;state.draft=importedDraft(result);toast('초안을 만들었어요. 내용을 확인하고 게시해주세요.');
  },'extension-title');
}
async function publishImportedDebate(){
  const state=extensionImportState,draft=state.draft;if(!draft||state.owner!==session.userId)return;
  return debateAction('extension-post',async epoch=>{
    const result=await debateRequest('/v1/debates',{method:'POST',body:{...draft,issues:draft.issues.map(value=>value.trim()).filter(Boolean)}});
    if(epoch!==debateState.epoch)return;
    resetExtensionImport();updateDebate(result.debate);debateState.archives={};debateState.listLoaded=false;
    debateState.details.set(result.debate.id,{debate:result.debate,opinions:[],loaded:true,hasMore:false,updatedAt:Date.now()});
    goto('debateDetail',{currentDebateId:result.debate.id});toast('새 토론이 게시되었어요.');
  },'extension-title');
}
function discardImportedDebate(){
  if(pendingActions.has('extension-post')||pendingActions.has('extension-analysis'))return;
  if(!confirm('확장 프로그램에서 가져온 글과 초안을 비울까요?'))return;
  resetExtensionImport();debateState.error='';goto('debate');
}
function renderImportedDebate(){
  const state=extensionImportState,d=state.draft,locked=pendingActions.has('extension-post')||pendingActions.has('extension-analysis');
  if(!state.text)return `<div class="empty-state"><h2>가져온 댓글이 없어요</h2><p>크롬 확장 프로그램에서 댓글을 선택해 보내주세요.</p><button class="btn-primary" onclick="startDebateWriting()">사진으로 토론 만들기</button></div>`;
  const fields=[['title','토론 제목',5,100],['summary','배경과 서로 다른 주장',20,1500],['agreeLabel','찬성 입장',2,80],['disagreeLabel','반대 입장',2,80]];
  return `<div class="page-header"><button class="back-btn" onclick="goto('debate')">${ICONS.back}</button><h2>가져온 댓글로 토론하기</h2></div><div class="write-wrap debate-write extension-import"><section><span class="eyebrow">CHROME · 가져온 글 확인</span><p class="field-help">닉네임·연락처 등 개인정보를 지운 뒤 분석해주세요. 원문과 출처는 공개 토론에 저장하지 않아요.</p><ul class="import-sources">${state.clips.map(clip=>`<li>${clip.url?`<a href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(clip.title||'원본 페이지')}</a>`:'출처 없는 선택 글'}</li>`).join('')}</ul><label class="debate-field" for="extension-text">가져온 댓글<textarea id="extension-text" maxlength="8000" oninput="editImportedText(this.value)" ${locked?'readonly':''}>${escapeHtml(state.text)}</textarea></label><label class="debate-field" for="extension-context">추가 문맥 <span>(선택)</span><textarea id="extension-context" maxlength="1000" oninput="editImportedText(this.value,'context')" ${locked?'readonly':''}>${escapeHtml(state.context)}</textarea></label><label class="consent-row"><input id="extension-consent" type="checkbox" ${state.consent?'checked':''} onchange="extensionImportState.consent=this.checked" ${locked?'disabled':''}><span>개인정보를 확인했으며, 이 글과 추가 문맥을 선택된 AI 제공자에게 보내는 데 동의해요.${debateState.config?.mode==='free'?' Gemini 무료 서비스에서는 입력 내용이 서비스 개선에 사용될 수 있어요.':''}</span></label><button class="btn-primary" data-action="extension-analysis" onclick="analyzeImportedDebate()">가져온 글 분석하기</button><button class="btn-ghost" onclick="discardImportedDebate()" ${locked?'disabled':''}>가져온 글 비우기</button></section>${debateState.error?`<p class="form-error" role="alert">${escapeHtml(debateState.error)}</p>`:''}${d?`<form class="debate-draft-form" onsubmit="event.preventDefault();publishImportedDebate()"><span class="eyebrow">초안 확인하고 게시하기</span><p class="field-help">${escapeHtml(state.analysis.limitations||'선택한 댓글만 분석했어요. 내용을 직접 확인해주세요.')}</p>${fields.map(([key,label,min,max])=>`<label class="debate-field" for="extension-${key==='title'?'title':key}">${label}${key==='summary'?`<textarea id="extension-${key}" required minlength="${min}" maxlength="${max}" oninput="extensionImportState.draft.${key}=this.value" ${locked?'readonly':''}>${escapeHtml(d[key])}</textarea>`:`<input id="extension-${key}" required minlength="${min}" maxlength="${max}" value="${escapeHtml(d[key])}" oninput="extensionImportState.draft.${key}=this.value" ${locked?'readonly':''}>`}</label>`).join('')}<fieldset class="debate-issues"><legend>핵심 쟁점</legend>${d.issues.map((issue,index)=>`<label class="debate-field" for="extension-issue-${index}">쟁점 ${index+1}<input id="extension-issue-${index}" required minlength="5" maxlength="200" value="${escapeHtml(issue)}" oninput="extensionImportState.draft.issues[${index}]=this.value" ${locked?'readonly':''}></label>`).join('')}</fieldset><button type="submit" class="btn-primary" data-action="extension-post">표현 확인 후 토론 게시하기</button></form>`:''}</div>`;
}
window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  const message=event.data;
  if(message?.channel!=='mindly-extension-v1'||message.direction!=='to-page'||typeof message.id!=='string'||message.id.length>100)return;
  if(!['status','analyzeText','rewrite','import'].includes(message.operation))return;
  const reply={channel:'mindly-extension-v1',direction:'to-extension',id:message.id};
  try{
    if(message.operation==='status')reply.result={version:1,authReady:sync.authReady,loggedIn:Boolean(session.userId),bridgeSession:extensionBridgeSession};
    else if(message.operation==='import')reply.result=receiveImportedDebate(message.payload||{});
    else reply.result=await extensionAI(message.operation,message.payload||{});
    reply.ok=true;
  }catch(error){reply.ok=false;reply.error={code:error.code||'BRIDGE_ERROR',message:error.message||'마인들리 연결을 확인해주세요.'};}
  window.postMessage(reply,location.origin);
});
document.addEventListener('mindly:session-changed',()=>{
  extensionAnalyses.clear();extensionBridgeSession=crypto.randomUUID();
  const state=extensionImportState;
  if(state.owner&&state.owner!==session.userId)resetExtensionImport();
  else if(state.pendingOpen&&session.userId){state.owner=session.userId;state.pendingOpen=false;queueMicrotask(()=>goto('debateImport'));}
});
