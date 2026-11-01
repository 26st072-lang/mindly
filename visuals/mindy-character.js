import * as THREE from 'three';

// Source-faithful 3D relief. The original pixels remain the surface; a closed,
// rounded mesh follows their alpha silhouette, including all four leg gaps,
// the peaked tail, newsboy cap and asymmetrical satchel. No invented mouth,
// repainted spots or reconstructed accessories. Rotation is intentionally
// limited to viewing this original-preserving volume, not an invented back.
export async function makeMindy(sourceImage) {
  await sourceImage.decode();
  const W=404,H=523,S=.0068;
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(sourceImage,0,0);
  const pixels=context.getImageData(0,0,W,H).data;
  const solid=new Uint8Array(W*H),distance=new Float32Array(W*H);
  for(let i=0;i<solid.length;i++){solid[i]=pixels[i*4+3]>48?1:0;distance[i]=solid[i]?1000:0;}
  // Chamfer distance to the original silhouette: rounded thickness follows
  // each feature, without changing any x/y contour or pixel placement.
  const diagonal=Math.SQRT2;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x;if(!solid[i])continue;
    if(x)distance[i]=Math.min(distance[i],distance[i-1]+1);
    if(y)distance[i]=Math.min(distance[i],distance[i-W]+1);
    if(x&&y)distance[i]=Math.min(distance[i],distance[i-W-1]+diagonal);
    if(x<W-1&&y)distance[i]=Math.min(distance[i],distance[i-W+1]+diagonal);
  }
  for(let y=H-1;y>=0;y--)for(let x=W-1;x>=0;x--){
    const i=y*W+x;if(!solid[i])continue;
    if(x<W-1)distance[i]=Math.min(distance[i],distance[i+1]+1);
    if(y<H-1)distance[i]=Math.min(distance[i],distance[i+W]+1);
    if(x<W-1&&y<H-1)distance[i]=Math.min(distance[i],distance[i+W+1]+diagonal);
    if(x&&y<H-1)distance[i]=Math.min(distance[i],distance[i+W-1]+diagonal);
  }
  const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  function rawDepth(x,y){
    const d=distance[Math.round(THREE.MathUtils.clamp(y,0,H-1))*W+Math.round(THREE.MathUtils.clamp(x,0,W-1))];
    // Flat outline + rounded volume, with shallow neck/tail and deeper head,
    // cap and bag. The coordinates are measured on the unchanged source PNG.
    const head=(1-smooth(136,170,y))*smooth(85,120,x)*(1-smooth(238,260,x));
    const cap=(1-smooth(68,89,y))*smooth(102,125,x)*(1-smooth(240,264,x));
    const bag=(1-smooth(104,135,x))*smooth(235,262,y)*(1-smooth(358,387,y));
    const tail=smooth(240,282,x)*(1-smooth(270,308,y));
    const legs=smooth(340,382,y);
    const radius=Math.max(20,48-head*9-cap*15-bag*8-tail*27-legs*25);
    const roll=Math.sqrt(Math.max(0,1-(1-Math.min(1,d/radius))**2));
    return (2+roll*(43+head*14+cap*7+bag*20-tail*19-legs*10))*S;
  }
  // Smooth only depth, never image pixels or the silhouette. This prevents
  // distance-field ridges from becoming visible creases under soft light.
  const heights=new Float32Array(W*H),horizontal=new Float32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)heights[y*W+x]=rawDepth(x,y);
  const kernel=[1,4,7,10,13,10,7,4,1],total=57;
  for(let pass=0;pass<3;pass++){
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let value=0;for(let k=-4;k<=4;k++)value+=heights[y*W+Math.max(0,Math.min(W-1,x+k))]*kernel[k+4];horizontal[y*W+x]=value/total;
    }
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let value=0;for(let k=-4;k<=4;k++)value+=horizontal[Math.max(0,Math.min(H-1,y+k))*W+x]*kernel[k+4];heights[y*W+x]=value/total;
    }
  }
  function depth(x,y){
    x=THREE.MathUtils.clamp(x,0,W-1);y=THREE.MathUtils.clamp(y,0,H-1);
    const ix=Math.floor(x),iy=Math.floor(y),nx=Math.min(W-1,ix+1),ny=Math.min(H-1,iy+1),fx=x-ix,fy=y-iy;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(heights[iy*W+ix],heights[iy*W+nx],fx),THREE.MathUtils.lerp(heights[ny*W+ix],heights[ny*W+nx],fx),fy);
  }
  const frontPositions=[],frontUV=[],frontNormals=[],triangles=[],indexByPosition=new Map();
  const alpha=(x,y)=>pixels[(Math.min(H-1,Math.max(0,Math.round(y)))*W+Math.min(W-1,Math.max(0,Math.round(x))))*4+3]/255;
  function vertex(point){
    const [x,y]=point,key=x.toFixed(3)+','+y.toFixed(3);
    if(indexByPosition.has(key))return indexByPosition.get(key);
    const i=frontPositions.length/3;indexByPosition.set(key,i);
    const z=depth(x,y);frontPositions.push((x-195)*S,(507-y)*S,z);frontUV.push(x/W,1-y/H);
    const dx=(depth(x+1,y)-depth(x-1,y))/(2*S),dy=(depth(x,y+1)-depth(x,y-1))/(2*S);
    const normal=new THREE.Vector3(-dx,dy,1).normalize();frontNormals.push(normal.x,normal.y,normal.z);return i;
  }
  // Clip a triangular surface grid to the alpha contour. Unlike an alpha
  // rectangle, every boundary has a real closed edge and a matching back.
  const cut=.20,step=2;
  function clippedTriangle(points){
    const polygon=[];
    for(let i=0;i<3;i++){
      const a=points[i],b=points[(i+1)%3],aa=alpha(...a),ab=alpha(...b),insideA=aa>=cut,insideB=ab>=cut;
      if(insideA)polygon.push(a);
      if(insideA!==insideB){const t=(cut-aa)/(ab-aa);polygon.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    if(polygon.length<3)return;
    const ids=polygon.map(vertex);
    // Image y points down; reverse winding for the outward-facing front.
    for(let i=1;i<ids.length-1;i++)triangles.push(ids[0],ids[i+1],ids[i]);
  }
  for(let y=0;y<H-1;y+=step)for(let x=0;x<W-1;x+=step){
    const r=Math.min(W-1,x+step),b=Math.min(H-1,y+step);
    clippedTriangle([[x,y],[r,y],[x,b]]);clippedTriangle([[r,y],[r,b],[x,b]]);
  }
  const frontGeometry=new THREE.BufferGeometry();
  frontGeometry.setAttribute('position',new THREE.Float32BufferAttribute(frontPositions,3));frontGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(frontNormals,3));frontGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(frontUV,2));frontGeometry.setIndex(triangles);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  // The unchanged source texture supplies every color and marking. Soft
  // directional shading reveals its volume consistently in all three moods.
  const frontMaterial=new THREE.ShaderMaterial({
    uniforms:{original:{value:map}},toneMapped:false,
    vertexShader:`varying vec2 vUv; varying vec3 vN; void main(){vUv=uv; vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D original; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec4 ink=texture2D(original,vUv); if(ink.a<.12)discard;
        vec3 n=normalize(vN);
        float diffuse=max(0.,dot(n,normalize(vec3(-.5,.65,1.))));
        float form=.66+.42*diffuse;
        float sheen=pow(max(0.,dot(n,normalize(vec3(-.4,.45,1.8)))),24.)*.035;
        gl_FragColor=vec4(ink.rgb*form+ink.rgb*sheen,1.);
        #include <colorspace_fragment>
      }`
  });
  // GLSL preprocessor directives must start at the beginning of a line.
  frontMaterial.fragmentShader=frontMaterial.fragmentShader.replace('#include','\n#include');
  const shellPositions=[...frontPositions],shellColors=[],shellIndices=[];
  const count=frontPositions.length/3;
  const skin=new THREE.Color('#c1dfe5'),capColor=new THREE.Color('#3a3b99'),bagColor=new THREE.Color('#b68d72');
  for(let i=0;i<count;i++){
    const x=frontUV[i*2]*W,y=(1-frontUV[i*2+1])*H;
    const c=y<88&&x>105&&x<262?capColor:x<137&&y>237&&y<389?bagColor:skin;
    shellColors.push(c.r,c.g,c.b);
    shellPositions.push(frontPositions[i*3],frontPositions[i*3+1],-frontPositions[i*3+2]*.65);
  }
  const frontColorCount=shellColors.length;for(let i=0;i<frontColorCount;i++)shellColors.push(shellColors[i]);
  const edges=new Map();
  for(let i=0;i<triangles.length;i+=3){
    const a=triangles[i],b=triangles[i+1],c=triangles[i+2];shellIndices.push(c+count,b+count,a+count);
    for(const [start,end] of [[a,b],[b,c],[c,a]]){const key=Math.min(start,end)+','+Math.max(start,end);if(edges.has(key))edges.delete(key);else edges.set(key,[start,end]);}
  }
  for(const [a,b] of edges.values())shellIndices.push(a,b+count,b,a,a+count,b+count);
  const shellGeometry=new THREE.BufferGeometry();shellGeometry.setAttribute('position',new THREE.Float32BufferAttribute(shellPositions,3));shellGeometry.setAttribute('color',new THREE.Float32BufferAttribute(shellColors,3));shellGeometry.setIndex(shellIndices);shellGeometry.computeVertexNormals();
  const shellMaterial=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.74,metalness:0,clearcoat:.08});
  const root=new THREE.Group(),front=new THREE.Mesh(frontGeometry,frontMaterial),shell=new THREE.Mesh(shellGeometry,shellMaterial);
  front.castShadow=true;shell.castShadow=true;shell.receiveShadow=true;root.add(shell,front);
  const deformables=[frontGeometry,shellGeometry].map(geometry=>{
    const original=new Float32Array(geometry.attributes.position.array),weights=[];
    for(let i=0;i<geometry.attributes.position.count;i++){
      const px=original[i*3]/S+195,py=507-original[i*3+1]/S;
      weights.push({head:(1-smooth(137,190,py))*smooth(82,115,px)*(1-smooth(247,276,px)),tail:smooth(240,282,px)*(1-smooth(280,309,py)),bag:(1-smooth(104,139,px))*smooth(232,269,py)*(1-smooth(360,394,py))});
    }
    return {geometry,original,weights};
  });
  const headPivot={x:(211-195)*S,y:(507-161)*S},tailPivot={x:(246-195)*S,y:(507-251)*S},bagPivot={x:(104-195)*S,y:(507-269)*S};
  function animate(time,variant,greeting=0){
    const headAngle=Math.sin(time*.9)*.006+(variant===2?.005:0)+(greeting>0?Math.sin(greeting*9)*Math.sin(greeting*Math.PI)*.016:0);
    const tailAngle=Math.sin(time*(variant===1?1.3:.8))*(variant===1?.013:.007);
    const bagAngle=Math.sin(time*1.15)*(variant===1?.008:.003);
    for(const {geometry,original,weights} of deformables){
      const p=geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        let x=original[i*3],y=original[i*3+1];const w=weights[i];
        // Small-angle rotations avoid per-vertex temporary arrays and keep
        // the original resting pose stable on slower mobile GPUs.
        if(w.head>.001){const a=headAngle*w.head,dx=x-headPivot.x,dy=y-headPivot.y,c=1-a*a*.5;x=headPivot.x+dx*c-dy*a;y=headPivot.y+dx*a+dy*c;}
        if(w.tail>.001){const a=tailAngle*w.tail,dx=x-tailPivot.x,dy=y-tailPivot.y,c=1-a*a*.5;x=tailPivot.x+dx*c-dy*a;y=tailPivot.y+dx*a+dy*c;}
        if(w.bag>.001){const a=bagAngle*w.bag,dx=x-bagPivot.x,dy=y-bagPivot.y,c=1-a*a*.5;x=bagPivot.x+dx*c-dy*a;y=bagPivot.y+dx*a+dy*c;}
        p.setXYZ(i,x,y,original[i*3+2]);
      }
      p.needsUpdate=true;
    }
  }
  root.userData.sourceFaithful=true;
  return {root,animate};
}
