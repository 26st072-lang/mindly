import * as THREE from 'three';
import {makeMindy} from './mindy-character.js';

export async function createMindyStage(renderer,sourceImage,{withReply=false}={}){
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(32,1,.1,80);
  const world=new THREE.Group();scene.add(world);
  const model=await makeMindy(sourceImage);world.add(model.root);model.root.position.y=.20;
  const hemi=new THREE.HemisphereLight('#f4f8ff','#c2b6a8',1.4);scene.add(hemi);
  const key=new THREE.DirectionalLight('#fff2df',2.4);key.position.set(-3.5,6,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:18});key.shadow.normalBias=.035;key.shadow.bias=-.0002;key.shadow.radius=4;scene.add(key);
  const rim=new THREE.DirectionalLight('#c2ccff',1.3);rim.position.set(4,4,-3);scene.add(rim);
  const fill=new THREE.DirectionalLight('#ffffff',.7);fill.position.set(-3,2,-4);scene.add(fill);
  const warmLamp=new THREE.PointLight('#ffd69a',0,6,2);warmLamp.position.set(1.7,1.4,.4);world.add(warmLamp);
  const environmentCanvas=document.createElement('canvas');environmentCanvas.width=512;environmentCanvas.height=256;
  const ec=environmentCanvas.getContext('2d'),eg=ec.createLinearGradient(0,0,0,256);eg.addColorStop(0,'#e1e8f5');eg.addColorStop(.45,'#ffffff');eg.addColorStop(1,'#b5c4cb');ec.fillStyle=eg;ec.fillRect(0,0,512,256);
  const envTexture=new THREE.CanvasTexture(environmentCanvas);envTexture.mapping=THREE.EquirectangularReflectionMapping;envTexture.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer),envTarget=pmrem.fromEquirectangular(envTexture);scene.environment=envTarget.texture;scene.environmentIntensity=.35;envTexture.dispose();pmrem.dispose();
  const sphere=new THREE.SphereGeometry(1,32,20);
  const material=(color,extra={})=>new THREE.MeshPhysicalMaterial({color,roughness:.6,clearcoat:.12,...extra});
  const ivory=material('#fff9ed'),periwinkle=material('#a5b4d6'),leafMat=material('#91b9a4'),stemMat=material('#6d9a85'),rose=material('#cb97a6'),peach=material('#eac7b6');
  const paper=material('#fffdf4',{roughness:.85,clearcoat:0}),gold=material('#c7a171',{metalness:.3,roughness:.5}),navy=material('#405477');
  const mesh=(g,m,p,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;};
  const group=(p,x=0,y=0,z=0)=>{const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;};
  const oval=(p,m,x,y,z,sx,sy,sz)=>{const o=mesh(sphere,m,p,x,y,z);o.scale.set(sx,sy,sz);return o;};
  const line=(points,mat,parent,r=.015)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),48,r,8,false),mat,parent);
  function roundShape(w,h,r=.12){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function slab(w,h,d=.1,r=.12){const g=new THREE.ExtrudeGeometry(roundShape(w,h,r),{depth:d,bevelSize:.025,bevelThickness:.025,bevelSegments:3,bevelEnabled:true,curveSegments:18,steps:1});g.translate(0,0,-d/2);return g;}
  function board(p,m,w,h,d,x,y,z){const o=mesh(slab(w,h,d),m,p,x,y,z);o.rotation.x=-Math.PI/2;return o;}
  function arch(parent,mat,w,h,d=.10){const s=new THREE.Shape(),r=w/2;s.moveTo(-r,0);s.lineTo(-r,h-r);s.absarc(0,h-r,r,Math.PI,0,true);s.lineTo(r,0);s.closePath();return mesh(new THREE.ExtrudeGeometry(s,{depth:d,bevelSize:.04,bevelThickness:.04,bevelSegments:4,curveSegments:32,steps:1}),mat,parent);}
  function plant(parent,x,y,z,scale=1){
    const g=group(parent,x,y,z);g.scale.setScalar(scale);
    mesh(new THREE.CylinderGeometry(.18,.13,.27,32),ivory,g,0,.135,0);
    line([[0,.2,0],[.02,.6,0],[-.05,1.02,0]],stemMat,g,.018);
    const leaves=[];
    for(const [x,y,z,angle] of [[-.12,.48,0,.7],[.12,.66,0,-.8],[-.14,.85,0,.7],[.08,1.0,0,-.45]]){const leaf=oval(g,leafMat,x,y,z,.12,.25,.035);leaf.rotation.z=angle;leaves.push({leaf,angle});}
    return {g,leaves};
  }
  const stages=[0,1,2].map(()=>group(world));
  // The grounding plane is softly shaped rather than a floating planet.
  const bases=[material('#e2e9ec'),material('#edd5c6'),material('#30415c')];
  stages.forEach((stage,i)=>{
    board(stage,bases[i],4.9,3.3,.16,0,.09,0);
    const floor=mesh(new THREE.PlaneGeometry(24,24),new THREE.ShadowMaterial({opacity:i===2?.22:.10}),stage,0,-.025,0);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  });
  const sun=stages[0];
  const windowGroup=group(sun,.25,.2,-1.04);
  arch(windowGroup,material('#d3dfe7'),3.65,3.82,.10);
  const windowPane=group(windowGroup,0,.09,.12);arch(windowPane,material('#eef1eb',{emissive:'#fff4d8',emissiveIntensity:.09}),3.40,3.60,.035);
  // Warm rectangular shafts of light have no orbital or celestial motifs.
  const beamMat=new THREE.MeshBasicMaterial({color:'#fff9df',transparent:true,opacity:.30,depthWrite:false,side:THREE.DoubleSide});
  for(const [x,width] of [[-.45,.27],[.28,.13]]){
    const sh=new THREE.Shape();sh.moveTo(x-.40,.08);sh.lineTo(x+width-.40,.08);sh.lineTo(x+width+1.0,2.9);sh.lineTo(x+1.0,2.9);sh.closePath();mesh(new THREE.ShapeGeometry(sh),beamMat,windowPane,-.55,.02,.07);
  }
  const p1=plant(sun,-1.75,.2,-.25,1.05),p2=plant(sun,1.87,.2,-.60,.70);
  const cushion=board(sun,material('#c6c5df'),1.24,.95,.22,-1.24,.34,.55);cushion.rotation.z=.08;
  const sunChat=group(sun,-1.50,2.28,.28);sunChat.rotation.y=.12;
  mesh(slab(.65,.40,.09,.15),paper,sunChat);
  const chatTail=new THREE.Shape();chatTail.moveTo(-.18,-.15);chatTail.lineTo(-.22,-.30);chatTail.lineTo(.02,-.17);chatTail.closePath();mesh(new THREE.ExtrudeGeometry(chatTail,{depth:.07,bevelEnabled:false}),paper,sunChat,0,0,-.02);
  const dots=[-.16,0,.16].map(x=>oval(sunChat,periwinkle,x,0,.08,.034,.034,.02));

  const letters=stages[1];
  const folds=group(letters,0,.2,-1.20);
  for(const [x,h,rot,c] of [[-1.65,2.55,.17,'#e4c4b5'],[0,3.75,-.045,'#f3dfce'],[1.6,2.8,-.18,'#e4b9b4']]){const fold=mesh(slab(1.6,h,.08,.32),material(c),folds,x,h/2,0);fold.rotation.y=rot;}
  const heartShape=new THREE.Shape();heartShape.moveTo(0,.14);heartShape.bezierCurveTo(-.52,.63,-.95,.02,0,-.65);heartShape.bezierCurveTo(.95,.02,.52,.63,0,.14);
  const heartGeo=new THREE.ExtrudeGeometry(heartShape,{depth:.16,bevelEnabled:true,bevelThickness:.055,bevelSize:.055,bevelSegments:4,curveSegments:28,steps:1});heartGeo.center();
  function envelope(parent,x,y,z,scale=1){
    const e=group(parent,x,y,z);e.scale.setScalar(scale);
    mesh(slab(.78,.53,.055,.06),paper,e);
    line([[-.36,.22,.065],[0,-.035,.074],[.36,.22,.065]],peach,e,.009);
    line([[-.36,-.22,.065],[-.07,.02,.065]],peach,e,.007);line([[.36,-.22,.065],[.07,.02,.065]],peach,e,.007);
    const seal=mesh(heartGeo,rose,e,0,-.025,.10);seal.scale.setScalar(.085);return e;
  }
  const mail=[envelope(letters,-1.65,1.95,.10,.75),envelope(letters,1.55,2.8,.1,.82),envelope(letters,1.68,.63,.73,.64)];
  mail.forEach((e,i)=>{e.userData.base=e.position.clone();e.rotation.z=[-.2,.17,-.12][i];e.userData.angle=e.rotation.z;});
  const hearts=[];
  for(const [x,y,z,s] of [[-1.30,2.72,.05,.21],[1.72,1.78,.16,.25],[.75,3.46,-.2,.12]]){const h=mesh(heartGeo,rose,letters,x,y,z);h.scale.setScalar(s);h.userData.base=h.position.clone();hearts.push(h);}
  const letterStack=group(letters,-1.55,.24,.75);letterStack.rotation.y=-.25;
  for(let i=0;i<4;i++)board(letterStack,paper,.88,.61,.018,0,i*.027,0).rotation.y=.02*i;
  const flower=plant(letters,1.95,.20,-.6,.65);

  const night=stages[2];
  const wall=group(night,.12,.2,-1.10);
  arch(wall,navy,3.55,3.72,.12);
  const inset=group(wall,0,.12,.16);arch(inset,material('#253955'),3.28,3.42,.04);
  const slit=material('#8da3ce',{emissive:'#7891c4',emissiveIntensity:.45,roughness:.3});
  for(const x of [-.97,.97])mesh(slab(.022,2.65,.015,.008),slit,inset,x,1.63,.06);
  const book=group(night,-1.25,.25,.85);book.rotation.y=-.12;
  board(book,material('#899abc'),1.45,.94,.08,0,0,0);
  for(const side of [-1,1])for(let i=0;i<4;i++){const page=board(book,paper,.69,.86,.009,side*.354,.055+i*.016,0);page.rotation.z=side*.04;}
  const turning=group(book,0,.135,0);board(turning,paper,.66,.84,.008,.34,0,0);
  const ribbon=mesh(slab(.055,.27,.008,.01),rose,book,.2,-.03,.54);ribbon.rotation.x=.25;
  const lamp=group(night,1.65,.2,.45);
  mesh(new THREE.CylinderGeometry(.28,.30,.10,40),gold,lamp,0,.05,0);
  mesh(new THREE.CylinderGeometry(.024,.024,.80,16),gold,lamp,0,.48,0);
  const glowMaterial=material('#ffe6b1',{emissive:'#ffcc80',emissiveIntensity:.85,roughness:.65});
  mesh(new THREE.CylinderGeometry(.20,.37,.40,48,1,true),glowMaterial,lamp,0,1.06,0);
  mesh(new THREE.CylinderGeometry(.20,.20,.025,40),gold,lamp,0,1.27,0);
  const lightPool=oval(night,new THREE.MeshBasicMaterial({color:'#ffdbaa',transparent:true,opacity:.12,depthWrite:false}),1.65,.19,.45,.62,.012,.62);lightPool.castShadow=false;
  const p3=plant(night,-1.9,.2,-.6,.67);


  // Retain the app's familiar right-hand heart reply in both color modes.
  const reply=group(world,1.48,2.85,.32);reply.visible=withReply;reply.rotation.z=.10;
  const pearl=material('#e8e4ff'),replyColor=material('#a5a2e2');
  mesh(slab(.65,.57,.09,.15),pearl,reply);
  mesh(new THREE.ExtrudeGeometry(chatTail,{depth:.07,bevelEnabled:false}),pearl,reply,.09,-.09,-.02);
  const replyHeart=mesh(heartGeo,replyColor,reply,0,.015,.13);replyHeart.scale.setScalar(.23);
  let selected=0;
  function setVariant(index){selected=index;
    stages.forEach((g,i)=>{g.visible=i===index;});
    key.color.set(index===2?'#e2eaff':'#fff3e4');key.intensity=index===2?2:2.4;
    hemi.intensity=index===2?1.15:1.4;hemi.groundColor.set(index===2?'#506284':'#c2b6a8');
    rim.intensity=index===2?2.2:1.3;fill.intensity=index===2?.55:.7;
    warmLamp.intensity=index===2?3.2:0;
    model.root.position.x=index===2?-.04:0;model.root.rotation.y=0;
  }
  function animate(t,greeting=0,pointer={x:0,y:0}){
    model.animate(t,selected,greeting,pointer);
    [p1,p2,flower,p3].forEach((p,i)=>p.leaves.forEach(({leaf,angle},j)=>{leaf.rotation.z=angle+Math.sin(t*1.25+i+j*.5)*.045;}));
    sunChat.rotation.z=Math.sin(t*.8)*.035;
    dots.forEach((dot,i)=>{dot.scale.y=.034*(1+Math.max(0,Math.sin(t*2.6-i*.8))*.4);});
    mail.forEach((e,i)=>{e.position.y=e.userData.base.y+Math.sin(t*1.1+i*1.7)*.09;e.rotation.z=e.userData.angle+Math.sin(t*.9+i)*.075;e.rotation.y=Math.sin(t*.7+i)*.15;});
    hearts.forEach((heart,i)=>{heart.rotation.y=Math.sin(t*.8+i)*.25;heart.rotation.z=Math.sin(t+i)*.10;heart.position.y=heart.userData.base.y+Math.sin(t*.9+i)*.075;});
    const cycle=(t%9)/9;turning.rotation.z=cycle<.64?0:-Math.PI*Math.sin((cycle-.64)/.36*Math.PI/2)**2;
    if(selected===2){warmLamp.intensity=3.2+Math.sin(t*1.1)*.45;glowMaterial.emissiveIntensity=.8+Math.sin(t*1.1)*.10;lightPool.material.opacity=.12+Math.sin(t*1.1)*.015;}
    replyHeart.scale.setScalar(.23*(1+.045*Math.sin(t*2.4)));
  }
  function dispose(){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      if(object.material)for(const mat of [object.material].flat()){
        materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);
        for(const uniform of Object.values(mat.uniforms||{}))if(uniform.value?.isTexture)textures.add(uniform.value);
      }
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());envTarget.dispose();
  }
  setVariant(0);
  return {scene,camera,world,model,setVariant,animate,dispose};
}
