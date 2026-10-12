// Client-side networking for the field mode: input prediction and reconciliation, the
// live socket with HTTP fallback, remote-player interpolation and network diagnostics.
// FieldGame renders from this object; tests/sim drives exactly the same code.
import {LiveClient,LiveActionError,type LiveStatus} from './live-client.ts';
import {stepInput,reconcileMotion,type MoveInput} from './motion.ts';
import {inputSteps,INPUT_STEP_MS} from './input.ts';
import {updatePresence,retainedPeers,presenceOpacity,type Presence} from './peer-presence.ts';
import {pushRemote,sampleRemote,type RemoteTrack} from './remote-motion.ts';
import {moveTo,WORLD,type Point} from './map.ts';
import type {View} from './game';
import type {FieldSnapshot,Effect} from './field';

export type ServerDiag={instance:string;conn:string;peersHere:number;ownedHere:number;instances:number;dbRttMs:number;dbStatementsPerSec:number;queries:number;budget:number;dbErrors:number;recycles:number;checkpointAge:number};
export type FrameReply={room?:View;revision:number;frame:FieldSnapshot;error?:string;transport?:string;diag?:ServerDiag};
export type Person=FieldSnapshot['people'][number];
export type RenderedPerson=Person&{mine:boolean;opacity:number};
type Options={code:string;token:string;room:View;spawn:Point;liveUrl:string|null|(()=>string|null);http:(body:Record<string,unknown>)=>Promise<FrameReply>;
 onRoom?:(v:View)=>void;onReset?:(p:Point)=>void;onFrame?:(f:FieldSnapshot,data:FrameReply)=>void;onEffect?:(e:Effect)=>void;onFault?:(message:string)=>void;onLiveStatus?:(s:LiveStatus)=>void};

const RECENT_KEEP_MS=4000,HTTP_GRACE_MS=700,CAMERA_KEEPALIVE_MS=2000;
class Window{values:number[]=[];size:number;constructor(size=120){this.size=size;}push(v:number){if(!Number.isFinite(v))return;this.values.push(v);if(this.values.length>this.size)this.values.shift();}
 q(p:number){if(!this.values.length)return null;const s=[...this.values].sort((a,b)=>a-b);return Math.round(s[Math.min(s.length-1,Math.floor(p*s.length))]*10)/10;}
 get last(){return this.values.at(-1)??null;}}
// Rolling measurements shown by the in-game network panel (F3 / ?netdebug=1).
export class NetStats{
 ack=new Window();correction=new Window(60);sampleAge=new Window(400);frameGap=new Window();action=new Window(30);kill=new Window(20);frameWork=new Window(240);frameDt=new Window(240);renderDelay=new Window(400);render3d=new Window(240);view3d:{quality:number;fps:number}|null=null;
 counts:Record<string,number>={};server:ServerDiag|null=null;rtt=0;lastFrameAt=0;
 count(k:string){this.counts[k]=(this.counts[k]||0)+1;}
 // 3D view: script+draw time per frame, drawing resolution and frame-rate target (governor).
 record3d(ms:number,quality:number,fps:number){this.render3d.push(ms);this.view3d={quality,fps};}
 summary(){return{rttMs:this.rtt,frameGapP95:this.frameGap.q(.95),sampleAgeP50:this.sampleAge.q(.5),sampleAgeP95:this.sampleAge.q(.95),renderDelayP50:this.renderDelay.q(.5),renderDelayP95:this.renderDelay.q(.95),ackP50:this.ack.q(.5),ackP95:this.ack.q(.95),correctionMax:this.correction.q(1),actionP50:this.action.q(.5),killLast:this.kill.last,frameWorkP95:this.frameWork.q(.95),frameDtP95:this.frameDt.q(.95),counts:{...this.counts},server:this.server};}
}

export class FieldNet{
 room:View;snapshot:FieldSnapshot|null=null;
 local:Point;visual:Point;correction={x:0,y:0};
 pending:MoveInput[]=[];recent:(MoveInput&{t:number})[]=[];inputNumber=1;lastAck=0;warp=0;inputElapsed=0;wasMoving=false;
 bootstrapped=false;connected=false;busy=false;holdLive=false;resendFrom:number|null=null;
 tracks:Record<string,RemoteTrack>={};presence:Record<string,Presence<Person>>={};interpolated:Record<string,Point&{at?:number}>={};epoch=-1;
 live:LiveClient|null=null;stats=new NetStats();serverOffset=0;
 private sentAt=new Map<number,number>();private seenEffects=new Set<string>();private stopped=true;private pollTimer?:ReturnType<typeof setTimeout>;private polling=false;private lastCameraPoll=0;private boot?:ReturnType<typeof setInterval>;private unhealthySince=0;private hidden=()=>typeof document!=='undefined'&&document.hidden;
 private o:Options;
 constructor(o:Options){this.o=o;this.room=o.room;this.local={...o.spawn};this.visual={...o.spawn};}
 setHiddenProbe(fn:()=>boolean){this.hidden=fn;}
 // Room views also arrive from the page (host controls); keep the newest.
 syncRoom(v:View){if(v.revision>=this.room.revision)this.room=v;}
 healthy(){return !!this.live?.healthy();}
 // ---- frames -------------------------------------------------------------------------
 apply(data:FrameReply,source:'http'|'live'|'action'){
  const f=data.frame;
  if(data.revision<this.room.revision||f.own.warp!==undefined&&(f.own.warp||0)<this.warp||this.snapshot&&data.revision<=this.room.revision&&f.serverNow<this.snapshot.serverNow){this.stats.count('frame.stale');return false;}
  this.stats.count('frame.'+source);const received=performance.now();
  if(source==='live'){if(this.stats.lastFrameAt)this.stats.frameGap.push(received-this.stats.lastFrameAt);this.stats.lastFrameAt=received;}
  if(this.epoch!==f.seq){this.tracks={};this.presence={};this.interpolated={};this.epoch=f.seq;}
  const removed=new Set<string>();
  for(const body of f.bodies)removed.add(body.id);
  for(const e of f.effects||[]){if(e.kind==='attack'&&e.target)removed.add(e.target);if(e.kind==='vanish'||e.kind==='vent')removed.add(e.actor);}
  updatePresence(this.presence,f.people,received,removed);
  for(const id of Object.keys(this.tracks))if(!this.presence[id]){delete this.tracks[id];delete this.interpolated[id];}
  const me=data.room?.me??this.room.me;
  for(const person of f.people){
   // Sample age only means something for an actor that moved (an idle actor keeps its old motion time).
   const prev=this.tracks[person.id]?.samples.at(-1);if(person.id!==me&&prev&&(person.at||0)>prev.at&&Math.hypot(person.x-prev.x,person.y-prev.y)>.5)this.stats.sampleAge.push(f.serverNow-(person.at||f.serverNow)+this.stats.rtt/2);
   this.tracks[person.id]=pushRemote(this.tracks[person.id],{...person,at:person.at||f.serverNow,warp:person.warp||0},received);}
  if(data.room){this.room=data.room;this.o.onRoom?.(data.room);}
  if(data.diag)this.stats.server=data.diag;
  this.connected=true;this.serverOffset=f.serverNow-Date.now();this.snapshot=f;
  const own=f.own,ack=own.ack||0;
  if(!this.bootstrapped||this.warp!==(own.warp||0)){
   this.pending=[];this.recent=[];this.resendFrom=null;this.inputNumber=ack+1;this.lastAck=ack;this.warp=own.warp||0;this.local={x:own.x,y:own.y};this.visual={...this.local};this.bootstrapped=true;this.correction={x:0,y:0};this.sentAt.clear();this.o.onReset?.(this.local);
  }else if(ack>=this.lastAck){
   const t=performance.now();for(const [n,s] of this.sentAt)if(n<=ack){this.stats.ack.push(t-s);this.sentAt.delete(n);}
   const result=reconcileMotion(own,this.pending,this.room.config);
   for(const i of this.pending)if(i.n<=ack)this.recent.push({...i,t});
   const keep=t-RECENT_KEEP_MS;while(this.recent.length&&(this.recent[0].t<keep||this.recent.length>400))this.recent.shift();
   this.pending=result.pending;const dx=this.local.x-result.position.x,dy=this.local.y-result.position.y;if(Math.hypot(dx,dy)>.01){this.stats.correction.push(Math.hypot(dx,dy));this.stats.count('correction');}
   this.correction={x:this.correction.x+dx,y:this.correction.y+dy};this.local=result.position;this.lastAck=ack;this.resendFrom=null;
  }
  for(const e of f.effects||[])if(!this.seenEffects.has(e.id)){this.seenEffects.add(e.id);this.o.onEffect?.(e);}
  if(this.seenEffects.size>250)this.seenEffects=new Set(Array.from(this.seenEffects).slice(-100));
  this.o.onFrame?.(f,data);return true;
 }
 // The server lost (or never had) inputs after `after`: send them again, or, if we no
 // longer have them, continue from the server's pose.
 private resend(after:number,warp:number){
  if(warp!==this.warp||after>=this.lastAck&&this.pending.every(i=>i.n>after))return;
  const all=[...this.recent,...this.pending];if(after>=this.inputNumber-1)return;
  if(all.some(i=>i.n===after+1)){this.resendFrom=after;this.stats.count('resend');return;}
  const own=this.snapshot?.own;if(own&&(own.ack||0)===after)this.rebase(own);
 }
 private rebase(own:{x:number;y:number;ack?:number;warp?:number}){
  this.stats.count('rebase');this.correction={x:this.correction.x+this.local.x-own.x,y:this.correction.y+this.local.y-own.y};
  this.local={x:own.x,y:own.y};this.pending=[];this.recent=[];this.resendFrom=null;this.lastAck=own.ack||0;this.inputNumber=this.lastAck+1;this.sentAt.clear();
 }
 private outgoing(){if(this.resendFrom===null)return this.pending;const from=this.resendFrom;const seen=new Set<number>();const out:MoveInput[]=[];for(const i of [...this.recent,...this.pending])if(i.n>from&&!seen.has(i.n)){seen.add(i.n);out.push({n:i.n,dx:i.dx,dy:i.dy,ms:i.ms});}return out;}
 // ---- transports ---------------------------------------------------------------------
 start(){
  if(!this.stopped)return;this.stopped=false;
  void this.poll();
  const url=typeof this.o.liveUrl==='function'?this.o.liveUrl():this.o.liveUrl;
  if(url)this.boot=setInterval(()=>{if(!this.snapshot||this.live||this.stopped)return;const live=new LiveClient({url,code:this.o.code,token:this.o.token,
   input:()=>({seq:this.room.seq,warp:this.warp,hold:this.holdLive,inputs:this.holdLive?[]:this.outgoing()}),
   frame:data=>{this.apply(data,'live');},
   status:s=>{this.stats.rtt=s.rtt;this.o.onLiveStatus?.(s);},
   ready:m=>{this.stats.count('live.ready');this.resend(m.ack,m.warp);},
   resend:m=>this.resend(m.after,m.warp),
   rebase:m=>{if(m.own&&(m.own.warp||0)===this.warp)this.rebase(m.own);}});this.live=live;live.start();},100);
 }
 // One HTTP poll loop; wake() runs it early (tab focus) without starting a second loop.
 private async poll(){
  if(this.stopped||this.polling)return;this.polling=true;clearTimeout(this.pollTimer);const started=performance.now();let failed=false;
  try{await this.frameOnce();}catch(e){if(!this.stopped&&!this.busy){failed=true;this.connected=false;this.o.onFault?.(e instanceof Error?(e.name==='AbortError'?'응답을 기다리고 있습니다. 다시 연결합니다.':e.message):'연결을 확인해 주세요.');}}
  finally{this.polling=false;if(!this.stopped)this.pollTimer=setTimeout(()=>void this.poll(),this.hidden()?1000:failed?350:Math.max(12,(this.room.host?120:100)-(performance.now()-started)));}
 }
 stop(){this.stopped=true;clearTimeout(this.pollTimer);clearInterval(this.boot);this.live?.stop();this.live=null;}
 wake(){if(this.stopped||this.busy||this.polling||this.hidden())return;void this.poll();}
 // HTTP frame polling only while the live socket is unavailable for a while.
 async frameOnce(){
  const now=performance.now(),watching=!!this.room.field?.watching;
  // CCTV views arrive over the socket too; HTTP only renews the watch lease every 2 s.
  if(this.live?.healthy()){this.unhealthySince=0;if(!watching||now-this.lastCameraPoll<CAMERA_KEEPALIVE_MS)return;}
  else if(this.live&&!watching){this.unhealthySince||=now;if(now-this.unhealthySince<HTTP_GRACE_MS)return;}
  if(watching)this.lastCameraPoll=now;
  const r=this.room,data=await this.o.http({action:'frame',base:this.snapshot?.own,count:r.config.count,mapId:r.config.mapId,revision:r.revision,camera:!!r.field?.watching&&!this.hidden(),protocol:2,inputs:this.busy?[]:this.pending,warp:this.warp,code:this.o.code,seq:r.seq});
  if(data.error)throw Error(data.error);if(!this.stopped)this.apply(data,'http');
 }
 // Field action: over the live socket when healthy (same isolate, ordered after the
 // inputs), otherwise HTTP. A transport failure retries once over HTTP with the same
 // requestId, which the server de-duplicates.
 async act(action:string,extra:Record<string,unknown>={}):Promise<FrameReply|null>{
  if(this.busy)return null;this.busy=true;const started=performance.now();
  const body={action,protocol:2,inputs:this.outgoing(),warp:this.warp,code:this.o.code,seq:this.room.seq,requestId:crypto.randomUUID(),...extra};
  try{
   let data:FrameReply|null=null;
   if(this.live?.healthy()){try{data=await this.live.act(body) as unknown as FrameReply;this.stats.count('act.live');}catch(e){if(e instanceof LiveActionError)throw e;this.stats.count('act.liveFailed');}}
   if(!data){this.holdLive=true;data=await this.o.http({...body,inputs:this.pending});this.stats.count('act.http');if(data.error)throw Error(data.error);}
   this.apply(data,'action');const ms=performance.now()-started;this.stats.action.push(ms);if(action==='kill')this.stats.kill.push(ms);return data;
  }finally{this.busy=false;this.holdLive=false;}
 }
 // ---- per rendered frame ---------------------------------------------------------------
 // Turns held keys/stick into fixed 20 ms inputs, predicts locally and eases corrections.
 step(dt:number,direction:Point,halt:boolean){
  const r=this.room,moving=Math.hypot(direction.x,direction.y)>.05&&!halt&&this.connected&&!r.host&&this.pending.length<180;
  const inputDirection=moving?direction:{x:0,y:0};
  if(this.bootstrapped&&this.connected&&!r.host&&!halt&&this.pending.length<180&&(moving||this.wasMoving)){
   const batch=moving?inputSteps(this.inputElapsed,dt*1000):{steps:1,remainder:0};this.inputElapsed=batch.remainder;
   const t=performance.now();
   for(let i=0;i<batch.steps&&this.pending.length<180;i++){const input={n:this.inputNumber++,dx:inputDirection.x,dy:inputDirection.y,ms:INPUT_STEP_MS};this.pending.push(input);this.sentAt.set(input.n,t);this.local=stepInput(this.local,input,r.config);}
  }else this.inputElapsed=0;this.wasMoving=moving;
  const predicted=stepInput(this.local,{n:0,dx:inputDirection.x,dy:inputDirection.y,ms:this.inputElapsed},r.config);
  const decay=Math.exp(-dt*18);this.correction.x*=decay;this.correction.y*=decay;
  this.visual=moveTo(predicted,{x:predicted.x+this.correction.x,y:predicted.y+this.correction.y},Math.hypot(this.correction.x,this.correction.y),r.config);
  return moving;
 }
 // Everybody to draw this frame: live snapshot plus briefly retained peers, each at its
 // interpolated position. Retained peers are never attack targets (they are not in the
 // snapshot people list used for targeting).
 render(time:number,opts:{retain:boolean}):RenderedPerson[]{
  const s=this.snapshot,r=this.room;if(!s)return[];
  const live=s.people,ids=new Set(live.map(p=>p.id));
  const held=opts.retain?retainedPeers(this.presence,time,this.visual,s.radius||WORLD.vision,r.config).filter(p=>!ids.has(p.id)):[];
  const out:RenderedPerson[]=[];const serverNow=Date.now()+this.serverOffset;
  for(const p of [...live,...held]){const mine=p.id===r.me;let pos:Point&{at?:number}=p;
   if(mine)pos=this.visual;else{const track=this.tracks[p.id];if(track){pos=sampleRemote(track,r.paused?(track.painted??time):time,r.config);const a=track.samples;if(pos.at&&a.length>1&&Math.hypot(a[a.length-1].x-a[a.length-2].x,a[a.length-1].y-a[a.length-2].y)>.5)this.stats.renderDelay.push(serverNow-pos.at);}}
   this.interpolated[p.id]=pos;out.push({...p,x:pos.x,y:pos.y,at:pos.at??p.at,mine,opacity:mine?1:presenceOpacity(this.presence[p.id],time)});}
  return out;
 }
}
