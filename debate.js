/* The browser calls our Worker. Provider keys never enter this file or storage. */
const debateState={config:null,configLoading:false,configError:'',list:[],listLoaded:false,listLoading:false,listError:'',hasMore:false,loadedAt:0,details:new Map(),archives:{},admin:null,adminLoading:false,adminError:'',adminCheck:null,feedback:null,error:'',images:[],imageLoading:false,consent:false,analysis:null,draft:null,opinionDrafts:{},epoch:0,controllers:new Set()};
Object.assign(ui,{archiveGroup:'concern',currentDebateId:null});
function workerEndpoint(){return String(window.MINDLY_CONFIG?.workerUrl||'').replace(/\/+$/,'');}
function communityRouteTitle(){return ui.route==='main'?(ui.mainTab==='home'?'마인들리 홈':'마음 라운지'):ui.route.startsWith('debate')?'익명 토론 게시판':ui.route==='archive'?'나의 보관함':'나의 마인들리';}
async function debateRequest(path,{method='GET',body,refresh=false}={}){
  const base=workerEndpoint();
  if(!base)throw Object.assign(new Error('익명 토론 공간을 준비하고 있어요. 잠시 후 다시 방문해주세요.'),{code:'SETUP_REQUIRED'});
  const controller=new AbortController();debateState.controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),65000);
  try{
    const headers={};
    if(auth?.currentUser){headers.Authorization='Bearer '+await auth.currentUser.getIdToken(refresh);}
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
    if(response.status===401&&auth?.currentUser&&!refresh)return debateRequest(path,{method,body,refresh:true});
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.message||'연결을 확인하고 다시 시도해주세요.'),{code:data.code,feedback:data.feedback});
    return data;
  }catch(error){if(error.name==='AbortError')throw new Error('요청이 지연되고 있어요. 작성한 내용은 유지되니 다시 시도해주세요.');throw error;}
  finally{clearTimeout(timeout);debateState.controllers.delete(controller);}
}
function debateMessage(message){return `<div class="sync-notice" role="status"><span>${escapeHtml(message)}</span></div>`;}
function debateEmpty(message='아직 열린 토론이 없어요. 첫 주제를 들려주세요.'){return `<div class="empty-state">${ICONS.comment}<h3>${escapeHtml(message)}</h3><p>서로 다른 생각을 존중하며 대화해요.</p></div>`;}
function renderDebateNotice(){
  if(!workerEndpoint())return debateMessage('익명 토론 공간을 준비하고 있어요.');
  if(debateState.listError)return `<div class="sync-notice" role="status"><span>${escapeHtml(debateState.listError)}</span><button onclick="loadDebates(true)">다시 불러오기</button></div>`;
  return '';
}
async function loadDebateConfig(){
  if(debateState.configLoading||!workerEndpoint())return;
  const epoch=debateState.epoch;debateState.configLoading=true;
  try{const data=await debateRequest('/v1/config');if(epoch===debateState.epoch){debateState.config=data;debateState.configError='';}}
  catch(error){if(epoch===debateState.epoch)debateState.configError=error.message;}
  finally{if(epoch===debateState.epoch){debateState.configLoading=false;backgroundRender();}}
}
async function loadDebates(reset=false){
  if(debateState.listLoading||!workerEndpoint())return;
  const epoch=debateState.epoch,offset=reset?0:debateState.list.length;debateState.listLoading=true;backgroundRender();
  try{
    const result=await debateRequest('/v1/debates?offset='+offset);
    if(epoch!==debateState.epoch)return;
    debateState.list=reset?result.items:[...debateState.list,...result.items.filter(item=>!debateState.list.some(old=>old.id===item.id))];
    debateState.hasMore=result.hasMore;debateState.listLoaded=true;debateState.listError='';debateState.loadedAt=Date.now();
  }catch(error){if(epoch===debateState.epoch)debateState.listError=error.message;}
  finally{if(epoch===debateState.epoch){debateState.listLoading=false;backgroundRender();}}
}
function updateDebate(debate){
  const index=debateState.list.findIndex(d=>d.id===debate.id);
  if(index>=0)debateState.list[index]=debate;
  const detail=debateState.details.get(debate.id);if(detail)detail.debate=debate;
  debateState.archives={};
}
async function loadDebateDetail(id,more=false){
  if(!id||!workerEndpoint())return;
  let state=debateState.details.get(id);
  if(state?.loading)return;
  if(!state){state={opinions:[],loaded:false};debateState.details.set(id,state);}
  const epoch=debateState.epoch;state.loading=true;state.error='';backgroundRender();
  try{const result=await debateRequest('/v1/debates/'+id+'?offset='+(more?state.opinions.length:0));if(epoch!==debateState.epoch)return;Object.assign(state,{debate:result.debate,opinions:more?[...state.opinions,...result.opinions.filter(o=>!state.opinions.some(old=>old.id===o.id))]:result.opinions,hasMore:result.hasMore,loaded:true,updatedAt:Date.now()});updateDebate(result.debate);}
  catch(error){if(epoch===debateState.epoch)state.error=error.message;}
  finally{if(epoch===debateState.epoch){state.loading=false;backgroundRender();}}
}
async function debateAction(key,callback,target='debate-opinion'){
  if(!requireLogin())return;
  const epoch=debateState.epoch;debateState.error='';
  return runAction(key,async()=>{
    try{return await callback(epoch);}
    catch(error){
      if(epoch!==debateState.epoch)return;
      if(error.code==='REVISE'&&error.feedback){debateState.feedback={...error.feedback,target};render();queueMicrotask(()=>document.getElementById('feedback-confirm')?.focus());}
      else{debateState.error=error.message||'요청을 완료하지 못했어요. 다시 시도해주세요.';toast(debateState.error);}
    }
  });
}
function startDebateWriting(){
  if(!requireLogin())return;
  if(!debateState.draft){debateState.error='';debateState.analysis=null;debateState.consent=false;}
  goto('debateWrite');
}
function clearDebateImages(){for(const image of debateState.images)URL.revokeObjectURL(image.preview);debateState.images=[];}
async function optimizeDebateImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('12MB 이하의 JPG, PNG, WebP 사진을 선택해주세요.');
  const image=await createImageBitmap(file);
  try{
    if(image.width*image.height>40_000_000)throw new Error('사진 크기가 너무 커요. 댓글 부분만 잘라 첨부해주세요.');
    const ratio=Math.min(1,2000/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));
    if(blob?.size>700*1024)blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.65));
    if(!blob||blob.size>700*1024)throw new Error('댓글 부분만 잘라서 다시 첨부해주세요.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
    return {name:file.name,mimeType:'image/jpeg',data,preview:URL.createObjectURL(blob),size:blob.size};
  }finally{image.close();}
}
async function chooseDebateImages(files){
  if(debateState.imageLoading||pendingActions.has('debate-analysis')||pendingActions.has('debate-post'))return;
  const selected=[...files];if(selected.length+debateState.images.length>3){toast('사진은 최대 3장까지 첨부할 수 있어요.');return;}
  const epoch=debateState.epoch;debateState.imageLoading=true;debateState.error='';render();
  const images=[];
  try{
    for(const file of selected)images.push(await optimizeDebateImage(file));
    if(epoch!==debateState.epoch){images.forEach(image=>URL.revokeObjectURL(image.preview));return;}
    if([...debateState.images,...images].reduce((sum,image)=>sum+image.size,0)>1_600_000)throw new Error('사진의 전체 크기가 커요. 필요한 댓글 부분만 잘라주세요.');
    debateState.images.push(...images);debateState.analysis=null;debateState.draft=null;
  }catch(error){images.forEach(image=>URL.revokeObjectURL(image.preview));if(epoch===debateState.epoch)debateState.error=error.message;}
  finally{if(epoch===debateState.epoch){debateState.imageLoading=false;render();}}
}
function removeDebateImage(index){if(pendingActions.has('debate-analysis')||pendingActions.has('debate-post'))return;URL.revokeObjectURL(debateState.images[index].preview);debateState.images.splice(index,1);debateState.analysis=null;debateState.draft=null;render();}
async function analyzeDebateImages(){
  if(!debateState.images.length||!debateState.consent){toast('사진 첨부와 AI 전송 동의를 확인해주세요.');return;}
  return debateAction('debate-analysis',async epoch=>{
    const result=await debateRequest('/v1/analyze',{method:'POST',body:{images:debateState.images.map(({mimeType,data})=>({mimeType,data})),consent:true}});
    if(epoch!==debateState.epoch)return;
    debateState.analysis=result;debateState.draft={id:crypto.randomUUID(),analysisId:result.analysisId,title:result.title,summary:result.summary,issues:[...result.issues],agreeLabel:result.agreeLabel,disagreeLabel:result.disagreeLabel};
    toast('초안을 만들었어요. 내용을 확인하고 게시해주세요.');
  },'debate-title');
}
async function publishDebate(){
  const draft=debateState.draft;
  if(!draft)return;
  return debateAction('debate-post',async epoch=>{
    const result=await debateRequest('/v1/debates',{method:'POST',body:{...draft,issues:draft.issues.map(value=>value.trim()).filter(Boolean)}});
    if(epoch!==debateState.epoch)return;
    clearDebateImages();debateState.draft=null;debateState.analysis=null;debateState.consent=false;
    debateState.details.set(result.debate.id,{debate:result.debate,opinions:[],loaded:true,hasMore:false,updatedAt:Date.now()});
    debateState.archives={};debateState.listLoaded=false;goto('debateDetail',{currentDebateId:result.debate.id});toast('새 토론이 게시되었어요.');
  },'debate-title');
}
function opinionDraft(id){return debateState.opinionDrafts[id]||(debateState.opinionDrafts[id]={stance:'',content:'',requestId:null});}
function setOpinionStance(id,stance){const draft=opinionDraft(id);draft.stance=stance;draft.requestId=null;render();}
async function submitDebateOpinion(id){
  const draft=opinionDraft(id);
  if(!draft.stance){toast('찬성 또는 반대를 선택해주세요.');return;}
  if(draft.content.trim().length<5){toast('입장을 선택한 이유를 5자 이상 적어주세요.');return;}
  const content=draft.content.trim(),stance=draft.stance,requestId=draft.requestId||(draft.requestId=crypto.randomUUID());
  return debateAction('debate-opinion',async epoch=>{
    const result=await debateRequest('/v1/debates/'+id+'/opinions',{method:'POST',body:{content,stance,requestId}});
    if(epoch!==debateState.epoch)return;
    updateDebate(result.debate);
    const state=debateState.details.get(id);if(state&&!state.opinions.some(item=>item.id===result.opinion.id))state.opinions.push(result.opinion);
    if(draft.content.trim()===content){draft.content='';draft.requestId=null;}
    toast('의견과 찬반 선택이 함께 등록되었어요.');
  });
}
async function toggleDebateHeart(id){
  const record=debateState.details.get(id)?.debate||debateState.list.find(d=>d.id===id)||Object.values(debateState.archives).flatMap(state=>state.items).find(d=>d.id===id);if(!record)return;
  return debateAction('debate-heart-'+id,async epoch=>{const result=await debateRequest('/v1/debates/'+id+'/heart',{method:'PUT',body:{hearted:!record.hearted}});if(epoch===debateState.epoch)updateDebate(result.debate);});
}
async function deleteDebate(id){
  if(!confirm('이 토론과 등록된 의견을 삭제할까요? 되돌릴 수 없어요.'))return;
  return debateAction('delete-debate-'+id,async epoch=>{await debateRequest('/v1/debates/'+id,{method:'DELETE'});if(epoch!==debateState.epoch)return;debateState.details.delete(id);debateState.list=debateState.list.filter(item=>item.id!==id);debateState.archives={};goto('debate');toast('토론이 삭제되었어요.');});
}
function renderDebateCard(debate){
  const count=debate.agreeCount+debate.disagreeCount,agree=count?Math.round(debate.agreeCount/count*100):0;
  return `<article class="post-card debate-card" data-key="debate-${debate.id}"><div class="meta-row"><span class="story-label">익명 토론</span><time>${timeAgo(debate.createdAt)}</time>${debate.isMine?'<span class="age-pill">내 글</span>':''}</div><h3><button class="post-title-link" onclick="goto('debateDetail',{currentDebateId:'${debate.id}'})">${escapeHtml(debate.title)}</button></h3><p class="content-preview">${escapeHtml(debate.summary)}</p><div class="debate-counts"><span>찬성 ${debate.agreeCount}</span><span>반대 ${debate.disagreeCount}</span></div><div class="vote-meter" role="img" aria-label="${count?'찬성 '+agree+'%, 반대 '+(100-agree)+'%':'아직 찬반 참여가 없어요'}"><i style="width:${count?agree:50}%"></i></div><div class="card-foot"><button class="heart-btn ${debate.hearted?'hearted':''}" data-action="debate-heart-${debate.id}" onclick="toggleDebateHeart('${debate.id}')" aria-label="토론 공감 ${debate.heartCount}개" aria-pressed="${debate.hearted}">${ICONS.heart}<span>${debate.heartCount}</span></button><button class="comment-cnt" onclick="goto('debateDetail',{currentDebateId:'${debate.id}'})" aria-label="토론 의견 ${debate.commentCount}개 보기">${ICONS.comment}<span>${debate.commentCount}</span></button><span class="card-note">${count}명 참여</span></div></article>`;
}
function renderDebateBoard(){
  const list=debateState.list.filter(item=>!ui.searchQuery||[item.title,item.summary,...item.issues].join(' ').toLowerCase().includes(ui.searchQuery.toLowerCase()));
  return `<section class="debate-intro"><div><span class="eyebrow">DIFFERENT THOUGHTS, BETTER QUESTIONS</span><h1>다른 생각도,<br>다정하게 나눌 수 있도록.</h1><p>사람을 향한 공격 대신, 주제에 대한 생각을 나눠요.</p></div><button class="btn-primary" onclick="startDebateWriting()">${ICONS.pencil}새 토론 열기</button></section><div class="debate-guideline">${ICONS.shield}<p>익명으로 참여해요. 찬성·반대와 이유를 함께 남기고, 표현을 한 번 더 살펴요.</p></div><div class="home-section-head"><h2>열린 토론</h2><button class="text-link" onclick="loadDebates(true)" ${debateState.listLoading?'disabled':''}>새로고침</button></div>${renderDebateNotice()}${list.length?`<div class="post-grid">${list.map(renderDebateCard).join('')}</div>`:debateState.listLoading?'<p class="loading-copy" role="status"><span class="spinner"></span>토론을 불러오고 있어요.</p>':debateEmpty(ui.searchQuery?'검색 결과가 없어요.':undefined)}${debateState.hasMore?`<button class="btn-ghost load-more" onclick="loadDebates()" ${debateState.listLoading?'disabled':''}>토론 더 보기</button>`:''}`;
}
function renderDebateWrite(){
  const d=debateState.draft,locked=pendingActions.has('debate-analysis')||pendingActions.has('debate-post'),info=debateState.config;
  return `<div class="page-header"><button class="back-btn" onclick="goto('debate')">${ICONS.back}</button><h2>새 익명 토론</h2></div><div class="write-wrap debate-write"><section><span class="eyebrow">01 · 댓글 사진에서 시작하기</span><h3>어떤 의견이 오가고 있나요?</h3><p class="field-help">유튜브·인스타그램 등에서 서로 다른 주장이 담긴 댓글 사진을 최대 3장 첨부해주세요. 닉네임·프로필 사진·계정 정보는 먼저 가려주세요.</p><label class="upload-button">${ICONS.pencil}<span>${debateState.imageLoading?'사진을 준비하고 있어요…':'댓글 사진 첨부'}</span><input id="debate-images" type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="토론 댓글 사진 첨부" onchange="chooseDebateImages(this.files)" ${locked||debateState.imageLoading?'disabled':''}></label><div class="image-previews">${debateState.images.map((image,index)=>`<figure data-key="upload-${index}"><img src="${image.preview}" alt="첨부한 댓글 사진 ${index+1}"><figcaption>${escapeHtml(image.name)}</figcaption><button aria-label="사진 ${index+1} 삭제" onclick="removeDebateImage(${index})" ${locked?'disabled':''}>×</button></figure>`).join('')}</div><label class="consent-row"><input id="debate-consent" type="checkbox" ${debateState.consent?'checked':''} onchange="debateState.consent=this.checked" ${locked?'disabled':''}><span>개인정보를 가렸으며, 사진을 ${escapeHtml(info?.provider||'선택된 AI 제공자')}에 보내 분석하는 데 동의해요. 원본 사진은 토론 게시판에 게시하거나 서버에 저장하지 않아요.${info?.mode==='free'?' Gemini 무료 서비스에서는 입력 내용이 서비스 개선에 사용될 수 있어요.':''}</span></label><button class="btn-primary" data-action="debate-analysis" onclick="analyzeDebateImages()" ${!workerEndpoint()||debateState.imageLoading?'disabled':''}>사진 읽고 토론 초안 만들기</button>${debateState.configError?debateMessage(debateState.configError):info&&!info.ready?debateMessage('AI 연결을 준비하고 있어요. 사진 분석은 연결 후 이용할 수 있어요.'):''}</section>${debateState.error?`<p class="form-error" role="alert">${escapeHtml(debateState.error)}</p>`:''}${d?`<form class="debate-draft-form" onsubmit="event.preventDefault();publishDebate()"><span class="eyebrow">02 · 초안 확인하고 게시하기</span><p class="field-help">AI가 사진을 잘못 읽을 수 있어요. 논제와 쟁점을 직접 확인하고 수정해주세요.</p><label class="debate-field" for="debate-title">토론 제목<input id="debate-title" required minlength="5" maxlength="100" value="${escapeHtml(d.title)}" oninput="debateState.draft.title=this.value" ${locked?'readonly':''}></label><label class="debate-field" for="debate-summary">배경과 서로 다른 주장<textarea id="debate-summary" required minlength="20" maxlength="1500" oninput="debateState.draft.summary=this.value" ${locked?'readonly':''}>${escapeHtml(d.summary)}</textarea></label><fieldset class="debate-issues"><legend>핵심 쟁점</legend>${d.issues.map((issue,index)=>`<label class="debate-field" for="issue-${index}">쟁점 ${index+1}<input id="issue-${index}" required minlength="5" maxlength="200" value="${escapeHtml(issue)}" oninput="debateState.draft.issues[${index}]=this.value" ${locked?'readonly':''}></label>`).join('')}</fieldset><div class="stance-labels"><label class="debate-field" for="agree-label">찬성 입장<input id="agree-label" required minlength="2" maxlength="80" value="${escapeHtml(d.agreeLabel)}" oninput="debateState.draft.agreeLabel=this.value" ${locked?'readonly':''}></label><label class="debate-field" for="disagree-label">반대 입장<input id="disagree-label" required minlength="2" maxlength="80" value="${escapeHtml(d.disagreeLabel)}" oninput="debateState.draft.disagreeLabel=this.value" ${locked?'readonly':''}></label></div><details class="ocr-result"><summary>AI가 읽은 내용 확인</summary><p>${escapeHtml(debateState.analysis.ocrText)}</p></details><button type="submit" class="btn-primary" data-action="debate-post">표현 확인 후 토론 게시하기</button></form>`:''}</div>`;
}
function renderDebateDetail(){
  const id=ui.currentDebateId,state=debateState.details.get(id),d=state?.debate;
  if(!d)return `<div class="page-header"><button class="back-btn" onclick="goto('debate')">${ICONS.back}</button><h2>익명 토론</h2></div>${state?.error?debateMessage(state.error):'<p class="loading-copy" role="status"><span class="spinner"></span>토론을 불러오고 있어요.</p>'}<button class="btn-ghost" onclick="loadDebateDetail('${id}')">다시 불러오기</button>`;
  const draft=opinionDraft(id),total=d.agreeCount+d.disagreeCount;
  return `<div class="page-header"><button class="back-btn" onclick="goto('debate')">${ICONS.back}</button><h2>익명 토론</h2></div><article class="detail-wrap debate-detail"><div class="meta-row"><span class="story-label">서로 존중하는 익명 토론</span><time>${timeAgo(d.createdAt)}</time></div><h1 class="detail-title">${escapeHtml(d.title)}</h1><p class="detail-content">${escapeHtml(d.summary).replace(/\n/g,'<br>')}</p><section class="issues-box"><h2>함께 생각할 쟁점</h2><ol>${d.issues.map(issue=>`<li>${escapeHtml(issue)}</li>`).join('')}</ol></section><div class="detail-actions"><button class="action-pill ${d.hearted?'hearted':''}" data-action="debate-heart-${id}" onclick="toggleDebateHeart('${id}')" aria-pressed="${d.hearted}">${ICONS.heart} 공감 ${d.heartCount}</button>${d.isMine||session.isAdmin?`<button class="action-pill" data-action="delete-debate-${id}" onclick="deleteDebate('${id}')">토론 삭제</button>`:''}<button class="text-link" onclick="loadDebateDetail('${id}')">새로고침</button></div><section class="debate-results" aria-label="현재 찬반 현황"><h2>${total}명이 생각을 나눴어요</h2><div class="debate-counts"><span>찬성 ${d.agreeCount}명</span><span>반대 ${d.disagreeCount}명</span></div><div class="vote-meter" role="img" aria-label="찬성 ${d.agreeCount}명, 반대 ${d.disagreeCount}명"><i style="width:${total?d.agreeCount/total*100:50}%"></i></div>${d.myStance?`<p class="field-help">내 현재 입장: ${d.myStance==='agree'?'찬성':'반대'}. 새 의견을 남기면 입장을 바꿀 수 있어요. 한 사람은 한 표로 집계해요.</p>`:''}</section><section class="opinion-compose"><h2>당신은 어떻게 생각하나요?</h2>${session.userId?`<form onsubmit="event.preventDefault();submitDebateOpinion('${id}')"><fieldset class="stance-choice"><legend>입장을 선택해주세요 <span>(필수)</span></legend>${[['agree','찬성',d.agreeLabel],['disagree','반대',d.disagreeLabel]].map(([value,label,description])=>`<label class="stance-option ${draft.stance===value?'selected':''}"><input type="radio" name="debate-stance" value="${value}" ${draft.stance===value?'checked':''} required onchange="setOpinionStance('${id}','${value}')" ${pendingActions.has('debate-opinion')?'disabled':''}><strong>${label}</strong><span>${escapeHtml(description)}</span></label>`).join('')}</fieldset><label class="debate-field" for="debate-opinion">이렇게 생각한 이유 <span>(필수 · 5~500자)</span><textarea id="debate-opinion" required minlength="5" maxlength="500" placeholder="사람에 대한 평가 대신, 주제에 관한 이유를 적어주세요." oninput="opinionDraft('${id}').content=this.value;opinionDraft('${id}').requestId=null" ${pendingActions.has('debate-opinion')?'readonly':''}>${escapeHtml(draft.content)}</textarea></label><p class="field-help">제출하면 AI가 표현을 확인해요. 수정 안내가 나오면 직접 고친 뒤 다시 제출해주세요.</p>${debateState.error?`<p class="form-error" role="alert">${escapeHtml(debateState.error)}</p>`:''}<button class="btn-primary" type="submit" data-action="debate-opinion">입장과 의견 제출</button></form>`:`<p>로그인하면 익명으로 참여할 수 있어요.</p><button class="btn-primary" onclick="goto('mypage')">로그인하고 참여하기</button>`}</section><section class="debate-opinions"><h2>나누고 있는 의견 <span>${d.commentCount}</span></h2>${state.error?debateMessage(state.error):''}${state.opinions.length?state.opinions.map(renderOpinionCard).join(''):'<p class="field-help">아직 등록된 의견이 없어요. 첫 생각을 들려주세요.</p>'}${state.hasMore?`<button class="btn-ghost load-more" onclick="loadDebateDetail('${id}',true)" ${state.loading?'disabled':''}>의견 더 보기</button>`:''}</section></article>`;
}
function renderOpinionCard(item,archive=false){return `<article class="opinion-card" data-key="opinion-${item.id}"><div class="meta-row"><strong>${escapeHtml(item.alias)}</strong><span class="stance-badge ${item.stance}">${item.stance==='agree'?'찬성':'반대'}</span>${item.isMine?'<span class="age-pill">내 의견</span>':''}<time>${timeAgo(item.createdAt)}</time></div>${archive?`<h3><button class="post-title-link" onclick="goto('debateDetail',{currentDebateId:'${item.debateId}'})">${escapeHtml(item.title)}</button></h3>`:''}<p>${escapeHtml(item.content)}</p></article>`;}
function renderDebateFeedback(){
  const feedback=debateState.feedback;if(!feedback)return '';
  return `<div class="feedback-overlay"><section class="feedback-dialog" role="alertdialog" aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-description"><span class="eyebrow">같은 생각도, 조금 더 다정하게</span><h2 id="feedback-title">표현을 한 번 다듬어볼까요?</h2><p id="feedback-description">${escapeHtml(feedback.reason)}</p><div class="suggestion-box"><strong>이렇게 표현해볼 수 있어요</strong><p>${escapeHtml(feedback.suggestion)}</p></div><p class="field-help">제안은 자동으로 반영되지 않아요. 확인 후 원래 입력란에서 직접 수정하고 다시 제출해주세요.</p><button id="feedback-confirm" class="btn-primary" onclick="closeDebateFeedback()">확인하고 직접 수정하기</button></section></div>`;
}
function closeDebateFeedback(){const target=debateState.feedback?.target;debateState.feedback=null;render();document.getElementById(target)?.focus({preventScroll:false});}
function renderCommunityHome(){
  const popular=DB.posts.filter(p=>p.hearts.length>0).sort((a,b)=>b.hearts.length-a.hearts.length).slice(0,2);
  const recent=DB.posts.slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,4);
  return `<div class="community-choice-grid"><section class="community-choice concern-choice"><span class="eyebrow">마음을 나누는 곳</span><h2>따뜻한 고민상담</h2><p>말하지 못했던 고민, 나누고 싶은 마음.<br>마인들리가 함께 듣고 응원할게요.</p><button class="btn-primary" onclick="setMainTab('concern')">마음 라운지로 ${ARROW_ICON}</button></section><section class="community-choice debate-choice"><span class="eyebrow">생각을 나누는 곳</span><h2>익명 토론 게시판</h2><p>같은 장면, 서로 다른 생각.<br>찬반과 이유를 나누며 시야를 넓혀요.</p><button class="btn-primary" onclick="goto('debate')">익명 토론으로 ${ARROW_ICON}</button></section></div><section class="home-section"><div class="home-section-head"><div><span class="eyebrow">WARM CONNECTIONS</span><h2>함께 공감하는 고민 <span class="hot-badge">HOT</span></h2></div><button class="text-link" onclick="setMainTab('concern','popular')">고민 더 보기 ${ARROW_ICON}</button></div>${syncNotice('posts')}${popular.length?`<div class="post-grid">${popular.map(p=>postCardHTML(p,true)).join('')}</div>`:collectionPlaceholder('posts','첫 공감을 기다리는 이야기들')}</section><section class="home-section"><div class="home-section-head"><div><span class="eyebrow">OPEN CONVERSATIONS</span><h2>지금, 생각이 오가는 토론</h2></div><button class="text-link" onclick="goto('debate')">토론 더 보기 ${ARROW_ICON}</button></div>${renderDebateNotice()}${debateState.list.length?`<div class="post-grid">${debateState.list.slice(0,2).map(renderDebateCard).join('')}</div>`:debateEmpty()}</section><section class="home-section"><div class="home-section-head"><div><span class="eyebrow">NEW STORIES</span><h2>방금 도착한 마음</h2></div><button class="text-link" onclick="setMainTab('concern')">모두 보기 ${ARROW_ICON}</button></div>${recent.length?`<div class="post-grid">${recent.map(p=>postCardHTML(p)).join('')}</div>`:collectionPlaceholder('posts','첫 이야기를 들려주세요')}</section>`;
}
function selectArchiveGroup(group){ui.archiveGroup=group;ui.archiveTab='posts';render();}
function selectArchiveTab(tab){ui.archiveTab=tab;render();}
async function loadDebateArchive(tab,more=false){
  if(!session.userId||!workerEndpoint())return;
  const state=debateState.archives[tab]||(debateState.archives[tab]={items:[],loaded:false});if(state.loading)return;
  const epoch=debateState.epoch;state.loading=true;state.error='';backgroundRender();
  try{const data=await debateRequest('/v1/me?tab='+tab+'&offset='+(more?state.items.length:0));if(epoch===debateState.epoch){state.items=more?[...state.items,...data.items.filter(item=>!state.items.some(old=>old.id===item.id))]:data.items;state.hasMore=data.hasMore;state.loaded=true;}}
  catch(error){if(epoch===debateState.epoch)state.error=error.message;}
  finally{if(epoch===debateState.epoch){state.loading=false;backgroundRender();}}
}
function renderOrganizedArchive(){
  if(!session.userId)return renderAuth();
  const group=ui.archiveGroup,tab=ui.archiveTab,posts=DB.posts.filter(p=>p.authorId===session.userId).sort((a,b)=>b.createdAt-a.createdAt),hearts=DB.posts.filter(p=>p.hearts.includes(session.userId)).sort((a,b)=>b.createdAt-a.createdAt),comments=DB.posts.flatMap(post=>post.comments.filter(comment=>comment.authorId===session.userId).map(comment=>({post,comment}))).sort((a,b)=>b.comment.createdAt-a.comment.createdAt),epilogues=DB.epilogues.filter(ep=>ep.authorId===session.userId).sort((a,b)=>b.createdAt-a.createdAt);
  const tabs=[['posts','내가 쓴 글',posts.length],['hearts','공감한 이야기',hearts.length],['comments','내가 쓴 댓글',comments.length],...(group==='concern'?[['epilogues','내가 쓴 후일담',epilogues.length]]:[])];
  let content='';
  if(group==='debate'){
    const state=debateState.archives[tab];
    content=(!workerEndpoint()?debateMessage('익명 토론 공간을 준비하고 있어요.'):state?.error?`<div class="sync-notice" role="status"><span>${escapeHtml(state.error)}</span><button onclick="loadDebateArchive('${tab}')">다시 불러오기</button></div>`:'')+(state?.items.length?`<div class="list-wrap">${state.items.map(item=>tab==='comments'?renderOpinionCard(item,true):renderDebateCard(item)).join('')}</div>`:state?.loading?'<p class="loading-copy" role="status"><span class="spinner"></span>내 활동을 불러오고 있어요.</p>':debateEmpty('아직 보관된 토론 활동이 없어요.'))+(state?.hasMore?`<button class="btn-ghost load-more" onclick="loadDebateArchive('${tab}',true)" ${state.loading?'disabled':''}>더 보기</button>`:'');
  }else{
    const channel=tab==='epilogues'?'epilogues':'posts',items=tab==='posts'?posts:tab==='hearts'?hearts:tab==='comments'?comments:epilogues;
    content=syncNotice(channel)+(items.length?`<div class="list-wrap">${tab==='posts'||tab==='hearts'?items.map(p=>postCardHTML(p)).join(''):tab==='comments'?items.map(({post,comment})=>`<article class="post-card" data-key="my-comment-${escapeHtml(comment.id)}"><div class="meta-row"><span>고민상담에 남긴 댓글</span><time>${timeAgo(comment.createdAt)}</time></div><h3><button class="post-title-link" data-post-id="${escapeHtml(post.id)}" onclick="goto('postDetail',{currentPostId:this.dataset.postId})">${escapeHtml(post.title)}</button></h3><p>${escapeHtml(comment.content)}</p></article>`).join(''):renderEpilogueFeed(items.map(ep=>({ep,post:DB.posts.find(p=>p.id===ep.postId)})))}</div>`:collectionPlaceholder(channel,'아직 보관된 활동이 없어요'));
  }
  return `<div class="page-header"><button class="back-btn" onclick="goto('main')">${ICONS.back}</button><h2>나의 보관함</h2></div><div class="archive-groups" role="tablist" aria-label="보관함 공간">${[['concern','고민상담'],['debate','익명 토론']].map(([value,label])=>`<button id="archive-group-${value}" role="tab" aria-selected="${group===value}" aria-controls="archive-area" tabindex="${group===value?0:-1}" onclick="selectArchiveGroup('${value}')">${label}</button>`).join('')}</div><div id="archive-area" role="tabpanel" aria-labelledby="archive-group-${group}"><div class="archive-tabs" role="tablist" aria-label="${group==='concern'?'고민상담':'익명 토론'} 활동">${tabs.map(([value,label,count])=>`<button id="archive-tab-${value}" class="tab-sub ${tab===value?'active':''}" role="tab" aria-selected="${tab===value}" aria-controls="archive-list-panel" tabindex="${tab===value?0:-1}" onclick="selectArchiveTab('${value}')">${label}${group==='concern'?' ('+count+')':''}</button>`).join('')}</div><div id="archive-list-panel" role="tabpanel" aria-labelledby="archive-tab-${tab}">${content}</div></div>`;
}
async function loadAIAdmin(){
  if(debateState.adminLoading||!session.isAdmin||!workerEndpoint())return;
  const epoch=debateState.epoch;debateState.adminLoading=true;
  try{const data=await debateRequest('/v1/admin/settings');if(epoch===debateState.epoch){debateState.admin=data;debateState.adminError='';}}
  catch(error){if(epoch===debateState.epoch)debateState.adminError=error.code==='ADMIN_REQUIRED'?'Worker에 관리자 Firebase UID를 등록해주세요.':error.message;}
  finally{if(epoch===debateState.epoch){debateState.adminLoading=false;backgroundRender();}}
}
function renderAIAdminPanel(){
  const info=debateState.admin;
  return `<section class="admin-section ai-settings"><h3>토론 AI · 무료 / 유료 선택</h3><p class="field-help">현재 선택은 모든 사진 분석과 의견 검사에 적용돼요. 무료 한도가 끝나도 유료로 자동 전환하지 않아요.</p>${!workerEndpoint()?debateMessage('Worker 배포와 연결을 먼저 완료해주세요.'):debateState.adminError?`<p class="form-error" role="alert">${escapeHtml(debateState.adminError)}</p>`:!info?'<p class="loading-copy"><span class="spinner"></span>설정을 확인하고 있어요.</p>':`<p>현재: <strong>${info.mode==='free'?'무료 · Gemini':'유료 · OpenRouter'}</strong></p><div class="ai-mode-options">${[['free','무료 · Gemini'],['paid','유료 · GPT Luna']].map(([mode,label])=>`<button class="btn-ghost ${info.mode===mode?'selected':''}" data-key="ai-mode-${mode}" data-action="ai-settings" aria-pressed="${info.mode===mode}" onclick="saveAIMode('${mode}')" ${!info.available[mode]?'disabled':''}>${label}<small>${escapeHtml(info.models[mode])}${!info.available[mode]?' · 키 등록 필요':''}</small></button>`).join('')}</div><p class="field-help">유료 모드는 OpenRouter 사용량만큼 비용이 발생해요. 제공자 계정에서 사용 한도를 설정해주세요. API 키는 Cloudflare의 비밀값에만 등록하며 여기에 표시하지 않아요.</p>`}<button data-key="ai-admin-refresh" class="text-link" onclick="loadAIAdmin()">설정 다시 확인</button>${renderAIConnectionCheck()}</section>`;
}
async function saveAIMode(mode){if(mode==='paid'&&!confirm('OpenRouter의 유료 GPT Luna로 전환할까요? API 사용량에 따라 비용이 발생합니다.'))return;return debateAction('ai-settings',async epoch=>{const result=await debateRequest('/v1/admin/settings',{method:'PATCH',body:{mode}});if(epoch!==debateState.epoch)return;debateState.config=result;debateState.adminCheck=null;debateState.admin={...debateState.admin,...result};toast('AI 모드를 변경했어요.');});}
function renderAIConnectionCheck(){
  if(!workerEndpoint()||!debateState.admin)return '';
  const result=debateState.adminCheck;
  return `<div class="ai-connection-check" data-key="ai-connection-check"><p class="field-help">키 등록 여부와 실제 AI 응답은 달라요. 연결 확인은 현재 선택한 AI에 짧은 검사 요청 1회를 보내요.</p><button id="ai-check-button" class="btn-ghost" data-action="ai-check" onclick="checkAIConnection()">AI 실제 연결 확인</button>${result?`<p class="${result.ok?'field-help':'form-error'}" role="status">${escapeHtml(result.message)}</p>`:''}</div>`;
}
async function checkAIConnection(){
  if(!session.isAdmin)return;
  const epoch=debateState.epoch;debateState.adminCheck=null;
  return runAction('ai-check',async()=>{
    try{const result=await debateRequest('/v1/admin/check-ai',{method:'POST',body:{}});if(epoch===debateState.epoch)debateState.adminCheck={ok:true,message:`${result.provider}의 실제 응답을 확인했어요. (${result.model})`};}
    catch(error){if(epoch===debateState.epoch)debateState.adminCheck={ok:false,message:error.message+(/^[A-Z][A-Z0-9_]{1,79}$/.test(error.code||'')?` (${error.code})`:'')};}
  });
}
document.addEventListener('mindly:view-rendered',()=>{
  if(!sync.authReady||!workerEndpoint())return;
  if(!debateState.config&&!debateState.configLoading&&!debateState.configError)loadDebateConfig();
  if((ui.route==='main'&&ui.mainTab==='home'||ui.route==='debate')&&!debateState.listLoaded&&!debateState.listLoading&&!debateState.listError)loadDebates(true);
  if(ui.route==='debateDetail'&&ui.currentDebateId&&!debateState.details.has(ui.currentDebateId))loadDebateDetail(ui.currentDebateId);
  if(ui.route==='archive'&&ui.archiveGroup==='debate'&&!debateState.archives[ui.archiveTab])loadDebateArchive(ui.archiveTab);
  if(ui.route==='adminPanel'&&!debateState.admin&&!debateState.adminLoading&&!debateState.adminError)loadAIAdmin();
});
document.addEventListener('mindly:session-changed',()=>{
  debateState.epoch++;for(const controller of debateState.controllers)controller.abort();debateState.controllers.clear();clearDebateImages();
  Object.assign(debateState,{configLoading:false,configError:'',list:[],listLoaded:false,listLoading:false,listError:'',details:new Map(),archives:{},admin:null,adminLoading:false,adminError:'',adminCheck:null,feedback:null,error:'',analysis:null,draft:null,consent:false,opinionDrafts:{},imageLoading:false});
});
document.addEventListener('keydown',event=>{if(!debateState.feedback)return;if(event.key==='Escape'){event.preventDefault();closeDebateFeedback();}else if(event.key==='Tab'){event.preventDefault();document.getElementById('feedback-confirm')?.focus();}});
setInterval(()=>{if(!document.hidden&&ui.route==='debateDetail'){const state=debateState.details.get(ui.currentDebateId);if(state?.loaded&&!state.loading&&Date.now()-state.updatedAt>30000)loadDebateDetail(ui.currentDebateId);}},30000);
