/* Keep parent links in storage; display threads without trusting their depth. */
function threadedComments(items){
  const byId=new Map(items.map(item=>[item.id,item])),children=new Map(),roots=[];
  for(const item of items){if(item.parentId&&byId.has(item.parentId)&&item.parentId!==item.id){const list=children.get(item.parentId)||[];list.push(item);children.set(item.parentId,list);}else roots.push(item);}
  const result=[],seen=new Set();
  const visit=root=>{const stack=[{item:root,depth:0}];while(stack.length){const entry=stack.pop();if(seen.has(entry.item.id))continue;seen.add(entry.item.id);result.push({...entry,parent:byId.get(entry.item.parentId)||null});const replies=children.get(entry.item.id)||[];for(let i=replies.length-1;i>=0;i--)stack.push({item:replies[i],depth:Math.min(3,entry.depth+1)});}};
  roots.forEach(visit);items.forEach(item=>{if(!seen.has(item.id))visit(item);});return result;
}
// Allow everyday frustration and self-reflection, but include abusive spellings,
// direct insults and attacks naming the post author or another participant.
const CONCERN_COMMENT_SWEARS=/(?:[시씨][\s.!·…]*[발빨](?!점|역|열차)|씨[\s.!·…]*팔|(?:개|씹|미[\s.!·…]*친)[\s.!·…]*새[\s.!·…]*(?:끼|꺄|꺅)|새[\s.!·…]*끼[\s.!·…]*야|새[\s.!·…]*꺄|병[\s.!·…]*신|미[\s.!·…]*친[\s.!·…]*[년놈]|미[\s.!·…]*친[\s.!·…]*아(?=$|[^\p{L}\p{N}]|[ㅋㅎㅠㅜ])|좆|지랄)/u;
const CONCERN_DIRECT_INSULT='(?:바보(?:야|냐|네|예요|에요|\\s*같(?:아(?:요)?|다|네(?:요)?))?|멍청(?:아|이|하(?:다|네(?:요)?)|해(?:요)?)|한심(?:하(?:다|네(?:요)?)|해(?:요)?)|못생겼(?:어(?:요)?|다|네(?:요)?|습니다)|못생긴\\s*(?:놈|년|새끼)|죽어(?:라|요|버려(?:라)?)?|뒤져(?:라|요|버려(?:라)?)?|닥쳐(?:라|요)?|꺼져(?:라|요)?)';
const CONCERN_INSULT_INTENSIFIERS='(?:(?:야|아니|아|아이|진짜|정말|참|완전|너무|아주|솔직히|그냥|좀|빨리)\\s*){0,3}';
const CONCERN_STANDALONE_INSULT=new RegExp('^\\s*'+CONCERN_INSULT_INTENSIFIERS+CONCERN_DIRECT_INSULT+'(?:\\s*(?:진짜|정말|너|넌|너는))?(?:[^\\p{L}\\p{N}]|[ㅋㅎㅠㅜ])*$','u');
const CONCERN_PERSON_TARGET='(?:너(?:희(?:들)?)?|넌|니(?:들)?|네|당신|작성자|글쓴이|글쓴\\s*분|댓글\\s*작성자|댓쓴이|저\\s*사람|그\\s*사람|이\\s*사람|[^\\s,]{1,20}님)(?:은|는|이|가|도|들)?';
const CONCERN_TARGET_PATTERN=new RegExp('(?:^|[\\s,@])'+CONCERN_PERSON_TARGET+'(?=$|[^\\p{L}\\p{N}]|바보|멍청|못생|한심|쓰레기|개\\s*같)','gu');
const CONCERN_ADDRESSED_INSULT=new RegExp('(?:^|[\\s,@])'+CONCERN_PERSON_TARGET+'\\s*'+CONCERN_INSULT_INTENSIFIERS+CONCERN_DIRECT_INSULT+'(?=$|[^\\p{L}\\p{N}]|[ㅋㅎㅠㅜ])','u');
const CONCERN_PERSON_ASSESSMENT=/(?:바보|멍청|못생(?:겼|긴|겨)|한심|쓰레기|개\s*같(?:아|다|네|은|애))/u;
const CONCERN_DEHUMANIZING=/(?:개\s*같은|바보\s*같은|멍청한|한심한|못생긴)\s*(?:것들?|놈|년|새끼|인간|사람들?|작성자|글쓴이)/u;
function normalizeConcernComment(content){return String(content).normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'');}
function hasConcernCommentAbuse(content,nicknames=[]){
  const text=normalizeConcernComment(content);
  if(CONCERN_COMMENT_SWEARS.test(text))return true;
  return (text.match(/[^.!?。！？\n,]+[.!?。！？\n,]*/gu)||[]).some(part=>{
    // A reassurance such as "너는 바보가 아니야" is not an attack.
    let sentence=part.replace(/[.!?。！？\n,]+$/gu,'');
    if(!/[?？]/u.test(part))sentence=sentence.replace(/(?:바보|멍청이|쓰레기|한심한\s*사람)(?:가|이|는|도)?\s*(?:아니(?:야|에요|다|라|라고|고)|아냐|아닙니다)/gu,'');
    if(CONCERN_STANDALONE_INSULT.test(sentence)||CONCERN_ADDRESSED_INSULT.test(sentence))return true;
    const assessment=CONCERN_PERSON_ASSESSMENT.exec(sentence)||CONCERN_DEHUMANIZING.exec(sentence);
    if(!assessment)return false;
    const before=sentence.slice(0,assessment.index);
    // Criticism of a situation or action is different from judging a person.
    if(/(?:상황|기분|하루|시험|과제|의견|행동|방법|정책|주장|선택|결정)(?:은|는|이|가|도)?\s*(?:(?:정말|진짜|좀|너무)\s*){0,3}$/u.test(before))return false;
    const self=[...before.matchAll(/(?:^|\s)(?:나|내가|나는|난|나도|저는|제가|내\s*자신)(?=\s|$)/gu)].at(-1);
    const targets=[...sentence.matchAll(CONCERN_TARGET_PATTERN)].map(match=>match.index);
    for(const nickname of nicknames){
      const name=normalizeConcernComment(nickname||'').trim();
      if(!name)continue;
      let index=sentence.indexOf(name);
      while(index!==-1){targets.push(index);index=sentence.indexOf(name,index+name.length);}
    }
    // A later first-person subject changes the assessment back to the speaker.
    const target=targets.some(index=>!self||index>self.index);
    if(self&&!target)return false;
    return target||CONCERN_DEHUMANIZING.test(sentence);
  });
}
function checkConcernCommentLanguage(content,inputId,postId){
  const post=DB.posts.find(item=>item.id===postId),nicknames=[post?.authorNickname,...(post?.comments||[]).map(comment=>comment.authorNickname)];
  if(!hasConcernCommentAbuse(content,nicknames))return true;
  alert('욕설이나 비방 표현이 포함되어 있어요.\n마인들리에서는 다정한 말들로 대화해주세요.\n내용을 직접 수정한 뒤 다시 보내주세요.');
  document.getElementById(inputId)?.focus();
  return false;
}
function commentArgs(...values){return values.map(value=>escapeHtml(JSON.stringify(value))).join(',');}
function renderCommentContent(content,key){
  const expanded=ui.expandedComments.has(key),id='comment-text-'+key;
  return `<div class="comment-copy"><p id="${escapeHtml(id)}" class="comment-text${expanded?'':' is-collapsed'}">${escapeHtml(content)}</p><button type="button" class="comment-more" aria-controls="${escapeHtml(id)}" aria-expanded="${expanded}" onclick="toggleCommentExpansion(${commentArgs(key)})" hidden>${expanded?'접기':'더보기'}</button></div>`;
}
function toggleCommentExpansion(key){if(ui.expandedComments.has(key))ui.expandedComments.delete(key);else ui.expandedComments.add(key);render();}
let commentMeasureFrame=null;
function measureCommentOverflow(){
  cancelAnimationFrame(commentMeasureFrame);
  commentMeasureFrame=requestAnimationFrame(()=>document.querySelectorAll('.comment-copy').forEach(copy=>{
    const text=copy.querySelector('.comment-text'),button=copy.querySelector('.comment-more');
    if(!text||!button)return;
    button.hidden=text.scrollHeight<=parseFloat(getComputedStyle(text).lineHeight)*5+1;
  }));
}
document.addEventListener('mindly:view-rendered',measureCommentOverflow);
window.addEventListener('resize',measureCommentOverflow,{passive:true});
document.fonts?.ready.then(measureCommentOverflow);
function startConcernReply(postId,commentId){
  if(!requireLogin())return;
  const target=DB.posts.find(post=>post.id===postId)?.comments.find(comment=>comment.id===commentId);
  if(!target||target.deleted)return;
  ui.concernReply={postId,commentId};render();document.getElementById('comment-input')?.focus();
}
function cancelConcernReply(){ui.concernReply=null;render();}
function renderConcernComments(post){
  if(!post.commentsAllowed)return '<div class="locked-note">작성자가 댓글을 허용하지 않은 글이에요</div>';
  const reply=ui.concernReply?.postId===post.id?post.comments.find(c=>c.id===ui.concernReply.commentId):null;
  const cards=threadedComments(post.comments).map(({item:c,depth,parent})=>{
    const editing=ui.editingCommentId===c.id&&ui.editingCommentPostId===post.id,mine=c.authorId===session.userId,manage=canEditComment(c)&&!c.deleted,args=commentArgs(post.id,c.id);
    return `<div class="comment-item${depth?' comment-reply':''}" data-key="comment-${escapeHtml(post.id)}-${escapeHtml(c.id)}" style="--reply-depth:${depth}"><span class="avatar">${avatarSVG(c.authorAvatar)}</span><div class="comment-body"><div class="comment-meta"><strong>${escapeHtml(c.authorNickname)}</strong><time>${timeAgo(c.createdAt)}</time>${mine?'<span class="age-pill">내 댓글</span>':''}</div>${parent?`<span class="reply-to">↳ ${escapeHtml(parent.authorNickname)}님에게 답글</span>`:''}${c.deleted?'<p class="deleted-comment">삭제된 댓글입니다.</p>':editing?`<textarea id="edit-comment-${escapeHtml(c.id)}" class="admin-comment-edit" aria-label="댓글 수정 내용" maxlength="1000" data-lock-action="edit-comment-${escapeHtml(c.id)}" oninput="ui.commentEditDraft=this.value">${escapeHtml(ui.commentEditDraft)}</textarea>${renderEvidenceComposer({kind:'concern-edit',id:post.id,parentId:c.id})}<div class="comment-edit-actions"><button class="admin-mini-btn" data-action="edit-comment-${escapeHtml(c.id)}" onclick="saveEditComment(${args})">수정 저장</button><button class="admin-mini-btn ghost" data-disable-while="edit-comment-${escapeHtml(c.id)}" onclick="cancelEditComment()">취소</button></div>`:`${renderCommentContent(c.content,'concern-'+post.id+'-'+c.id)}${renderEvidenceList(c.evidence)}${c.editedAt?'<span class="edited-label">수정됨</span>':''}`}<div class="comment-actions">${!c.deleted&&session.userId?`<button onclick="startConcernReply(${args})" aria-label="${escapeHtml(c.authorNickname)} 댓글에 답글">답글</button>`:''}${manage&&!editing?`${session.isAdmin&&!mine?'<span class="admin-badge">관리자</span>':''}<button aria-label="${mine?'내 댓글 수정':'댓글 수정'}" onclick="startEditComment(${args})">수정</button><button aria-label="${mine?'내 댓글 삭제':'댓글 삭제'}" data-action="delete-comment-${escapeHtml(c.id)}" onclick="deleteComment(${args})">삭제</button>`:''}</div></div></div>`;
  }).join('');
  return `<div class="comments-block"><h4>댓글 ${post.comments.filter(c=>!c.deleted).length}</h4>${cards||'<p class="field-help">첫 댓글을 남겨보세요.</p>'}${reply?`<div class="reply-context">${escapeHtml(reply.authorNickname)}님에게 답글 <button onclick="cancelConcernReply()">답글 취소</button></div>`:''}<div class="comment-input-row"><input id="comment-input" aria-label="댓글 내용" maxlength="1000" value="${escapeHtml(ui.commentDrafts[post.id]||'')}" placeholder="${session.userId?(reply?'답글을 남겨주세요':'따뜻한 댓글을 남겨주세요'):'로그인 후 댓글을 남길 수 있어요'}" oninput="ui.commentDrafts[${commentArgs(post.id)}]=this.value" onkeydown="if(event.key==='Enter'&&!event.isComposing){event.preventDefault();submitComment(${commentArgs(post.id)});}"><button class="comment-send" aria-label="${reply?'답글 보내기':'댓글 보내기'}" data-action="comment" onclick="submitComment(${commentArgs(post.id)})">${ICONS.send}</button></div>${renderEvidenceComposer({kind:'concern',id:post.id,parentId:reply?.id||null})}</div>`;
}
function findDebateOpinion(debateId,opinionId){return debateState.details.get(debateId)?.opinions.find(item=>item.id===opinionId)||Object.values(debateState.archives).flatMap(state=>state.items).find(item=>item.id===opinionId&&item.debateId===debateId);}
function applyOpinionResult(result){
  updateDebate(result.debate);
  const state=debateState.details.get(result.debate.id);if(state){const index=state.opinions.findIndex(item=>item.id===result.opinion.id);if(index>=0)state.opinions[index]=result.opinion;else state.opinions.push(result.opinion);}
}
function startDebateReply(debateId,opinionId){
  if(!requireLogin())return;
  const parent=findDebateOpinion(debateId,opinionId);if(!parent||parent.deleted)return;
  debateState.activeReply={debateId,parentId:opinionId};opinionDraft(debateId,opinionId);
  if(ui.route!=='debateDetail'||ui.currentDebateId!==debateId)goto('debateDetail',{currentDebateId:debateId});else render();
  document.getElementById('reply-opinion-'+opinionId)?.focus();
}
function cancelDebateReply(debateId){if(debateState.activeReply?.debateId===debateId)debateState.activeReply=null;render();}
function renderDebateReplyContext(debateId,draft){
  if(!draft.parentId)return '';
  const parent=findDebateOpinion(debateId,draft.parentId);
  return `<div class="reply-context">${escapeHtml(parent?.alias||'선택한 댓글')}에게 답글 <button type="button" data-disable-while="debate-reply-${draft.parentId}" onclick="cancelDebateReply('${debateId}')">답글 취소</button></div>`;
}
function startDebateCommentEdit(debateId,opinionId){
  const item=findDebateOpinion(debateId,opinionId);
  if(!item||item.deleted||!session.userId||!item.isMine)return;
  debateState.commentEdit={debateId,id:opinionId,content:item.content,revision:item.revision||0};seedEvidence({kind:'debate-edit',id:debateId,parentId:opinionId},item.evidence);render();document.getElementById('edit-opinion-'+opinionId)?.focus();
}
function cancelDebateCommentEdit(){if(pendingActions.has('edit-opinion-'+debateState.commentEdit?.id))return;debateState.commentEdit=null;render();}
async function saveDebateComment(debateId,opinionId){
  const edit=debateState.commentEdit;if(!edit||edit.id!==opinionId||edit.debateId!==debateId)return;
  if(edit.content.trim().length<5||edit.content.trim().length>1000){toast('의견을 5~1000자로 적어주세요.');return;}
  return debateAction('edit-opinion-'+opinionId,async epoch=>{
    const result=await debateRequest(`/v1/debates/${debateId}/opinions/${opinionId}`,{method:'PATCH',body:{content:edit.content,revision:edit.revision,evidenceIds:evidenceIds({kind:'debate-edit',id:debateId,parentId:opinionId})}});
    if(epoch!==debateState.epoch)return;applyOpinionResult(result);debateState.commentEdit=null;toast('댓글이 수정되었어요.');
  },'edit-opinion-'+opinionId);
}
async function deleteDebateComment(debateId,opinionId){
  const item=findDebateOpinion(debateId,opinionId);if(!item||item.deleted||!session.userId||!item.isMine&&!session.isAdmin)return;
  if(!confirm('이 댓글을 삭제할까요? 달린 답글은 유지되며 원래 내용은 지워집니다.'))return;
  return debateAction('delete-opinion-'+opinionId,async epoch=>{
    const result=await debateRequest(`/v1/debates/${debateId}/opinions/${opinionId}`,{method:'DELETE',body:{revision:item.revision||0}});
    if(epoch!==debateState.epoch)return;applyOpinionResult(result);if(debateState.commentEdit?.id===opinionId)debateState.commentEdit=null;if(debateState.activeReply?.parentId===opinionId)debateState.activeReply=null;toast('댓글이 삭제되었어요.');
  });
}
function renderDebateOpinionForm(debate,{parentId=null}={}){
  if(!session.userId)return `<p>로그인하면 익명으로 참여할 수 있어요.</p><button class="btn-primary" onclick="goto('mypage')">로그인하고 참여하기</button>`;
  const id=debate.id,draft=opinionDraft(id,parentId),isReply=!!parentId,target=isReply?'reply-opinion-'+parentId:'debate-opinion',action=isReply?'debate-reply-'+parentId:'debate-opinion',parentArg=parentId?`'${parentId}'`:'null',busy=pendingActions.has(action);
  return `<form class="${isReply?'inline-reply-form':'opinion-form'}" onsubmit="event.preventDefault();submitDebateOpinion('${id}',${parentArg})">${isReply?renderDebateReplyContext(id,draft):''}<fieldset class="stance-choice"><legend>${isReply?'답글의 입장을 선택해주세요':'입장을 선택해주세요'} <span>(필수)</span></legend>${[['agree','찬성',debate.agreeLabel],['disagree','반대',debate.disagreeLabel]].map(([value,label,description])=>`<label class="stance-option ${draft.stance===value?'selected':''}"><input type="radio" name="${isReply?'reply-stance-'+parentId:'debate-stance'}" value="${value}" ${draft.stance===value?'checked':''} required onchange="setOpinionStance('${id}','${value}',${parentArg})" ${busy?'disabled':''}><strong>${label}</strong><span>${escapeHtml(description)}</span></label>`).join('')}</fieldset><label class="debate-field" for="${target}">${isReply?'답글 내용':'이렇게 생각한 이유'} <span>(필수 · 5~1000자)</span><textarea id="${target}" required minlength="5" maxlength="1000" aria-describedby="${target}-help" placeholder="사람에 대한 평가 대신, 주제에 관한 이유를 적어주세요." oninput="updateOpinionDraft('${id}',${parentArg},this)" ${busy?'readonly':''}>${escapeHtml(draft.content)}</textarea></label><span class="comment-limit"><span id="${target}-count">${draft.content.length}</span> / 1000자</span>${renderEvidenceComposer({kind:'debate',id,parentId})}<p class="field-help" id="${target}-help">해요체 등 편한 존댓말로 작성해주세요. 제출하면 AI가 반말·욕설 등 표현을 확인해요. 수정 안내가 나오면 직접 고친 뒤 다시 제출해주세요.</p>${debateState.error&&(!debateState.errorTarget||debateState.errorTarget===target)?`<p class="form-error" role="alert">${escapeHtml(debateState.error)}</p>`:''}<button class="btn-primary" type="submit" data-action="${action}">${isReply?'답글 제출':'입장과 의견 제출'}</button></form>`;
}
function renderDiscussionOpinion(item,{archive=false,depth=0,parent=null}={}){
  const edit=debateState.commentEdit,editing=edit?.id===item.id&&edit.debateId===item.debateId,canEdit=session.userId&&item.isMine&&!item.deleted,canDelete=session.userId&&(item.isMine||session.isAdmin)&&!item.deleted;
  const body=item.deleted?`<p class="deleted-comment">${item.deletedByAdmin?'관리자에 의해 삭제된 댓글입니다':'삭제된 댓글입니다.'}</p>`:editing?`<textarea id="edit-opinion-${item.id}" aria-label="토론 댓글 수정 내용" class="admin-comment-edit" maxlength="1000" data-lock-action="edit-opinion-${item.id}" oninput="debateState.commentEdit.content=this.value">${escapeHtml(edit.content)}</textarea>${renderEvidenceComposer({kind:'debate-edit',id:item.debateId,parentId:item.id})}<div class="comment-edit-actions"><button data-action="edit-opinion-${item.id}" onclick="saveDebateComment('${item.debateId}','${item.id}')">표현 확인 후 수정 저장</button><button data-disable-while="edit-opinion-${item.id}" onclick="cancelDebateCommentEdit()">취소</button></div>`:`${renderCommentContent(item.content,'debate-'+item.id)}${renderEvidenceList(item.evidence)}${item.editedAt?'<span class="edited-label">수정됨</span>':''}`;
  const replying=!archive&&!item.deleted&&debateState.activeReply?.debateId===item.debateId&&debateState.activeReply?.parentId===item.id,debate=debateState.details.get(item.debateId)?.debate;
  return `<article class="opinion-card stance-${item.stance}${depth?' comment-reply':''}" data-key="opinion-${item.id}" style="--reply-depth:${Math.min(3,Number(depth)||0)}"><div class="meta-row"><strong>${escapeHtml(item.alias)}</strong><span class="stance-badge ${item.stance}">${item.stance==='agree'?'찬성':'반대'}</span>${item.isMine?'<span class="age-pill">내 의견</span>':''}<time>${timeAgo(item.createdAt)}</time></div>${archive?`<h3><button class="post-title-link" onclick="goto('debateDetail',{currentDebateId:'${item.debateId}'})">${escapeHtml(item.title)}</button></h3>`:''}${parent||item.parentId?`<span class="reply-to">↳ ${escapeHtml(parent?.alias||item.parentAlias||'원래 댓글')}에게 답글</span>`:''}${body}<div class="comment-actions">${session.userId&&!item.deleted?`<button onclick="startDebateReply('${item.debateId}','${item.id}')">답글</button>`:''}${canEdit&&!editing?`<button aria-label="내 토론 댓글 수정" onclick="startDebateCommentEdit('${item.debateId}','${item.id}')">수정</button>`:''}${canDelete&&!editing?`<button aria-label="${item.isMine?'내 토론 댓글 삭제':'토론 댓글 삭제'}" data-action="delete-opinion-${item.id}" onclick="deleteDebateComment('${item.debateId}','${item.id}')">삭제</button>`:''}</div>${replying&&debate?`<div class="inline-reply">${renderDebateOpinionForm(debate,{parentId:item.id})}</div>`:''}</article>`;
}
