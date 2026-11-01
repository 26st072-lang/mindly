import * as THREE from 'three';
import {createMindyStage} from './mindy-stage.js';

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let current=null,pending=false,timer=null,serial=0,unavailable=false;

async function createEntryScene(){
  const image=new Image();image.src='assets/mascot.png';await image.decode();
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  let stage;
  try{stage=await createMindyStage(renderer,image,{withReply:true});}
  catch(error){renderer.dispose();renderer.forceContextLoss();throw error;}
  const {scene,camera,world}=stage;
  let host=null,disposed=false,lost=false,visible=true,time=0,lastTime=0,lastDraw=0;
  const pointer={x:0,y:0},smoothed={x:0,y:0};
  const isNight=()=>document.documentElement.dataset.theme==='night';
  function draw(t){
    if(disposed||lost||!host?.isConnected||!host.clientWidth||!host.clientHeight)return;
    smoothed.x+=(pointer.x-smoothed.x)*.07;smoothed.y+=(pointer.y-smoothed.y)*.07;
    world.rotation.y=reducedMotion.matches?0:smoothed.x*.045;
    const distance=Math.max(10,10/Math.max(.45,camera.aspect));
    camera.position.set(0,2.81,distance);camera.lookAt(0,1.93,0);
    stage.animate(t);renderer.render(scene,camera);
    host.dataset.ready='true';host.dataset.scene=isNight()?'night':'day';
  }
  function resize(){
    if(disposed||!host?.isConnected)return;
    const {width,height}=host.getBoundingClientRect();if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();draw(reducedMotion.matches?1.4:time);
  }
  function loop(now){
    if(disposed)return;
    const interval=host?.clientWidth<360?1000/30:1000/40;
    if(now-lastDraw<interval)return;
    if(lastTime)time+=Math.min((now-lastTime)/1000,.06);lastTime=now;lastDraw=now;draw(time);
  }
  function run(){lastTime=0;renderer.setAnimationLoop(!disposed&&!lost&&visible&&!document.hidden&&!reducedMotion.matches?loop:null);if(reducedMotion.matches)draw(1.4);}
  function themeChanged(){stage.setVariant(isNight()?2:0);draw(reducedMotion.matches?1.4:time);}
  const onPointer=event=>{if(event.pointerType!=='mouse'||reducedMotion.matches||!host)return;const rect=host.getBoundingClientRect();pointer.x=THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width-.5,-.5,.5);};
  const onLeave=()=>{pointer.x=0;pointer.y=0;};
  const resizeObserver=new ResizeObserver(resize),intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;run();});
  const contextLost=event=>{event.preventDefault();lost=true;renderer.setAnimationLoop(null);if(host)host.dataset.ready='false';};
  const contextRestored=()=>{lost=false;resize();run();};
  renderer.domElement.addEventListener('webglcontextlost',contextLost);renderer.domElement.addEventListener('webglcontextrestored',contextRestored);
  document.addEventListener('visibilitychange',run);document.addEventListener('mindly:theme-changed',themeChanged);reducedMotion.addEventListener('change',run);
  function detach(){
    host?.closest('.entry-art')?.removeEventListener('pointermove',onPointer);host?.closest('.entry-art')?.removeEventListener('pointerleave',onLeave);
    resizeObserver.disconnect();intersection.disconnect();
  }
  return {
    get host(){return host;},
    mount(nextHost){
      detach();host=nextHost;host.append(renderer.domElement);
      host.closest('.entry-art')?.addEventListener('pointermove',onPointer,{passive:true});host.closest('.entry-art')?.addEventListener('pointerleave',onLeave,{passive:true});
      stage.setVariant(isNight()?2:0);resizeObserver.observe(host);intersection.observe(host);resize();run();
    },
    dispose(){
      if(disposed)return;disposed=true;renderer.setAnimationLoop(null);detach();
      document.removeEventListener('visibilitychange',run);document.removeEventListener('mindly:theme-changed',themeChanged);reducedMotion.removeEventListener('change',run);
      renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.domElement.removeEventListener('webglcontextrestored',contextRestored);
      renderer.domElement.remove();stage.dispose();renderer.dispose();renderer.forceContextLoss();host=null;
    }
  };
}

function syncScene(){
  const host=document.querySelector('.entry-webgl');
  if(!host){
    current?.dispose();current=null;
    if(pending){clearTimeout(timer);timer=null;pending=false;serial++;}
    return;
  }
  if(current){if(current.host!==host)current.mount(host);return;}
  if(unavailable||pending||!host.clientWidth||!host.clientHeight)return;
  pending=true;const request=++serial;
  // Render text and account controls first. A rapid route switch invalidates
  // unfinished work, so asynchronous image decoding cannot leak a canvas.
  timer=setTimeout(async()=>{
    timer=null;let built;
    try{built=await createEntryScene();}
    catch{if(request===serial){unavailable=true;pending=false;}return;}
    const nextHost=document.querySelector('.entry-webgl');
    if(request!==serial||!nextHost){built.dispose();return;}
    pending=false;current=built;current.mount(nextHost);
  },80);
}
document.addEventListener('mindly:view-rendered',syncScene);
window.addEventListener('resize',syncScene,{passive:true});
window.addEventListener('pagehide',()=>{serial++;clearTimeout(timer);pending=false;timer=null;current?.dispose();current=null;});
window.addEventListener('pageshow',syncScene);
syncScene();
