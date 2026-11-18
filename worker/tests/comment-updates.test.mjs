import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers.mjs';
const send=(h,d,user,extra={})=>h.request(`/v1/debates/${d.id}/opinions`,{method:'POST',user,body:{requestId:crypto.randomUUID(),stance:'agree',content:'서로의 근거를 존중하며 대화하고 싶습니다.',...extra}});
const change=(h,d,o,user,method,body={})=>h.request(`/v1/debates/${d.id}/opinions/${o.id}`,{method,user,body:{revision:o.revision,...body}});

test('admin edits are forbidden; moderation deletion preserves notice, privacy and replies',async()=>{
  const h=harness(),d=await h.publish('owner'),o=(await send(h,d,'alice')).data.opinion,r=(await send(h,d,'bob',{parentId:o.id})).data.opinion,calls=h.calls.length;
  const edit=await change(h,d,o,'admin','PATCH',{content:'다른 사람의 댓글을 관리자가 수정하려고 합니다.'});
  assert.equal(edit.status,403);assert.equal(edit.data.code,'COMMENT_AUTHOR_REQUIRED');assert.equal(h.calls.length,calls);
  assert.equal(h.DB.sqlite.prepare('SELECT content FROM opinions WHERE id=?').get(o.id).content,o.content);
  const removed=await change(h,d,o,'admin','DELETE');
  assert.equal(removed.status,200);assert.equal(removed.data.opinion.deletedByAdmin,true);assert.equal(removed.data.opinion.content,'');
  assert.equal((await change(h,d,o,'admin','DELETE')).data.opinion.deletedByAdmin,true);
  const detail=await h.request('/v1/debates/'+d.id,{user:null});
  assert.equal(detail.data.opinions.find(item=>item.id===o.id).deletedByAdmin,true);assert.equal(detail.data.opinions.find(item=>item.id===r.id).content,r.content);assert.ok(!JSON.stringify(detail.data).includes('alice'));
  const own=(await send(h,d,'admin')).data.opinion,edited=await change(h,d,own,'admin','PATCH',{content:'관리자가 본인이 쓴 댓글을 수정한 내용입니다.'});
  assert.equal(edited.status,200);assert.equal((await change(h,d,edited.data.opinion,'admin','DELETE')).data.opinion.deletedByAdmin,false);
});
test('1000 characters are accepted in opinions, replies and edits; 1001 never reaches AI',async()=>{
  const h=harness(),d=await h.publish(),content='가'.repeat(1000),o=(await send(h,d,'alice',{content})).data.opinion;
  assert.equal(o.content.length,1000);const reply=await send(h,d,'bob',{content,parentId:o.id});assert.equal(reply.status,201);assert.equal(reply.data.opinion.parentId,o.id);
  const edited=await change(h,d,o,'alice','PATCH',{content:'나'.repeat(1000)});assert.equal(edited.status,200);assert.equal(edited.data.opinion.content.length,1000);
  const calls=h.calls.length;assert.equal((await send(h,d,'alice',{content:content+'가'})).status,400);assert.equal((await change(h,d,edited.data.opinion,'alice','PATCH',{content:content+'가'})).status,400);assert.equal(h.calls.length,calls);
});
test('search finds older debates before pagination and escapes literal SQL wildcards',async()=>{
  const h=harness(),d=await h.publish(),insert=h.DB.sqlite.prepare('INSERT INTO debates(id,analysis_id,user_id,title,summary,issues,agree_label,disagree_label,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<27;i++)insert.run(crypto.randomUUID(),crypto.randomUUID(),'fixture','새 토론 '+i,'다른 주제의 배경입니다.','[]','찬성','반대',Date.now()+i+10);
  assert.ok(!(await h.request('/v1/debates',{user:null})).data.items.some(item=>item.id===d.id));
  const found=await h.request('/v1/debates?q='+encodeURIComponent('휴대전화'),{user:null});assert.equal(found.status,200);assert.deepEqual(found.data.items.map(item=>item.id),[d.id]);assert.equal(found.data.hasMore,false);
  h.DB.sqlite.prepare('UPDATE debates SET title=? WHERE id=?').run('100% 선택할 수 있는 토론',d.id);
  assert.equal((await h.request('/v1/debates?q=%25',{user:null})).data.items.length,1);assert.equal((await h.request('/v1/debates?q=_',{user:null})).data.items.length,0);
  assert.equal((await h.request('/v1/debates?q='+encodeURIComponent("' OR 1=1 --"),{user:null})).data.items.length,0);assert.equal((await h.request('/v1/debates?q='+('a'.repeat(101)),{user:null})).status,400);
  const first=await h.request('/v1/debates?q='+encodeURIComponent('새 토론'),{user:null}),second=await h.request('/v1/debates?q='+encodeURIComponent('새 토론')+'&offset=20',{user:null});
  assert.equal(first.data.items.length,20);assert.equal(first.data.hasMore,true);assert.equal(second.data.items.length,7);assert.equal(second.data.hasMore,false);
});
