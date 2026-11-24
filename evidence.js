/* Evidence belongs to a draft, never to the modal. No provider key is used here. */
const evidenceState={drafts:new Map(),dialog:null,controllers:new Set()};
const evidenceRelations={supports:'직접 뒷받침',partial:'부분적으로 뒷받침',contradicts:'반대 근거',related:'관련 자료'};
const evidenceTypes={article:'기사',paper:'학술 논문',statistics:'통계',report:'보고서',web:'웹 자료'};
const evidenceTrust={high:'높음',medium:'보통',low:'낮음',unverified:'판단 유보'};
function evidenceKey(d){return [d.kind,d.id,d.parentId||''].join(':');}
function evidenceDraft(d){const key=evidenceKey(d);if(!evidenceState.drafts.has(key))evidenceState.drafts.set(key,[]);return evidenceState.drafts.get(key);}
function seedEvidence(d,items){evidenceState.drafts.set(evidenceKey(d),[...(items||[])]);}
function evidenceIds(d){return evidenceDraft(d).map(s=>s.id);}
function evidenceBibliography(d){return evidenceDraft(d).map(s=>({id:s.id,url:s.url,title:s.title,publisher:s.publisher,publishedAt:s.publishedAt||null,type:s.type||'web'}));}
function clearEvidenceIf(d,ids){if(JSON.stringify(evidenceIds(d))===JSON.stringify(ids))evidenceState.drafts.delete(evidenceKey(d));}
function safeEvidenceHref(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function evidenceYear(source){return source.publishedAt?String(source.publishedAt).slice(0,4):'발행일 미확인';}
function renderEvidenceList(items){
  const sources=(items||[]).filter(s=>safeEvidenceHref(s.url)).slice(0,8);if(!sources.length)return '';
  return `<details class="comment-evidence"><summary>📚 첨부된 근거 ${sources.length}개</summary><p>자료 첨부는 주장의 사실 여부가 검증되었다는 뜻이 아니에요.</p><ol>${sources.map(s=>`<li><a href="${escapeHtml(safeEvidenceHref(s.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title||s.url)} ↗</a><span>${escapeHtml(s.publisher||new URL(s.url).hostname)} · ${escapeHtml(evidenceYear(s))}</span></li>`).join('')}</ol></details>`;
}
function renderEvidenceComposer(d){
  if(!session.userId||d.kind==='concern'||d.kind==='concern-edit')return '';
  const items=evidenceDraft(d),args=commentArgs(d);
  return `<div class="evidence-composer" data-key="evidence-${escapeHtml(evidenceKey(d))}"><button id="evidence-open-${escapeHtml(evidenceKey(d))}" type="button" class="evidence-add" onclick="openEvidenceDialog(${args})">📎 근거 첨부</button><span class="evidence-count">${items.length} / 8개</span>${items.length?`<ul class="evidence-chips">${items.map(s=>`<li><span title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span><button type="button" aria-label="${escapeHtml(s.title)} 첨부 삭제" onclick="removeDraftEvidence(${args},${commentArgs(s.id)})">×</button></li>`).join('')}</ul>`:''}</div>`;
}
function removeDraftEvidence(d,id){evidenceState.drafts.set(evidenceKey(d),evidenceDraft(d).filter(s=>s.id!==id));invalidateEvidenceRequest(d);render();}
function invalidateEvidenceRequest(d){if(d.kind==='debate')opinionDraft(d.id,d.parentId).requestId=null;}
function evidenceText(d){
  if(d.kind==='concern')return ui.commentDrafts[d.id]||'';
  if(d.kind==='concern-edit')return ui.commentEditDraft||'';
  if(d.kind==='debate-edit')return debateState.commentEdit?.content||'';
  return opinionDraft(d.id,d.parentId).content;
}
function evidenceContext(d){
  if(d.kind.startsWith('concern')){const p=DB.posts.find(p=>p.id===d.id),parentId=d.kind==='concern-edit'?p?.comments.find(c=>c.id===d.parentId)?.parentId:d.parentId;return [p?.title,p?.content,parentId?p?.comments.find(c=>c.id===parentId)?.content:''].filter(Boolean).join('\n').slice(0,3000);}
  const parentId=d.kind==='debate-edit'?findDebateOpinion(d.id,d.parentId)?.parentId:d.parentId;
  const debate=debateState.details.get(d.id)?.debate,parent=parentId?findDebateOpinion(d.id,parentId):null;
  return [debate?.title,debate?.summary,parent?.content].filter(Boolean).join('\n').slice(0,3000);
}
function openEvidenceDialog(d){
  if(!requireLogin())return;
  evidenceState.dialog={descriptor:d,mode:'choose',url:'',preview:null,results:null,selected:new Set(),phase:'',error:'',consent:false,busy:false,content:evidenceText(d).trim(),context:evidenceContext(d),returnId:document.activeElement?.id};
  render();setTimeout(()=>document.querySelector('#evidence-dialog button')?.focus(),0);
}
function closeEvidenceDialog(){const d=evidenceState.dialog;if(!d)return;evidenceState.dialog=null;render();document.getElementById(d.returnId)?.focus({preventScroll:true});}
function evidenceMode(mode){const d=evidenceState.dialog;if(!d||d.busy)return;d.mode=mode;d.error='';render();setTimeout(()=>document.getElementById(mode==='manual'?'evidence-url':'evidence-consent')?.focus(),0);if(mode==='ai')debateRequest('/v1/evidence/config').then(config=>{if(d===evidenceState.dialog){d.config=config;render();}}).catch(()=>{});}
function addEvidenceSources(sources){
  const d=evidenceState.dialog;if(!d)return;const items=evidenceDraft(d.descriptor),byUrl=new Map(items.map(s=>[s.url,s]));
  for(const source of sources.filter(Boolean))if(byUrl.size<8&&!byUrl.has(source.url)&&safeEvidenceHref(source.url))byUrl.set(source.url,source);
  if(byUrl.size===items.length){toast(items.length===8?'근거는 최대 8개까지 첨부할 수 있어요.':'이미 첨부한 자료예요.');return;}
  evidenceState.drafts.set(evidenceKey(d.descriptor),[...byUrl.values()]);invalidateEvidenceRequest(d.descriptor);closeEvidenceDialog();toast('작성 중인 글에 근거를 첨부했어요.');
}
async function previewEvidenceURL(){
  const d=evidenceState.dialog;if(!d||d.busy)return;d.busy=true;d.error='';d.preview=null;render();
  try{const data=await debateRequest('/v1/evidence/url',{method:'POST',body:{url:d.url.trim()}});if(d===evidenceState.dialog)d.preview=data.source;}
  catch(error){if(d===evidenceState.dialog)d.error=error.message;}
  finally{if(d===evidenceState.dialog){d.busy=false;render();}}
}
function updateEvidenceURL(value){const d=evidenceState.dialog;if(!d)return;d.url=value;d.preview=null;document.querySelector('.evidence-preview')?.remove();}
async function requestEvidenceSearch(body,onEvent,refresh=false){
  const controller=new AbortController();evidenceState.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),180000);
  try{
    if(!auth?.currentUser)throw new Error('로그인 후 이용해주세요.');
    const token=await getDebateToken(auth.currentUser,refresh,controller.signal);
    const response=await fetch(workerEndpoint()+'/v1/evidence/search',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
    if(response.status===401&&!refresh)return requestEvidenceSearch(body,onEvent,true);
    if(!response.headers.get('Content-Type')?.includes('application/x-ndjson')){
      let data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message||'검색하지 못했어요.'),{code:data.code});
      while(data.jobId&&!['done','error'].includes(data.phase)){
        onEvent(data);await new Promise(resolve=>setTimeout(resolve,1400));if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
        data=await debateRequest('/v1/evidence/jobs/'+data.jobId);
      }onEvent(data);return;
    }
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',finished=false;
    for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>200000)throw new Error('검색 응답이 너무 커요. 다시 시도해주세요.');const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)if(line.trim()){const event=JSON.parse(line);if(['done','error'].includes(event.phase))finished=true;onEvent(event);}}
    if(!finished)throw new Error('검색 연결이 끊어졌어요. 다시 검색하면 저장된 결과를 확인할 수 있어요.');
  }catch(error){if(error.name==='AbortError')throw new Error('검색 시간이 초과됐어요. 작성한 글은 유지됩니다. 다시 시도해주세요.');throw error;}
  finally{clearTimeout(timer);evidenceState.controllers.delete(controller);}
}
async function searchDraftEvidence(provider='combined'){
  const d=evidenceState.dialog;if(!d||d.busy)return;
  if(!d.consent){d.error='Google AI에 작성 내용을 보내는 데 동의해주세요.';render();return;}
  if(d.content.length<5){d.error='먼저 댓글이나 답글을 5자 이상 작성해주세요.';render();return;}
  d.busy=true;d.error='';d.results=null;d.selected.clear();d.phase='analyzing';render();
  try{await requestEvidenceSearch({content:d.content,context:d.context,consent:true,provider},event=>{
    if(d!==evidenceState.dialog)return;d.phase=event.phase;
    if(event.phase==='error'){d.error=event.message;d.busy=false;}
    if(event.phase==='done'){d.results=event;d.busy=false;d.phase='';}
    render();
  });}catch(error){if(d===evidenceState.dialog)d.error=error.message;}
  finally{if(d===evidenceState.dialog){d.busy=false;d.phase='';render();}}
}
function toggleEvidenceSelection(id,checked){const d=evidenceState.dialog;if(!d)return false;if(checked&&d.selected.size+evidenceDraft(d.descriptor).length>=8){toast('근거는 최대 8개까지 첨부할 수 있어요.');return false;}if(checked)d.selected.add(id);else d.selected.delete(id);render();return true;}
function attachSelectedEvidence(){const d=evidenceState.dialog;if(d?.results)addEvidenceSources(d.results.sources.filter(s=>d.selected.has(s.id)));}
function renderEvidenceCard(s){
  const d=evidenceState.dialog,attached=evidenceDraft(d.descriptor).some(item=>item.url===s.url);
  return `<article class="evidence-result"><label class="evidence-result-heading"><input type="checkbox" aria-label="${escapeHtml(s.title)} 선택" ${d.selected.has(s.id)?'checked':''} ${attached?'disabled':''} onchange="if(toggleEvidenceSelection(${commentArgs(s.id)},this.checked)===false)this.checked=false"><strong>${escapeHtml(s.title)}</strong>${attached?'<span>첨부됨</span>':''}</label><div class="evidence-meta">${escapeHtml(s.publisher)} · ${escapeHtml(s.publishedAt||'발행일 미확인')} · ${escapeHtml(evidenceTypes[s.type]||'웹 자료')}</div><span class="evidence-relation relation-${escapeHtml(s.relation)}">${escapeHtml(evidenceRelations[s.relation]||'관련 자료')}</span><p>${escapeHtml(s.summary)}</p><dl><dt>주장과의 연관성</dt><dd>${escapeHtml(s.relationReason)}</dd><dt>신뢰도: ${escapeHtml(evidenceTrust[s.trust]||'판단 유보')}</dt><dd>${escapeHtml(s.trustReason)}</dd></dl><p class="evidence-verification">${s.originalChecked?'원문 일부 확인 · 전체 내용과 연구 방법은 직접 확인해주세요.':'원문 내용 미검증 · 검색 또는 서지 정보로만 확인했어요.'}</p><a class="evidence-original" href="${escapeHtml(safeEvidenceHref(s.url))}" target="_blank" rel="noopener noreferrer">원문 보기 ↗ <span>${escapeHtml(s.url)}</span></a></article>`;
}
function renderEvidenceDialog(){
  const d=evidenceState.dialog;if(!d)return '';
  const phase={analyzing:'주장 분석 중',searching:'관련 자료 검색 중',reviewing:'출처 검토 중'}[d.phase]||'주소 확인 중';
  let body='';
  if(d.mode==='choose')body=`<p>자료를 첨부할 방법을 선택해주세요.</p><div class="evidence-methods"><button type="button" onclick="evidenceMode('manual')"><strong>직접 링크 추가</strong><span>기사·논문·통계·보고서의 URL 확인</span></button><button type="button" onclick="evidenceMode('ai')"><strong>AI로 근거 찾기</strong><span>작성한 글을 분석하고 실제 자료 검색</span></button></div>`;
  if(d.mode==='manual')body=`<form onsubmit="event.preventDefault();previewEvidenceURL()"><label for="evidence-url">자료 URL</label><div class="evidence-url-row"><input id="evidence-url" type="url" required maxlength="2000" placeholder="https://…" value="${escapeHtml(d.url)}" oninput="updateEvidenceURL(this.value)" ${d.busy?'readonly':''}><button type="submit" class="btn-primary" ${d.busy?'disabled':''}>정보 확인</button></div></form>${d.preview?`<div class="evidence-preview"><h3>${escapeHtml(d.preview.title)}</h3><p>${escapeHtml(d.preview.publisher)} · ${escapeHtml(d.preview.publishedAt||'발행일 미확인')} · ${escapeHtml(evidenceTypes[d.preview.type]||'웹 자료')}</p><p class="field-help">${escapeHtml(d.preview.notice)}</p><a href="${escapeHtml(safeEvidenceHref(d.preview.url))}" target="_blank" rel="noopener noreferrer">원문 확인 ↗</a><button class="btn-primary" type="button" onclick="addEvidenceSources([evidenceState.dialog.preview])">이 근거 첨부</button></div>`:''}<p class="field-help">공개된 주소만 사용할 수 있어요. 안전하게 읽을 수 없는 사이트는 제목·출처·발행일이 미확인으로 표시될 수 있어요.</p>`;
  if(d.mode==='ai')body=`<div class="evidence-draft-preview"><span>작성 중인 글</span><p>${escapeHtml(d.content||'작성한 댓글이 없어요.')}</p></div><label class="evidence-consent"><input id="evidence-consent" type="checkbox" ${d.consent?'checked':''} ${d.busy?'disabled':''} onchange="evidenceState.dialog.consent=this.checked">작성 내용과 관련 문맥을 Google AI에 보내 분석하고, 추출한 검색어를 뉴스·학술 검색 서비스에 보내는 데 동의해요. 무료 API의 입력은 Google의 서비스 개선에 사용될 수 있어요. 개인정보는 제외해주세요.</label><div class="evidence-search-actions"><button type="button" class="btn-primary" onclick="searchDraftEvidence()" ${d.busy?'disabled':''}>무료 통합 검색</button><button type="button" class="evidence-add" onclick="searchDraftEvidence('academic')" ${d.busy?'disabled':''}>무료 학술자료 검색 (Crossref)</button>${d.config?.googleReady?`<button type="button" class="evidence-add" onclick="searchDraftEvidence('google')" ${d.busy?'disabled':''}>Google 검색으로 근거 찾기</button>`:''}</div><p class="field-help">뉴스 기사와 학술자료의 실제 검색 결과를 Gemini가 분석해요. 원문을 확인하지 못한 자료는 미검증으로 표시해요. 추가 검색 API 키 없이 이용할 수 있어요.</p>${d.results?`<div class="evidence-analysis"><h3>핵심 주장·논점</h3><ol>${(d.results.claims||[]).map(c=>`<li>${escapeHtml(c.text)}<details><summary>검색어 보기</summary><p>한국어: ${escapeHtml(c.queryKo)}<br>영어: ${escapeHtml(c.queryEn)}</p></details></li>`).join('')}</ol><p class="field-help">${d.results.provider==='crossref'?'Crossref 학술자료 검색':d.results.provider==='news-crossref'?'뉴스·학술자료 통합 검색':'Google Search 기반 검색'}${d.results.cached?' · 저장된 검색 결과 (최대 6시간)':''}</p>${(d.results.warnings||[]).map(message=>`<p class="field-help" role="status">${escapeHtml(message)}</p>`).join('')}${d.results.sources.some(s=>s.relation==='contradicts')?'<p class="evidence-counter">작성한 주장에 반대되는 근거도 포함되어 있어요.</p>':''}</div><div class="evidence-results">${d.results.sources.length?d.results.sources.map(renderEvidenceCard).join(''):`<div class="empty-state"><p>확인 가능한 관련 자료를 찾지 못했어요. 작성한 글과 기존 첨부는 유지돼요.</p><button type="button" class="evidence-add" onclick="searchDraftEvidence('combined')">${d.results.provider==='crossref'?'기사까지 검색 넓히기':'다시 검색하기'}</button></div>`}</div>${d.results.searchSuggestions?`<iframe class="evidence-google-suggestions" title="Google 검색 제안" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="${escapeHtml(d.results.searchSuggestions)}"></iframe>`:''}${d.results.sources.length?`<div class="evidence-selection"><span>${d.selected.size}개 선택</span><button type="button" class="btn-primary" onclick="attachSelectedEvidence()" ${d.selected.size?'':'disabled'}>선택한 근거 첨부</button></div>`:''}`:''}`;
  return `<div class="evidence-overlay" onclick="if(event.target===this)closeEvidenceDialog()"><section id="evidence-dialog" class="evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-dialog-title"><header><div>${d.mode!=='choose'?`<button type="button" class="evidence-back" onclick="evidenceMode('choose')" ${d.busy?'disabled':''}>← 방법 선택</button>`:''}<h2 id="evidence-dialog-title">근거 첨부</h2></div><button type="button" class="evidence-close" aria-label="근거 첨부 닫기" onclick="closeEvidenceDialog()">×</button></header><p class="evidence-disclaimer">근거가 첨부되어도 주장이 검증되거나 사실로 확정되는 것은 아니에요.</p>${body}${d.busy?`<div class="evidence-loading" role="status" aria-live="polite"><span class="evidence-spinner" aria-hidden="true"></span>${phase}…</div>`:''}${d.error?`<p class="form-error" role="alert">${escapeHtml(d.error)}</p>`:''}</section></div>`;
}
function resetEvidenceState(){for(const c of evidenceState.controllers)c.abort();evidenceState.controllers.clear();evidenceState.dialog=null;evidenceState.drafts.clear();}
document.addEventListener('keydown',event=>{
  if(!evidenceState.dialog)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeEvidenceDialog();return;}
  if(event.key!=='Tab')return;
  const focusable=[...document.querySelectorAll('#evidence-dialog button:not(:disabled),#evidence-dialog input:not(:disabled),#evidence-dialog a[href],#evidence-dialog summary,#evidence-dialog iframe')];
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
},true);
