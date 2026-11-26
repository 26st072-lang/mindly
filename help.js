/* Public guidance uses the existing meta collection and its admin-only writes. */
const HELP_SECTIONS=[
  {key:'usage',title:'마인들리, 이렇게 이용해요',content:'마인들리는 이름 대신 별명으로 고민과 생각을 나누는 공간이에요.\n처음이라면 “먼저 둘러볼게요”로 이야기를 읽어보세요. 글쓰기, 댓글, 공감, 나의 보관함은 로그인 후 이용할 수 있어요.\n마음 라운지에서는 고민을 나누고 따뜻한 댓글을 남길 수 있어요. 익명 토론 게시판에서는 한 주제에 대한 서로 다른 생각을 나눠요.\n나의 보관함에서는 내가 쓴 글과 댓글, 공감한 이야기를 다시 볼 수 있어요.'},
  {key:'concern',title:'고민을 나눌 때 지켜요',content:'고민 쓰기에서 제목과 내용을 적고, 어울리는 해시태그와 나이대를 골라주세요. 댓글을 받을지도 선택할 수 있어요.\n안전한 익명 활동을 위해 실명, 학교명, 전화번호 등 개인정보를 작성하지 말아 주세요. 다른 사람의 개인정보도 올리지 않아요.\n친구의 고민을 읽을 때는 먼저 마음을 들어주세요. 비웃거나 잘못을 따지기보다 “많이 힘들었겠다”처럼 다정하게 말해요.\n욕설이나 비방 표현이 있으면 수정 안내가 나와요. 작성한 내용은 남아 있으니 직접 고친 뒤 다시 보내주세요.'},
  {key:'debate',title:'토론할 때 지켜요',content:'토론 주제를 직접 적거나 사진으로 초안을 만들 수 있어요. AI가 만든 내용은 틀릴 수 있으니 확인하고 고친 뒤 직접 게시해주세요.\n의견을 남길 때는 찬성 또는 반대를 고르고, 그렇게 생각하는 이유도 함께 적어요.\n내 생각과 달라도 상대방을 존중해요. 사람을 평가하기보다 주제와 이유에 대해 말해요. 해요체 같은 편한 존댓말을 사용해주세요.\n의견과 답글은 1000자까지 쓸 수 있어요. AI가 표현을 확인하고 수정 안내를 보여주면, 직접 고친 뒤 다시 제출해주세요. 제안이 자동으로 입력되지는 않아요.\n근거를 첨부할 수 있어요. 첨부된 자료도 실제로 주장을 뒷받침하는지 함께 살펴봐요.'},
  {key:'prohibited',title:'이런 행동은 하지 않아요',content:'욕설, 비하, 놀림, 따돌림, 협박처럼 다른 사람을 다치게 하는 말은 하지 않아요.\n성별, 나이, 외모, 장애, 출신 등을 이유로 누군가를 낮춰 말하지 않아요.\n실명, 학교명, 연락처, 사진 등으로 다른 사람이 누구인지 드러내거나, 누군가를 사칭하지 않아요.\n폭력적이거나 성적인 내용, 위험한 행동을 부추기는 글, 반복되는 광고와 도배는 올리지 않아요.\n운영자는 다른 사람의 안전과 공간의 약속을 지키기 위해 글이나 댓글을 삭제할 수 있어요.'},
  {key:'faq',title:'자주 묻는 질문',content:'Q. 로그인하지 않아도 볼 수 있나요?\nA. 이야기를 둘러보고 이용 안내와 하단의 상담·문의 연락처를 볼 수 있어요. 글쓰기, 댓글, 공감, 나의 보관함은 로그인이 필요해요.\n\nQ. 회원가입할 때 이메일이 필요한가요?\nA. 새 회원은 아이디와 비밀번호로 가입해요. 기존에 이메일로 가입했다면 그 이메일로 로그인할 수 있어요.\n\nQ. 아이디나 비밀번호를 잊어버렸어요.\nA. 아래 운영자 이메일로 문의해주세요. 문의할 때 비밀번호를 보내지 마세요.\n\nQ. 내가 쓴 글이나 댓글을 고칠 수 있나요?\nA. 내가 쓴 고민 글과 댓글에서 수정하거나 삭제할 수 있어요. 토론 의견을 수정할 때도 표현을 다시 확인해요. 댓글을 삭제해도 그 아래에 달린 답글은 남아요.\n\nQ. 토론에서 내 이름이 보이나요?\nA. 토론 의견에는 “익명 1” 같은 번호가 표시돼요. 같은 토론에서는 같은 번호를 사용해요. 마음 라운지에는 별명이 표시되니, 내용에도 개인정보를 적지 마세요.\n\nQ. 수정 안내가 나오면 내용이 바뀌나요?\nA. 자동으로 바뀌지 않아요. 안내를 확인한 뒤 원래 입력창에서 직접 고치고 다시 보내주세요.\n\nQ. 연결 오류가 나면 어떻게 하나요?\nA. 인터넷 연결을 확인하고 화면의 다시 불러오기나 다시 시도를 눌러주세요. 작성 중인 내용은 화면에 남아 있을 수 있지만, 새로고침하거나 로그아웃하면 사라질 수 있어요.'},
  {key:'contact',title:'운영자에게 문의해요',content:'이용 중 문제가 생기거나 도움이 필요하면 kickinmindly@gmail.com 으로 메일을 보내주세요.\n문제가 생긴 화면, 어떤 동작을 했는지, 오류가 나온 내용을 알려주면 확인에 도움이 돼요. 문제가 있는 글은 제목과 작성 시간도 함께 알려주세요. 화면을 첨부한다면 다른 사람의 개인정보는 가려주세요.\n비밀번호, 전화번호, 학교명 같은 개인정보는 보내지 마세요.\n운영자 메일은 긴급 상담 창구가 아니에요. 위기 상담이 필요할 때는 모든 화면 하단에 있는 상담전화 안내를 확인해주세요.'}
];
function normalizeHelpSections(value){
  return Object.fromEntries(HELP_SECTIONS.map(section=>[section.key,typeof value?.[section.key]==='string'&&value[section.key].trim()?value[section.key]:section.content]));
}
const helpState={sections:normalizeHelpSections(null),draft:null,error:''};
function startHelpEdit(){
  if(!session.isAdmin||!sync.channels.help?.ready)return;
  helpState.draft={...helpState.sections};helpState.error='';render();
  document.getElementById('help-edit-usage')?.focus();
}
function cancelHelpEdit(){
  if(pendingActions.has('help-save'))return;
  helpState.draft=null;helpState.error='';render();
}
async function saveHelp(){
  if(!session.isAdmin||!helpState.draft)return;
  const draft=helpState.draft,generation=authGeneration;
  const sections=Object.fromEntries(HELP_SECTIONS.map(({key})=>[key,draft[key].trim()]));
  if(Object.values(sections).some(text=>!text||text.length>6000)){
    helpState.error='각 항목을 1~6000자로 입력해주세요.';render();return;
  }
  helpState.error='';
  return runAction('help-save',async()=>{
    try{
      await db.collection('meta').doc('help').set({sections,updatedAt:Date.now()});
      if(generation!==authGeneration)return;
      helpState.sections=sections;
      if(helpState.draft===draft)helpState.draft=null;
      toast('이용 안내 및 FAQ를 저장했어요.');
    }catch{
      if(generation!==authGeneration)return;
      helpState.error='저장하지 못했어요. 작성한 내용은 유지돼요. 연결을 확인하고 다시 저장해주세요.';
    }
  });
}
function renderHelp(){
  const editing=session.isAdmin&&helpState.draft;
  return `<div class="page-header"><button class="back-btn" onclick="goto('main',{mainTab:'home'})">${ICONS.back}</button><h1 class="help-page-title">이용 안내 및 FAQ</h1></div>
    <div class="help-wrap"><p class="help-intro">처음이어도 괜찮아요. 함께 편안하게 이야기하는 방법을 알아봐요.</p>
    ${syncNotice('help')}
    ${session.isAdmin&&!editing?`<button class="btn-primary" onclick="startHelpEdit()" ${sync.channels.help?.ready?'':'disabled'}>안내 및 FAQ 수정</button>`:''}
    ${editing?'<p class="field-help">저장한 내용은 로그인하지 않은 사용자에게도 보여요. 각 항목을 1~6000자로 작성해주세요.</p>':''}
    <div class="help-sections">${HELP_SECTIONS.map(section=>`<section class="help-section" aria-labelledby="help-title-${section.key}"><h2 id="help-title-${section.key}">${section.title}</h2>${editing?`<label class="sr-only" for="help-edit-${section.key}">${section.title}</label><textarea id="help-edit-${section.key}" maxlength="6000" rows="10" data-lock-action="help-save" oninput="helpState.draft.${section.key}=this.value">${escapeHtml(helpState.draft[section.key])}</textarea>`:`<p>${escapeHtml(helpState.sections[section.key])}</p>`}</section>`).join('')}</div>
    ${editing?`<form class="help-edit-actions" onsubmit="event.preventDefault();saveHelp();">${helpState.error?`<p class="form-error" role="alert">${escapeHtml(helpState.error)}</p>`:''}<button type="submit" class="btn-primary" data-action="help-save">변경 내용 저장</button><button type="button" class="btn-ghost" data-disable-while="help-save" onclick="cancelHelpEdit()">취소</button></form>`:''}</div>`;
}
document.addEventListener('mindly:session-changed',()=>{helpState.draft=null;helpState.error='';});
