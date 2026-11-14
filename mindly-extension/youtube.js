/* Reads a draft only when its author presses the injected button. Never posts comments. */
(()=>{
  if(window.__mindlyYoutubeExtension)return;window.__mindlyYoutubeExtension=true;
  const editors=new WeakMap(),hosts=new Set(),requests=new Map();let timer;
  const read=editor=>editor.innerText.replace(/\r\n/g,'\n').trim();
  function attach(){
    document.querySelectorAll('ytd-commentbox #contenteditable-root[contenteditable="true"],ytd-commentbox [contenteditable="true"][role="textbox"]').forEach(editor=>{
      if(editors.get(editor)?.isConnected)return;
      const host=document.createElement('span');host.style.cssText='display:block;padding:8px 0;';host.dataset.mindlyTone='';
      const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),button=document.createElement('button');
      style.textContent='button{font:500 13px/1.5 system-ui,sans-serif;color:#39445c;background:#eef0fa;border:1px solid #c9cfe0;border-radius:18px;padding:7px 13px;cursor:pointer}button:hover{background:#e1e5f3}button:focus-visible{outline:2px solid #606ba0;outline-offset:3px}p{font:12px/1.5 system-ui,sans-serif;color:#8a432c;margin:5px 0}';
      button.type='button';button.textContent='✦ 마인들리 말투 다듬기';
      const notice=document.createElement('p');notice.setAttribute('role','status');notice.hidden=true;
      button.addEventListener('click',async()=>{
        const original=read(editor);
        if(!original){notice.textContent='댓글을 작성한 뒤 눌러주세요.';notice.hidden=false;return;}
        if(original.length>2000){notice.textContent='말투 교정은 2,000자까지 지원해요.';notice.hidden=false;return;}
        const requestId=crypto.randomUUID();requests.set(requestId,{editor,original});
        while(requests.size>5)requests.delete(requests.keys().next().value);
        try{
          const response=await chrome.runtime.sendMessage({type:'YOUTUBE_DRAFT',original,requestId});
          notice.textContent=response?.ok?'옆의 마인들리 패널에서 전송 내용을 확인해주세요.':response?.error?.message||'확장 프로그램을 다시 열어주세요.';
        }catch{notice.textContent='확장 프로그램을 다시 불러왔다면 유튜브 페이지도 새로고침해주세요.';}
        notice.hidden=false;
      });
      shadow.append(style,button,notice);editor.parentElement.append(host);editors.set(editor,host);hosts.add(host);
    });
    for(const host of hosts)if(!host.isConnected)hosts.delete(host);
  }
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(attach,150);});
  observer.observe(document.body,{subtree:true,childList:true});attach();
  const listener=(message,sender,sendResponse)=>{
    if(sender.id!==chrome.runtime.id||sender.tab)return;
    if(message?.type==='YOUTUBE_DISABLE'){
      observer.disconnect();clearTimeout(timer);for(const host of hosts)host.remove();requests.clear();chrome.runtime.onMessage.removeListener(listener);delete window.__mindlyYoutubeExtension;sendResponse({ok:true});return;
    }
    if(message?.type!=='APPLY_REWRITE')return;
    const target=requests.get(message.requestId);
    if(!target?.editor.isConnected){sendResponse({ok:false,error:{code:'INPUT_GONE',message:'댓글 입력창이 바뀌었어요. 말투 다듬기를 다시 눌러주세요.'}});return;}
    if(target.original!==message.original||read(target.editor)!==target.original){sendResponse({ok:false,error:{code:'DRAFT_CHANGED',message:'댓글을 추가로 수정하셨어요. 현재 댓글을 다시 검사해주세요.'}});return;}
    if(typeof message.text!=='string'||!message.text.trim()||message.text.length>2000){sendResponse({ok:false,error:{code:'INVALID_INPUT',message:'수정 제안의 길이를 확인해주세요.'}});return;}
    const editor=target.editor;editor.focus();
    const selection=window.getSelection();selection.selectAllChildren(editor);
    const inserted=document.execCommand('insertText',false,message.text);
    if(!inserted)editor.textContent=message.text;
    editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:message.text}));
    requests.delete(message.requestId);sendResponse({ok:true});
  };
  chrome.runtime.onMessage.addListener(listener);
})();
