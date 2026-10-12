import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {AVATAR_3D} from './first-person.ts';
export {DOLL_NAMES} from './doll-names.ts';

// Desk-figure proportions (1 unit = 40 map px): the head is about half of the height, the
// body a short flared coat on stubby legs, mitten hands and rounded toy shoes. Viewed from
// the first-person camera (eye 1.43) other players' eyes sit slightly below eye level.
export const DOLL={height:1.71,headY:1.24,headScale:.94,shoulderY:.82,hipY:.42,labelY:2.0};
// The head is authored around its own centre (y 1.36) and the head group is scaled/offset
// onto DOLL.headY, so face, hair and accessories share one coordinate frame.
const LEGACY_HEAD_Y=1.36;

// A soft "mochi" head: full cheeks, the lower half narrowing to a small rounded chin.
// faceZ() is the exact front surface, so painted features lie on the skin.
const HC=LEGACY_HEAD_Y,HX=.445,HY=.425,HZ=.4;
const jaw=(y:number)=>{const s=T.MathUtils.clamp((HC-.02-y)/(HY-.02),0,1);return s*s*(3-2*s);};
const widthAt=(y:number)=>1-.16*jaw(y),depthAt=(y:number)=>1-.06*jaw(y);
const faceZ=(x:number,y:number)=>{const u=x/(HX*widthAt(y)),v=(y-HC)/HY;return -HZ*depthAt(y)*Math.sqrt(Math.max(.012,1-u*u-v*v));};
// Hair rides on the same shape, `pad` above the skin; below the widest line it falls straight.
const hairAt=(theta:number,phi:number,pad:number)=>{const y=HC+(HY+pad)*Math.cos(theta),s=Math.sin(theta);return new T.Vector3((HX+pad)*s*Math.sin(phi)*widthAt(y),y,(HZ+pad)*s*Math.cos(phi)*depthAt(y));};
const hang=(phi:number,drop:number,pad:number,inward=0)=>{const e=hairAt(Math.PI/2,phi,pad);return new T.Vector3(e.x*(1-inward),HC-drop,e.z*(1-inward));};
// Body surfaces for clothing details: the coat is a lathe of TORSO squashed to .8 depth.
const TORSO=[[0,.425],[.16,.428],[.232,.44],[.252,.466],[.247,.51],[.232,.59],[.219,.67],[.213,.74],[.206,.8],[.188,.85],[.15,.887],[.09,.907],[.03,.914],[0,.915]];
const torsoR=(y:number)=>{for(let i=1;i<TORSO.length;i++){const [r0,y0]=TORSO[i-1],[r1,y1]=TORSO[i];if(y<=y1)return r0+(r1-r0)*T.MathUtils.clamp((y-y0)/(y1-y0),0,1);}return 0;};
const torsoZ=(x:number,y:number)=>-.8*Math.sqrt(Math.max(.0004,torsoR(y)**2-x*x));

// Shared, never disposed: every doll in every scene and the portrait renderer use the same
// three materials (vertex colours), so a doll costs one draw call per joint group and kind.
const MATTE=new T.MeshStandardMaterial({vertexColors:true,roughness:.68,metalness:0});
const GLOSS=new T.MeshStandardMaterial({vertexColors:true,roughness:.22,metalness:0});
// A little of each surface's own colour is added as glow, like a painted PVC figure: shadow
// sides stay readable under the map's cool light instead of turning grey-green.
for(const m of [MATTE,GLOSS])m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.16;');};
const PAINT=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
const SHADOW=new T.MeshBasicMaterial({color:'#07101a',transparent:true,opacity:.23,depthWrite:false});
const SHADOW_GEO=new T.CircleGeometry(.36,24);
const HEAD=(()=>{const s=new T.SphereGeometry(1,44,32);s.deleteAttribute('uv');s.deleteAttribute('normal');const g=mergeVertices(s);s.dispose();const p=g.attributes.position;for(let i=0;i<p.count;i++){const y=HC+p.getY(i)*HY;p.setXYZ(i,p.getX(i)*HX*widthAt(y),y,p.getZ(i)*HZ*depthAt(y));}g.computeVertexNormals();return g;})();
const SPHERE=new T.SphereGeometry(1,16,12),SMALL=new T.SphereGeometry(1,10,8),ROUNDED=new RoundedBoxGeometry(1,1,1,1,.15),CYLINDER=new T.CylinderGeometry(1,1,1,22);
const COAT=new T.LatheGeometry(TORSO.map(([r,y])=>new T.Vector2(r,y)),28),SLEEVE=new T.LatheGeometry([[0,.035],[.045,.03],[.064,0],[.068,-.09],[.072,-.158],[.077,-.162],[.078,-.19],[.068,-.21],[0,-.212]].map(([r,y])=>new T.Vector2(r,y)),14),TROUSER=new T.LatheGeometry([[0,.03],[.075,.02],[.09,-.03],[.083,-.2],[.076,-.3],[0,-.3]].map(([r,y])=>new T.Vector2(r,y)),14);
const SHARED=new Set<T.BufferGeometry>([HEAD,SPHERE,SMALL,ROUNDED,CYLINDER,COAT,SLEEVE,TROUSER]);
type Kind='matte'|'gloss'|'paint';
type Shade=(p:T.Vector3,n:T.Vector3,c:T.Color)=>void;
const colour=new T.Color(),base=new T.Color(),matrix=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),p3=new T.Vector3(),n3=new T.Vector3(),hsl={h:0,s:0,l:0};
// Colour nudges in sRGB HSL (what a painter would do), returning a new colour.
const shift=(c:T.ColorRepresentation,dl:number,ds=0,dh=0)=>{const o=new T.Color(c);o.getHSL(hsl,T.SRGBColorSpace);return o.setHSL(hsl.h+dh,T.MathUtils.clamp(hsl.s+ds,0,1),T.MathUtils.clamp(hsl.l+dl,0,1),T.SRGBColorSpace);};
const V=(x:number,y:number)=>new T.Vector2(x,y);
const ellipse=(x:number,y:number,rx:number,ry:number,n=28)=>Array.from({length:n},(_,i)=>V(x+Math.cos(i/n*Math.PI*2)*rx,y+Math.sin(i/n*Math.PI*2)*ry));
// Sutherland-Hodgman: keeps the part of `shape` inside the convex counter-clockwise `edge`.
const clip=(shape:T.Vector2[],edge:T.Vector2[])=>{let out=shape;for(let i=0;i<edge.length&&out.length;i++){const a=edge[i],b=edge[(i+1)%edge.length],input=out,side=(p:T.Vector2)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>=0;out=[];for(let j=0;j<input.length;j++){const p=input[j],r=input[(j+1)%input.length],pin=side(p);if(pin)out.push(p);if(pin!==side(r)){const t=((a.x-p.x)*(b.y-a.y)-(a.y-p.y)*(b.x-a.x))/((r.x-p.x)*(b.y-a.y)-(r.y-p.y)*(b.x-a.x));out.push(V(p.x+(r.x-p.x)*t,p.y+(r.y-p.y)*t));}}}return out;};
// A stroke along a polyline, `width[i]` thick on its left (upper side when drawn left to
// right) and `below` of that on the other side: lids, lashes, brows, mouths.
const stroke=(line:T.Vector2[],width:number[],below=.25)=>{const a:T.Vector2[]=[],b:T.Vector2[]=[];line.forEach((p,i)=>{const d=line[Math.min(line.length-1,i+1)].clone().sub(line[Math.max(0,i-1)]).normalize(),n=V(-d.y,d.x);a.push(p.clone().addScaledVector(n,width[i]));b.push(p.clone().addScaledVector(n,-width[i]*below));});return [...b,...a.reverse()];};
const taper=(n:number,w0:number,w1:number,w2:number)=>Array.from({length:n},(_,i)=>{const t=i/(n-1);return t<.5?w0+(w1-w0)*Math.sin(t*Math.PI):w2+(w1-w2)*Math.sin(t*Math.PI);});

// Per-avatar look. Hair: short cap, bob (to the jaw) or long (to the shoulders); sweep turns
// the fringe sideways; part splits it in the middle; tail adds twin tails, a ponytail or a bun.
type Look={girl:boolean;hair:'short'|'bob'|'long';sweep:number;part?:boolean;ahoge?:boolean;tail?:'twin'|'pony'|'bun';clip?:boolean;glasses?:boolean;mouth:'smile'|'cat'|'open';shoe:number};
const LOOKS:Look[]=[
 {girl:false,hair:'short',sweep:.38,ahoge:true,mouth:'smile',shoe:0},{girl:true,hair:'long',sweep:-.08,mouth:'smile',shoe:3},
 {girl:false,hair:'short',sweep:-.22,mouth:'open',shoe:1},{girl:true,hair:'long',sweep:.26,mouth:'cat',shoe:2},
 {girl:true,hair:'bob',sweep:-.3,clip:true,mouth:'smile',shoe:3},{girl:false,hair:'short',sweep:0,part:true,mouth:'smile',shoe:0},
 {girl:true,hair:'short',sweep:.18,tail:'twin',mouth:'open',shoe:2},{girl:false,hair:'short',sweep:-.42,mouth:'smile',shoe:1},
 {girl:false,hair:'short',sweep:.5,ahoge:true,mouth:'cat',shoe:0},{girl:true,hair:'long',sweep:.3,clip:true,mouth:'smile',shoe:3},
 {girl:false,hair:'short',sweep:.16,glasses:true,mouth:'smile',shoe:1},{girl:true,hair:'bob',sweep:-.2,tail:'bun',mouth:'smile',shoe:2},
 {girl:true,hair:'short',sweep:.22,tail:'pony',mouth:'open',shoe:3},{girl:false,hair:'short',sweep:-.3,ahoge:true,mouth:'open',shoe:2},
 {girl:true,hair:'bob',sweep:.32,clip:true,mouth:'cat',shoe:0},{girl:false,hair:'short',sweep:-.45,mouth:'smile',shoe:1},
];
const SHOES=[['#30323f','#e6dfd2'],['#5a3a2b','#e9dcc6'],['#f1ece3','#b9b2a6'],['#7b3f4c','#efe5d8']];
const IRIS=['#806052','#5395ab','#947b52','#679c86','#a26f8d','#8b78b4','#5e95b6','#a17c53','#7e9c74','#9b7ab3','#679d99','#bb875e','#a58097','#7d9eb8','#9296c5','#708da6'];

// Figure paint: skin a touch warmer, very dark hair lifted so its sculpted form still reads.
// AVATAR_3D itself stays as authored (the 2D UI uses it); only the figures are repainted.
function figurePaint(id:number){
 const [coat,hairBase,accent,skinBase,pants]=AVATAR_3D[id],fair=T.MathUtils.smoothstep(new T.Color(skinBase).getHSL(hsl,T.SRGBColorSpace).l,.5,.72),hairLight=new T.Color(hairBase).getHSL(hsl,T.SRGBColorSpace).l;
 return{coat,accent,pants,fair,hairLight,skin:shift(skinBase,0,.1*fair,-.01*fair),hair:shift(hairBase,Math.max(0,.15-hairLight),.02)};}
const KNIFE={grip:'#393040',guard:'#c4d6dd',blade:'#dde8ed'};
// Every piece is baked into its joint group's buffers with a vertex colour (shade() may vary
// it per vertex); bake() then makes one mesh per joint group and material kind.
function kit(){
 const parts=new Map<T.Object3D,Record<Kind,T.BufferGeometry[]>>();
 const add=(g:T.Object3D,source:T.BufferGeometry,m:T.Matrix4|null,c:T.ColorRepresentation,kind:Kind='matte',shade?:Shade)=>{
  const geo=source.clone();if(m)geo.applyMatrix4(m);geo.deleteAttribute('uv');if(!geo.index){const n=geo.attributes.position.count;geo.setIndex(Array.from({length:n},(_,i)=>i));}
  if(!geo.attributes.normal)geo.computeVertexNormals();base.set(c);const pos=geo.attributes.position,nor=geo.attributes.normal,n=pos.count,rgb=new Float32Array(n*3);
  for(let i=0;i<n;i++){colour.copy(base);if(shade)shade(p3.fromBufferAttribute(pos,i),n3.fromBufferAttribute(nor,i),colour);rgb[i*3]=colour.r;rgb[i*3+1]=colour.g;rgb[i*3+2]=colour.b;}geo.setAttribute('color',new T.BufferAttribute(rgb,3));
  let entry=parts.get(g);if(!entry){entry={matte:[],gloss:[],paint:[]};parts.set(g,entry);}entry[kind].push(geo);if(!SHARED.has(source))source.dispose();};
 const at=(x:number,y:number,z:number,sx:number,sy:number,sz:number,rx=0,ry=0,rz=0)=>matrix.compose(new T.Vector3(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),new T.Vector3(sx,sy,sz)).clone();
 const ball=(g:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,c:T.ColorRepresentation,kind:Kind='matte',geo=Math.max(sx,sy,sz)<.05?SMALL:SPHERE)=>add(g,geo,at(x,y,z,sx,sy,sz),c,kind);
 const box=(g:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,c:T.ColorRepresentation,rz=0,kind:Kind='matte')=>add(g,ROUNDED,at(x,y,z,sx,sy,sz,0,0,rz),c,kind);
 const ring=(g:T.Object3D,x:number,y:number,z:number,r:number,tube:number,c:T.ColorRepresentation,sz=1,rx=Math.PI/2,arc=Math.PI*2,ry=0)=>add(g,new T.TorusGeometry(r,tube,6,20,arc),at(x,y,z,1,sz,1,rx,ry,0),c);
 const rod=(g:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,c:T.ColorRepresentation)=>{const d=b.clone().sub(a);add(g,CYLINDER,new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize()),new T.Vector3(r,d.length(),r)),c,'gloss');};
 const bake=()=>{for(const [group,kinds] of parts)for(const [kind,list] of Object.entries(kinds) as [Kind,T.BufferGeometry[]][]){if(!list.length)continue;const merged=mergeGeometries(list,false)!;list.forEach(g=>g.dispose());merged.computeBoundingSphere();group.add(new T.Mesh(merged,kind==='paint'?PAINT:kind==='gloss'?GLOSS:MATTE));}parts.clear();};
 return{add,at,ball,box,ring,rod,bake};}

export function createDoll(index:number){
 const id=((index%16)+16)%16,look=LOOKS[id],root=new T.Group(),head=new T.Group(),arms:T.Group[]=[],legs:T.Group[]=[];
 root.name='doll-'+id;head.name='head';root.add(head);head.scale.setScalar(DOLL.headScale);head.position.y=DOLL.headY-LEGACY_HEAD_Y*DOLL.headScale;
 const {coat,accent,pants,skin,fair,hair,hairLight}=figurePaint(id),{add,at,ball,box,ring,rod,bake}=kit();
 // Flat shapes laid onto a surface z=surface(x,y), subdivided so they bend with it. Face paint
 // is unlit like figure paint; clothing decals are lit and face outwards (-z).
 const lay=(g:T.Object3D,shape:T.Vector2[],c:T.ColorRepresentation|((x:number,y:number,o:T.Color)=>void),cx:number,cy:number,surface:(x:number,y:number)=>number,lift:number,kind:Kind='paint',mirror=1,fine=.03)=>{
  if(shape.length<3)return;const flat=new T.ShapeGeometry(new T.Shape(shape)).toNonIndexed(),vertices:number[]=[];
  const split=(a:T.Vector3,b:T.Vector3,c:T.Vector3,depth=0)=>{const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);if(Math.max(ab,bc,ca)<fine||depth>=7){if(kind==='paint')vertices.push(a.x,a.y,0,b.x,b.y,0,c.x,c.y,0);else vertices.push(a.x,a.y,0,c.x,c.y,0,b.x,b.y,0);return;}if(ab>=bc&&ab>=ca){const m=a.clone().add(b).multiplyScalar(.5);split(a,m,c,depth+1);split(m,b,c,depth+1);}else if(bc>=ca){const m=b.clone().add(c).multiplyScalar(.5);split(a,b,m,depth+1);split(a,m,c,depth+1);}else{const m=c.clone().add(a).multiplyScalar(.5);split(a,b,m,depth+1);split(m,b,c,depth+1);}};
  const fp=flat.attributes.position;for(let i=0;i<fp.count;i+=3)split(new T.Vector3().fromBufferAttribute(fp,i),new T.Vector3().fromBufferAttribute(fp,i+1),new T.Vector3().fromBufferAttribute(fp,i+2));flat.dispose();
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)*mirror+cx,y=p.getY(i)+cy;p.setXYZ(i,x,y,surface(x,y)-lift);}geo.computeVertexNormals();
  if(typeof c==='function')add(g,geo,null,'#fff',kind,(v,_n,o)=>c((v.x-cx)*mirror,v.y-cy,o));else add(g,geo,null,c,kind);};
 const paint=(shape:T.Vector2[],c:T.ColorRepresentation|((x:number,y:number,o:T.Color)=>void),cx:number,cy:number,layer=0,mirror=1,fine=.03)=>lay(head,shape,c,cx,cy,faceZ,.003+layer*.0007,'paint',mirror,fine);
 const decal=(shape:T.Vector2[],c:T.ColorRepresentation,layer=0,kind:Kind='matte')=>lay(root,shape,c,0,0,torsoZ,.003+layer*.0025,kind,1,.04);
 // Hair shading: the underside a little darker and a glossy "angel ring" band around the crown.
 const sheen=shift(hair,.2,-.04),under=shift(hair,-.06);
 const hairShade:Shade=(p,n,c)=>{const band=Math.exp(-(((p.y-(HC+.255))/.045)**2))*Math.max(0,Math.min(1,(n.x*p.x/HX+n.y*(p.y-HC)/HY+n.z*p.z/HZ)*2.2));c.lerp(under,T.MathUtils.clamp((HC-.05-p.y)/.5,0,1)*.7).lerp(sheen,band*.75);};
 // A sculpted lock: a flattened tube along a smooth path, its wide side lying on the head,
 // tapering to a point. The open root is always buried in the hair cap.
 const lock=(path:T.Vector3[],width:number,flat=.42,profile=(t:number)=>Math.cos(t*Math.PI/2)**.75,steps=12)=>{
  const curve=new T.CatmullRomCurve3(path,false,'centripetal'),v:number[]=[],ix:number[]=[],around=10;
  for(let i=0;i<=steps;i++){const t=i/steps,p=curve.getPoint(t),tan=curve.getTangent(t),out=new T.Vector3(p.x/HX**2,(p.y-HC)/HY**2,p.z/HZ**2).normalize(),side=new T.Vector3().crossVectors(tan,out).normalize(),up=new T.Vector3().crossVectors(tan,side).normalize(),r=Math.max(.0015,width*(profile(t)||0));
   for(let j=0;j<around;j++){const a=j/around*Math.PI*2,w=p.clone().addScaledVector(side,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r*flat);v.push(w.x,w.y,w.z);if(i<steps){const n=i*around+j,k=i*around+(j+1)%around;ix.push(n,k,n+around,k,k+around,n+around);}}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(ix);geo.computeVertexNormals();add(head,geo,null,hair,'matte',hairShade);};

 // ---- head (legacy coordinates, see LEGACY_HEAD_Y) ----------------------------------------
 // Skin with soft airbrushed cheeks (vertex colour, lit) instead of pasted blush ovals.
 const blush=shift(skin,.03+.02*(1-fair),.04+.1*fair,-.025),neck=shift(skin,-.08);
 add(head,HEAD,null,skin,'matte',(p,_n,c)=>{for(const s of [-1,1]){const dx=(p.x-s*.235)/.092,dy=(p.y-1.226)/.056;if(p.z<0)c.lerp(blush,(.45+.25*fair)*Math.exp(-dx*dx-dy*dy));}c.lerp(neck,T.MathUtils.clamp((1.02-p.y)/.08,0,1));});
 for(const side of [-1,1])ball(head,side*.405,1.29,.03,.048,.068,.05,skin,'matte',SMALL);
 // Eyes: mirrored per side, iris clipped to the eye opening, gradient iris, two highlights.
 const iris=IRIS[id],girl=look.girl,EX=.168,EY=1.322;
 const top=girl?new T.CubicBezierCurve(V(-.098,-.002),V(-.088,.075),V(.035,.104),V(.112,.04)):new T.CubicBezierCurve(V(-.098,0),V(-.084,.07),V(.04,.099),V(.112,.034));
 const bottom=girl?new T.CubicBezierCurve(V(.112,.04),V(.098,-.045),V(-.02,-.09),V(-.098,-.002)):new T.CubicBezierCurve(V(.112,.034),V(.096,-.042),V(-.02,-.08),V(-.098,0));
 let opening=[...top.getPoints(16),...bottom.getPoints(16).slice(1,-1)];if(T.ShapeUtils.isClockWise(opening))opening=opening.reverse();
 const ix=.008,iy=girl?.006:.002,rx=girl?.066:.061,ry=girl?.086:.076,inside=(s:T.Vector2[])=>clip(s,opening);
 const irisTop=shift(iris,-.2,.02),irisLow=shift(iris,.17,.08),rim=shift(iris,-.3,.05),pupil=shift(iris,-.42,-.1),glow=shift(iris,.3,.1),lidShade=new T.Color('#d6d2e4'),white=new T.Color('#fffaf5');
 const lid=girl?'#3a2830':'#2f2630',brow=shift(hair,hairLight>.45?-.18:-.04,.04),lash=shift(lid,.25);
 for(const side of [-1,1]){const cx=side*EX;
  paint(opening,(_x,y,o)=>o.copy(white).lerp(lidShade,T.MathUtils.clamp((y-.012)/.07,0,1)),cx,EY,1,side,.02);
  paint(inside(ellipse(ix,iy,rx,ry)),rim,cx,EY,2,side);
  paint(inside(ellipse(ix,iy,rx*.9,ry*.92)),(_x,y,o)=>o.copy(irisTop).lerp(irisLow,T.MathUtils.clamp((iy+ry*.6-y)/(ry*1.3),0,1)),cx,EY,3,side,.014);
  paint(clip(inside(ellipse(ix,iy-ry*.5,rx*.62,ry*.3)),ellipse(ix,iy,rx*.8,ry*.84)),glow,cx,EY,4,side);
  paint(inside(ellipse(ix+.002,iy+.012,rx*.44,ry*.48)),pupil,cx,EY,5,side);
  paint(inside(ellipse(ix-.025,iy+.03,.022,.027)),'#ffffff',cx,EY,6,side);
  paint(inside(ellipse(ix+.03,iy-.038,.011,.011,16)),'#ffffff',cx,EY,6,side);
  if(girl)paint(inside(ellipse(ix+.03,iy+.043,.006,.006,12)),'#ffffff',cx,EY,6,side);
  // Upper lash line (thicker at the outer corner, a small flick for the girls), lower lash.
  const line=top.getPoints(18);if(girl)line.push(V(.124,.052),V(.136,.066));
  const w=line.map((_,i)=>{const t=i/18;return i>18?(i===19?.011:.003):(girl?.006:.008)+(girl?.012:.011)*t*t*(3-2*t);});
  paint(stroke(line,w,.35),lid,cx,EY,7,side);
  paint(stroke(bottom.getPoints(18).slice(0,7),[.0015,.004,.0045,.004,.0032,.002,.0008],0),lash,cx,EY,7,side);
  if(girl)paint(stroke(new T.QuadraticBezierCurve(V(-.04,.103),V(.03,.122),V(.088,.083)).getPoints(10),taper(11,.0008,.0035,.0006),0),shift(skin,-.1,.05),cx,EY,1,side);
  const browLine=girl?new T.QuadraticBezierCurve(V(-.07,-.004),V(-.005,.024),V(.074,.0)).getPoints(12):new T.QuadraticBezierCurve(V(-.08,-.012),V(-.01,.02),V(.078,.006)).getPoints(12);
  paint(stroke(browLine,girl?taper(13,.006,.0105,.003):taper(13,.012,.0155,.006),.5),brow,cx+side*.004,girl?1.452:1.446,1,side);
 }
 // Nose dot and a small mouth (a smile, a cat "ω" or a little open laugh).
 paint(ellipse(0,0,.009,.006,14),shift(skin,-.07,-.02,-.01),0,1.257,1);
 const mouthC=new T.Color('#8c3f4a').lerp(skin,.1);
 if(look.mouth==='open'){const m=[...new T.QuadraticBezierCurve(V(-.036,.008),V(0,.0),V(.036,.008)).getPoints(10),...new T.CubicBezierCurve(V(.036,.008),V(.03,-.04),V(-.03,-.04),V(-.036,.008)).getPoints(14).slice(1,-1)].reverse();paint(m,'#93404c',0,1.188,1);paint(clip(ellipse(0,-.03,.022,.014),m),'#ec8f98',0,1.188,2);}
 else if(look.mouth==='cat'){for(const s of [-1,1])paint(stroke(new T.QuadraticBezierCurve(V(0,.006),V(.016,-.02),V(.032,.004)).getPoints(9),taper(10,.002,.005,.0015),.5),mouthC,0,1.19,1,s);}
 else paint(stroke(new T.QuadraticBezierCurve(V(-.033,.008),V(0,-.019),V(.033,.008)).getPoints(12),taper(13,.0025,.0065,.0025),.5),mouthC,0,1.19,1);

 // ---- hair -------------------------------------------------------------------------------
 // A sculpted cap: clumps that end in points along the hairline and tuck into the skin at
 // their edge, so the hairline is a clean curve; fringe and side locks lie on top of it.
 const hairline=(f:number)=>{const k=[[0,1.0],[.7,1.08],[1.0,1.45],[1.3,1.52],[1.6,1.37],[2.05,2.2],[Math.PI,2.62]];for(let i=1;i<k.length;i++)if(f<=k[i][0]){const t=(f-k[i-1][0])/(k[i][0]-k[i-1][0]);return k[i-1][1]+(k[i][1]-k[i-1][1])*t*t*(3-2*t);}return 2.62;};
 const clumps=16,sectors=clumps*4,rings=20,hv:number[]=[],hi:number[]=[];
 for(let a=0;a<=rings;a++)for(let b=0;b<=sectors;b++){
  const phi=b/sectors*Math.PI*2,f=Math.abs(Math.atan2(Math.sin(phi-Math.PI),Math.cos(phi-Math.PI))),frac=(b/4)%1,tip=1-Math.abs(2*frac-1),u=a/rings;
  const edge=hairline(f)+tip*.11*T.MathUtils.smoothstep(f,.75,1.15),theta=.006+(edge-.006)*u;
  const pad=(.046+.026*Math.cos(Math.min(theta,Math.PI/2))**2)*(1-T.MathUtils.smoothstep(u,.8,1))+.014*Math.sin(Math.PI*frac)**2*u*(1-T.MathUtils.smoothstep(u,.85,1))-.018*T.MathUtils.smoothstep(u,.9,1);
  const p=hairAt(theta,phi,pad);hv.push(p.x,p.y,p.z);if(a<rings&&b<sectors){const n=a*(sectors+1)+b;hi.push(n,n+sectors+1,n+1,n+1,n+sectors+1,n+sectors+2);}}
 const capRaw=new T.BufferGeometry();capRaw.setAttribute('position',new T.Float32BufferAttribute(hv,3));capRaw.setIndex(hi);const cap=mergeVertices(capRaw);capRaw.dispose();cap.computeVertexNormals();add(head,cap,null,hair,'matte',hairShade);
 // Fringe: overlapping locks of varied width and length from the crown, lying on the forehead
 // and ending above the brows. [offset from the front, half width, extra length]
 const fringe=look.part?[[-.84,.085,.03],[-.6,.1,0],[-.36,.09,.05],[-.14,.075,.02],[.14,.075,.02],[.36,.09,.05],[.6,.1,0],[.84,.085,.03]]
  :[[-.86,.09,.02],[-.6,.11,.05],[-.36,.075,0],[-.15,.115,.07],[.08,.085,.02],[.3,.12,.06],[.56,.08,0],[.82,.1,.04]];
 for(const [i,[o,w,l]] of fringe.entries()){
  const sweep=look.part?Math.sign(o)*.32:look.sweep,len=1.21+l+((id*7+i*3)%5)*.01-Math.abs(o)*.05+(look.part?.03:0),phi=Math.PI+o-sweep*.25,steps=[0,.22,.45,.68,.86,1];
  lock(steps.map(t=>hairAt(.3+(len-.3)*t,phi+sweep*.55*t**1.4,.02+.06*Math.sin(Math.PI*Math.min(1,t*1.12))**.8)),w*(girl?.95:1),.4,t=>Math.cos(t*Math.PI/2)**.55);}
 // Side locks frame the face in front of the ears; longer for bob/long hair and the girls.
 const sideDrop=look.hair==='long'?.44:look.hair==='bob'?.32:girl?.24:.07;
 for(const s of [-1,1]){const phi=Math.PI-s*1.12;lock([hairAt(.55,phi,.02),hairAt(1.0,phi,.05),hairAt(1.38,phi+s*.06,.05),hang(phi+s*.1,sideDrop*.45,.045),hang(phi+s*.12,sideDrop,.03,.06)],girl?.08:.07,.45);}
 // Bob and long hair: a mass of wide locks over the back and sides, resting on the back.
 if(look.hair!=='short'){const long=look.hair==='long',drop=long?.62:.34;
  for(let i=0;i<9;i++){const phi=(i-4)/4*1.62,d=drop*(1-Math.abs(i-4)*.02)+(i%2)*.03;
   lock([hairAt(.95,phi,.02),hairAt(1.3,phi,.07),hang(phi,0,.075),hang(phi,d*.5,.07,long?.08:.02),hang(phi,d*.85,.06,long?.28:.08),hang(phi,d,.04,long?.36:.2)],.13,.5,t=>t<.7?1:Math.cos((t-.7)/.3*Math.PI/2)**.7,14);}}
 // Tails and accessories.
 if(look.tail==='twin')for(const s of [-1,1]){const phi=s*1.05,tie=hairAt(.95,phi,.075);ball(head,tie.x,tie.y,tie.z,.05,.05,.05,accent,'gloss');lock([hairAt(.95,phi,0),hairAt(.95,phi,.13),new T.Vector3(s*.6,HC-.05,.32),new T.Vector3(s*.6,HC-.3,.28),new T.Vector3(s*.54,HC-.5,.25)],.11,.85,t=>Math.sin(Math.PI*(.2+.8*t))**.7,14);}
 if(look.tail==='pony'){ball(head,...hairAt(1.12,0,.08).toArray() as [number,number,number],.055,.055,.055,accent,'gloss');lock([hairAt(1.12,0,.0),hairAt(1.1,0,.16),new T.Vector3(0,HC-.16,.66),new T.Vector3(.03,HC-.44,.56),new T.Vector3(-.02,HC-.62,.46)],.13,.7,t=>Math.sin(Math.PI*(.25+.75*t))**.8,14);}
 if(look.tail==='bun'){const c=hairAt(.62,0,.15);ball(head,c.x,c.y,c.z,.17,.165,.165,hair);ring(head,c.x,c.y-.09,c.z-.07,.12,.022,accent,1,Math.PI/2-.95);}
 if(look.ahoge)lock([hairAt(.14,Math.PI,.0),hairAt(.06,Math.PI,.1),new T.Vector3(.04,HC+HY+.16,-.07),new T.Vector3(.1,HC+HY+.14,-.01)],.042,.5,t=>Math.cos(t*Math.PI/2)**.6,10);
 if(look.clip){const c=hairAt(1.12,Math.PI+.62,.085);box(head,c.x,c.y,c.z,.15,.045,.05,accent,-.55);ball(head,c.x-.04,c.y+.025,c.z-.012,.026,.026,.014,'#e3c67e','gloss');}
 if(look.glasses)for(const s of [-1,1]){const x=s*EX,slope=(faceZ(x+.01,EY)-faceZ(x-.01,EY))/.02,z=faceZ(x,EY)-.032;add(head,new T.TorusGeometry(.104,.0075,6,32),at(x,EY,z,1,.92,1,0,Math.atan2(-slope,1),0),'#584531','gloss');if(s>0)box(head,0,EY+.02,faceZ(0,EY)-.045,.12,.014,.012,'#584531');rod(head,new T.Vector3(s*.268,EY+.02,faceZ(.268,EY)-.03),new T.Vector3(s*.43,EY+.03,-.02),.007,'#584531');}

 // ---- body: a short flared coat on a tiny neck -------------------------------------------
 add(root,COAT,at(0,0,0,1,1,.8),coat);
 ring(root,0,.452,0,.247,.017,shift(coat,-.07),.8);
 add(root,CYLINDER,at(0,.93,0,.066,.12,.066),skin,'matte',(p,_n,c)=>c.lerp(neck,T.MathUtils.clamp((p.y-.9)/.06,0,1)*.8));
 // Shirt V, lapels, collar, buttons and a name badge, laid on the coat surface.
 decal([V(-.084,.888),V(-.004,.672),V(.004,.672),V(.084,.888)],accent);
 for(const s of [-1,1])decal([V(s*.078,.889),V(s*.135,.862),V(s*.058,.722),V(s*.003,.668)],shift(coat,-.05),1);
 ring(root,0,.905,0,.072,.022,accent,1);
 for(const y of [.6,.53])ball(root,0,y,torsoZ(0,y)-.006,.014,.014,.008,'#d8c59b','gloss');
 decal([V(.1,.715),V(.165,.715),V(.165,.77),V(.1,.77)],'#efe6d2',1);decal([V(.1,.757),V(.165,.757),V(.165,.77),V(.1,.77)],accent,2);
 if([0,3,7,12].includes(id))ring(root,0,.89,0,.1,.05,accent,.86);
 if(id===5)ring(root,0,.9,.05,.16,.05,coat,.75,Math.PI/2-.3,Math.PI,0);
 // ---- limbs: shoulder and hip pivots are what scene3d animates ------------------------------
 const [shoe,sole]=SHOES[look.shoe];
 for(const side of [-1,1]){
  const arm=new T.Group();arm.name=side<0?'leftArm':'rightArm';arm.position.set(side*.235,DOLL.shoulderY,0);root.add(arm);
  add(arm,SLEEVE,at(side*.008,0,0,1,1,1,0,0,side*.12),coat,'matte',(p,_n,c)=>{if(Math.cos(.12)*p.y-Math.sin(side*.12)*(p.x-side*.008)<-.16)c.set(accent);});
  ball(arm,side*.037,-.262,-.008,.058,.064,.058,skin);ball(arm,0,-.25,-.052,.024,.032,.026,skin);
  arms.push(arm);
  const leg=new T.Group();leg.name=side<0?'leftLeg':'rightLeg';leg.position.set(side*.112,DOLL.hipY,0);root.add(leg);
  add(leg,TROUSER,null,pants);
  ball(leg,0,-.343,-.035,.096,.074,.15,shoe);ball(leg,0,-.404,-.037,.1,.017,.156,sole,'matte',SPHERE);
  box(leg,0,-.287,-.1,.086,.016,.03,accent,0);
  legs.push(leg);
 }
 const knife=new T.Group();knife.name='knife';
 box(knife,.04,-.33,-.035,.045,.13,.045,KNIFE.grip);box(knife,.04,-.40,-.035,.14,.022,.065,KNIFE.guard);
 add(knife,new T.ConeGeometry(.05,.28,3),at(.04,-.555,-.035,1,1,1,0,0,Math.PI),KNIFE.blade,'gloss');
 knife.visible=false;arms[1].add(knife);
 bake();
 const shadow=new T.Mesh(SHADOW_GEO,SHADOW);shadow.name='shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.018;root.add(shadow);
 return{root,head,arms,legs,knife,shadow,dispose(){root.traverse(o=>{if(o instanceof T.Mesh&&o.geometry!==SHADOW_GEO)o.geometry.dispose();});}};
}

// The player's own forearm in first person (camera space, reaching in from the lower right):
// the figures' sleeve with its cuff band and a mitten hand, in the player's own figure paint,
// so it matches how everyone else sees that character. The forearm pivots at VIEW_WRIST and
// runs back through VIEW_SHOULDER; VIEW_HAND (the mitten centre) is the device-reach contact
// point, and aim() swings the whole forearm so the long sleeve always comes from the shoulder.
const VIEW_FOREARM=new T.Vector3(-.075,.21,-.17).normalize();
export const VIEW_HAND=new T.Vector3(.28,-.15,-.55),VIEW_WRIST=VIEW_HAND.clone().addScaledVector(VIEW_FOREARM,-.072),VIEW_SHOULDER=VIEW_WRIST.clone().addScaledVector(VIEW_FOREARM,-.37);
const VIEW_SLEEVE=new T.LatheGeometry([[0,-.95],[.11,-.95],[.096,-.42],[.086,-.24],[.075,-.07],[.077,-.066],[.08,-.06],[.08,-.012],[.072,.006],[0,.008]].map(([r,y])=>new T.Vector2(r,y)),20),VIEW_MITTEN=new T.SphereGeometry(1,24,18);
for(const g of [VIEW_SLEEVE,VIEW_MITTEN])SHARED.add(g);
export function createViewArm(index:number){
 const id=((index%16)+16)%16,{coat,accent,skin}=figurePaint(id),{add,at,box,bake}=kit(),arm=new T.Group(),fore=new T.Group(),knife=new T.Group();
 // Forearm frame: y along the arm towards the fingers, z the back of the hand (towards the eye), thumb on -x.
 const side=new T.Vector3(1,0,0).addScaledVector(VIEW_FOREARM,-VIEW_FOREARM.x).normalize();
 fore.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(side,VIEW_FOREARM,new T.Vector3().crossVectors(side,VIEW_FOREARM)));fore.position.copy(VIEW_WRIST);arm.add(fore);
 const rest=fore.quaternion.clone(),turn=new T.Quaternion();
 add(fore,VIEW_SLEEVE,null,coat,'matte',(p,_n,c)=>{if(p.y>-.064)c.set(accent);});
 // Mitten: one smooth rounded paddle with the thumb on the inner side, like the figures' hands.
 add(fore,VIEW_MITTEN,at(0,.072,.002,.062,.076,.05),skin);add(fore,VIEW_MITTEN,at(-.056,.052,.016,.024,.036,.026,0,0,.55),skin);
 box(knife,VIEW_HAND.x,-.1,VIEW_HAND.z,.055,.18,.055,KNIFE.grip);box(knife,VIEW_HAND.x,.02,VIEW_HAND.z,.17,.03,.07,KNIFE.guard);add(knife,new T.ConeGeometry(.058,.42,3),at(VIEW_HAND.x,.23,VIEW_HAND.z,1,1,1),KNIFE.blade,'gloss');
 bake();
 return{avatar:id,arm,knife,
  // Point the forearm along `direction` (shoulder to wrist), or back to rest without one.
  aim(direction?:T.Vector3){fore.quaternion.copy(rest);if(direction)fore.quaternion.premultiply(turn.setFromUnitVectors(VIEW_FOREARM,direction));},
  dispose(){for(const g of [arm,knife]){g.removeFromParent();g.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});}}};
}
