import {HISTORY_SQL} from '@/lib/lag-compensation';
import { database, hash, mutate, roomGate, roomLocks, type RoomRow } from '@/lib/store';
import { actor, view, type Room } from '@/lib/game';
import { fieldAct, fieldSnapshot, poseFor, stopCameras, type Pose } from '@/lib/field';
import {proposeMotion,MOVE_CHECKPOINT_SQL,HTTP_MOVE_ALLOWED,LIVE_LEASE_MS} from '@/lib/field-transport';
import { consumeInputs } from '@/lib/motion';
import { moveTo, WORLD, locationAt } from '@/lib/map';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store, private','Vary':'Authorization'}});
// HTTP is the fallback transport: the client uses it before its WebSocket is ready, while
// it is reconnecting, and for actions when the socket is unhealthy. A live connection's
// movement lease (see lib/field-transport.ts) always takes precedence over HTTP writes.
const UPSERT_HTTP_POSE='INSERT INTO field_positions (code,player,x,y,at,seq,ack,clock,warp,previous,place,owner,owner_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,\'http\',?';
const ON_CONFLICT_HTTP=' ON CONFLICT(code,player) DO UPDATE SET history=' + HISTORY_SQL + ',x=excluded.x,y=excluded.y,at=excluded.at,seq=excluded.seq,ack=excluded.ack,clock=excluded.clock,warp=excluded.warp,previous=excluded.previous,place=excluded.place,owner=\'http\',owner_at=excluded.owner_at';
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return reply({error:'잘못된 요청입니다.'},403);
 const raw=await req.text();if(raw.length>18000)return reply({error:'요청이 너무 큽니다.'},413);const b=JSON.parse(raw);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token)||!(/^[A-Z2-9]{6}$/.test(String(b.code))))throw Error('입장 정보를 확인해 주세요.');
 const key=await hash(token),db=database();
 const positions=()=>db.prepare('SELECT player AS id, x, y, at, seq, ack, clock, warp, previous, place, history, owner, owner_at FROM field_positions WHERE code = ?').bind(b.code);
 // Verified checkpoint movement + fresh room + all positions share one round trip.
 const now=Date.now(),lease=now-LIVE_LEASE_MS,base=b.base as Pose|undefined,count=Number(b.count);
 const proposal=b.action==='frame'&&b.protocol===2&&Number.isInteger(count)&&count>=6&&count<=29&&b.seq===base?.seq&&(b.warp||0)===(base?.warp||0)?proposeMotion(base,b.inputs,now,{count,mapId:b.mapId==='nereid'?'nereid':'aurora'}):null;
 const writes=proposal&&base?[db.prepare(MOVE_CHECKPOINT_SQL).bind(proposal.x,proposal.y,proposal.at,proposal.ack,proposal.clock,proposal.place,proposal.place,now,b.code,base.id,base.x,base.y,base.at,base.seq,base.ack,base.clock,base.warp,now,key,b.seq,count,b.mapId==='nereid'?'nereid':'aurora',lease)]:[];
 const initial=await db.batch([...writes,db.prepare('SELECT state, version, expires FROM mafia_rooms WHERE code = ?').bind(b.code),positions()]);
 const moved=!!writes.length&&initial[0].meta.changes===1,offset=writes.length;
 const row=initial[offset].results[0] as RoomRow|undefined;if(!row)throw Error('방을 찾을 수 없거나 만료되었습니다. 코드를 확인해 주세요.');
 let r=await mutate(b.code,key,undefined,{row,db}),poses=initial[offset+1].results as (Pose&{owner?:string;owner_at?:number})[];
 const seed=()=>({row:{state:JSON.stringify(r),version:r.revision||0,expires:row.expires},db});
 const {p}=actor(r,key);
 // Does a live connection currently own this player's movement?
 const leased=(id:string)=>{const saved=poses.find(x=>x.id===id);return !!saved&&!!saved.owner&&saved.owner!=='http'&&(saved.owner_at||0)>=lease;};
 if(b.action==='frame'&&p&&r.phase==='field'&&r.field?.watching?.[p.id]&&!r.paused){const w=r.field.watching[p.id];if(b.camera!==true||w.until-Date.now()<6000)r=await mutate(b.code,key,room=>{const current=room.field?.watching?.[p.id];if(!current)return;if(b.camera===true)current.until=Date.now()+12000;else stopCameras(room,p.id,Date.now());},seed());}

 if(b.action!=='frame'&&b.protocol===2&&p){
  for(let attempt=0;attempt<24;attempt++){
   const current=r.players.find(x=>x.key===key)!;const now=Date.now(),old=poseFor(r,current,poses,now),saved=poses.find(x=>x.id===current.id),ownedLive=leased(current.id);
   let next={...old,ack:old.ack||0,clock:old.clock||old.at};
   if(r.phase==='field'&&!r.paused&&b.seq===r.seq&&!r.field?.venting?.[current.id]&&!r.field?.watching?.[current.id]&&(b.warp||0)===(old.warp||0))next={...next,...consumeInputs(next,b.inputs,now,r.config)};
   const place=locationAt(next,r.config),candidate:Pose={...next,id:current.id,at:Math.max(now,(saved?.at||0)+1),seq:r.field?.epoch||0,warp:old.warp||0,place,previous:place!==old.place?old.place:old.previous};
   const actionPoses=poses.filter(x=>x.id!==current.id).concat(candidate),draft:Room=structuredClone(r);
   fieldAct(draft,key,b,actionPoses,now);draft.revision=(r.revision||0)+1;
   // While a live connection owns movement the action uses its last checkpoint plus the
   // sent inputs but must not overwrite the row (no stale-position retry loop either).
   const update=db.prepare('UPDATE mafia_rooms SET state=?,version=version+1,live_gate=?,live_locks=? WHERE code=? AND version=? AND (COALESCE((SELECT at FROM field_positions WHERE code=? AND player=?),0)=? OR ?=1)').bind(JSON.stringify(draft),roomGate(draft),roomLocks(draft),r.code,r.revision||0,r.code,current.id,saved?.at||0,ownedLive?1:0);
   // changes() belongs to the preceding guarded update in this atomic batch.
   const move=db.prepare(UPSERT_HTTP_POSE+' WHERE changes()=1'+ON_CONFLICT_HTTP+' WHERE '+HTTP_MOVE_ALLOWED).bind(r.code,current.id,candidate.x,candidate.y,candidate.at,candidate.seq,candidate.ack,candidate.clock,candidate.warp,candidate.previous,candidate.place,now,lease);
   const committed=await db.batch([update,move]);
   if(committed[0].meta.changes===1)return reply({room:view(draft,key),revision:draft.revision,frame:fieldSnapshot(draft,key,actionPoses)});
   // Same randomised back-off as mutate(): without it simultaneous actions (29 players
   // pressing at once) retry in lock-step and can exhaust the attempts. The window grows
   // with each failed attempt so an uncontended retry stays immediate.
   await new Promise(resolve=>setTimeout(resolve,Math.random()*Math.min(45,4*attempt)));
   const refreshed=await db.batch([db.prepare('SELECT state,version,expires FROM mafia_rooms WHERE code=?').bind(b.code),positions()]);
   const fresh=refreshed[0].results[0] as RoomRow|undefined;if(!fresh)throw Error('방을 찾을 수 없습니다.');
   r=await mutate(b.code,key,undefined,{row:fresh,db});poses=refreshed[1].results as Pose[];
  }
  throw Error('요청이 몰리고 있습니다. 다시 시도해 주세요.');
 }
 // Actions carry the last unacknowledged movement with them; no separate flush request.
 if(!moved&&p&&!leased(p.id)&&(b.action==='frame'||b.protocol===2))for(let attempt=0;attempt<2;attempt++){
  if(r.phase!=='field'||!r.field||r.paused||b.seq!==r.seq||r.field.venting?.[p.id]||r.field.watching?.[p.id])break;
  const now=Date.now(),old=poseFor(r,p,poses,now),saved=poses.find(x=>x.id===p.id);let next={...old,ack:old.ack||0,clock:old.clock||old.at};
  if(b.protocol===2){if((b.warp||0)===(old.warp||0))next={...next,...consumeInputs(next,b.inputs,now,r.config)};}
  else {const elapsed=Math.max(0,Math.min(.8,(now-old.at)/1000));if(Number.isFinite(b.x)&&Number.isFinite(b.y))next={...next,...moveTo(old,{x:b.x,y:b.y},WORLD.speed*1.15*elapsed,r.config)};}
  if(saved&&saved.seq===r.field.epoch&&saved.warp===(old.warp||0)&&next.ack===(saved.ack||0)&&next.x===saved.x&&next.y===saved.y)break;
  const place=locationAt(next,r.config),previous=place!==old.place?old.place:old.previous;
  const write=db.prepare(UPSERT_HTTP_POSE+' WHERE EXISTS (SELECT 1 FROM mafia_rooms WHERE code=? AND version=?)'+ON_CONFLICT_HTTP+' WHERE field_positions.at = ? AND '+HTTP_MOVE_ALLOWED).bind(r.code,p.id,next.x,next.y,Math.max(now,(saved?.at||0)+1),r.field.epoch,next.ack,next.clock,old.warp||0,previous,place,now,r.code,r.revision||0,saved?.at||0,lease);
  // The version predicate prevents an old frame from moving after a meeting or pause.
  const updated=await db.batch([write,positions()]);poses=updated[1].results as Pose[];
  if(updated[0].meta.changes===1)break;
  r=await mutate(b.code,key);
 }
 if(b.action!=='frame')r=await mutate(b.code,key,room=>fieldAct(room,key,b,poses,Date.now()),seed());
 const frame=fieldSnapshot(r,key,poses);
 // Player roles, chat and task lists only travel when their authoritative revision changes.
 return reply({...(b.action!=='frame'||b.revision!==r.revision?{room:view(r,key)}:{}),revision:r.revision,transport:moved?'checkpoint':'sync',frame});
 }catch(e){return reply({error:e instanceof Error?e.message:'현장 연결을 다시 시도해 주세요.'},400);}}
