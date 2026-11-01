import * as THREE from 'three';
import {createMindyStage} from '../../visuals/mindy-stage.js';

const concepts=[
  {name:'햇살 드는 상담실',eyebrow:'01 · SUNLIT ROOM',title:'당신의 이야기에,<br>살며시 귀 기울여요.',description:'햇살이 스미는 작은 공간. 원래 모습 그대로의 마인디가 아주 살짝 고개를 끄덕이며, 처음 꺼내는 이야기를 기다려요.',tags:['원본 자세와 표정','창빛과 잎 그림자','윤곽을 살린 입체 볼륨'],color:'#f0f4f7'},
  {name:'마음을 전하는 편지',eyebrow:'02 · LETTERS OF CARE',title:'작은 마음이 모여,<br>커다란 위로가 돼요.',description:'마인디 곁으로 전해지는 편지와 작은 하트. 원래 자세를 유지한 채 꼬리와 가방이 미세하게 움직이며 응원의 순간을 만들어요.',tags:['미세한 꼬리와 가방 모션','입체 편지와 하트','원본 색과 무늬 유지'],color:'#f8f1eb'},
  {name:'고요한 밤의 기록',eyebrow:'03 · QUIET JOURNAL',title:'오늘의 마음을,<br>천천히 내려놓아요.',description:'하루가 저무는 푸른 방. 익숙한 모습의 마인디 곁에서 책장이 넘어가고, 작은 조명이 숨처럼 은은하게 밝아져요.',tags:['원본 자세를 지키는 모션','자동으로 넘어가는 책장','깊은 남색과 따뜻한 조명'],color:'#19263f'}
];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const host=document.getElementById('scene');
const loading=document.getElementById('loading');
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}
catch{
  loading.innerHTML='<strong>3D 화면을 열지 못했어요.</strong><span>Chrome 또는 Edge에서 하드웨어 가속을 켜고 다시 열어주세요.</span>';
  document.body.classList.add('no-webgl');
}
if(renderer)start().catch(error=>{console.error(error);loading.hidden=false;loading.innerHTML='<strong>3D 화면을 준비하지 못했어요.</strong><span>파일을 다시 열어주세요.</span>';});
async function start(){
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
  const stage=await createMindyStage(renderer,document.querySelector('.reference-art img'));
  const {scene,camera,world,model}=stage;
  let selected=Math.max(0,Math.min(2,Number(document.body.dataset.initial)||0));
  let activeTime=0,previous=0,frame=0,lastDraw=0,visible=true,disposed=false;
  let targetYaw=0,currentYaw=0,targetPitch=.02,currentPitch=.02;
  let drag=null,pointer={x:0,y:0},greeting=0,transition=0;
  let size={width:0,height:0};
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  function select(index,focus=false){
    selected=index;const c=concepts[index];document.body.dataset.concept=String(index);
    document.getElementById('concept-title').innerHTML=c.title;
    document.getElementById('concept-description').textContent=c.description;
    document.getElementById('concept-eyebrow').textContent=c.eyebrow;
    document.getElementById('scene-title').textContent=c.name;
    document.getElementById('stage-panel').setAttribute('aria-labelledby','concept-'+index);
    document.getElementById('scene').setAttribute('aria-label',c.name+' — 마인디 3D 장면, 방향키 또는 드래그로 각도 변경');
    document.getElementById('tags').replaceChildren(...c.tags.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
    stage.setVariant(index);
    targetYaw=0;targetPitch=.02;transition=reducedMotion.matches?1:0;
    if(focus)tabs[index].focus();
    if(reducedMotion.matches)draw(0);
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(index));
    tab.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%3;
      else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+2)%3;
      else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;
      event.preventDefault();select(next,true);
    });
  });
  function resize(){
    if(disposed)return;
    const rect=host.getBoundingClientRect();size={width:rect.width,height:rect.height};
    if(!size.width||!size.height)return;
    renderer.setSize(size.width,size.height,false);camera.aspect=size.width/size.height;camera.updateProjectionMatrix();draw(0);
  }
  function draw(dt){
    if(disposed)return;
    const t=reducedMotion.matches?1.4:activeTime;
    currentYaw+=(targetYaw-currentYaw)*Math.min(1,dt*9||1);currentPitch+=(targetPitch-currentPitch)*Math.min(1,dt*9||1);
    world.rotation.y=currentYaw+(reducedMotion.matches?0:pointer.x*.035);
    const distance=Math.max(10,10/Math.max(.45,camera.aspect));
    camera.position.set(0,2.75+currentPitch*3,distance);camera.lookAt(0,1.93,0);
    stage.animate(t,greeting,pointer);
    if(greeting>0)greeting=Math.max(0,greeting-dt*.65);
    transition=Math.min(1,transition+dt*2.6);world.position.y=reducedMotion.matches?0:-.045*(1-transition);
    renderer.render(scene,camera);
  }
  host.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,yaw:targetYaw,pitch:targetPitch,moved:false};host.setPointerCapture(event.pointerId);host.classList.add('dragging');
  });
  host.addEventListener('pointermove',event=>{
    if(drag){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true;targetYaw=THREE.MathUtils.clamp(drag.yaw+dx*.003,-.40,.40);targetPitch=THREE.MathUtils.clamp(drag.pitch+dy*.001,-.05,.16);}
    else if(event.pointerType==='mouse'){const r=host.getBoundingClientRect();pointer.x=(event.clientX-r.left)/r.width-.5;pointer.y=(event.clientY-r.top)/r.height-.5;}
    if(reducedMotion.matches)draw(0);
  });
  const endDrag=event=>{if(drag&&!drag.moved&&!reducedMotion.matches)greeting=1;drag=null;host.classList.remove('dragging');if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);};
  host.addEventListener('pointerup',endDrag);host.addEventListener('pointercancel',()=>{drag=null;host.classList.remove('dragging');});
  host.addEventListener('pointerleave',()=>{pointer={x:0,y:0};});
  host.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft')targetYaw=Math.max(-.40,targetYaw-.10);
    else if(event.key==='ArrowRight')targetYaw=Math.min(.40,targetYaw+.10);
    else if(event.key==='ArrowUp')targetPitch=Math.max(-.05,targetPitch-.04);
    else if(event.key==='ArrowDown')targetPitch=Math.min(.16,targetPitch+.04);
    else if(event.key==='Home'){targetYaw=0;targetPitch=.02;}
    else if(event.key==='Enter'||event.key===' '){greeting=reducedMotion.matches?0:1;}
    else return;event.preventDefault();if(reducedMotion.matches)draw(0);
  });
  function tick(now){
    frame=0;if(disposed||!visible||document.hidden||reducedMotion.matches)return;
    if(now-lastDraw>=1000/40){const dt=previous?Math.min((now-previous)/1000,.05):.025;previous=now;lastDraw=now;activeTime+=dt;draw(dt);}
    frame=requestAnimationFrame(tick);
  }
  function resume(){cancelAnimationFrame(frame);frame=0;previous=0;if(!disposed&&visible&&!document.hidden&&!reducedMotion.matches)frame=requestAnimationFrame(tick);else if(reducedMotion.matches)draw(0);}
  const observer=new ResizeObserver(resize);observer.observe(host);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume();});intersection.observe(host);
  document.addEventListener('visibilitychange',resume);reducedMotion.addEventListener('change',resume);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);loading.hidden=false;loading.innerHTML='<strong>3D 화면이 잠시 멈췄어요.</strong><span>다른 탭을 닫고 이 파일을 다시 열어주세요.</span>';});
  window.addEventListener('pagehide',event=>{cancelAnimationFrame(frame);if(event.persisted)return;disposed=true;observer.disconnect();intersection.disconnect();stage.dispose();renderer.dispose();});
  window.addEventListener('pageshow',event=>{if(event.persisted)resume();});
  select(selected);resize();loading.hidden=true;document.body.classList.add('ready');resume();
  // Read-only diagnostics for local preview verification.
  window.mindyPreview={get activeConcept(){return selected;},get renderedMeshes(){let n=0;scene.traverse(o=>{if(o.isMesh)n++;});return n;},get angle(){return currentYaw;},get animationTime(){return activeTime;},get originalSurface(){return model.root.userData.sourceFaithful===true;}};
}
