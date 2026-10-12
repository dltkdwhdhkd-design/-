import * as T from 'three';
import {reachAmount,type Reach,type DeviceTarget} from './interaction';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mapFor,roomFloors,ventsFor,emergencyFor,repairFor,distance,sight,type Point} from './map';
import {floorEdges,doorways} from './map-render';
import {securityConsole,communicationsConsole} from './surveillance';
import {createDoll,createViewArm,warmDolls,DOLL,VIEW_HAND,VIEW_SHOULDER,VIEW_WRIST} from './doll-character';
import {stageLights} from './doll-stage';
import type {View} from './game';
import type {FieldSnapshot,Effect} from './field';
export type SceneFrame={room:View;own:Point;people:FieldSnapshot['people'];bodies:FieldSnapshot['bodies'];effects:(Effect&{seenAt:number})[];radius:number;now:number;moving:boolean;sound:boolean;reach?:Reach|null};
export type Look={yaw:number;pitch:number};
const U=.025;
type Puppet={root:T.Group;arms:T.Group[];legs:T.Group[];knife:T.Group;last:Point;phase:number;label:T.Sprite;caption:string;avatar:number;dispose:()=>void};
export function createScene(canvas:HTMLCanvasElement,config:View['config'],low:boolean,avatars:number[]=[]){
 // basePixelRatio x quality (setQuality, driven by the frame-rate governor) is the drawing size.
 const renderer=new T.WebGLRenderer({canvas,antialias:!low,alpha:false,powerPreference:'high-performance'}),basePixelRatio=Math.min(devicePixelRatio||1,low?1:1.5);renderer.setPixelRatio(basePixelRatio);renderer.debug.checkShaderErrors=false;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const scene=new T.Scene();scene.background=new T.Color('#22355a');scene.fog=new T.Fog('#22355a',7,22);
 const camera=new T.PerspectiveCamera(76,1,.06,130);camera.rotation.order='YXZ';scene.add(camera);
 stageLights(scene);
 const map=mapFor(config),geo=new T.BoxGeometry(1,1,1),softGeo=new RoundedBoxGeometry(1,1,1,3,.12),sphere=new T.SphereGeometry(1,24,16),cylinder=new T.CylinderGeometry(1,1,1,10),materials=new Map<string,T.Material>(),textures=new Set<T.Texture>(),labels:T.Sprite[]=[];
 const mat=(color:string)=>{let m=materials.get(color) as T.MeshLambertMaterial|undefined;if(!m){m=new T.MeshLambertMaterial({color});materials.set(color,m);}return m;};
 // Unlit colour for lanterns, string lights and lit windows (still fades into the fog).
 const glowMat=(color:string)=>{let m=materials.get('glow:'+color) as T.MeshBasicMaterial|undefined;if(!m){m=new T.MeshBasicMaterial({color});materials.set('glow:'+color,m);}return m;};
 const box=(g:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const m=new T.Mesh(softGeo,mat(c));m.position.set(x,y,z);m.scale.set(w,h,d);g.add(m);return m;};
 // Night-time sea station in a toy style: cream pavilions with pastel bands, lit windows and
 // string lights; wooden bridges with railings and lanterns over a visible sea. Everything
 // static is batched by shape and colour into instanced meshes (one draw call per batch).
 type Shape='box'|'ball'|'cyl';const batch=new Map<string,{shape:Shape;color:string;glow:boolean;items:number[][]}>();
 const add=(shape:Shape,glow=false)=>(x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const key=shape+(glow?'+':'')+c;let b=batch.get(key);if(!b){b={shape,color:c,glow,items:[]};batch.set(key,b);}b.items.push([x,y,z,w,h,d]);};
 const fixed=add('box'),post=add('cyl'),bulb=add('ball',true),lit=add('box',true);
 const plaques=new Map<string,T.SpriteMaterial>();
 const tint=(c:string,amount:number,to='#f7f0e3')=>'#'+new T.Color(c).lerp(new T.Color(to),amount).getHexString();
 const WALL='#f2e8d6',WOOD='#b98e61',SEAM='#8a6543',RAIL='#f0e4cc',LANTERN='#ffcf73';
 // Sea: a wave texture repeated under the whole station, below the bridge decks.
 {const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d')!;x.fillStyle='#1c5f74';x.fillRect(0,0,256,256);x.strokeStyle='#58aebf';x.lineWidth=3;x.globalAlpha=.5;for(let row=0;row<6;row++){const y=row*256/6+20;x.beginPath();for(let i=0;i<=256;i+=8){const yy=y+Math.sin(i/256*Math.PI*4+row)*5;if(i)x.lineTo(i,yy);else x.moveTo(i,yy);}x.stroke();}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;const w=map.width*U+120,h=map.height*U+120;t.repeat.set(w/6,h/6);textures.add(t);const m=new T.MeshLambertMaterial({map:t});materials.set('sea',m);
  const sea=new T.Mesh(new T.PlaneGeometry(w,h),m);sea.rotation.x=-Math.PI/2;sea.position.set(map.width*U/2,-.85,map.height*U/2);scene.add(sea);}
 // Floors are the exact rectangles used by server collision. Bridge decks sit 2 cm under the
 // room floors, so where a bridge runs into a room the room floor is the one drawn.
 const roomRects=map.locations.flatMap(roomFloors),inRoom=(x:number,y:number,pad=0)=>roomRects.some(f=>x>=f.x-pad&&x<=f.x+f.w+pad&&y>=f.y-pad&&y<=f.y+f.h+pad);
 for(const c of map.corridors){const cx=(c.x+c.w/2)*U,cz=(c.y+c.h/2)*U,along=c.w>=c.h;fixed(cx,-.14,cz,c.w*U,.24,c.h*U,WOOD);
  for(let s=(along?c.x:c.y)+17;s<(along?c.x+c.w:c.y+c.h);s+=34)if(along)fixed(s*U,-.016,cz,.035,.01,c.h*U,SEAM);else fixed(cx,-.016,s*U,c.w*U,.01,.035,SEAM);
  // Piles under both sides of the deck.
  for(let s=(along?c.x:c.y)+40;s<(along?c.x+c.w:c.y+c.h)-20;s+=160)for(const side of [12,(along?c.h:c.w)-12]){const px=along?s:c.x+side,py=along?c.y+side:s;if(!inRoom(px,py,20))post(px*U,-.55,py*U,.1,.8,.1,'#6b4f35');}}
 for(const [i,r] of map.locations.entries()){
  const floorColor=tint(r.color,.58),line=tint(r.color,.42,'#cfc3b0'),rug=tint(r.color,.35),rugEdge=tint(r.color,.12,'#3b4a66'),cx=(r.x+r.w/2)*U,cz=(r.y+r.h/2)*U;
  for(const f of roomFloors(r)){fixed((f.x+f.w/2)*U,-.08,(f.y+f.h/2)*U,f.w*U,.16,f.h*U,floorColor);fixed((f.x+f.w/2)*U,-.53,(f.y+f.h/2)*U,f.w*U+.16,.74,f.h*U+.16,'#8e9aa6');}
  for(let x=r.x+40;x<r.x+r.w;x+=60)fixed(x*U,.004,cz,.02,.008,r.h*U,line);
  for(let y=r.y+40;y<r.y+r.h;y+=60)fixed(cx,.005,y*U,r.w*U,.008,.02,line);
  // A rug in the middle, open pergola beams with string lights overhead, and the room sign.
  fixed(cx,.012,cz,r.w*U*.5,.008,r.h*U*.44,rugEdge);fixed(cx,.016,cz,r.w*U*.5-.24,.008,r.h*U*.44-.24,rug);
  for(let x=r.x+75;x<r.x+r.w-30;x+=150){fixed(x*U,3.14,cz,.16,.16,r.h*U+.1,'#e2c89c');for(let y=r.y+30;y<r.y+r.h-10;y+=30){const t=(y-r.y)/r.h;bulb(x*U,3.02-Math.sin(t*Math.PI)*.16,y*U,.03,.03,.03,'#ffe7b0');}}
  const sign=plaque(`${String(i+1).padStart(2,'0')}  ${r.name}`,r.color,2.8,.5);sign.position.set(cx,2.45,(r.y+38)*U);scene.add(sign);labels.push(sign);
 }
 for(const e of floorEdges([...roomRects,...map.corridors])){
  const x=(e.x1+e.x2)/2,z=(e.y1+e.y2)/2,vertical=e.x1===e.x2,len=vertical?e.y2-e.y1:e.x2-e.x1,room=map.locations.find(r=>x>=r.x-.1&&x<=r.x+r.w+.1&&z>=r.y-.1&&z<=r.y+r.h+.1);
  // slab: a box centred on the edge, t thick (across), running its whole length (+t so corners close).
  const slab=(t:number,y:number,h:number,c:string,shape=fixed)=>vertical?shape(x*U,y+h/2,z*U,t,h,len*U+t,c):shape(x*U,y+h/2,z*U,len*U+t,h,t,c);
  if(room){const band=tint(room.color,.42),deep=tint(room.color,.12,'#3b4a66');
   slab(.16,0,3.1,WALL);slab(.2,0,1,band);slab(.23,.97,.08,deep);slab(.26,3.08,.16,deep);
   // Windows: warm light on the outside face, pale glass on the inside face.
   const inward=inRoom(vertical?x+4:x,vertical?z:z+4)&&!inRoom(vertical?x-4:x,vertical?z:z-4)?1:-1;
   if(len>=150)for(let s=60+((len-120)%140)/2;s<=len-60;s+=140){const at=(vertical?e.y1:e.x1)+s;for(const side of [-1,1]){const off=side*.1,wx=vertical?(x*U+off):at*U,wz=vertical?at*U:(z*U+off),inside=side===inward,paint=inside?fixed:lit,glass=inside?'#a9d6ec':'#ffd98c';
    if(vertical){paint(wx,1.75,wz,.03,1,.9,glass);fixed(wx+side*.012,1.75,wz,.03,1,.05,WALL);fixed(wx+side*.012,1.75,wz,.03,.05,.9,WALL);}else{paint(wx,1.75,wz,.9,1,.03,glass);fixed(wx,1.75,wz+side*.012,.05,1,.03,WALL);fixed(wx,1.75,wz+side*.012,.9,.05,.03,WALL);}}}
  }else{
   // Bridge railing: posts with a lantern on every third, top and middle rails, an edge board.
   slab(.1,.96,.08,RAIL);slab(.07,.5,.06,RAIL);slab(.12,-.02,.1,SEAM);
   const n=Math.max(1,Math.round(len/70));for(let k=0;k<=n;k++){const at=(vertical?e.y1:e.x1)+len*k/n,px=vertical?x:at,pz=vertical?at:z;post(px*U,.5,pz*U,.065,1,.065,RAIL);if(k%3===0){bulb(px*U,1.12,pz*U,.1,.1,.1,LANTERN);fixed(px*U,1.24,pz*U,.17,.05,.17,'#6b4f35');}}
  }
 }
 // Door frames where a bridge enters a building, with the room's plaque over the outside.
 for(const d of doorways(map)){const r=d.room,deep=tint(r.color,.12,'#3b4a66'),mid=(d.a+d.b)/2,span=(d.b-d.a)*U,out=d.edge===(d.vertical?r.x:r.y)?-1:1,index=map.locations.indexOf(r);
  for(const end of [d.a,d.b])if(d.vertical)fixed(d.edge*U,1.3,end*U,.3,2.6,.22,deep);else fixed(end*U,1.3,d.edge*U,.22,2.6,.3,deep);
  if(d.vertical){fixed(d.edge*U,2.85,mid*U,.2,.5,span,WALL);fixed(d.edge*U,2.63,mid*U,.28,.08,span+.2,deep);}else{fixed(mid*U,2.85,d.edge*U,span,.5,.2,WALL);fixed(mid*U,2.63,d.edge*U,span+.2,.08,.28,deep);}
  const sign=plaque(`${String(index+1).padStart(2,'0')}  ${r.name}`,r.color,1.75,.31);sign.position.set(d.vertical?(d.edge+out*14)*U:mid*U,2.92,d.vertical?mid*U:(d.edge+out*14)*U);scene.add(sign);labels.push(sign);}
 const deviceMeshes:T.Object3D[]=[],deviceTargets=new Map<T.Object3D,DeviceTarget>();const register=(g:T.Group,target:DeviceTarget)=>g.traverse(o=>{if(o instanceof T.Mesh){deviceMeshes.push(o);deviceTargets.set(o,target);}});
 const stations=new Map<string,{group:T.Group;screen:T.Mesh;label:T.Sprite;pos:Point}>();
 // Each console is two meshes: the body (one vertex-coloured geometry per variant and room
 // colour, shared) and the screen, whose material shows the task state.
 const painted=new T.MeshLambertMaterial({vertexColors:true});materials.set('painted',painted);const consoles=new Map<string,T.BufferGeometry>();
 const part=(g:T.BufferGeometry,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const p=g.clone();p.scale(w,h,d);p.translate(x,y,z);const color=new T.Color(c),n=p.attributes.position.count,colors=new Float32Array(n*3);for(let i=0;i<n;i++)color.toArray(colors,i*3);p.setAttribute('color',new T.BufferAttribute(colors,3));return p;};
 const consoleBody=(variant:number,accent:string)=>{const key=variant+accent;let g=consoles.get(key);if(!g){const parts=[part(softGeo,0,.42,0,.58,.84,.42,'#ece3d1'),part(softGeo,0,.66,0,.6,.1,.44,accent),part(softGeo,0,.92,0,.84,.12,.56,'#fbf7ee'),...[0,1,2].map(row=>part(geo,-.06,1.04+row*.078,-.148,.39-row*.07,.014,.012,'#193e48')),part(softGeo,-.21,.99,.17,.07,.03,.06,'#eec775'),part(softGeo,0,.99,.17,.07,.03,.06,'#80c5de'),part(softGeo,.2,.99,.17,.07,.03,.06,'#e0a592')];
  if(variant===0)parts.push(part(cylinder,.3,1.2,0,.12,.38,.12,'#7cc8e0'));else if(variant===1)parts.push(part(sphere,.28,1.23,0,.13,.2,.13,'#8fd6a0'));
  g=mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p));parts.forEach(p=>p.dispose());consoles.set(key,g);}return g;};
 for(const [i,s] of map.stations.entries()){
  const g=new T.Group();g.position.set(s.x*U,0,s.y*U);scene.add(g);const room=map.locations.find(r=>r.id===s.room);
  g.add(new T.Mesh(consoleBody(i%3,tint(room?.color||'#7bdcff',.3)),painted));const panel=box(g,0,1.13,-.1,.7,.38,.07,'#67d7b5');panel.rotation.x=-.3;
  const l=label('E  '+s.name,'#ffe7ab',2.2,.34);l.position.y=1.7;g.add(l);stations.set(s.id,{group:g,screen:panel,label:l,pos:s});register(g,{action:'taskStart',station:s.id,point:s,height:1.13,label:s.name});
 }
 function plaque(text:string,color:string,w:number,h:number){let m=plaques.get(text);if(!m){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#fdf6e8';ctx.beginPath();ctx.roundRect(3,3,506,90,40);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(11,11,490,74,34);ctx.fill();ctx.fillStyle='#1b2a3a';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 34px Arial,"Malgun Gothic",sans-serif';ctx.fillText(text,256,50,460);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.add(t);m=new T.SpriteMaterial({map:t,depthTest:true,transparent:true});plaques.set(text,m);}const l=new T.Sprite(m);l.scale.set(w,h,1);return l;}
 function label(text:string,color:string,w:number,h:number){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#0b1a26e8';ctx.fillRect(0,0,512,96);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(2,2,508,92);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 30px Arial,"Malgun Gothic",sans-serif';ctx.fillText(text,256,48,486);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.add(t);const l=new T.Sprite(new T.SpriteMaterial({map:t,depthTest:true,transparent:true}));l.scale.set(w,h,1);return l;}
 const marker=(p:Point,text:string,color:string,action:DeviceTarget['action'])=>{const g=new T.Group();g.position.set(p.x*U,0,p.y*U);scene.add(g);box(g,0,.45,0,.7,.9,.5,'#ece3d1');box(g,0,1.01,0,.6,.22,.3,color);const l=label(text,color,2,.36);l.position.y=1.7;g.add(l);labels.push(l);register(g,{action,point:p,height:1.01,label:text});return g;};
 const emergencyDevice=marker(emergencyFor(config),'긴급회의','#e78876','emergency');const emergencyButton=emergencyDevice.children[1] as T.Mesh;emergencyDevice.remove(emergencyButton);deviceMeshes.splice(deviceMeshes.indexOf(emergencyButton),1);deviceTargets.delete(emergencyButton);const redButton=new T.Mesh(new T.CylinderGeometry(.22,.24,.14,24),mat('#ed5360'));redButton.position.y=1.01;emergencyDevice.add(redButton);deviceMeshes.push(redButton);deviceTargets.set(redButton,{action:'emergency',point:emergencyFor(config),height:1.08,label:'긴급회의'});marker(securityConsole(config),'C  CCTV','#7bdeda','cameraStart');marker(communicationsConsole(config),'통신 복구','#cfa9ec','commsRepair');marker(repairFor(config),'전력 복구','#efd284','repair');
 for(const v of ventsFor(config)){fixed(v.x*U,.03,v.y*U,1.2,.06,.66,'#172934');for(let n=-4;n<=4;n++)fixed(v.x*U+n*.12,.075,v.y*U,.035,.03,.52,'#758a95');const l=label('V  환기구 '+v.network,'#b8a6df',1.45,.25);l.position.set(v.x*U,.35,v.y*U);scene.add(l);labels.push(l);}
 const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
 const shapes={box:geo,ball:new T.IcosahedronGeometry(1,1),cyl:new T.CylinderGeometry(1,1,1,8)};
 for(const {shape,color,glow,items} of batch.values()){const mesh=new T.InstancedMesh(shapes[shape],glow?glowMat(color):mat(color),items.length);items.forEach((a,i)=>{matrix.compose(position.set(a[0],a[1],a[2]),rotation,scale.set(a[3],a[4],a[5]));mesh.setMatrixAt(i,matrix);});mesh.computeBoundingSphere();scene.add(mesh);}
 const puppets=new Map<string,Puppet>();
 function puppet(avatar:number,name:string){const doll=createDoll(avatar),l=label(name,'#dcece7',1.3,.24);l.position.y=DOLL.labelY;doll.root.add(l);scene.add(doll.root);return{...doll,last:{x:NaN,y:NaN},phase:0,label:l,caption:name,avatar};}
 let latestData:SceneFrame|null=null;const raycaster=new T.Raycaster();raycaster.far=2.65;
 function pickDevice(x=0,y=0){const data=latestData;if(!data)return null;const r=data.room,f=r.field,me=r.players.find(p=>p.id===r.me);if(r.host||r.paused||!f||f.watching||f.vent)return null;camera.updateMatrixWorld();scene.updateMatrixWorld();raycaster.setFromCamera(new T.Vector2(x,y),camera);for(const hit of raycaster.intersectObjects(deviceMeshes,false)){const target=deviceTargets.get(hit.object)!;if(distance(data.own,target.point)>100||!sight(data.own,target.point,config))continue;if(target.action==='taskStart'){if(!f.tasks.some(t=>t.station===target.station&&!t.done))continue;}else if(!me?.alive)continue;if(target.action==='emergency'&&(!f.emergenciesLeft||f.meetingAt>r.serverNow||f.lightsUntil>r.serverNow))continue;if(target.action==='cameraStart'&&(f.commsUntil>r.serverNow||f.invisibleUntil>r.serverNow))continue;if(target.action==='repair'&&f.lightsUntil<=r.serverNow)continue;if(target.action==='commsRepair'&&f.commsUntil<=r.serverNow)continue;return target;}return null;}
 const hand=new T.Group(),heldKnife=new T.Group();camera.add(hand);hand.add(heldKnife);
 // Own forearm reaching forward from the lower right: the figures' sleeve, cuff band and mitten
 // in the player's own figure paint (createViewArm), rebuilt when the avatar changes. VIEW_HAND
 // (the mitten centre) is the contact point used by the device-reach animation below; while
 // reaching, the forearm swings so its sleeve still runs back through VIEW_SHOULDER.
 let ownArm:ReturnType<typeof createViewArm>|undefined;
 const dressArm=(avatar:number)=>{if(ownArm?.avatar===((avatar%16)+16)%16)return;ownArm?.dispose();ownArm=createViewArm(avatar);hand.add(ownArm.arm);heldKnife.add(ownArm.knife);};
 const armDirection=new T.Vector3();
 // Warm-up while the loading screen shows: build the figures of everyone in the room and
 // compile their shaders with one of them in the scene, so neither a player coming into view
 // nor the first frame with a figure stalls on building geometry or compiling shaders.
 {warmDolls(avatars);const warm=createDoll(avatars[0]??0),arm=createViewArm(avatars[0]??0);scene.add(warm.root);camera.add(arm.arm,arm.knife);try{renderer.compile(scene,camera);}catch{}warm.dispose();arm.dispose();}
 let last=0,step=0;let audio:AudioContext|undefined;const stepTimes=new Map<string,number>();
 const enableAudio=()=>{try{audio||=new AudioContext();void audio.resume();}catch{}};
 const footstep=(id:string,p:Point,own:Point,yaw:number,time:number)=>{if(!audio||audio.state!=='running'||time-(stepTimes.get(id)||0)<340)return;stepTimes.set(id,time);const dist=distance(p,own);if(dist>220||!sight(p,own,config))return;const ctx=audio,o=ctx.createOscillator(),g=ctx.createGain(),pan=ctx.createStereoPanner();o.type='triangle';o.frequency.setValueAtTime(95,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(38,ctx.currentTime+.075);g.gain.setValueAtTime(.035*(1-dist/240),ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.09);pan.pan.value=Math.max(-1,Math.min(1,((p.x-own.x)*Math.cos(yaw)+(p.y-own.y)*Math.sin(yaw))/150));o.connect(g).connect(pan).connect(ctx.destination);o.start();o.stop(ctx.currentTime+.1);};

 function update(data:SceneFrame,look:Look,follow:string){const dt=Math.min(.05,(data.now-last)/1000||.016);last=data.now;latestData=data;const r=data.room,focus=r.host&&follow?data.people.find(p=>p.id===follow):null,own=focus||data.own;camera.position.set(own.x*U,1.43,own.y*U);camera.rotation.set(-look.pitch,-look.yaw,0);camera.updateMatrixWorld();
  const fog=scene.fog as T.Fog;fog.near=Math.max(1,data.radius*U*.65);fog.far=Math.max(2.5,data.radius*U*1.15);if(r.host){fog.near=18;fog.far=65;}
  if(data.sound&&data.moving&&!r.paused)footstep('own',own,own,look.yaw,data.now);step+=data.moving?dt*9:0;hand.visible=!r.host&&!!r.players.find(p=>p.id===r.me)?.alive;const ownAvatar=r.players.find(p=>p.id===r.me)?.avatar||0;dressArm(ownAvatar);
  const attack=data.effects.find(e=>e.actor===r.me&&['attack','blocked'].includes(e.kind)&&data.now-e.seenAt<620);const age=attack?(data.now-attack.seenAt)/620:0;heldKnife.visible=!!attack;hand.position.set(0,data.moving?Math.sin(step)*.012:0,attack?-Math.sin(age*Math.PI)*.42:0);hand.rotation.x=attack?Math.sin(age*Math.PI)*-.8:0;const reach=data.reach,amount=reach?reachAmount(data.now-reach.started):0;if(reach&&amount>0&&!attack){const t=reach.target,contact=camera.worldToLocal(new T.Vector3(t.point.x*U,t.height,t.point.y*U));hand.position.subVectors(contact,VIEW_HAND).multiplyScalar(amount);hand.rotation.x=0;}ownArm?.aim(amount>0&&!attack?armDirection.copy(hand.position).add(VIEW_WRIST).sub(VIEW_SHOULDER).normalize():undefined);redButton.position.y=1.01-(reach?.target.action==='emergency'?.065*amount:0);
  for(const [id,s] of stations){const task=r.field?.tasks.find(t=>t.station===id),near=distance(own,s.pos)<150;s.label.visible=!!task&&!task.done&&near&&sight(own,s.pos,config);s.screen.material=mat(task?.done?'#477267':task?'#6ce6bf':'#446572');}
  const visible=new Set<string>();for(const p of data.people){if(p.id===r.me&&!r.host||p.id===focus?.id||p.vented||p.invisible||!p.alive)continue;visible.add(p.id);let actor=puppets.get(p.id);const caption=p.speech&&p.speech.until>r.serverNow?p.name+' · '+p.speech.text:p.name;
   if(!actor||actor.avatar!==p.avatar){if(actor)removePuppet(actor);actor=puppet(p.avatar,caption);puppets.set(p.id,actor);}if(actor.caption!==caption){const old=actor.label;actor.root.remove(old);disposeLabel(old);actor.label=label(caption,'#e6f6ee',Math.min(3.6,.9+caption.length*.08),.28);actor.label.position.y=DOLL.labelY;actor.root.add(actor.label);actor.caption=caption;}
   actor.root.visible=true;const dx=p.x-actor.last.x,dy=p.y-actor.last.y,d=Math.hypot(dx,dy);if(Number.isFinite(d)&&d>.04){actor.phase+=Math.min(d,20)/22;actor.root.rotation.y=Math.atan2(-dx,-dy);}if(data.sound&&d>.08&&Number.isFinite(d)&&!r.paused)footstep(p.id,p,own,look.yaw,data.now);actor.last={x:p.x,y:p.y};actor.root.position.set(p.x*U,0,p.y*U);const stride=Number.isFinite(d)&&d>.08?Math.sin(actor.phase*1.8)*.55:0;actor.legs[0].rotation.x=stride;actor.legs[1].rotation.x=-stride;actor.arms[0].rotation.x=-stride*.65;actor.arms[1].rotation.x=stride*.65;
   const strike=data.effects.find(e=>e.actor===p.id&&data.now-e.seenAt<620&&['attack','blocked'].includes(e.kind));actor.knife.visible=!!strike;if(strike){actor.arms[1].rotation.x=1.5+Math.sin((data.now-strike.seenAt)/620*Math.PI)*.5;actor.root.rotation.y=Math.atan2(strike.x-strike.tx,strike.y-strike.ty);}
   actor.label.visible=distance(own,p)<220&&sight(own,p,config);
  }
  for(const b of data.bodies){const id='body:'+b.id;visible.add(id);let actor=puppets.get(id);if(!actor){actor=puppet(b.avatar,'R · '+b.name);puppets.set(id,actor);}actor.root.visible=true;actor.root.position.set(b.x*U,.18,b.y*U);actor.root.rotation.z=Math.PI/2;actor.label.visible=false;}
  for(const [id,p] of puppets)if(!visible.has(id))p.root.visible=false;
  renderer.render(scene,camera);
 }
 function disposeLabel(l:T.Sprite){const material=l.material as T.SpriteMaterial;if(material.map){material.map.dispose();textures.delete(material.map);}material.dispose();}
 function removePuppet(p:Puppet){scene.remove(p.root);disposeLabel(p.label);p.dispose();}
 return{update,pickDevice,enableAudio,resize(w:number,h:number){renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();},
  setQuality(scale:number){renderer.setPixelRatio(basePixelRatio*scale);},
  dispose(){puppets.forEach(p=>p.dispose());scene.traverse(o=>{if(o instanceof T.Mesh&&!o.geometry.userData.shared)o.geometry.dispose();if(o instanceof T.Sprite)o.material.dispose();});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());renderer.dispose();void audio?.close();},stats:()=>renderer.info.render};
}
