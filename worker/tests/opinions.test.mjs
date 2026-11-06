import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,sampleAnalysis} from './helpers.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const send=(h,debate,user,extra={})=>h.request(`/v1/debates/${debate.id}/opinions`,{method:'POST',user,body:{requestId:crypto.randomUUID(),stance:'agree',content:'서로의 입장을 존중하며 근거를 나누면 좋겠습니다.',...extra}});
const change=(h,debate,opinion,user,method,body={})=>h.request(`/v1/debates/${debate.id}/opinions/${opinion.id}`,{method,user,body:{revision:opinion.revision,...body}});

test('anonymous numbers follow first successful participation and remain stable after deletion, replies and another debate',async()=>{
  const h=harness(),debate=await h.publish('owner');
  const a=(await send(h,debate,'alice')).data.opinion,b=(await send(h,debate,'bob')).data.opinion;
  assert.equal(a.alias,'익명 1');assert.equal(b.alias,'익명 2');
  const again=(await send(h,debate,'alice',{parentId:b.id})).data.opinion;
  assert.equal(again.alias,'익명 1');assert.equal(again.parentId,b.id);
  assert.equal((await change(h,debate,a,'alice','DELETE')).status,200);
  assert.equal((await change(h,debate,again,'alice','DELETE')).status,200);
  assert.equal((await send(h,debate,'alice')).data.opinion.alias,'익명 1');
  assert.equal((await send(h,debate,'charlie')).data.opinion.alias,'익명 3');
  const other=await h.publish('owner');assert.equal((await send(h,other,'bob')).data.opinion.alias,'익명 1');
  const detail=await h.request('/v1/debates/'+debate.id,{user:null});
  assert.ok(!JSON.stringify(detail.data).includes('alice'));assert.ok(!JSON.stringify(detail.data).includes('user_id'));
});

test('reply parents must belong to the same debate and still exist before moderation and insertion',async()=>{
  const h=harness(),debate=await h.publish(),other=await h.publish();
  const parent=(await send(h,debate,'alice')).data.opinion;
  const calls=h.calls.length;
  assert.equal((await send(h,other,'bob',{parentId:parent.id})).status,404);
  assert.equal(h.calls.length,calls);
  assert.equal((await change(h,debate,parent,'alice','DELETE')).status,200);
  assert.equal((await send(h,debate,'bob',{parentId:parent.id})).status,404);
});

test('only the comment author or administrator can edit and delete, with moderation and revision conflicts enforced',async()=>{
  let reject=false;
  const h=harness({ai:(_env,_mode,task)=>task==='analyze'?sampleAnalysis:reject?{allowed:false,reason:'상대를 비하하는 표현입니다.',suggestion:'근거를 설명해 주시면 좋겠습니다.',flags:['비하']}:{allowed:true,reason:'',suggestion:'',flags:[]}}),debate=await h.publish('post-owner');
  const original=(await send(h,debate,'alice')).data.opinion;
  assert.equal((await change(h,debate,original,'post-owner','PATCH',{content:'다른 사람의 댓글을 변경하려는 시도입니다.'})).status,403);
  assert.equal((await change(h,debate,original,'bob','DELETE')).status,403);
  reject=true;
  const denied=await change(h,debate,original,'alice','PATCH',{content:'상대를 비하하는 잘못된 수정 내용입니다.'});
  assert.equal(denied.status,422);assert.equal(denied.data.code,'REVISE');
  assert.equal(h.DB.sqlite.prepare('SELECT revision FROM opinions WHERE id=?').get(original.id).revision,0);
  reject=false;
  const edited=await change(h,debate,original,'alice','PATCH',{content:'구체적인 근거를 함께 살펴보면 좋겠습니다.'});
  assert.equal(edited.status,200);assert.equal(edited.data.opinion.revision,1);assert.ok(edited.data.opinion.editedAt);assert.equal(edited.data.opinion.alias,original.alias);
  const calls=h.calls.length;
  assert.equal((await change(h,debate,original,'alice','PATCH',{content:'오래된 편집 화면에서 보낸 내용입니다.'})).status,409);assert.equal(h.calls.length,calls);
  const removed=await change(h,debate,edited.data.opinion,'alice','DELETE');
  assert.equal(removed.status,200);assert.equal(removed.data.opinion.content,'');assert.equal(removed.data.opinion.deleted,true);
  assert.equal(removed.data.debate.commentCount,0);assert.equal(removed.data.debate.agreeCount,0);
  assert.equal((await h.request('/v1/me?tab=comments',{user:'alice'})).data.items.length,0);
});

test('deleting a parent preserves replies and removing the latest opinion restores the preceding stance',async()=>{
  const h=harness(),debate=await h.publish();
  const parent=(await send(h,debate,'alice')).data.opinion;
  const reply=(await send(h,debate,'bob',{parentId:parent.id,stance:'disagree'})).data.opinion;
  const newer=(await send(h,debate,'alice',{stance:'disagree'})).data.opinion;
  const deleted=await change(h,debate,newer,'alice','DELETE');
  assert.equal(deleted.data.debate.agreeCount,1);assert.equal(deleted.data.debate.disagreeCount,1);
  await change(h,debate,parent,'alice','DELETE');
  const detail=await h.request('/v1/debates/'+debate.id,{user:'bob'});
  assert.equal(detail.data.opinions.find(o=>o.id===parent.id).content,'');
  assert.equal(detail.data.opinions.find(o=>o.id===reply.id).parentId,parent.id);
  assert.equal(detail.data.debate.commentCount,1);
  assert.equal((await h.request('/v1/debates/'+debate.id,{method:'DELETE'})).status,200);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM opinions').get().n,0);
});

test('an edit racing another write cannot overwrite the newer revision after AI completes',async()=>{
  let duringReview;
  const h=harness({ai:(_env,_mode,task)=>{duringReview?.();return task==='analyze'?sampleAnalysis:{allowed:true,reason:'',suggestion:'',flags:[]};}}),debate=await h.publish();
  const original=(await send(h,debate,'alice')).data.opinion;
  duringReview=()=>h.DB.sqlite.prepare('UPDATE opinions SET content=?,revision=revision+1 WHERE id=?').run('다른 기기에서 먼저 수정한 댓글입니다.',original.id);
  assert.equal((await change(h,debate,original,'alice','PATCH',{content:'오래된 화면의 댓글 수정 내용입니다.'})).status,409);
  assert.equal(h.DB.sqlite.prepare('SELECT content FROM opinions WHERE id=?').get(original.id).content,'다른 기기에서 먼저 수정한 댓글입니다.');
});

test('a reply target deleted during review rolls back its new anonymous number and comment',async()=>{
  let duringReview;
  const h=harness({ai:(_env,_mode,task)=>{duringReview?.();return task==='analyze'?sampleAnalysis:{allowed:true,reason:'',suggestion:'',flags:[]};}}),debate=await h.publish();
  const parent=(await send(h,debate,'alice')).data.opinion;
  duringReview=()=>h.DB.sqlite.prepare("UPDATE opinions SET content='',deleted_at=? WHERE id=?").run(Date.now(),parent.id);
  const result=await send(h,debate,'bob',{parentId:parent.id});assert.equal(result.status,404);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM debate_participants WHERE user_id=?').get('bob').n,0);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) n FROM opinions WHERE user_id=?').get('bob').n,0);
});

test('existing opinions migrate to sequential stable aliases without losing content or authors',()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_debates.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO debates VALUES(?,?,?,?,?,?,?,?,?)').run('debate','analysis','owner','제목','설명','[]','찬성','반대',1);
  const insert=db.prepare('INSERT INTO opinions(id,debate_id,user_id,alias,stance,content,created_at) VALUES(?,?,?,?,?,?,?)');
  insert.run('one','debate','bob','익명 HASHB','agree','먼저 작성한 원문',10);
  insert.run('two','debate','alice','익명 HASHA','disagree','나중에 작성한 원문',20);
  insert.run('three','debate','bob','익명 HASHB','agree','다시 작성한 원문',30);
  db.exec(readFileSync(new URL('../migrations/0002_opinion_threads.sql',import.meta.url),'utf8'));
  const rows=db.prepare('SELECT * FROM opinions ORDER BY created_at').all();
  assert.deepEqual(rows.map(row=>row.alias),['익명 1','익명 2','익명 1']);
  assert.deepEqual(rows.map(row=>row.content),['먼저 작성한 원문','나중에 작성한 원문','다시 작성한 원문']);
  assert.deepEqual(rows.map(row=>row.user_id),['bob','alice','bob']);
  insert.run('four','debate','charlie','익명 OLD_HASH','agree','배포 전 코드에서 작성한 원문',40);
  assert.equal(db.prepare('SELECT alias FROM opinions WHERE id=?').get('four').alias,'익명 3');
  db.close();
});
