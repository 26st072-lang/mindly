/* Keep parent links in storage; display threads without trusting their depth. */
function threadedComments(items){
  const byId=new Map(items.map(item=>[item.id,item])),children=new Map(),roots=[];
  for(const item of items){if(item.parentId&&byId.has(item.parentId)&&item.parentId!==item.id){const list=children.get(item.parentId)||[];list.push(item);children.set(item.parentId,list);}else roots.push(item);}
  const result=[],seen=new Set();
  const visit=root=>{const stack=[{item:root,depth:0}];while(stack.length){const entry=stack.pop();if(seen.has(entry.item.id))continue;seen.add(entry.item.id);result.push({...entry,parent:byId.get(entry.item.parentId)||null});const replies=children.get(entry.item.id)||[];for(let i=replies.length-1;i>=0;i--)stack.push({item:replies[i],depth:Math.min(3,entry.depth+1)});}};
  roots.forEach(visit);items.forEach(item=>{if(!seen.has(item.id))visit(item);});return result;
}
function commentArgs(...values){return values.map(value=>escapeHtml(JSON.stringify(value))).join(',');}
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
    return `<div class="comment-item${depth?' comment-reply':''}" data-key="comment-${escapeHtml(post.id)}-${escapeHtml(c.id)}" style="--reply-depth:${depth}"><span class="avatar">${avatarSVG(c.authorAvatar)}</span><div class="comment-body"><div class="comment-meta"><strong>${escapeHtml(c.authorNickname)}</strong><time>${timeAgo(c.createdAt)}</time>${mine?'<span class="age-pill">내 댓글</span>':''}</div>${parent?`<span class="reply-to">↳ ${escapeHtml(parent.authorNickname)}님에게 답글</span>`:''}${c.deleted?'<p class="deleted-comment">삭제된 댓글입니다.</p>':editing?`<textarea id="edit-comment-${escapeHtml(c.id)}" class="admin-comment-edit" aria-label="댓글 수정 내용" maxlength="1000" data-lock-action="edit-comment-${escapeHtml(c.id)}" oninput="ui.commentEditDraft=this.value">${escapeHtml(ui.commentEditDraft)}</textarea><div class="comment-edit-actions"><button class="admin-mini-btn" data-action="edit-comment-${escapeHtml(c.id)}" onclick="saveEditComment(${args})">수정 저장</button><button class="admin-mini-btn ghost" data-disable-while="edit-comment-${escapeHtml(c.id)}" onclick="cancelEditComment()">취소</button></div>`:`<p>${escapeHtml(c.content)}</p>${c.editedAt?'<span class="edited-label">수정됨</span>':''}`}<div class="comment-actions">${!c.deleted&&session.userId?`<button onclick="startConcernReply(${args})" aria-label="${escapeHtml(c.authorNickname)} 댓글에 답글">답글</button>`:''}${manage&&!editing?`${session.isAdmin&&!mine?'<span class="admin-badge">관리자</span>':''}<button aria-label="${mine?'내 댓글 수정':'댓글 수정'}" onclick="startEditComment(${args})">수정</button><button aria-label="${mine?'내 댓글 삭제':'댓글 삭제'}" data-action="delete-comment-${escapeHtml(c.id)}" onclick="deleteComment(${args})">삭제</button>`:''}</div></div></div>`;
  }).join('');
  return `<div class="comments-block"><h4>댓글 ${post.comments.filter(c=>!c.deleted).length}</h4>${cards||'<p class="field-help">첫 댓글을 남겨보세요.</p>'}${reply?`<div class="reply-context">${escapeHtml(reply.authorNickname)}님에게 답글 <button onclick="cancelConcernReply()">답글 취소</button></div>`:''}<div class="comment-input-row"><input id="comment-input" aria-label="댓글 내용" maxlength="1000" value="${escapeHtml(ui.commentDrafts[post.id]||'')}" placeholder="${session.userId?(reply?'답글을 남겨주세요':'따뜻한 댓글을 남겨주세요'):'로그인 후 댓글을 남길 수 있어요'}" oninput="ui.commentDrafts[${commentArgs(post.id)}]=this.value" onkeydown="if(event.key==='Enter'&&!event.isComposing){event.preventDefault();submitComment(${commentArgs(post.id)});}"><button class="comment-send" aria-label="${reply?'답글 보내기':'댓글 보내기'}" data-action="comment" onclick="submitComment(${commentArgs(post.id)})">${ICONS.send}</button></div></div>`;
}
function findDebateOpinion(debateId,opinionId){return debateState.details.get(debateId)?.opinions.find(item=>item.id===opinionId)||Object.values(debateState.archives).flatMap(state=>state.items).find(item=>item.id===opinionId&&item.debateId===debateId);}
function applyOpinionResult(result){
  updateDebate(result.debate);
  const state=debateState.details.get(result.debate.id);if(state){const index=state.opinions.findIndex(item=>item.id===result.opinion.id);if(index>=0)state.opinions[index]=result.opinion;else state.opinions.push(result.opinion);}
}
function startDebateReply(debateId,opinionId){
  if(!requireLogin())return;
  const parent=findDebateOpinion(debateId,opinionId);if(!parent||parent.deleted)return;
  opinionDraft(debateId).parentId=opinionId;opinionDraft(debateId).requestId=null;
  if(ui.route!=='debateDetail'||ui.currentDebateId!==debateId)goto('debateDetail',{currentDebateId:debateId});else render();
  document.getElementById('debate-opinion')?.focus();
}
function cancelDebateReply(debateId){const draft=opinionDraft(debateId);draft.parentId=null;draft.requestId=null;render();}
function renderDebateReplyContext(debateId,draft){
  if(!draft.parentId)return '';
  const parent=findDebateOpinion(debateId,draft.parentId);
  return `<div class="reply-context">${escapeHtml(parent?.alias||'선택한 댓글')}에게 답글 <button type="button" data-disable-while="debate-opinion" onclick="cancelDebateReply('${debateId}')">답글 취소</button></div>`;
}
function startDebateCommentEdit(debateId,opinionId){
  const item=findDebateOpinion(debateId,opinionId);
  if(!item||item.deleted||!session.userId||!item.isMine&&!session.isAdmin)return;
  debateState.commentEdit={debateId,id:opinionId,content:item.content,revision:item.revision||0};render();document.getElementById('edit-opinion-'+opinionId)?.focus();
}
function cancelDebateCommentEdit(){if(pendingActions.has('edit-opinion-'+debateState.commentEdit?.id))return;debateState.commentEdit=null;render();}
async function saveDebateComment(debateId,opinionId){
  const edit=debateState.commentEdit;if(!edit||edit.id!==opinionId||edit.debateId!==debateId)return;
  if(edit.content.trim().length<5){toast('의견을 5자 이상 적어주세요.');return;}
  return debateAction('edit-opinion-'+opinionId,async epoch=>{
    const result=await debateRequest(`/v1/debates/${debateId}/opinions/${opinionId}`,{method:'PATCH',body:{content:edit.content,revision:edit.revision}});
    if(epoch!==debateState.epoch)return;applyOpinionResult(result);debateState.commentEdit=null;toast('댓글이 수정되었어요.');
  },'edit-opinion-'+opinionId);
}
async function deleteDebateComment(debateId,opinionId){
  const item=findDebateOpinion(debateId,opinionId);if(!item||item.deleted||!session.userId||!item.isMine&&!session.isAdmin)return;
  if(!confirm('이 댓글을 삭제할까요? 달린 답글은 유지되며 원래 내용은 지워집니다.'))return;
  return debateAction('delete-opinion-'+opinionId,async epoch=>{
    const result=await debateRequest(`/v1/debates/${debateId}/opinions/${opinionId}`,{method:'DELETE',body:{revision:item.revision||0}});
    if(epoch!==debateState.epoch)return;applyOpinionResult(result);if(debateState.commentEdit?.id===opinionId)debateState.commentEdit=null;toast('댓글이 삭제되었어요.');
  });
}
function renderDiscussionOpinion(item,{archive=false,depth=0,parent=null}={}){
  const edit=debateState.commentEdit,editing=edit?.id===item.id&&edit.debateId===item.debateId,manage=session.userId&&(item.isMine||session.isAdmin)&&!item.deleted;
  const body=item.deleted?'<p class="deleted-comment">삭제된 댓글입니다.</p>':editing?`<textarea id="edit-opinion-${item.id}" aria-label="토론 댓글 수정 내용" class="admin-comment-edit" maxlength="500" data-lock-action="edit-opinion-${item.id}" oninput="debateState.commentEdit.content=this.value">${escapeHtml(edit.content)}</textarea><div class="comment-edit-actions"><button data-action="edit-opinion-${item.id}" onclick="saveDebateComment('${item.debateId}','${item.id}')">표현 확인 후 수정 저장</button><button data-disable-while="edit-opinion-${item.id}" onclick="cancelDebateCommentEdit()">취소</button></div>`:`<p>${escapeHtml(item.content)}</p>${item.editedAt?'<span class="edited-label">수정됨</span>':''}`;
  return `<article class="opinion-card stance-${item.stance}${depth?' comment-reply':''}" data-key="opinion-${item.id}" style="--reply-depth:${Math.min(3,Number(depth)||0)}"><div class="meta-row"><strong>${escapeHtml(item.alias)}</strong><span class="stance-badge ${item.stance}">${item.stance==='agree'?'찬성':'반대'}</span>${item.isMine?'<span class="age-pill">내 의견</span>':''}<time>${timeAgo(item.createdAt)}</time></div>${archive?`<h3><button class="post-title-link" onclick="goto('debateDetail',{currentDebateId:'${item.debateId}'})">${escapeHtml(item.title)}</button></h3>`:''}${parent||item.parentId?`<span class="reply-to">↳ ${escapeHtml(parent?.alias||item.parentAlias||'원래 댓글')}에게 답글</span>`:''}${body}<div class="comment-actions">${session.userId&&!item.deleted?`<button onclick="startDebateReply('${item.debateId}','${item.id}')">답글</button>`:''}${manage&&!editing?`<button aria-label="${item.isMine?'내 토론 댓글 수정':'토론 댓글 수정'}" onclick="startDebateCommentEdit('${item.debateId}','${item.id}')">수정</button><button aria-label="${item.isMine?'내 토론 댓글 삭제':'토론 댓글 삭제'}" data-action="delete-opinion-${item.id}" onclick="deleteDebateComment('${item.debateId}','${item.id}')">삭제</button>`:''}</div></article>`;
}
