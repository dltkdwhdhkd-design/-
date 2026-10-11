import * as T from 'three';
import {reachAmount,type Reach,type DeviceTarget} from './interaction';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mapFor,roomFloors,ventsFor,emergencyFor,repairFor,distance,sight,type Point} from './map';
import {floorEdges} from './map-render';
import {securityConsole,communicationsConsole} from './surveillance';
import {createDoll,DOLL} from './doll-character';
import {stageLights} from './doll-stage';
import {AVATAR_3D} from './first-person';
import type {View} from './game';
import type {FieldSnapshot,Effect} from './field';
export type SceneFrame={room:View;own:Point;people:FieldSnapshot['people'];bodies:FieldSnapshot['bodies'];effects:(Effect&{seenAt:number})[];radius:number;now:number;moving:boolean;sound:boolean;reach?:Reach|null};
export type Look={yaw:number;pitch:number};
const U=.025;
type Puppet={root:T.Group;arms:T.Group[];legs:T.Group[];knife:T.Group;last:Point;phase:number;label:T.Sprite;caption:string;avatar:number;dispose:()=>void};
export function createScene(canvas:HTMLCanvasElement,config:View['config'],low:boolean){
 const renderer=new T.WebGLRenderer({canvas,antialias:!low,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,low?1:1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const scene=new T.Scene();scene.background=new T.Color('#102c40');scene.fog=new T.Fog('#102c40',7,22);
 const camera=new T.PerspectiveCamera(76,1,.06,130);camera.rotation.order='YXZ';scene.add(camera);
 stageLights(scene);
 const map=mapFor(config),geo=new T.BoxGeometry(1,1,1),softGeo=new RoundedBoxGeometry(1,1,1,3,.12),sphere=new T.SphereGeometry(1,24,16),cylinder=new T.CylinderGeometry(1,1,1,10),materials=new Map<string,T.MeshLambertMaterial>(),textures=new Set<T.Texture>(),labels:T.Sprite[]=[];
 const mat=(color:string)=>{let m=materials.get(color);if(!m){m=new T.MeshLambertMaterial({color});materials.set(color,m);}return m;};
 const box=(g:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const m=new T.Mesh(softGeo,mat(c));m.position.set(x,y,z);m.scale.set(w,h,d);g.add(m);return m;};
 const ball=(g:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const m=new T.Mesh(sphere,mat(c));m.position.set(x,y,z);m.scale.set(w,h,d);g.add(m);return m;};
 const batch=new Map<string,number[][]>();const fixed=(x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>{const list=batch.get(c)||[];list.push([x,y,z,w,h,d]);batch.set(c,list);};
 // Shared rectangles and boundary segments are the exact geometry used by server collision.
 fixed(map.width*U/2,-.9,map.height*U/2,map.width*U+100,.2,map.height*U+100,'#124452');
 for(const c of map.corridors)fixed((c.x+c.w/2)*U,-.12,(c.y+c.h/2)*U,c.w*U,.24,c.h*U,'#5a675f');
 for(const [i,r] of map.locations.entries()){
  for(const f of roomFloors(r))fixed((f.x+f.w/2)*U,-.08,(f.y+f.h/2)*U,f.w*U,.16,f.h*U,['#485d64','#485367','#465e5b','#555260'][i%4]);
  // Overhead beams, suspended lights and a large room number establish scale.
  for(let x=r.x+70;x<r.x+r.w;x+=150){fixed(x*U,3.05,(r.y+r.h/2)*U,.14,.2,r.h*U,'#243b48');fixed(x*U,2.92,(r.y+r.h/2)*U,.09,.05,1.6,'#d7fff0');}
  for(let x=r.x+24;x<r.x+r.w;x+=60)fixed(x*U,.008,(r.y+r.h/2)*U,.018,.01,r.h*U,'#6d8286');
  for(let y=r.y+24;y<r.y+r.h;y+=60)fixed((r.x+r.w/2)*U,.009,y*U,r.w*U,.012,.018,'#6d8286');
  const sign=label(`${String(i+1).padStart(2,'0')}  ${r.name}`,r.color,2.8,.5);sign.position.set((r.x+r.w/2)*U,2.45,(r.y+38)*U);scene.add(sign);labels.push(sign);
 }
 for(const e of floorEdges([...map.locations.flatMap(roomFloors),...map.corridors])){
  const x=(e.x1+e.x2)/2,z=(e.y1+e.y2)/2,w=Math.abs(e.x2-e.x1)*U,d=Math.abs(e.y2-e.y1)*U;
  const indoor=map.locations.some(r=>x>=r.x-.1&&x<=r.x+r.w+.1&&z>=r.y-.1&&z<=r.y+r.h+.1),h=indoor?3.1:1.15;
  fixed(x*U,h/2,z*U,Math.max(.14,w),h,Math.max(.14,d),indoor?'#29424f':'#304955');
  fixed(x*U,indoor?2.2:1.15,z*U,Math.max(.17,w),.045,Math.max(.17,d),'#80bdb6');
  fixed(x*U,.13,z*U,Math.max(.18,w),.17,Math.max(.18,d),'#152c39');
 }
 const deviceMeshes:T.Object3D[]=[],deviceTargets=new Map<T.Object3D,DeviceTarget>();const register=(g:T.Group,target:DeviceTarget)=>g.traverse(o=>{if(o instanceof T.Mesh){deviceMeshes.push(o);deviceTargets.set(o,target);}});
 const stations=new Map<string,{group:T.Group;screen:T.Mesh;label:T.Sprite;pos:Point}>();
 for(const [i,s] of map.stations.entries()){
  const g=new T.Group();g.position.set(s.x*U,0,s.y*U);scene.add(g);
  box(g,0,.42,0,.58,.84,.42,'#1c313f');box(g,0,.92,0,.84,.12,.56,'#bdccc4');const panel=box(g,0,1.13,-.1,.7,.38,.07,'#67d7b5');panel.rotation.x=-.3;for(let row=0;row<3;row++)box(g,-.06,1.04+row*.078,-.148,.39-row*.07,.014,.012,'#193e48');
  box(g,-.21,.99,.17,.07,.03,.06,'#eec775');box(g,0,.99,.17,.07,.03,.06,'#80c5de');box(g,.2,.99,.17,.07,.03,.06,'#e0a592');
  if(i%3===0){const jar=new T.Mesh(cylinder,mat('#6197a8'));jar.scale.set(.12,.38,.12);jar.position.set(.3,1.2,0);g.add(jar);}else if(i%3===1){ball(g,.28,1.23,0,.13,.2,.13,'#70ae87');}
  const l=label('E  '+s.name,'#ffe7ab',2.2,.34);l.position.y=1.7;g.add(l);stations.set(s.id,{group:g,screen:panel,label:l,pos:s});register(g,{action:'taskStart',station:s.id,point:s,height:1.13,label:s.name});
 }
 function label(text:string,color:string,w:number,h:number){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#0b1a26e8';ctx.fillRect(0,0,512,96);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(2,2,508,92);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 30px Arial,"Malgun Gothic",sans-serif';ctx.fillText(text,256,48,486);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.add(t);const l=new T.Sprite(new T.SpriteMaterial({map:t,depthTest:true,transparent:true}));l.scale.set(w,h,1);return l;}
 const marker=(p:Point,text:string,color:string,action:DeviceTarget['action'])=>{const g=new T.Group();g.position.set(p.x*U,0,p.y*U);scene.add(g);box(g,0,.45,0,.7,.9,.5,'#233541');box(g,0,1.01,0,.6,.22,.3,color);const l=label(text,color,2,.36);l.position.y=1.7;g.add(l);labels.push(l);register(g,{action,point:p,height:1.01,label:text});return g;};
 const emergencyDevice=marker(emergencyFor(config),'긴급회의','#e78876','emergency');const emergencyButton=emergencyDevice.children[1] as T.Mesh;emergencyDevice.remove(emergencyButton);deviceMeshes.splice(deviceMeshes.indexOf(emergencyButton),1);deviceTargets.delete(emergencyButton);const redButton=new T.Mesh(new T.CylinderGeometry(.22,.24,.14,24),mat('#ed5360'));redButton.position.y=1.01;emergencyDevice.add(redButton);deviceMeshes.push(redButton);deviceTargets.set(redButton,{action:'emergency',point:emergencyFor(config),height:1.08,label:'긴급회의'});marker(securityConsole(config),'C  CCTV','#7bdeda','cameraStart');marker(communicationsConsole(config),'통신 복구','#cfa9ec','commsRepair');marker(repairFor(config),'전력 복구','#efd284','repair');
 for(const v of ventsFor(config)){fixed(v.x*U,.03,v.y*U,1.2,.06,.66,'#172934');for(let n=-4;n<=4;n++)fixed(v.x*U+n*.12,.075,v.y*U,.035,.03,.52,'#758a95');const l=label('V  환기구 '+v.network,'#b8a6df',1.45,.25);l.position.set(v.x*U,.35,v.y*U);scene.add(l);labels.push(l);}
 const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
 for(const [c,items] of batch){const mesh=new T.InstancedMesh(geo,mat(c),items.length);items.forEach((a,i)=>{matrix.compose(position.set(a[0],a[1],a[2]),rotation,scale.set(a[3],a[4],a[5]));mesh.setMatrixAt(i,matrix);});mesh.computeBoundingSphere();scene.add(mesh);}
 const puppets=new Map<string,Puppet>();
 function puppet(avatar:number,name:string){const doll=createDoll(avatar),l=label(name,'#dcece7',1.3,.24);l.position.y=DOLL.labelY;doll.root.add(l);scene.add(doll.root);return{...doll,last:{x:NaN,y:NaN},phase:0,label:l,caption:name,avatar};}
 let latestData:SceneFrame|null=null;const raycaster=new T.Raycaster();raycaster.far=2.65;
 function pickDevice(x=0,y=0){const data=latestData;if(!data)return null;const r=data.room,f=r.field,me=r.players.find(p=>p.id===r.me);if(r.host||r.paused||!f||f.watching||f.vent)return null;camera.updateMatrixWorld();scene.updateMatrixWorld();raycaster.setFromCamera(new T.Vector2(x,y),camera);for(const hit of raycaster.intersectObjects(deviceMeshes,false)){const target=deviceTargets.get(hit.object)!;if(distance(data.own,target.point)>100||!sight(data.own,target.point,config))continue;if(target.action==='taskStart'){if(!f.tasks.some(t=>t.station===target.station&&!t.done))continue;}else if(!me?.alive)continue;if(target.action==='emergency'&&(!f.emergenciesLeft||f.meetingAt>r.serverNow||f.lightsUntil>r.serverNow))continue;if(target.action==='cameraStart'&&(f.commsUntil>r.serverNow||f.invisibleUntil>r.serverNow))continue;if(target.action==='repair'&&f.lightsUntil<=r.serverNow)continue;if(target.action==='commsRepair'&&f.commsUntil<=r.serverNow)continue;return target;}return null;}
 const hand=new T.Group();camera.add(hand);
 // Own forearm reaching forward from the lower right (sleeve, cuff, mitten). The mitten centre
 // (.28,-.15,-.55) is the contact point used by the device-reach animation below.
 const forearm=new T.Vector3(-.075,.21,-.17).normalize(),alongArm=(m:T.Mesh)=>{m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),forearm);return m;};
 alongArm(box(hand,.33,-.31,-.43,.11,.3,.12,'#35475e')).name='sleeve';alongArm(box(hand,.295,-.21,-.515,.128,.045,.132,'#7fa3b8')).name='cuff';
 ball(hand,.28,-.15,-.55,.064,.06,.072,'#dfb08b').name='palm';ball(hand,.24,-.162,-.58,.026,.038,.03,'#dfb08b').name='thumb';const heldKnife=new T.Group();hand.add(heldKnife);box(heldKnife,.28,-.1,-.55,.055,.18,.055,'#36303a');box(heldKnife,.28,.02,-.55,.17,.03,.07,'#899da5');const blade=new T.Mesh(new T.ConeGeometry(.058,.42,3),mat('#dce9ee'));blade.position.set(.28,.23,-.55);heldKnife.add(blade);
 const reachArm=new T.Mesh(new T.CylinderGeometry(.072,.11,1,12),mat('#35475e'));reachArm.visible=false;camera.add(reachArm);const armStart=new T.Vector3(.42,-.48,-.26),armEnd=new T.Vector3(),armDirection=new T.Vector3(),upAxis=new T.Vector3(0,1,0);
 let last=0,step=0;let audio:AudioContext|undefined;const stepTimes=new Map<string,number>();
 const enableAudio=()=>{try{audio||=new AudioContext();void audio.resume();}catch{}};
 const footstep=(id:string,p:Point,own:Point,yaw:number,time:number)=>{if(!audio||audio.state!=='running'||time-(stepTimes.get(id)||0)<340)return;stepTimes.set(id,time);const dist=distance(p,own);if(dist>220||!sight(p,own,config))return;const ctx=audio,o=ctx.createOscillator(),g=ctx.createGain(),pan=ctx.createStereoPanner();o.type='triangle';o.frequency.setValueAtTime(95,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(38,ctx.currentTime+.075);g.gain.setValueAtTime(.035*(1-dist/240),ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.09);pan.pan.value=Math.max(-1,Math.min(1,((p.x-own.x)*Math.cos(yaw)+(p.y-own.y)*Math.sin(yaw))/150));o.connect(g).connect(pan).connect(ctx.destination);o.start();o.stop(ctx.currentTime+.1);};

 function update(data:SceneFrame,look:Look,follow:string){const dt=Math.min(.05,(data.now-last)/1000||.016);last=data.now;latestData=data;const r=data.room,focus=r.host&&follow?data.people.find(p=>p.id===follow):null,own=focus||data.own;camera.position.set(own.x*U,1.43,own.y*U);camera.rotation.set(-look.pitch,-look.yaw,0);camera.updateMatrixWorld();
  const fog=scene.fog as T.Fog;fog.near=Math.max(1,data.radius*U*.65);fog.far=Math.max(2.5,data.radius*U*1.15);if(r.host){fog.near=18;fog.far=65;}
  if(data.sound&&data.moving&&!r.paused)footstep('own',own,own,look.yaw,data.now);step+=data.moving?dt*9:0;hand.visible=!r.host&&!!r.players.find(p=>p.id===r.me)?.alive;const ownAvatar=r.players.find(p=>p.id===r.me)?.avatar||0;const sleeveColor=AVATAR_3D[ownAvatar%16];for(const part of hand.children)if(part instanceof T.Mesh)part.material=mat(part.name==='sleeve'?sleeveColor[0]:part.name==='cuff'?sleeveColor[2]:sleeveColor[3]);
  const attack=data.effects.find(e=>e.actor===r.me&&['attack','blocked'].includes(e.kind)&&data.now-e.seenAt<620);const age=attack?(data.now-attack.seenAt)/620:0;heldKnife.visible=!!attack;hand.position.set(0,data.moving?Math.sin(step)*.012:0,attack?-Math.sin(age*Math.PI)*.42:0);hand.rotation.x=attack?Math.sin(age*Math.PI)*-.8:0;const reach=data.reach,amount=reach?reachAmount(data.now-reach.started):0;if(reach&&amount>0&&!attack){const t=reach.target,contact=camera.worldToLocal(new T.Vector3(t.point.x*U,t.height,t.point.y*U));hand.position.set((contact.x-.28)*amount,(contact.y+.15)*amount,(contact.z+.55)*amount);hand.rotation.x=0;}reachArm.visible=amount>0&&!attack&&hand.visible;if(reachArm.visible){armEnd.copy(hand.position).add(new T.Vector3(.28,-.15,-.55));armDirection.subVectors(armEnd,armStart);reachArm.position.copy(armStart).add(armEnd).multiplyScalar(.5);reachArm.scale.y=armDirection.length();reachArm.quaternion.setFromUnitVectors(upAxis,armDirection.normalize());reachArm.material=mat(sleeveColor[0]);}redButton.position.y=1.01-(reach?.target.action==='emergency'?.065*amount:0);
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
 return{update,pickDevice,enableAudio,resize(w:number,h:number){renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();},dispose(){puppets.forEach(p=>p.dispose());scene.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();if(o instanceof T.Sprite)o.material.dispose();});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());renderer.dispose();void audio?.close();},stats:()=>renderer.info.render};
}
