import * as T from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {AVATAR_3D} from './first-person.ts';
export {DOLL_NAMES} from './doll-names.ts';

// Soft toy figures (1 unit = 40 map px): a big round head (about half of the height), a small
// bean-shaped body, stubby arms with mitten hands and round shoes. Simple dot eyes set low on
// the face, rosy cheeks and chunky hair with rounded ends keep them cute rather than uncanny.
// Viewed from the first-person camera (eye 1.43) other players' eyes sit a little lower.
export const DOLL={height:1.71,headY:1.24,headScale:.94,shoulderY:.82,hipY:.42,labelY:2.0};
// The head is authored around its own centre (y 1.36) and the head group is scaled/offset
// onto DOLL.headY, so face, hair and accessories share one coordinate frame.
const LEGACY_HEAD_Y=1.36;

// A round head, only a little fuller at the cheeks than at the chin. faceZ() is the exact
// front surface, so painted features lie on the skin.
const HC=LEGACY_HEAD_Y,HX=.43,HY=.41,HZ=.41;
const jaw=(y:number)=>{const s=T.MathUtils.clamp((HC-.05-y)/(HY-.05),0,1);return s*s*(3-2*s);};
const widthAt=(y:number)=>1-.07*jaw(y),depthAt=(y:number)=>1-.03*jaw(y);
const faceZ=(x:number,y:number)=>{const u=x/(HX*widthAt(y)),v=(y-HC)/HY;return -HZ*depthAt(y)*Math.sqrt(Math.max(.012,1-u*u-v*v));};
// Hair rides on the same shape, `pad` above the skin; below the widest line it falls straight.
const hairAt=(theta:number,phi:number,pad:number)=>{const y=HC+(HY+pad)*Math.cos(theta),s=Math.sin(theta);return new T.Vector3((HX+pad)*s*Math.sin(phi)*widthAt(y),y,(HZ+pad)*s*Math.cos(phi)*depthAt(y));};
const hang=(phi:number,drop:number,pad:number,inward=0)=>{const e=hairAt(Math.PI/2,phi,pad);return new T.Vector3(e.x*(1-inward),HC-drop,e.z*(1-inward));};
// The body is a bean: a lathe of TORSO squashed to .86 depth (torsoZ is its front surface).
const TORSO=[[0,.415],[.14,.417],[.205,.43],[.228,.46],[.228,.52],[.216,.6],[.204,.68],[.196,.75],[.18,.81],[.15,.855],[.1,.885],[.04,.9],[0,.902]];
const torsoR=(y:number)=>{for(let i=1;i<TORSO.length;i++){const [r0,y0]=TORSO[i-1],[r1,y1]=TORSO[i];if(y<=y1)return r0+(r1-r0)*T.MathUtils.clamp((y-y0)/(y1-y0),0,1);}return 0;};
const torsoZ=(x:number,y:number)=>-.86*Math.sqrt(Math.max(.0004,torsoR(y)**2-x*x));

// Shared, never disposed: every doll in every scene and the portrait renderer use the same
// three materials (vertex colours), so a doll costs one draw call per joint group and kind.
const MATTE=new T.MeshStandardMaterial({vertexColors:true,roughness:.74,metalness:0});
const GLOSS=new T.MeshStandardMaterial({vertexColors:true,roughness:.3,metalness:0});
// A little of each surface's own colour is added as glow, like a soft vinyl toy: shadow sides
// stay warm and readable under the map's cool light instead of turning grey-green.
for(const m of [MATTE,GLOSS])m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.2;');};
const PAINT=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
const SHADOW=new T.MeshBasicMaterial({color:'#07101a',transparent:true,opacity:.23,depthWrite:false});
const SHADOW_GEO=new T.CircleGeometry(.34,24);
const HEAD=(()=>{const s=new T.SphereGeometry(1,36,26);s.deleteAttribute('uv');s.deleteAttribute('normal');const g=mergeVertices(s);s.dispose();const p=g.attributes.position;for(let i=0;i<p.count;i++){const y=HC+p.getY(i)*HY;p.setXYZ(i,p.getX(i)*HX*widthAt(y),y,p.getZ(i)*HZ*depthAt(y));}g.computeVertexNormals();return g;})();
const SPHERE=new T.SphereGeometry(1,16,12),SMALL=new T.SphereGeometry(1,10,8),CYLINDER=new T.CylinderGeometry(1,1,1,12);
const lathe=(profile:number[][],segments:number)=>new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),segments);
const BODY=lathe(TORSO,24),SLEEVE=lathe([[0,.04],[.04,.035],[.06,.01],[.064,-.06],[.066,-.15],[.07,-.153],[.071,-.185],[.062,-.205],[0,-.208]],12),TROUSER=lathe([[0,.03],[.07,.02],[.085,-.02],[.08,-.18],[.074,-.28],[0,-.285]],12);
const SHARED=new Set<T.BufferGeometry>([HEAD,SPHERE,SMALL,CYLINDER,BODY,SLEEVE,TROUSER]);
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
// right) and `below` of that on the other side: lashes, brows, mouths.
const stroke=(line:T.Vector2[],width:number[],below=.25)=>{const a:T.Vector2[]=[],b:T.Vector2[]=[];line.forEach((p,i)=>{const d=line[Math.min(line.length-1,i+1)].clone().sub(line[Math.max(0,i-1)]).normalize(),n=V(-d.y,d.x);a.push(p.clone().addScaledVector(n,width[i]));b.push(p.clone().addScaledVector(n,-width[i]*below));});return [...b,...a.reverse()];};
const taper=(n:number,w0:number,w1:number,w2:number)=>Array.from({length:n},(_,i)=>{const t=i/(n-1);return t<.5?w0+(w1-w0)*Math.sin(t*Math.PI):w2+(w1-w2)*Math.sin(t*Math.PI);});
// Lock end shapes: `round` stays full and closes like a fingertip; `drop` swells then rounds off.
const round=(t:number)=>Math.max(0,1-t**2.4)**.5,drop=(t:number)=>Math.sin(Math.PI*(.18+.82*t))**.6;

// Per-avatar look. Hair: short, bob (to the jaw) or long (to the shoulders). Fringe: swept to
// one side (sweep), parted in the middle, or straight-cut bangs; tail adds twin tails, a
// ponytail or a bun.
type Look={girl:boolean;hair:'short'|'bob'|'long';fringe:'swept'|'part'|'bangs';sweep:number;ahoge?:boolean;tail?:'twin'|'pony'|'bun';clip?:boolean;glasses?:boolean;mouth:'smile'|'cat'|'open';shoe:number};
const LOOKS:Look[]=[
 {girl:false,hair:'short',fringe:'swept',sweep:1,ahoge:true,mouth:'smile',shoe:0},{girl:true,hair:'long',fringe:'bangs',sweep:0,mouth:'smile',shoe:3},
 {girl:false,hair:'short',fringe:'swept',sweep:-1,mouth:'open',shoe:1},{girl:true,hair:'long',fringe:'swept',sweep:1,mouth:'cat',shoe:2},
 {girl:true,hair:'bob',fringe:'bangs',sweep:0,clip:true,mouth:'smile',shoe:3},{girl:false,hair:'short',fringe:'part',sweep:0,mouth:'smile',shoe:0},
 {girl:true,hair:'short',fringe:'bangs',sweep:0,tail:'twin',mouth:'open',shoe:2},{girl:false,hair:'short',fringe:'swept',sweep:-1,mouth:'smile',shoe:1},
 {girl:false,hair:'short',fringe:'swept',sweep:1,ahoge:true,mouth:'cat',shoe:0},{girl:true,hair:'long',fringe:'swept',sweep:-1,clip:true,mouth:'smile',shoe:3},
 {girl:false,hair:'short',fringe:'part',sweep:0,glasses:true,mouth:'smile',shoe:1},{girl:true,hair:'bob',fringe:'swept',sweep:-1,tail:'bun',mouth:'smile',shoe:2},
 {girl:true,hair:'short',fringe:'bangs',sweep:0,tail:'pony',mouth:'open',shoe:3},{girl:false,hair:'short',fringe:'swept',sweep:-1,ahoge:true,mouth:'open',shoe:2},
 {girl:true,hair:'bob',fringe:'swept',sweep:1,clip:true,mouth:'cat',shoe:0},{girl:false,hair:'short',fringe:'swept',sweep:1,mouth:'smile',shoe:1},
];
const SHOES=[['#3a3d4c','#e9e2d6'],['#6a4634','#ece0cb'],['#f3eee6','#c9c1b4'],['#8a4a58','#f1e7da']];
const IRIS=['#806052','#5395ab','#947b52','#679c86','#a26f8d','#8b78b4','#5e95b6','#a17c53','#7e9c74','#9b7ab3','#679d99','#bb875e','#a58097','#7d9eb8','#9296c5','#708da6'];

// Figure paint: skin a touch warmer, very dark hair lifted so its rounded form still reads.
// AVATAR_3D itself stays as authored (the 2D UI uses it); only the figures are repainted.
function figurePaint(id:number){
 const [coat,hairBase,accent,skinBase,pants]=AVATAR_3D[id],fair=T.MathUtils.smoothstep(new T.Color(skinBase).getHSL(hsl,T.SRGBColorSpace).l,.5,.72),hairLight=new T.Color(hairBase).getHSL(hsl,T.SRGBColorSpace).l;
 return{coat,accent,pants,fair,hairLight,skin:shift(skinBase,.01,.1*fair,-.01*fair),hair:shift(hairBase,Math.max(0,.17-hairLight),.03)};}
const KNIFE={grip:'#393040',guard:'#c4d6dd',blade:'#dde8ed'};
// Every piece is baked into its joint group's buffers with a vertex colour (shade() may vary
// it per vertex); bake() then makes one mesh per joint group and material kind. Baked
// geometry is marked shared: templates reuse it for every copy of that figure.
function kit(){
 const parts=new Map<T.Object3D,Record<Kind,T.BufferGeometry[]>>();
 const add=(g:T.Object3D,source:T.BufferGeometry,m:T.Matrix4|null,c:T.ColorRepresentation,kind:Kind='matte',shade?:Shade)=>{
  const geo=source.clone();if(m)geo.applyMatrix4(m);geo.deleteAttribute('uv');if(!geo.index){const n=geo.attributes.position.count;geo.setIndex(Array.from({length:n},(_,i)=>i));}
  if(!geo.attributes.normal)geo.computeVertexNormals();base.set(c);const pos=geo.attributes.position,nor=geo.attributes.normal,n=pos.count,rgb=new Float32Array(n*3);
  for(let i=0;i<n;i++){colour.copy(base);if(shade)shade(p3.fromBufferAttribute(pos,i),n3.fromBufferAttribute(nor,i),colour);rgb[i*3]=colour.r;rgb[i*3+1]=colour.g;rgb[i*3+2]=colour.b;}geo.setAttribute('color',new T.BufferAttribute(rgb,3));
  let entry=parts.get(g);if(!entry){entry={matte:[],gloss:[],paint:[]};parts.set(g,entry);}entry[kind].push(geo);if(!SHARED.has(source))source.dispose();};
 const at=(x:number,y:number,z:number,sx:number,sy:number,sz:number,rx=0,ry=0,rz=0)=>matrix.compose(new T.Vector3(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),new T.Vector3(sx,sy,sz)).clone();
 const ball=(g:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,c:T.ColorRepresentation,kind:Kind='matte',geo=Math.max(sx,sy,sz)<.05?SMALL:SPHERE)=>add(g,geo,at(x,y,z,sx,sy,sz),c,kind);
 const ring=(g:T.Object3D,x:number,y:number,z:number,r:number,tube:number,c:T.ColorRepresentation,sz=1,rx=Math.PI/2,ry=0)=>add(g,new T.TorusGeometry(r,tube,6,20),at(x,y,z,1,sz,1,rx,ry,0),c);
 const rod=(g:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,c:T.ColorRepresentation,kind:Kind='matte')=>{const d=b.clone().sub(a);add(g,CYLINDER,new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize()),new T.Vector3(r,d.length(),r)),c,kind);};
 const bake=()=>{for(const [group,kinds] of parts)for(const [kind,list] of Object.entries(kinds) as [Kind,T.BufferGeometry[]][]){if(!list.length)continue;const merged=mergeGeometries(list,false)!;list.forEach(g=>g.dispose());merged.computeBoundingSphere();merged.userData.shared=true;group.add(new T.Mesh(merged,kind==='paint'?PAINT:kind==='gloss'?GLOSS:MATTE));}parts.clear();};
 return{add,at,ball,ring,rod,bake};}

// Builds one figure (about 9k triangles). createDoll() copies it, so this runs once per avatar.
function build(id:number){
 const look=LOOKS[id],root=new T.Group(),head=new T.Group(),girl=look.girl;
 root.name='doll-'+id;head.name='head';root.add(head);head.scale.setScalar(DOLL.headScale);head.position.y=DOLL.headY-LEGACY_HEAD_Y*DOLL.headScale;
 const {coat,accent,pants,skin,fair,hair,hairLight}=figurePaint(id),{add,at,ball,ring,rod,bake}=kit();
 // Flat shapes laid onto a surface z=surface(x,y), subdivided so they bend with it. Face paint
 // is unlit like printed toy paint; clothing decals are lit and face outwards (-z).
 const lay=(g:T.Object3D,shape:T.Vector2[],c:T.ColorRepresentation|((x:number,y:number,o:T.Color)=>void),cx:number,cy:number,surface:(x:number,y:number)=>number,lift:number,kind:Kind='paint',mirror=1,fine=.03)=>{
  if(shape.length<3)return;const flat=new T.ShapeGeometry(new T.Shape(shape)).toNonIndexed(),vertices:number[]=[];
  const split=(a:T.Vector3,b:T.Vector3,c:T.Vector3,depth=0)=>{const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);if(Math.max(ab,bc,ca)<fine||depth>=7){if(kind==='paint')vertices.push(a.x,a.y,0,b.x,b.y,0,c.x,c.y,0);else vertices.push(a.x,a.y,0,c.x,c.y,0,b.x,b.y,0);return;}if(ab>=bc&&ab>=ca){const m=a.clone().add(b).multiplyScalar(.5);split(a,m,c,depth+1);split(m,b,c,depth+1);}else if(bc>=ca){const m=b.clone().add(c).multiplyScalar(.5);split(a,b,m,depth+1);split(a,m,c,depth+1);}else{const m=c.clone().add(a).multiplyScalar(.5);split(a,b,m,depth+1);split(m,b,c,depth+1);}};
  const fp=flat.attributes.position;for(let i=0;i<fp.count;i+=3)split(new T.Vector3().fromBufferAttribute(fp,i),new T.Vector3().fromBufferAttribute(fp,i+1),new T.Vector3().fromBufferAttribute(fp,i+2));flat.dispose();
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)*mirror+cx,y=p.getY(i)+cy;p.setXYZ(i,x,y,surface(x,y)-lift);}geo.computeVertexNormals();
  if(typeof c==='function')add(g,geo,null,'#fff',kind,(v,_n,o)=>c((v.x-cx)*mirror,v.y-cy,o));else add(g,geo,null,c,kind);};
 const paint=(shape:T.Vector2[],c:T.ColorRepresentation|((x:number,y:number,o:T.Color)=>void),cx:number,cy:number,layer=0,mirror=1,fine=.03)=>lay(head,shape,c,cx,cy,faceZ,.003+layer*.0008,'paint',mirror,fine);
 const decal=(shape:T.Vector2[],c:T.ColorRepresentation,layer=0)=>lay(root,shape,c,0,0,torsoZ,.003+layer*.0025,'matte',1,.04);
 // Hair shading: a soft sheen across the crown, the underside a little deeper.
 const sheen=shift(hair,.16,-.03),under=shift(hair,-.05);
 const hairShade:Shade=(p,n,c)=>{const band=Math.exp(-(((p.y-(HC+.24))/.06)**2))*Math.max(0,Math.min(1,(n.x*p.x/HX+n.y*(p.y-HC)/HY+n.z*p.z/HZ)*2));c.lerp(under,T.MathUtils.clamp((HC-.05-p.y)/.5,0,1)*.6).lerp(sheen,band*.55);};
 // A chunky lock: a thick flattened tube along a smooth path, its wide side lying on the head,
 // ending in a rounded tip. The open root is always buried in the hair cap.
 const lock=(path:T.Vector3[],width:number,flat=.5,profile=round,steps=10)=>{
  const curve=new T.CatmullRomCurve3(path,false,'centripetal'),v:number[]=[],ix:number[]=[],around=9;
  for(let i=0;i<=steps;i++){const t=i/steps,p=curve.getPoint(t),tan=curve.getTangent(t),out=new T.Vector3(p.x/HX**2,(p.y-HC)/HY**2,p.z/HZ**2).normalize(),side=new T.Vector3().crossVectors(tan,out).normalize(),up=new T.Vector3().crossVectors(tan,side).normalize(),r=Math.max(.002,width*(profile(t)||0));
   for(let j=0;j<around;j++){const a=j/around*Math.PI*2,w=p.clone().addScaledVector(side,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r*flat);v.push(w.x,w.y,w.z);if(i<steps){const n=i*around+j,k=i*around+(j+1)%around;ix.push(n,k,n+around,k,k+around,n+around);}}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(ix);geo.computeVertexNormals();add(head,geo,null,hair,'matte',hairShade);};

 // ---- head (legacy coordinates, see LEGACY_HEAD_Y) ----------------------------------------
 // Skin with soft rosy cheeks (vertex colour, lit) and a little shade under the chin.
 const blush=skin.clone().lerp(new T.Color('#ff8e8c'),.28+.22*fair),neck=shift(skin,-.07);
 add(head,HEAD,null,skin,'matte',(p,_n,c)=>{for(const s of [-1,1]){const dx=(p.x-s*.2)/.08,dy=(p.y-1.222)/.05;if(p.z<0)c.lerp(blush,.75*Math.exp(-dx*dx-dy*dy));}c.lerp(neck,T.MathUtils.clamp((1.03-p.y)/.08,0,1));});
 for(const side of [-1,1])ball(head,side*.418,1.3,.02,.042,.062,.048,skin,'matte',SMALL);
 // Eyes: tall dark ovals set a little below the middle of the face, tinted with the eye colour
 // at the bottom, with one big and one small highlight (same side on both eyes, like a light).
 const EX=.148,EY=1.3,rx=girl?.053:.049,ry=girl?.071:.066,dark=new T.Color('#2a2129').lerp(new T.Color(IRIS[id]),.12),tint=shift(IRIS[id],-.04,.06);
 for(const side of [-1,1]){const cx=side*EX;
  paint(ellipse(0,0,rx,ry,32),(_x,y,o)=>o.copy(dark).lerp(tint,.8*T.MathUtils.clamp((-.15*ry-y)/(.75*ry),0,1)),cx,EY,1,1,.012);
  paint(ellipse(-rx*.3,ry*.34,rx*.38,ry*.31,20),'#ffffff',cx,EY,2);
  paint(ellipse(rx*.36,-ry*.4,rx*.17,rx*.17,14),'#ffffff',cx,EY,2);
  // Two small lashes at the outer corner for the girls.
  if(girl)for(const [a,len] of [[.42,.024],[.85,.02]] as const){const s=V(Math.cos(a)*rx*.96,Math.sin(a)*ry*.96),d=V(Math.cos(a)*1.25,Math.sin(a)*.9).normalize();paint(stroke([s,s.clone().addScaledVector(d,len*.5),s.clone().addScaledVector(d,len)],[.0055,.004,.0012],.5),dark,cx,EY,1,side);}
  // Small soft brows.
  paint(stroke(new T.QuadraticBezierCurve(V(-.034,-.004),V(0,.012),V(.036,-.002)).getPoints(8),girl?taper(9,.004,.0068,.003):taper(9,.0065,.009,.005),.5),shift(hair,hairLight>.45?-.22:-.05,.04),cx+side*.004,EY+.105,1,side);
 }
 // A small mouth close under the eyes: a smile, a cat "ω" or a little open laugh.
 const mouthC=new T.Color('#7c3a42').lerp(skin,.08);
 if(look.mouth==='open'){const m=[...new T.QuadraticBezierCurve(V(-.026,.006),V(0,.002),V(.026,.006)).getPoints(8),...new T.CubicBezierCurve(V(.026,.006),V(.022,-.034),V(-.022,-.034),V(-.026,.006)).getPoints(12).slice(1,-1)].reverse();paint(m,'#8e3d48',0,1.19,1);paint(clip(ellipse(0,-.024,.016,.011),m),'#ec8f98',0,1.19,2);}
 else if(look.mouth==='cat'){for(const s of [-1,1])paint(stroke(new T.QuadraticBezierCurve(V(0,.005),V(.013,-.016),V(.026,.004)).getPoints(8),taper(9,.0022,.005,.0018),.5),mouthC,0,1.195,1,s);}
 else paint(stroke(new T.QuadraticBezierCurve(V(-.025,.007),V(0,-.016),V(.025,.007)).getPoints(10),taper(11,.0025,.0062,.0025),.5),mouthC,0,1.195,1);

 // ---- hair -------------------------------------------------------------------------------
 // One puffy cap, fringe included: its edge is a row of soft rounded scallops that curl under
 // into the skin, so there is no hard rim. The fringe is straight-cut, parted in the middle or
 // longer on one side (sweep); side locks and tails are added on top.
 const sweep=look.sweep,front=(s:number)=>look.fringe==='bangs'?1.3:look.fringe==='part'?1.13+.17*Math.min(1,Math.abs(s)/.55):1.25+.09*sweep*T.MathUtils.clamp(s/.9,-1,1);
 const sides=[[.75,0],[1.02,1.38],[1.3,1.5],[1.6,1.36],[2.05,2.15],[Math.PI,2.55]];
 const hairline=(s:number)=>{const f=Math.abs(s);let back=2.55;for(let i=1;i<sides.length;i++)if(f<=sides[i][0]){const t=T.MathUtils.clamp((f-sides[i-1][0])/(sides[i][0]-sides[i-1][0]),0,1),from=i===1?front(s):sides[i-1][1];back=from+(sides[i][1]-from)*t*t*(3-2*t);break;}return f<.75?front(s):back;};
 // Rings run from the crown to the edge at full thickness, then LIP rings roll the edge under
 // into the skin, so the edge reads as a thick rounded lip and meets the skin at a clean line.
 const clumps=14,sectors=clumps*5,rings=16,LIP=[[.012,.04],[.026,.016],[.034,-.012]],hv:number[]=[],hi:number[]=[];
 for(let a=0;a<=rings+LIP.length;a++)for(let b=0;b<=sectors;b++){
  const phi=b/sectors*Math.PI*2,s=Math.atan2(Math.sin(phi-Math.PI),Math.cos(phi-Math.PI)),frac=(b/5)%1,arch=Math.sin(Math.PI*frac),u=Math.min(1,a/rings);
  const edge=hairline(s)+arch*(Math.abs(s)<.8?.055:.085),lip=LIP[a-rings-1],theta=lip?edge+lip[0]:.006+(edge-.006)*u;
  const pad=lip?lip[1]:(.05+.032*Math.cos(Math.min(theta,Math.PI/2))**2)*(1-.25*T.MathUtils.smoothstep(u,.7,1))+.008*arch*u;
  const p=hairAt(theta,phi,pad);hv.push(p.x,p.y,p.z);if(a<rings+LIP.length&&b<sectors){const n=a*(sectors+1)+b;hi.push(n,n+sectors+1,n+1,n+1,n+sectors+1,n+sectors+2);}}
 const capRaw=new T.BufferGeometry();capRaw.setAttribute('position',new T.Float32BufferAttribute(hv,3));capRaw.setIndex(hi);const cap=mergeVertices(capRaw);capRaw.dispose();cap.computeVertexNormals();add(head,cap,null,hair,'matte',hairShade);
 // A swept fringe gets one big soft swoop across the top, so the hair has a direction.
 if(look.fringe==='swept')lock([0,.3,.6,.85,1].map(t=>hairAt(.25+.95*t,Math.PI-sweep*(.25-1.05*t),.05+.045*Math.sin(Math.PI*t))),.16,.45,round,10);
 // Side locks frame the face in front of the ears; longer for bob/long hair and the girls.
 const sideDrop=look.hair==='long'?.4:look.hair==='bob'?.3:girl?.22:.04;
 for(const s of [-1,1]){const phi=Math.PI-s*1.1;lock([hairAt(.6,phi,.02),hairAt(1.0,phi,.055),hairAt(1.36,phi+s*.05,.055),hang(phi+s*.08,sideDrop*.5,.05),hang(phi+s*.1,sideDrop,.04,.05)],girl?.095:.085,.55);}
 // Bob and long hair: a soft mass of wide rounded locks over the back and sides.
 if(look.hair!=='short'){const long=look.hair==='long',d0=long?.56:.32;
  for(let i=0;i<7;i++){const phi=(i-3)/3*1.55,d=d0*(1-Math.abs(i-3)*.03);
   lock([hairAt(.95,phi,.02),hairAt(1.3,phi,.075),hang(phi,0,.08),hang(phi,d*.5,.075,long?.08:.03),hang(phi,d*.85,.065,long?.24:.1),hang(phi,d,.05,long?.3:.2)],.16,.55,round,12);}}
 // Tails and accessories.
 if(look.tail==='twin')for(const s of [-1,1]){const phi=s*1.05,tie=hairAt(.95,phi,.08);ball(head,tie.x,tie.y,tie.z,.05,.05,.05,accent,'gloss');lock([hairAt(.95,phi,0),hairAt(.95,phi,.14),new T.Vector3(s*.6,HC-.06,.32),new T.Vector3(s*.6,HC-.3,.28),new T.Vector3(s*.53,HC-.48,.25)],.12,.85,drop,12);}
 if(look.tail==='pony'){const tie=hairAt(1.1,0,.08);ball(head,tie.x,tie.y,tie.z,.055,.055,.055,accent,'gloss');lock([hairAt(1.1,0,0),hairAt(1.08,0,.16),new T.Vector3(0,HC-.14,.64),new T.Vector3(.02,HC-.4,.54),new T.Vector3(-.02,HC-.56,.45)],.13,.8,drop,12);}
 if(look.tail==='bun'){const c=hairAt(.6,0,.15);ball(head,c.x,c.y,c.z,.165,.16,.16,hair);ring(head,c.x,c.y-.09,c.z-.07,.12,.024,accent,1,Math.PI/2-.95);}
 if(look.ahoge)lock([hairAt(.12,Math.PI,0),hairAt(.05,Math.PI,.1),new T.Vector3(.03,HC+HY+.17,-.06),new T.Vector3(.09,HC+HY+.15,0)],.045,.6,round,8);
 if(look.clip){const c=hairAt(1.1,Math.PI+.66,.09);rod(head,c.clone().add(new T.Vector3(.055,.03,0)),c.clone().add(new T.Vector3(-.055,-.03,0)),.022,accent,'gloss');ball(head,c.x,c.y,c.z-.018,.034,.034,.02,'#f2d27a','gloss');}
 if(look.glasses)for(const s of [-1,1]){const x=s*EX,slope=(faceZ(x+.01,EY)-faceZ(x-.01,EY))/.02,z=faceZ(x,EY)-.03;add(head,new T.TorusGeometry(.085,.008,6,28),at(x,EY,z,1,1,1,0,Math.atan2(-slope,1),0),'#5b4836','gloss');if(s>0)rod(head,new T.Vector3(-.064,EY+.02,faceZ(-.064,EY)-.035),new T.Vector3(.064,EY+.02,faceZ(.064,EY)-.035),.008,'#5b4836','gloss');rod(head,new T.Vector3(s*.232,EY+.01,faceZ(.232,EY)-.025),new T.Vector3(s*.415,EY+.03,-.02),.007,'#5b4836','gloss');}

 // ---- body: a small bean with a round collar ---------------------------------------------
 add(root,BODY,at(0,0,0,1,1,.86),coat);
 ring(root,0,.445,0,.222,.02,shift(coat,-.06),.86);
 ring(root,0,.885,0,.082,.032,accent,.9);
 decal([V(-.072,.876),V(-.004,.74),V(.004,.74),V(.072,.876)],accent);
 for(const y of [.66,.58])ball(root,0,y,torsoZ(0,y)-.006,.017,.017,.01,'#f1e3c2','gloss');
 if([0,3,7,12].includes(id))ring(root,0,.875,0,.1,.05,accent,.88);
 if(id===5)add(root,new T.TorusGeometry(.15,.05,6,16,Math.PI),at(0,.9,.05,1,.75,1,Math.PI/2-.3,0,0),coat);
 // ---- limbs: shoulder and hip pivots are what scene3d animates ------------------------------
 const [shoe,sole]=SHOES[look.shoe],arms:T.Group[]=[],legs:T.Group[]=[];
 for(const side of [-1,1]){
  const arm=new T.Group();arm.name=side<0?'leftArm':'rightArm';arm.position.set(side*.225,DOLL.shoulderY,0);root.add(arm);
  add(arm,SLEEVE,at(side*.006,0,0,1,1,1,0,0,side*.1),coat,'matte',(p,_n,c)=>{if(Math.cos(.1)*p.y-Math.sin(side*.1)*(p.x-side*.006)<-.152)c.set(accent);});
  ball(arm,side*.028,-.252,-.006,.054,.058,.054,skin);ball(arm,0,-.24,-.046,.022,.03,.024,skin);
  arms.push(arm);
  const leg=new T.Group();leg.name=side<0?'leftLeg':'rightLeg';leg.position.set(side*.105,DOLL.hipY,0);root.add(leg);
  add(leg,TROUSER,null,pants);
  ball(leg,0,-.34,-.03,.092,.072,.142,shoe);ball(leg,0,-.4,-.032,.098,.02,.15,sole);
  legs.push(leg);
 }
 const knife=new T.Group();knife.name='knife';
 rod(knife,new T.Vector3(.04,-.27,-.035),new T.Vector3(.04,-.39,-.035),.024,KNIFE.grip);ball(knife,.04,-.4,-.035,.07,.012,.032,KNIFE.guard);
 add(knife,new T.ConeGeometry(.045,.26,3),at(.04,-.545,-.035,1,1,1,0,0,Math.PI),KNIFE.blade,'gloss');
 knife.visible=false;arms[1].add(knife);
 bake();
 const shadow=new T.Mesh(SHADOW_GEO,SHADOW);shadow.name='shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.018;root.add(shadow);
 return root;
}

// One template per avatar, built on first use; every doll is a cheap copy that shares its
// geometry and materials, so a player coming into view never costs a long frame.
const TEMPLATES=new Map<number,T.Group>();
const template=(id:number)=>{let t=TEMPLATES.get(id);if(!t){t=build(id);TEMPLATES.set(id,t);}return t;};
export function createDoll(index:number){
 const id=((index%16)+16)%16,root=template(id).clone(),part=(name:string)=>root.getObjectByName(name) as T.Group;
 return{root,head:part('head'),arms:[part('leftArm'),part('rightArm')],legs:[part('leftLeg'),part('rightLeg')],knife:part('knife'),shadow:part('shadow') as unknown as T.Mesh,
  // The geometry belongs to the template (shared by every copy), so only the copy is dropped.
  dispose(){root.removeFromParent();}};
}
// Builds the templates of these avatars now (call it while a loading screen shows), so the
// first sighting of each figure during play costs nothing.
export function warmDolls(indices:number[]){for(const i of new Set(indices))template(((i%16)+16)%16);}

// The player's own forearm in first person (camera space, reaching in from the lower right):
// the figures' sleeve with its cuff band and a mitten hand, in the player's own figure paint,
// so it matches how everyone else sees that character. The forearm pivots at VIEW_WRIST and
// runs back through VIEW_SHOULDER; VIEW_HAND (the mitten centre) is the device-reach contact
// point, and aim() swings the whole forearm so the long sleeve always comes from the shoulder.
const VIEW_FOREARM=new T.Vector3(-.075,.21,-.17).normalize();
export const VIEW_HAND=new T.Vector3(.28,-.15,-.55),VIEW_WRIST=VIEW_HAND.clone().addScaledVector(VIEW_FOREARM,-.072),VIEW_SHOULDER=VIEW_WRIST.clone().addScaledVector(VIEW_FOREARM,-.37);
const VIEW_SLEEVE=lathe([[0,-.95],[.105,-.95],[.094,-.42],[.084,-.24],[.074,-.07],[.077,-.066],[.08,-.06],[.08,-.012],[.072,.006],[0,.008]],20),VIEW_MITTEN=new T.SphereGeometry(1,24,18);
for(const g of [VIEW_SLEEVE,VIEW_MITTEN])SHARED.add(g);
export function createViewArm(index:number){
 const id=((index%16)+16)%16,{coat,accent,skin}=figurePaint(id),{add,at,rod,bake}=kit(),arm=new T.Group(),fore=new T.Group(),knife=new T.Group();
 // Forearm frame: y along the arm towards the fingers, z the back of the hand (towards the eye), thumb on -x.
 const side=new T.Vector3(1,0,0).addScaledVector(VIEW_FOREARM,-VIEW_FOREARM.x).normalize();
 fore.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(side,VIEW_FOREARM,new T.Vector3().crossVectors(side,VIEW_FOREARM)));fore.position.copy(VIEW_WRIST);arm.add(fore);
 const rest=fore.quaternion.clone(),turn=new T.Quaternion();
 add(fore,VIEW_SLEEVE,null,coat,'matte',(p,_n,c)=>{if(p.y>-.064)c.set(accent);});
 // Mitten: one smooth rounded paddle with the thumb on the inner side, like the figures' hands.
 add(fore,VIEW_MITTEN,at(0,.072,.002,.062,.076,.05),skin);add(fore,VIEW_MITTEN,at(-.056,.052,.016,.024,.036,.026,0,0,.55),skin);
 rod(knife,new T.Vector3(VIEW_HAND.x,-.19,VIEW_HAND.z),new T.Vector3(VIEW_HAND.x,-.01,VIEW_HAND.z),.03,KNIFE.grip);add(knife,SPHERE,at(VIEW_HAND.x,.02,VIEW_HAND.z,.09,.016,.04),KNIFE.guard);add(knife,new T.ConeGeometry(.058,.42,3),at(VIEW_HAND.x,.23,VIEW_HAND.z,1,1,1),KNIFE.blade,'gloss');
 bake();
 return{avatar:id,arm,knife,
  // Point the forearm along `direction` (shoulder to wrist), or back to rest without one.
  aim(direction?:T.Vector3){fore.quaternion.copy(rest);if(direction)fore.quaternion.premultiply(turn.setFromUnitVectors(VIEW_FOREARM,direction));},
  dispose(){for(const g of [arm,knife]){g.removeFromParent();g.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});}}};
}
