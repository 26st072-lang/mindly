const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let model=null,busy=false,tab='topic',clipEdits=new Map(),contextEdit=null,originalEdit=null,consent=false,rewriteConsent=false;
async function send(message){
  const reply=await chrome.runtime.sendMessage(message);
  if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'확장 프로그램을 다시 열어주세요.'),{code:reply?.error?.code});
  return reply.result;
}
function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').dataset.error=String(error);$('notice').setAttribute('role',error?'alert':'status');}
function setBusy(value){busy=value;document.querySelectorAll('button:not([role=tab])').forEach(button=>button.disabled=value);document.querySelectorAll('textarea').forEach(field=>field.readOnly=value);$('analyze').classList.toggle('working',value&&tab==='topic');$('rewrite').classList.toggle('working',value&&tab==='tone');}
function selectTab(value){tab=value;for(const name of ['topic','tone']){const active=name===value;$(name+'-tab').setAttribute('aria-selected',String(active));$(name+'-tab').tabIndex=active?0:-1;$(name+'-panel').hidden=!active;}}
function renderAnalysis(result){
  // Keep the full analysis in storage for the website; show only its semantic preview here.
  const preview=result.preview||result;
  return `<article class="result result-compact" aria-label="간단한 토론 분석">
    <span class="eyebrow">주제</span><h3>${escape(preview.title)}</h3>
    <dl class="compact-stances">
      <div class="stance"><dt>찬성</dt><dd>${escape(preview.agreeLabel)}</dd></div>
      <div class="stance opposite"><dt>반대</dt><dd>${escape(preview.disagreeLabel)}</dd></div>
    </dl>
    <h4>핵심 쟁점</h4><ul class="compact-issues">${(preview.issues||[]).slice(0,2).map(issue=>`<li>${escape(issue)}</li>`).join('')}</ul>
    <p class="scope">선택한 댓글 기준${result.preview?'':' · 다시 분석하면 짧은 요약이 표시돼요.'}</p>
  </article>`;
}
function render(){
  if(!model)return;
  const state=model.workspace,focused=document.activeElement,focusId=focused?.id,start=focused?.selectionStart,end=focused?.selectionEnd;
  $('clip-count').textContent=state.clips.length+' / 10';
  $('clips').innerHTML=state.clips.length?state.clips.map((clip,index)=>`<article class="clip"><div class="clip-header">${clip.url?`<a href="${escape(clip.url)}" target="_blank" rel="noopener noreferrer" title="${escape(clip.url)}">${escape(clip.title||new URL(clip.url).hostname)}</a>`:'<span class="help">선택한 글</span>'}<button class="remove" data-remove="${escape(clip.id)}" aria-label="댓글 ${index+1} 삭제" type="button">×</button></div><textarea id="clip-${escape(clip.id)}" data-clip="${escape(clip.id)}" aria-label="가져온 댓글 ${index+1} · 개인정보를 지울 수 있어요" maxlength="8000" rows="3">${escape(clipEdits.get(clip.id)??clip.text)}</textarea></article>`).join(''):'<div class="empty">다른 입장에도 귀를 기울이는 첫걸음.<br>살펴보고 싶은 댓글을 모아주세요.</div>';
  $('context').value=contextEdit??state.context;$('original').value=originalEdit??state.rewrite?.original??'';
  $('analysis-consent').checked=consent;$('rewrite-consent').checked=rewriteConsent;
  $('environment').value=model.settings.environment;
  $('youtube-toggle').textContent=model.youtubeEnabled?'유튜브 교정 버튼 끄기':'유튜브 교정 버튼 켜기';
  const result=state.analysis;
  $('analysis-result').innerHTML=result&&!clipEdits.size&&contextEdit===null?renderAnalysis(result):'';
  const rewrite=state.rewrite,feedback=rewrite?.feedback;
  $('rewrite-result').innerHTML=feedback&&(originalEdit===null||originalEdit===rewrite.original)?`<article class="result"><span class="eyebrow">표현을 돌아보는 시간</span>${feedback.allowed?'<h3>이 표현으로 마음을 전해도 좋겠어요.</h3><p>AI가 뚜렷한 공격 표현을 찾지 못했어요. 문맥은 한 번 더 확인해주세요.</p>':`<h3>이렇게 전해보면 어떨까요?</h3><p>${escape(feedback.reason)}</p><div class="suggestion">${escape(feedback.suggestion)}</div>${rewrite.target?'<button id="apply" class="primary full" type="button">수정문을 유튜브 입력창에 적용</button>':'<p class="quiet">제안을 복사해 원래 입력창에 직접 반영할 수 있어요.</p>'}`}</article>`:'';
  $('analysis-result').hidden=false;$('rewrite-result').hidden=false;
  if(focusId){const target=$(focusId);if(target&&target!==focused){target.focus();if(typeof start==='number')target.setSelectionRange(start,end);}}
  setBusy(busy);
}
async function refresh(){model=await send({type:'GET_STATE'});render();}
async function persistInputs(){
  for(const [id,text] of clipEdits){await send({type:'EDIT_CLIP',id,text});clipEdits.delete(id);}
  if(contextEdit!==null){const context=contextEdit;await send({type:'SET_CONTEXT',context});if(contextEdit===context)contextEdit=null;}
}
async function perform(action,success){
  if(busy)return;notice('');setBusy(true);
  try{await action();await refresh();if(success)notice(success);}
  catch(error){notice(error.message+(error.code?' ('+error.code+')':''),true);}
  finally{setBusy(false);}
}
$('topic-tab').addEventListener('click',()=>selectTab('topic'));
$('tone-tab').addEventListener('click',()=>selectTab('tone'));
document.querySelector('.tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();selectTab(event.key==='Home'?'topic':event.key==='End'?'tone':tab==='topic'?'tone':'topic');$(tab+'-tab').focus();
});
$('clips').addEventListener('input',event=>{
  if(!event.target.dataset.clip)return;clipEdits.set(event.target.dataset.clip,event.target.value);consent=false;$('analysis-consent').checked=false;$('analysis-result').hidden=true;
});
$('clips').addEventListener('click',event=>{
  const id=event.target.dataset.remove;if(!id)return;
  perform(async()=>{clipEdits.delete(id);consent=false;await send({type:'REMOVE_CLIP',id});});
});
$('context').addEventListener('input',event=>{contextEdit=event.target.value;consent=false;rewriteConsent=false;$('analysis-consent').checked=false;$('rewrite-consent').checked=false;$('analysis-result').hidden=true;});
$('original').addEventListener('input',event=>{originalEdit=event.target.value;rewriteConsent=false;$('rewrite-consent').checked=false;$('rewrite-result').hidden=true;});
$('analysis-consent').addEventListener('change',event=>consent=event.target.checked);
$('rewrite-consent').addEventListener('change',event=>rewriteConsent=event.target.checked);
$('capture').addEventListener('click',()=>perform(async()=>{await persistInputs();consent=false;await send({type:'CAPTURE_SELECTION'});},'선택한 댓글을 가져왔어요. 개인정보를 확인해주세요.'));
$('analyze').addEventListener('click',()=>perform(async()=>{const approved=consent;await persistInputs();await send({type:'ANALYZE',consent:approved});},'가져온 댓글의 주제와 쟁점을 정리했어요.'));
$('import').addEventListener('click',()=>perform(async()=>{await persistInputs();await send({type:'IMPORT'});},'마인들리 탭으로 보냈어요. 로그인 후 내용을 확인하고 직접 게시해주세요.'));
$('rewrite').addEventListener('click',()=>perform(async()=>{const approved=rewriteConsent,content=$('original').value;await persistInputs();await send({type:'REWRITE',content,consent:approved});originalEdit=null;},'원문과 제안을 비교해 확인해주세요.'));
$('rewrite-result').addEventListener('click',event=>{if(event.target.id==='apply')perform(()=>send({type:'APPLY_REWRITE'}),'유튜브 입력창에 적용했어요. 게시 버튼은 직접 눌러주세요.');});
$('environment').addEventListener('change',event=>perform(()=>send({type:'SET_ENVIRONMENT',environment:event.target.value}),'연결할 마인들리를 변경했어요.'));
$('open-mindly').addEventListener('click',()=>perform(()=>send({type:'OPEN_MINDLY'})));
$('youtube-toggle').addEventListener('click',async()=>{
  if(busy)return;
  if(model.youtubeEnabled){await perform(()=>send({type:'YOUTUBE_DISABLED'}),'유튜브 교정 버튼을 껐어요.');return;}
  try{
    // Request directly from the click, before awaiting other work.
    const granted=await chrome.permissions.request({origins:['https://www.youtube.com/*']});
    if(granted)await perform(()=>send({type:'YOUTUBE_ENABLED'}),'유튜브 댓글 입력창에 말투 다듬기 버튼을 켰어요.');
    else notice('유튜브 접근 권한을 허용하면 입력창 옆 버튼을 사용할 수 있어요.');
  }catch(error){notice(error.message,true);}
});
$('clear').addEventListener('click',()=>{
  if(!confirm('가져온 댓글과 수정 제안을 모두 비울까요?'))return;
  perform(async()=>{clipEdits.clear();contextEdit=null;originalEdit=null;consent=false;rewriteConsent=false;await send({type:'CLEAR'});},'가져온 자료를 비웠어요.');
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='session'||!changes.workspace)return;
  const before=changes.workspace.oldValue,after=changes.workspace.newValue;
  if(after?.rewrite?.target&&after.rewrite.id!==before?.rewrite?.id){originalEdit=null;rewriteConsent=false;selectTab('tone');}
  if(JSON.stringify(before?.clips)!==JSON.stringify(after?.clips)){consent=false;}
  refresh().catch(error=>notice(error.message,true));
});
refresh().then(()=>{if(model.workspace.lastError)notice(model.workspace.lastError,true);}).catch(error=>notice(error.message,true));
