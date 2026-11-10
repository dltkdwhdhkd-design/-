// Line-by-line transcription of the v21 FieldGame network/movement logic (React state
// replaced by plain fields) so the simulator measures the shipped client behaviour.
import {LiveClient} from '../../lib/live-client.ts';
import {stepInput,reconcileMotion} from '../../lib/motion.ts';
import {inputSteps,INPUT_STEP_MS} from '../../lib/input.ts';
import {updatePresence,retainedPeers} from '../../lib/peer-presence.ts';
import {pushRemote,sampleRemote} from '../../lib/remote-motion.ts';
import {spawn,moveTo,distance,WORLD} from '../../lib/map.ts';
import {isImpostor} from '../../lib/field-roles.ts';

export function createClient({index,code,token,room,http,metrics,wsUrl}){
 const c={index,code,token,hidden:false,intent:{x:0,y:0},alive:true,dead:false};
 let latest=room,snapshot=null,bootstrapped=false,connected=false,busy=false,live=null;
 let local=spawn(index,room.config),visualLocal={...local},correction={x:0,y:0},pending=[],inputNumber=1,lastAck=0,warp=0,inputElapsed=0,wasMoving=false;
 const remoteTracks={},presence={},interpolated={};let remoteEpoch=-1;
 const sentAt=new Map(),seenBodies=new Set();
 c.me=()=>latest.me;c.view=()=>latest;c.snapshot=()=>snapshot;c.position=()=>visualLocal;c.pendingCount=()=>pending.length;
 c.rendered=new Map();c.trackOf=id=>remoteTracks[id];c.isLiveHealthy=()=>!!live?.healthy();
 function apply(data,source){
  const f=data.frame;if(data.revision<latest.revision||f.own.warp!==undefined&&f.own.warp<warp||snapshot&&data.revision<=latest.revision&&f.serverNow<snapshot.serverNow){metrics.count('frame.dropped');return;}
  metrics.count('frame.'+source);if(process.env.SIM_TRACE&&index===Number(process.env.SIM_TRACE))console.error('[trace]',Math.round(performance.now()),source,'rev',data.revision,'room',!!data.room,'bodies',f.bodies.length,'alive',data.room?.players.find(p=>p.id===data.room.me)?.alive);
  if(remoteEpoch!==f.seq){for(const k of Object.keys(remoteTracks))delete remoteTracks[k];for(const k of Object.keys(presence))delete presence[k];for(const k of Object.keys(interpolated))delete interpolated[k];remoteEpoch=f.seq;}
  const received=performance.now(),removed=new Set();
  for(const body of f.bodies)removed.add(body.id);
  for(const e of f.effects||[]){if(e.kind==='attack'&&e.target)removed.add(e.target);if(e.kind==='vanish'||e.kind==='vent')removed.add(e.actor);}
  updatePresence(presence,f.people,received,removed);
  for(const id of Object.keys(remoteTracks))if(!presence[id]){delete remoteTracks[id];delete interpolated[id];metrics.count('track.deleted');}
  for(const person of f.people){if(person.id!==latest.me)metrics.sample(person.id,person.at||f.serverNow,f.serverNow);remoteTracks[person.id]=pushRemote(remoteTracks[person.id],{...person,at:person.at||f.serverNow,warp:person.warp||0},performance.now());}
  if(data.room){latest=data.room;}connected=true;snapshot=f;
  if(!bootstrapped||warp!==(f.own.warp||0)){pending=[];inputNumber=(f.own.ack||0)+1;lastAck=f.own.ack||0;warp=f.own.warp||0;local={x:f.own.x,y:f.own.y};bootstrapped=true;correction={x:0,y:0};}
  else if((f.own.ack||0)>=lastAck){
   for(const [n,t] of sentAt)if(n<=(f.own.ack||0)){metrics.ack(performance.now()-t);sentAt.delete(n);}
   const result=reconcileMotion(f.own,pending,latest.config);pending=result.pending;const dx=local.x-result.position.x,dy=local.y-result.position.y;if(Math.hypot(dx,dy)>.01)metrics.correction(Math.hypot(dx,dy));correction={x:correction.x+dx,y:correction.y+dy};local=result.position;lastAck=f.own.ack||0;}
  const me=latest.players.find(p=>p.id===latest.me);if(me&&!me.alive&&c.alive){c.alive=false;metrics.event('deathSeen',{who:index});}
  for(const b of f.bodies)if(!seenBodies.has(b.id)){seenBodies.add(b.id);metrics.bodySeen(b.id);}
  c.onFrame?.(f,data);
 }
 c.apply=apply;
 async function frameOnce(){
  if(live?.healthy())return;
  const body={action:'frame',base:snapshot?.own,count:latest.config.count,mapId:latest.config.mapId,revision:latest.revision,camera:false,protocol:2,inputs:busy?[]:pending,warp,code,seq:latest.seq};
  const data=await http(token,'/api/field',body);if(data.error)throw Error(data.error);apply(data,'http');
 }
 let stopped=false,pollTimer;
 const poll=async()=>{const started=performance.now();let failed=false;try{await frameOnce();}catch(e){failed=true;connected=false;metrics.count('http.error');}finally{if(!stopped)pollTimer=setTimeout(poll,c.hidden?1000:failed?350:Math.max(12,100-(performance.now()-started)));}};
 const boot=setInterval(()=>{if(!snapshot||live)return;live=new LiveClient({url:wsUrl,code,token,input:()=>({seq:latest.seq,warp,hold:busy,inputs:busy?[]:pending}),frame:data=>apply(data,'live'),status:()=>{}});c.live=live;live.start();},100);
 c.start=()=>{void poll();};
 c.stop=()=>{stopped=true;clearTimeout(pollTimer);clearInterval(boot);live?.stop();};
 c.act=async(action,extra={})=>{if(busy)return null;busy=true;try{const data=await http(token,'/api/field',{action,protocol:2,inputs:pending,warp,code,seq:latest.seq,requestId:crypto.randomUUID(),...extra});if(data.error)return data;apply(data,'action');return data;}finally{busy=false;}};
 // One rendered frame (FirstPersonViewport/2D draw loop movement + remote sampling).
 c.frame=(time,dt)=>{
  if(c.hidden){inputElapsed=0;return;}
  const halt=!!latest.paused||busy&&false;
  const direction=c.alive?c.intent:{x:0,y:0},moving=Math.hypot(direction.x,direction.y)>.05&&!halt&&connected&&pending.length<180;
  const inputDirection=moving?direction:{x:0,y:0};
  if(bootstrapped&&connected&&!halt&&pending.length<180&&(moving||wasMoving)){
   const batch=moving?inputSteps(inputElapsed,dt*1000):{steps:1,remainder:0};inputElapsed=batch.remainder;
   for(let i=0;i<batch.steps&&pending.length<180;i++){const input={n:inputNumber++,dx:inputDirection.x,dy:inputDirection.y,ms:INPUT_STEP_MS};pending.push(input);sentAt.set(input.n,performance.now());local=stepInput(local,input,latest.config);}
  }else inputElapsed=0;wasMoving=moving;
  if(pending.length>=180)metrics.count('frame.inputBlocked');
  const predicted=stepInput(local,{n:0,dx:inputDirection.x,dy:inputDirection.y,ms:inputElapsed},latest.config);
  const decay=Math.exp(-dt*18);correction.x*=decay;correction.y*=decay;visualLocal=moveTo(predicted,{x:predicted.x+correction.x,y:predicted.y+correction.y},Math.hypot(correction.x,correction.y),latest.config);
  const s=snapshot;c.rendered.clear();if(!s)return;
  const liveIds=new Set(s.people.map(p=>p.id)),held=retainedPeers(presence,time,visualLocal,s.radius||WORLD.vision,latest.config).filter(p=>!liveIds.has(p.id));
  for(const p of [...s.people,...held]){if(p.id===latest.me)continue;const track=remoteTracks[p.id];const pos=track?sampleRemote(track,latest.paused?(track.painted??time):time,latest.config,!!live?.healthy()):p;interpolated[p.id]=pos;if(p.alive&&!p.vented&&!p.invisible)c.rendered.set(p.id,{x:pos.x,y:pos.y,at:pos.at});}
 };
 // FieldGame.kill(): pick the nearest eligible rendered target and send the strike.
 c.tryKill=async(targetId)=>{
  const live=snapshot?.people||[],role=latest.myRole;
  const p=live.find(p=>p.id===targetId&&p.alive&&!p.vented&&!p.invisible);if(!p)return{skipped:'not-visible'};
  const pos={...p,...interpolated[p.id]};if(distance(visualLocal,pos)>=93)return{skipped:'far'};
  if(!isImpostor(role)&&role!=='lonewolf')return{skipped:'role'};
  return c.act('kill',{target:targetId,targetAt:pos.at});
 };
 return c;
}
