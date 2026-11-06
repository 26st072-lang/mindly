import {ApiError,assertAdmin,identifier,text} from './security.js';

export function opinionDTO(row,user){
  return {id:row.id,debateId:row.debate_id,alias:row.alias,stance:row.stance,content:row.deleted_at?'':row.content,createdAt:row.created_at,editedAt:row.edited_at||null,deleted:Boolean(row.deleted_at),revision:row.revision||0,parentId:row.parent_id||null,parentAlias:row.parent_alias||null,isMine:Boolean(user&&row.user_id===user.uid),title:row.title};
}
function voteStatements(env,debateId,userId,stamp){
  return [
    env.DB.prepare('DELETE FROM votes WHERE debate_id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM opinions WHERE debate_id=? AND user_id=? AND deleted_at IS NULL)').bind(debateId,userId,debateId,userId),
    env.DB.prepare('INSERT INTO votes(debate_id,user_id,stance,updated_at) SELECT debate_id,user_id,stance,? FROM opinions WHERE debate_id=? AND user_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1 ON CONFLICT(debate_id,user_id) DO UPDATE SET stance=excluded.stance,updated_at=excluded.updated_at').bind(stamp,debateId,userId),
  ];
}
function sameRequest(row,user,debateId,content,stance,parentId){
  if(row.user_id!==user.uid||row.debate_id!==debateId||row.content!==content||row.stance!==stance||(row.parent_id||null)!==parentId||row.deleted_at)throw new ApiError(409,'CONFLICT','이 요청은 이미 다른 내용으로 처리됐어요. 새로고침 후 다시 시도해주세요.');
  return opinionDTO(row,user);
}
export async function createOpinion(env,user,debateId,body,stamp,review){
  const requestId=identifier(body.requestId),content=text(body.content,'의견',5,500),parentId=body.parentId?identifier(body.parentId):null;
  if(!['agree','disagree'].includes(body.stance))throw new ApiError(400,'STANCE_REQUIRED','찬성 또는 반대를 선택해주세요.');
  const previous=await env.DB.prepare('SELECT * FROM opinions WHERE id=?').bind(requestId).first();
  if(previous)return {opinion:sameRequest(previous,user,debateId,content,body.stance,parentId),created:false};
  if(parentId&&!await env.DB.prepare('SELECT id FROM opinions WHERE id=? AND debate_id=? AND deleted_at IS NULL').bind(parentId,debateId).first())throw new ApiError(404,'REPLY_TARGET_UNAVAILABLE','답글을 달 댓글이 삭제되었거나 이 토론에 없어요.');
  await review(content,body.stance);
  try{
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO debate_participants(debate_id,user_id,number,created_at) SELECT ?,?,COALESCE(MAX(number),0)+1,? FROM debate_participants WHERE debate_id=?').bind(debateId,user.uid,stamp,debateId),
      env.DB.prepare("INSERT INTO opinions(id,debate_id,user_id,alias,stance,content,created_at,parent_id) SELECT ?,?,?, '익명 ' || number,?,?,?,? FROM debate_participants WHERE debate_id=? AND user_id=?").bind(requestId,debateId,user.uid,body.stance,content,stamp,parentId,debateId,user.uid),
      ...voteStatements(env,debateId,user.uid,stamp),
    ]);
  }catch(error){
    if(String(error.message).includes('REPLY_TARGET_UNAVAILABLE'))throw new ApiError(404,'REPLY_TARGET_UNAVAILABLE','검사 중 원래 댓글이 삭제되었어요. 다른 댓글에 답글을 남겨주세요.');
    if(!String(error.message).includes('UNIQUE'))throw error;
    const existing=await env.DB.prepare('SELECT * FROM opinions WHERE id=?').bind(requestId).first();
    if(!existing)throw error;
    return {opinion:sameRequest(existing,user,debateId,content,body.stance,parentId),created:false};
  }
  return {opinion:opinionDTO(await env.DB.prepare('SELECT * FROM opinions WHERE id=?').bind(requestId).first(),user),created:true};
}
export async function changeOpinion(env,user,debateId,opinionId,method,body,stamp,review){
  const row=await env.DB.prepare('SELECT * FROM opinions WHERE id=? AND debate_id=?').bind(opinionId,debateId).first();
  if(!row)throw new ApiError(404,'NOT_FOUND','댓글을 찾을 수 없어요.');
  if(row.user_id!==user.uid)assertAdmin(user,env);
  if(method==='DELETE'&&row.deleted_at)return opinionDTO(row,user);
  if(row.deleted_at)throw new ApiError(404,'NOT_FOUND','이미 삭제된 댓글이에요.');
  if(!Number.isInteger(body.revision)||body.revision!==row.revision)throw new ApiError(409,'COMMENT_CONFLICT','다른 곳에서 댓글이 변경됐어요. 내용을 복사한 뒤 새로고침해주세요.');
  let next;
  if(method==='PATCH'){
    const content=text(body.content,'의견',5,500);
    if(content===row.content)return opinionDTO(row,user);
    await review(content,row.stance);
    next=await env.DB.prepare('UPDATE opinions SET content=?,edited_at=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL RETURNING *').bind(content,stamp,opinionId,row.revision).first();
  }else{
    const results=await env.DB.batch([
      env.DB.prepare("UPDATE opinions SET content='',deleted_at=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL RETURNING *").bind(stamp,opinionId,row.revision),
      ...voteStatements(env,debateId,row.user_id,stamp),
    ]);
    next=results[0].results?.[0];
  }
  if(!next)throw new ApiError(409,'COMMENT_CONFLICT','검사 중 댓글이 변경됐어요. 내용을 복사한 뒤 새로고침해주세요.');
  return opinionDTO(next,user);
}
