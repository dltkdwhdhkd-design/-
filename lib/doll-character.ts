import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {AVATAR_3D} from './first-person.ts';
export {DOLL_NAMES} from './doll-names.ts';

// Desk-figure proportions (1 unit = 40 map px): the head is about half of the height, the
// body a short flared coat on stubby legs, mitten hands and big rounded shoes. Viewed from
// the first-person camera (eye 1.43) other players' eyes sit slightly below eye level.
export const DOLL={height:1.71,headY:1.24,headScale:.94,shoulderY:.82,hipY:.42,labelY:2.0};
// The face and hair are authored around the legacy head centre (y 1.36) and the head group
// is scaled/offset onto DOLL.headY, so the painted features keep their tested layout.
const LEGACY_HEAD_Y=1.36;

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
const HEAD=new T.SphereGeometry(1,32,24),SPHERE=new T.SphereGeometry(1,16,12),SMALL=new T.SphereGeometry(1,10,8),ROUNDED=new RoundedBoxGeometry(1,1,1,2,.15),CYLINDER=new T.CylinderGeometry(1,1,1,22);
type Kind='matte'|'gloss'|'paint';
const colour=new T.Color(),matrix=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler();

export function createDoll(index:number){
 const id=((index%16)+16)%16,[coat,hair,accent,skin,pants]=AVATAR_3D[id],root=new T.Group(),head=new T.Group(),arms:T.Group[]=[],legs:T.Group[]=[];
 root.name='doll-'+id;head.name='head';root.add(head);head.scale.setScalar(DOLL.headScale);head.position.y=DOLL.headY-LEGACY_HEAD_Y*DOLL.headScale;
 const parts=new Map<T.Object3D,Record<Kind,T.BufferGeometry[]>>();
 // Every piece is baked into its joint group's buffers with a vertex colour.
 const add=(g:T.Object3D,source:T.BufferGeometry,m:T.Matrix4|null,c:string,kind:Kind='matte')=>{
  const geo=source.clone();if(m)geo.applyMatrix4(m);geo.deleteAttribute('uv');if(!geo.index){const n=geo.attributes.position.count;geo.setIndex(Array.from({length:n},(_,i)=>i));}
  if(!geo.attributes.normal)geo.computeVertexNormals();colour.set(c);const n=geo.attributes.position.count,rgb=new Float32Array(n*3);for(let i=0;i<n;i++){rgb[i*3]=colour.r;rgb[i*3+1]=colour.g;rgb[i*3+2]=colour.b;}geo.setAttribute('color',new T.BufferAttribute(rgb,3));
  let entry=parts.get(g);if(!entry){entry={matte:[],gloss:[],paint:[]};parts.set(g,entry);}entry[kind].push(geo);if(source!==HEAD&&source!==SPHERE&&source!==SMALL&&source!==ROUNDED&&source!==CYLINDER)source.dispose();};
 const at=(x:number,y:number,z:number,sx:number,sy:number,sz:number,rx=0,ry=0,rz=0)=>matrix.compose(new T.Vector3(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),new T.Vector3(sx,sy,sz)).clone();
 const ball=(g:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,kind:Kind='matte',geo=Math.max(sx,sy,sz)<.05?SMALL:SPHERE)=>add(g,geo,at(x,y,z,sx,sy,sz),c,kind);
 const box=(g:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,rz=0,kind:Kind='matte')=>add(g,ROUNDED,at(x,y,z,sx,sy,sz,0,0,rz),c,kind);
 const lock=(g:T.Object3D,a:number[],b:number[],c:number[],width:number,color=hair)=>{const curve=new T.QuadraticBezierCurve3(new T.Vector3(...a as [number,number,number]),new T.Vector3(...b as [number,number,number]),new T.Vector3(...c as [number,number,number])),v:number[]=[],ix:number[]=[];for(let i=0;i<=10;i++){const t=i/10,p=curve.getPoint(t),tangent=curve.getTangent(t),right=new T.Vector3(0,0,1).cross(tangent).normalize();if(right.lengthSq()<.1)right.set(1,0,0);const normal=tangent.clone().cross(right).normalize(),r=width*(.55+Math.sin(t*Math.PI)*.5)*(1-t*.97);for(let j=0;j<10;j++){const q=p.clone().addScaledVector(right,Math.cos(j*Math.PI/5)*r).addScaledVector(normal,Math.sin(j*Math.PI/5)*r*.58);v.push(q.x,q.y,q.z);if(i<10){const n=i*10+j,k=i*10+(j+1)%10;ix.push(n,k,n+10,k,k+10,n+10);}}}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(ix);geo.computeVertexNormals();add(g,geo,null,color);};

 // ---- head (legacy coordinates, see LEGACY_HEAD_Y) ----------------------------------------
 // One continuous face; painted features follow the surface instead of protruding eyeballs.
 add(head,HEAD,at(0,1.36,0,.455,.425,.375),skin);
 for(const sign of [-1,1])ball(head,sign*.424,1.30,.015,.064,.086,.064,skin);
 const iris=['#806052','#5395ab','#947b52','#679c86','#a26f8d','#8b78b4','#5e95b6','#a17c53','#7e9c74','#9b7ab3','#679d99','#bb875e','#a58097','#7d9eb8','#9296c5','#708da6'][id];
 const paint=(shape:T.Shape,c:string,cx:number,cy:number,layer=0)=>{const flat=new T.ShapeGeometry(shape,20).toNonIndexed(),vertices:number[]=[];const split=(a:T.Vector3,b:T.Vector3,c:T.Vector3,depth=0)=>{const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);if(Math.max(ab,bc,ca)<.03||depth>=7){vertices.push(a.x,a.y,0,b.x,b.y,0,c.x,c.y,0);return;}if(ab>=bc&&ab>=ca){const m=a.clone().add(b).multiplyScalar(.5);split(a,m,c,depth+1);split(m,b,c,depth+1);}else if(bc>=ca){const m=b.clone().add(c).multiplyScalar(.5);split(a,b,m,depth+1);split(a,m,c,depth+1);}else{const m=c.clone().add(a).multiplyScalar(.5);split(a,b,m,depth+1);split(m,b,c,depth+1);}};const fp=flat.attributes.position;for(let i=0;i<fp.count;i+=3)split(new T.Vector3().fromBufferAttribute(fp,i),new T.Vector3().fromBufferAttribute(fp,i+1),new T.Vector3().fromBufferAttribute(fp,i+2));flat.dispose();const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+cx,y=p.getY(i)+cy,z=-.375*Math.sqrt(Math.max(.015,1-(x/.455)**2-((y-1.36)/.425)**2))-.003-layer*.0007;p.setXYZ(i,x,y,z);}g.computeVertexNormals();add(head,g,null,c,'paint');};
 const ellipse=(x:number,y:number,rx:number,ry:number,c:string,layer=0)=>{const s=new T.Shape();s.absellipse(0,0,rx,ry,0,Math.PI*2,false,0);paint(s,c,x,y,layer);};
 for(const side of [-1,1]){const x=side*.169,y=1.335;
  const white=new T.Shape();white.moveTo(-.105,0);white.bezierCurveTo(-.09,.066,-.025,.083,.032,.067);white.bezierCurveTo(.078,.057,.105,.032,.108,.01);white.bezierCurveTo(.084,-.052,.026,-.063,-.023,-.056);white.bezierCurveTo(-.076,-.048,-.102,-.02,-.105,0);paint(white,'#fff7ef',x,y,1);
  ellipse(x+.009,y+.004,.057,.062,iris,2);ellipse(x+.009,y+.025,.042,.042,'#454355',3);ellipse(x+.009,y+.008,.025,.046,'#30303e',4);ellipse(x-.008,y+.037,.018,.020,'#ffffff',5);ellipse(x+.030,y-.023,.009,.010,'#defff3',5);
  const lid=new T.Shape();lid.moveTo(-.12,.018);lid.bezierCurveTo(-.095,.057,-.050,.083,.012,.079);lid.bezierCurveTo(.072,.076,.106,.046,.111,.015);lid.lineTo(.098,.019);lid.bezierCurveTo(.07,.056,.024,.062,-.004,.060);lid.bezierCurveTo(-.066,.061,-.092,.029,-.105,.004);lid.closePath();paint(lid,'#49373f',x,y,6);
  const brow=new T.Shape();brow.moveTo(-.069,0);brow.quadraticCurveTo(0,.024,.076,-.005);brow.lineTo(.073,-.012);brow.quadraticCurveTo(0,.013,-.069,-.008);brow.closePath();paint(brow,hair,x,1.466,1);
  ellipse(side*.279,1.222,.054,.023,'#e8b2aa',1);ellipse(side*.279,1.222,.036,.016,'#edbcb3',2);
 }
 const smile=new T.Shape();smile.moveTo(-.035,.006);smile.quadraticCurveTo(0,-.018,.035,.006);smile.quadraticCurveTo(.013,-.031,-.009,-.019);smile.quadraticCurveTo(-.028,-.013,-.035,.006);paint(smile,'#b27b78',0,1.183,1);
 // A continuous hair shell with a lifted fringe and a rounded back silhouette.
 const long=[1,3,9,11,12].includes(id),bob=[4,6,14].includes(id),sweep=id%3;
 const hv:number[]=[],hi:number[]=[],rings=18,sectors=40;
 for(let a=0;a<=rings;a++)for(let b=0;b<=sectors;b++){const phi=b/sectors*Math.PI*2,front=Math.max(0,-Math.cos(phi))**5,end=(long?2.40:bob?2.13:1.96)*(1-front)+1.18*front,theta=.006+(end-.006)*a/rings;hv.push(.489*Math.sin(theta)*Math.sin(phi),1.40+.463*Math.cos(theta),.035+.409*Math.sin(theta)*Math.cos(phi));if(a<rings&&b<sectors){const n=a*(sectors+1)+b;hi.push(n,n+sectors+1,n+1,n+1,n+sectors+1,n+sectors+2);}}
 const hg=new T.BufferGeometry();hg.setAttribute('position',new T.Float32BufferAttribute(hv,3));hg.setIndex(hi);hg.computeVertexNormals();add(head,hg,null,hair);
 for(let n=0;n<5;n++){const x=(n-2)*.15,offset=sweep===0?.11:sweep===1?-.10:0;lock(head,[x*.72,1.79,-.08],[x+offset,1.66,-.41],[x+offset*.7,1.505+(n%3)*.019,-.373],.139);}
 for(const side of [-1,1]){lock(head,[side*.37,1.68,.03],[side*.48,1.48,-.11],[side*.418,long?1.06:bob?1.16:1.28,-.067],.125);if(long)lock(head,[side*.38,1.55,.22],[side*.50,1.17,.25],[side*.32,.97,.27],.17);}
 if(id===11){ball(head,0,1.84,.17,.175,.18,.17,hair);ball(head,0,1.77,.16,.185,.024,.175,accent);}
 if(id===10){for(const x of [-.172,.172])add(head,new T.TorusGeometry(.104,.007,6,32),at(x,1.34,-.374,1,1,1),'#584531','gloss');box(head,0,1.34,-.376,.13,.014,.012,'#584531');}
 if([4,9,14].includes(id)){box(head,-.37,1.56,-.255,.15,.045,.05,accent,-.45);ball(head,-.4,1.58,-.265,.026,.026,.014,'#e3c67e','gloss');}

 // ---- body: a short flared coat on a tiny neck -------------------------------------------
 const profile=[[0,.355],[.2,.358],[.243,.375],[.255,.42],[.25,.5],[.236,.6],[.224,.7],[.214,.78],[.196,.84],[.15,.885],[.07,.905],[0,.91]].map(([r,y])=>new T.Vector2(r,y));
 add(root,new T.LatheGeometry(profile,22),at(0,0,0,1,1,.78),coat);
 add(root,CYLINDER,at(0,.47,0,.253,.05,.253*.8),'#333440');
 add(root,CYLINDER,at(0,.92,0,.075,.1,.075),skin);
 box(root,0,.7,-.168,.16,.3,.04,accent);
 for(const side of [-1,1]){box(root,side*.085,.76,-.18,.1,.2,.035,coat,side*-.32);box(root,side*.13,.6,-.178,.1,.022,.03,accent);}
 for(const y of [.57,.65,.73])ball(root,0,y,-.192,.014,.014,.008,'#d8c59b','gloss');
 box(root,-.13,.76,-.17,.055,.08,.016,'#e7dbc0');box(root,-.13,.776,-.18,.034,.026,.009,accent);
 if([0,3,7,12].includes(id)){add(root,CYLINDER,at(0,.875,-.005,.205,.085,.205*.82),accent);box(root,.1,.72,-.19,.1,.26,.045,accent,-.1);}
 if(id===5){box(root,0,.9,.07,.4,.13,.26,coat);for(const x of [-.06,.06])box(root,x,.8,-.192,.014,.16,.014,accent);}
 // ---- limbs: shoulder and hip pivots are what scene3d animates ------------------------------
 for(const side of [-1,1]){
  const arm=new T.Group();arm.name=side<0?'leftArm':'rightArm';arm.position.set(side*.235,DOLL.shoulderY,0);root.add(arm);
  add(arm,new T.CapsuleGeometry(.07,.15,4,12),at(side*.02,-.12,0,1,1,1,0,0,side*.12),coat);
  box(arm,side*.035,-.235,0,.15,.05,.15,accent);
  ball(arm,side*.04,-.29,-.01,.07,.075,.07,skin);ball(arm,-side*.005,-.275,-.06,.03,.04,.035,skin);
  arms.push(arm);
  const leg=new T.Group();leg.name=side<0?'leftLeg':'rightLeg';leg.position.set(side*.115,DOLL.hipY,0);root.add(leg);
  add(leg,new T.CapsuleGeometry(.09,.16,4,12),at(0,-.17,0,1,1,1),pants);
  ball(leg,0,-.335,-.035,.11,.085,.165,'#303340');box(leg,0,-.39,-.04,.22,.04,.33,'#b8a791');
  for(let k=0;k<2;k++)box(leg,0,-.30-k*.035,-.15,.1,.014,.024,accent);
  legs.push(leg);
 }
 const knife=new T.Group();knife.name='knife';
 box(knife,.04,-.33,-.035,.045,.13,.045,'#393040');box(knife,.04,-.40,-.035,.14,.022,.065,'#c4d6dd');
 add(knife,new T.ConeGeometry(.05,.28,3),at(.04,-.555,-.035,1,1,1,0,0,Math.PI),'#dde8ed','gloss');
 knife.visible=false;arms[1].add(knife);
 // ---- bake: one mesh per joint group and material kind --------------------------------------
 for(const [group,kinds] of parts)for(const [kind,list] of Object.entries(kinds) as [Kind,T.BufferGeometry[]][]){if(!list.length)continue;const merged=mergeGeometries(list,false)!;list.forEach(g=>g.dispose());merged.computeBoundingSphere();group.add(new T.Mesh(merged,kind==='paint'?PAINT:kind==='gloss'?GLOSS:MATTE));}
 const shadow=new T.Mesh(SHADOW_GEO,SHADOW);shadow.name='shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.018;root.add(shadow);
 return{root,head,arms,legs,knife,shadow,dispose(){root.traverse(o=>{if(o instanceof T.Mesh&&o.geometry!==SHADOW_GEO)o.geometry.dispose();});}};
}
