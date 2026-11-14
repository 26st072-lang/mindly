/* A narrow relay on the Mindly application only. Firebase tokens never cross it. */
(()=>{
  if(window.__mindlyContentRelay)return;window.__mindlyContentRelay=true;
  const pending=new Map(),channel='mindly-extension-v1';
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(sender.id!==chrome.runtime.id||sender.tab||message?.type!=='MINDLY_BRIDGE')return;
    if(!['status','analyzeText','rewrite','import'].includes(message.operation))return;
    const id=crypto.randomUUID();
    const timer=setTimeout(()=>{pending.delete(id);sendResponse({ok:false,error:{code:'BRIDGE_TIMEOUT',message:'마인들리 연결이 지연되고 있어요. 웹사이트를 새로고침한 뒤 다시 실행해주세요.'}});},message.operation==='status'?1500:70_000);
    pending.set(id,{sendResponse,timer});
    window.postMessage({channel,direction:'to-page',id,operation:message.operation,payload:message.payload||{}},location.origin);
    return true;
  });
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!==channel||event.data.direction!=='to-extension')return;
    const item=pending.get(event.data.id);if(!item)return;
    pending.delete(event.data.id);clearTimeout(item.timer);
    item.sendResponse(event.data.ok?{ok:true,result:event.data.result}:{ok:false,error:event.data.error});
  });
})();
