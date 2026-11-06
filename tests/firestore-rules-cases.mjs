export function firestoreRuleCases(){
  const mine={id:'mine',authorId:'alice',authorNickname:'익명 친구',authorAvatar:0,content:'기존에 작성한 댓글입니다.',createdAt:1000};
  const other={...mine,id:'other',authorId:'bob',content:'다른 사람의 댓글입니다.'};
  const before={authorId:'post-owner',title:'고민',content:'고민 내용',hearts:[],comments:[mine,other]};
  const edited={...mine,content:'정중하게 수정한 댓글입니다.',editedAt:2000,editedByAdmin:false};
  const deleted={...mine,content:'',deleted:true,deletedAt:2000};
  const reply={...mine,id:'reply',content:'다른 의견에도 귀 기울이고 싶어요.',parentId:'other',createdAt:2000};
  const scenarios=[
    ['own edit','alice',before,{...before,comments:[edited,other]},'ALLOW'],
    ['own deletion','alice',before,{...before,comments:[deleted,other]},'ALLOW'],
    ['own reply','alice',before,{...before,comments:[mine,other,reply]},'ALLOW'],
    ['another author cannot edit','bob',before,{...before,comments:[edited,other]},'DENY'],
    ['another author cannot delete','bob',before,{...before,comments:[deleted,other]},'DENY'],
    ['post owner cannot edit another comment','post-owner',before,{...before,comments:[edited,other]},'DENY'],
    ['cannot forge reply author','bob',before,{...before,comments:[mine,other,reply]},'DENY'],
    ['cannot change the original author','alice',before,{...before,comments:[{...edited,authorId:'bob'},other]},'DENY'],
    ['cannot silently remove another comment','alice',before,{...before,comments:[edited]},'DENY'],
    ['cannot overwrite a reply while editing','alice',{...before,comments:[mine,other,reply]},{...before,comments:[edited,other]},'DENY'],
    ['cannot restore a deleted comment','alice',{...before,comments:[deleted,other]},{...before,comments:[edited,other]},'DENY'],
    ['post editing stays available','post-owner',before,{...before,title:'수정한 고민 제목'},'ALLOW'],
    ['hearts stay available','bob',before,{...before,hearts:['bob']},'ALLOW'],
    ['administrator moderation stays available','admin',before,{...before,comments:[deleted,other]},'ALLOW'],
    ['guest cannot edit',null,before,{...before,comments:[edited,other]},'DENY'],
  ];
  return scenarios.map(([name,user,resource,data,expectation])=>({name,test:{expectation,request:{path:'/databases/(default)/documents/posts/rules-test',method:'update',auth:user?{uid:user,token:{email:user==='admin'?'kickin_mindly@gmail.com':user+'@example.test'}}:null,resource:{data}},resource:{data:resource}}}));
}
