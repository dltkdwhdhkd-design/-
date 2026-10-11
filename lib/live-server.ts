import {locationAt,moveTo,distance,WORLD,type Point} from './map.ts';
import {database,hash,roomGate,roomWrite,liveQueryBudget,type RoomRow} from './store';
import {actor,view,tick,type Room} from './game';
import {fieldAct,fieldSnapshot,poseFor,type Pose,type FieldBody} from './field';
import {consumeInputs,type MoveInput} from './motion';
import {HISTORY_SQL,REWIND_MS,type HistoricPose} from './lag-compensation';

// ---------------------------------------------------------------------------------------
// Realtime field server.
//
// A Cloudflare Worker has no per-room singleton: every WebSocket may land in a different
// isolate. Earlier versions therefore relayed everybody's position through D1 on every
// tick, which made other players lag 0.5-2 s, flicker out of view and made attacks miss.
//
// Now each isolate is the single authority ("owner") for the players whose sockets it
// holds: their inputs are applied in memory the moment they arrive and are broadcast to
// every peer in the same isolate immediately. D1 is used only to (a) persist owned poses
// for other isolates and for reconnects and (b) learn about players owned elsewhere.
// One D1 batch per cycle carries both, and the large room JSON is only transferred when
// its version changed. Ownership is a lease in field_positions (owner/owner_at): a newer
// connection for the same player takes it over and the older one is closed.
//
// Field actions (attack, report, missions...) are also sent over the socket and run in
// the actor's isolate against exactly the positions that actor was shown, so "what you
// saw is what you hit" even for targets owned by another isolate.
//
// D1 limits queries per Worker invocation; a WebSocket is one invocation. Every D1
// statement is charged to the peer whose context issued it, the cycle is driven by the
// peer with the most budget left, and a peer close to its budget is asked to reconnect
// (seamless: the client re-sends unconfirmed inputs).
//
// Workers forbid I/O on behalf of another request: a socket may only be written from the
// request (connection) that accepted it, and a D1 call belongs to the connection that made
// it. Shared room state is therefore never pushed to other sockets directly: work done in one
// connection's context marks peers (force/outbox) and each peer's own 50 ms pump delivers.
// A cycle whose connection ended mid-call is abandoned after CYCLE_STALE_MS.
// ---------------------------------------------------------------------------------------

type Row=Pose&{owner:string;owner_at:number};
type Peer={socket:WebSocket;key:string;id:string|null;conn:string;owner:string;claimedAt:number;revision:number;seen:number;rateAt:number;rateCount:number;
 replaced?:boolean;closed?:boolean;retiringSince?:number;signature?:string;lastBroadcast:number;lastDiag:number;queries:number;visible:Map<string,number>;wantResend?:number;
 /** messages for this socket queued by other request contexts; only its own pump sends them */ outbox:unknown[];force?:boolean;closeWith?:[number,string]};
type Owned={peer:Peer;pose:Pose;queue:Map<number,MoveInput>;dirty:boolean;written:number;heartbeat:number;gapSince:number|null;resendAsked:number};

const CYCLE_STALE_MS=6000,MOTION_JITTER_MS=100,MAX_INFLIGHT=2,CYCLE_MS=70,QUIET_CYCLE_MS=220,BROADCAST_MS=50,TICK_MS=300,HISTORY_KEEP=REWIND_MS+700;
const rooms=new Map<string,LiveRoom>();
let INSTANCE='';
const send=(socket:WebSocket,data:unknown)=>{try{if(socket.readyState===1)socket.send(JSON.stringify(data));}catch{/* closed underneath us */}};
// Safe from any context: delivered by the peer's own pump within one broadcast interval.
const post=(peer:Peer,data:unknown)=>{if(!peer.closed&&peer.outbox.length<64)peer.outbox.push(data);};
const READ_SQL=`SELECT r.version AS version,r.expires AS expires,r.live_gate AS gate,CASE WHEN r.version<>?1 THEN r.state END AS state,
 (SELECT json_group_array(json_array(p.player,p.x,p.y,p.at,p.seq,p.ack,p.clock,p.warp,p.previous,p.place,p.owner,p.owner_at)) FROM field_positions p WHERE p.code=r.code) AS poses
 FROM mafia_rooms r WHERE r.code=?2`;
// One statement persists every dirty owned pose. Rows are only touched by their lease
// holder, only while the room is in the same unpaused field phase and the player is not
// locked in a vent/CCTV, and never move backwards in input order.
const FLUSH_SQL=`INSERT INTO field_positions (code,player,x,y,at,seq,ack,clock,warp,previous,place,owner,owner_at)
 SELECT ?1,json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),json_extract(j.value,'$[2]'),json_extract(j.value,'$[3]'),json_extract(j.value,'$[4]'),json_extract(j.value,'$[5]'),json_extract(j.value,'$[6]'),json_extract(j.value,'$[7]'),json_extract(j.value,'$[8]'),json_extract(j.value,'$[9]'),json_extract(j.value,'$[10]'),?4
 FROM json_each(?2) j WHERE EXISTS (SELECT 1 FROM mafia_rooms r WHERE r.code=?1 AND r.expires>?4 AND r.live_gate=?3 AND instr(r.live_locks,'|'||json_extract(j.value,'$[0]')||'|')=0)
 ON CONFLICT(code,player) DO UPDATE SET history=CASE WHEN field_positions.ack<>excluded.ack OR field_positions.seq<>excluded.seq THEN ${HISTORY_SQL} ELSE field_positions.history END,
 x=excluded.x,y=excluded.y,at=excluded.at,seq=excluded.seq,ack=excluded.ack,clock=excluded.clock,warp=excluded.warp,previous=excluded.previous,place=excluded.place,owner_at=excluded.owner_at
 WHERE field_positions.owner=excluded.owner AND (field_positions.seq<>excluded.seq OR field_positions.warp<>excluded.warp OR field_positions.ack<excluded.ack OR field_positions.owner_at<excluded.owner_at-900)`;
// Taking over a player always succeeds; it also creates the row for a new epoch.
const CLAIM_SQL=`INSERT INTO field_positions (code,player,x,y,at,seq,ack,clock,warp,previous,place,owner,owner_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(code,player) DO UPDATE SET owner=excluded.owner,owner_at=excluded.owner_at`;
// Extrapolate remote (other-isolate) actors for visibility only; never for positions or hits.
const PREDICT_MS=500;
const parsePoses=(json:string|null):Row[]=>{if(!json)return[];try{return(JSON.parse(json) as unknown[][]).map(a=>({id:String(a[0]),x:Number(a[1]),y:Number(a[2]),at:Number(a[3]),seq:Number(a[4]),ack:Number(a[5]),clock:Number(a[6]),warp:Number(a[7]),previous:String(a[8]),place:String(a[9]),owner:String(a[10]||''),owner_at:Number(a[11]||0)}));}catch{return[];}};
const isQuotaError=(e:unknown)=>/too many|limit|exceed|subrequest/i.test(e instanceof Error?e.message:String(e));
// The host's per-connection D1 query cap is learned from its own error message, so nothing
// has to be configured whatever plan the hosting runs on: after the first "too many
// requests/subrequests" error, every connection in this isolate hands over a few queries
// before that point. LIVE_D1_QUERY_BUDGET (default 800) only sets an upper bound.
const isCapError=(e:unknown)=>/too many (api )?(sub)?requests|subrequest/i.test(e instanceof Error?e.message:String(e));
let learnedBudget=Infinity;
const queryBudget=()=>Math.min(liveQueryBudget(),learnedBudget);

class LiveRoom{
 peers=new Set<Peer>();owned=new Map<string,Owned>();rows=new Map<string,Row>();history=new Map<string,HistoricPose[]>();
 r:Room;version:number;fresh=Date.now();closed=false;cycles=new Map<number,number>();tickingSince=0;nextCycle=0;nextTick=0;cycleSeq=0;applied=0;
 stats={rtt:[] as number[],statements:[] as number[],errors:0,recycles:0};
 constructor(r:Room,version:number,rows:Row[]){this.r=r;this.version=version;this.r.revision=version;this.ingestRows(rows,Date.now());}
 // ---- helpers -------------------------------------------------------------------------
 player(id:string|null){return id?this.r.players.find(p=>p.id===id):undefined;}
 remember(id:string,p:HistoricPose){const h=this.history.get(id)||[];const last=h.at(-1);if(last&&last.at===p.at&&last.x===p.x&&last.y===p.y)return;h.push({x:p.x,y:p.y,at:p.at,warp:p.warp||0,seq:p.seq});const from=Date.now()-HISTORY_KEEP;while(h.length>2&&h[0].at<from)h.shift();this.history.set(id,h);}
 // Everybody's best known pose: owned players from memory, the rest from D1.
 poses(now:number,withHistory=false):Pose[]{
  const out:Pose[]=[];
  for(const p of this.r.players){const o=this.owned.get(p.id);const pose=o?o.pose:this.rows.get(p.id);if(!pose)continue;out.push(withHistory?{...pose,history:(this.history.get(p.id)||[]).filter(h=>h.at<pose.at) as never}:pose);}
  void now;return out;
 }
 // Lazily evaluated (only for actors near the edge of someone's view) and memoised per 50 ms.
 private guesses=new Map<string,{bucket:number;point:Point|undefined}>();
 predict(id:string,now:number):Point|undefined{
  const bucket=Math.floor(now/50),hit=this.guesses.get(id);if(hit&&hit.bucket===bucket)return hit.point;
  let point:Point|undefined;const row=this.rows.get(id),h=this.history.get(id);
  if(row&&!this.owned.has(id)&&now-row.at<=1500&&h&&h.length>=2){const b=h[h.length-1],a=h[h.length-2],dt=b.at-a.at,d=distance(a,b);
   if(dt>0&&dt<=600&&b.at===row.at&&(b.warp||0)===(row.warp||0)&&(a.warp||0)===(b.warp||0)&&a.seq===b.seq&&d>=.5){const v=Math.min(WORLD.speed,d/(dt/1000)),e=Math.min(PREDICT_MS,now-b.at)/1000;point=moveTo(b,{x:b.x+(b.x-a.x)/d*v*e,y:b.y+(b.y-a.y)/d*v*e},v*e,this.r.config);}}
  this.guesses.set(id,{bucket,point});return point;
 }
 // Re-derive an owned pose after the room state changed (warps, new epoch after a meeting).
 normalize(o:Owned,now:number){const p=this.player(o.peer.id);if(!p)return;const next=poseFor(this.r,p,[o.pose],now);if(next!==o.pose){const epochChanged=next.seq!==o.pose.seq,warped=(next.warp||0)!==(o.pose.warp||0);o.pose={...next,ack:epochChanged?0:next.ack||0,clock:next.clock??now,warp:next.warp||0};o.dirty=true;if(epochChanged||warped)o.queue.clear();this.remember(p.id,o.pose);}}
 ingestRows(rows:Row[],now:number){
  for(const row of rows){this.rows.set(row.id,row);if(!this.owned.has(row.id))this.remember(row.id,row);}
  void now;
 }
 // ---- peers ---------------------------------------------------------------------------
 add(peer:Peer,row:Row|undefined,now:number){
  for(const old of this.peers)if(old.key===peer.key){old.replaced=true;}
  this.peers.add(peer);
  const p=this.player(peer.id);if(!p)return;
  const prev=this.owned.get(p.id);if(prev&&prev.peer!==peer)prev.peer.replaced=true;
  const pose=poseFor(this.r,p,row?[row]:[],now);
  this.owned.set(p.id,{peer,pose:{...pose,ack:pose.ack||0,clock:pose.clock??now,warp:pose.warp||0},queue:new Map(),dirty:false,written:pose.ack||0,heartbeat:now,gapSince:null,resendAsked:0});
  this.remember(p.id,pose);
 }
 remove(peer:Peer){
  peer.closed=true;this.peers.delete(peer);
  for(const [id,o] of this.owned)if(o.peer===peer){this.owned.delete(id);const row=this.rows.get(id);if(row)this.rows.set(id,{...row,...o.pose,owner:row.owner,owner_at:row.owner_at});}
  if(!this.peers.size){this.closed=true;if(rooms.get(this.r.code)===this)rooms.delete(this.r.code);}
 }
 // Remaining D1 budget decides which peer pays for the shared cycle.
 driver(){let best:Peer|undefined;for(const p of this.peers)if(!p.replaced&&!p.closed&&!p.retiringSince&&(!best||p.queries<best.queries))best=p;return best;}
 async d1(peer:Peer,stmts:D1PreparedStatement[]){
  const before=peer.queries;peer.queries+=stmts.length;const t=Date.now();
  try{const out=await database().batch(stmts);this.stats.rtt.push(Date.now()-t);if(this.stats.rtt.length>40)this.stats.rtt.shift();this.stats.statements.push(...stmts.map(()=>Date.now()));return out;}
  catch(e){this.stats.errors++;if(isCapError(e))learnedBudget=Math.min(learnedBudget,Math.max(10,before-4));if(isQuotaError(e))peer.queries=Number.MAX_SAFE_INTEGER;throw e;}
  finally{if(peer.queries>=queryBudget())this.recycle(peer);}
 }
 // Ask the client to open a fresh connection (new invocation, new budget). The old one
 // keeps serving frames until the new one has taken over, so there is no visible gap.
 recycle(peer:Peer){if(peer.closed||peer.replaced||peer.retiringSince)return;peer.retiringSince=Date.now();this.stats.recycles++;post(peer,{type:'recycle'});}
 inflight(now:number){for(const [id,start] of this.cycles)if(now-start>CYCLE_STALE_MS)this.cycles.delete(id);return this.cycles.size;}
 pump(peer:Peer){
  if(this.closed||peer.closed)return false;
  if(peer.replaced||Date.now()-peer.seen>12000||peer.retiringSince&&Date.now()-peer.retiringSince>8000){try{peer.socket.close(peer.retiringSince?4000:1001,peer.retiringSince?'recycle':'Reconnect');}catch{}this.remove(peer);return false;}
  if(peer.closeWith){try{peer.socket.close(...peer.closeWith);}catch{}this.remove(peer);return false;}
  for(const m of peer.outbox.splice(0))send(peer.socket,m);
  const now=Date.now();
  for(const o of this.owned.values())if(o.peer===peer)this.advance(o,now);
  this.broadcast(peer,!!peer.force);peer.force=false;
  if(this.driver()===peer&&this.inflight(now)<MAX_INFLIGHT&&now>=this.nextCycle)void this.cycle(peer);
  return true;
 }
 // ---- movement -------------------------------------------------------------------------
 ingest(peer:Peer,b:Record<string,unknown>){
  const now=Date.now();peer.seen=now;
  if(b.type==='ping'){send(peer.socket,{type:'pong',sent:b.sent,serverNow:now});return;}
  if(b.type==='act'){void this.act(peer,b);return;}
  if(b.type!=='input')return;
  if(now-peer.rateAt>=1000){peer.rateAt=now;peer.rateCount=0;}if(++peer.rateCount>45){peer.socket.close(1008,'Too many inputs');return;}
  const o=peer.id?this.owned.get(peer.id):undefined;if(!o||o.peer!==peer)return;
  this.queue(o,b,now);this.advance(o,now);
 }
 queue(o:Owned,b:Record<string,unknown>,now:number){
  if(b.seq!==this.r.seq||!Array.isArray(b.inputs)||b.inputs.length>360||(Number(b.warp)||0)!==(o.pose.warp||0))return;
  const ack=o.pose.ack||0;
  for(const raw of b.inputs){const i=raw as MoveInput;if(!i||!Number.isSafeInteger(i.n)||i.n<=ack||i.n>ack+360||!Number.isFinite(i.ms)||i.ms<=0||i.ms>50||!Number.isFinite(i.dx)||!Number.isFinite(i.dy)||Math.abs(i.dx)>1||Math.abs(i.dy)>1)continue;if(!o.queue.has(i.n))o.queue.set(i.n,{n:i.n,dx:i.dx,dy:i.dy,ms:i.ms});}
  void now;
 }
 advance(o:Owned,now:number){
  const r=this.r,f=r.field,p=this.player(o.peer.id);if(!p||!f||r.phase!=='field'||r.paused||f.venting?.[p.id]||f.watching?.[p.id])return false;
  this.normalize(o,now);
  const base=o.pose,ack=base.ack||0;
  for(const n of o.queue.keys())if(n<=ack)o.queue.delete(n);
  if(!o.queue.size){o.gapSince=null;return false;}
  const ordered=[...o.queue.values()].sort((a,b)=>a.n-b.n);
  if(ordered[0].n!==ack+1){
   // A hole in the sequence (e.g. after a reconnect): ask the client to resend once,
   // then tell it to rebase on our pose if it cannot.
   o.gapSince??=now;
   if(now-o.resendAsked>600){o.resendAsked=now;post(o.peer,{type:'resend',after:ack,warp:base.warp||0,seq:base.seq});}
   if(now-o.gapSince>2500){o.queue.clear();o.gapSince=null;post(o.peer,{type:'rebase',own:{...base,history:undefined}});}
   return false;
  }
  o.gapSince=null;
  const next=consumeInputs({...base,ack,clock:base.clock??base.at},ordered,now,r.config);
  if(next.ack===ack)return false;
  let consumed=0;for(const i of ordered){if(i.n>next.ack)break;consumed+=i.ms;o.queue.delete(i.n);}
  // Stamp with motion time: while moving, consecutive samples are exactly as far apart as
  // the movement they describe (observers interpolate at true speed, not network rhythm).
  // After a pause, or when inputs fall too far behind, re-anchor to arrival time.
  const continuous=base.at+consumed>=now-MOTION_JITTER_MS;
  const at=Math.round(Math.max(base.at+1,continuous?Math.min(now,base.at+consumed):now));
  const place=locationAt(next,r.config);
  o.pose={...base,x:next.x,y:next.y,ack:next.ack,clock:next.clock,at,place,previous:place!==base.place?base.place:base.previous};
  o.dirty=true;this.remember(p.id,o.pose);return true;
 }
 // ---- broadcast ------------------------------------------------------------------------
 broadcast(peer:Peer,force=false){
  if(this.closed||peer.closed)return;const now=Date.now(),poses=this.poses(now);
  const sig=`${this.version}:${this.r.seq}:${this.r.paused}:${poses.map(p=>`${p.id}:${p.ack}:${p.at}:${p.warp}`).join('|')}`;
  if(!force&&sig===peer.signature&&now-peer.lastBroadcast<250)return;peer.signature=sig;peer.lastBroadcast=now;
  try{
   const {p}=actor(this.r,peer.key),frame=fieldSnapshot(this.r,peer.key,poses,now,peer.visible,id=>this.predict(id,now));
   const o=p?this.owned.get(p.id):undefined;if(o)frame.own={...o.pose,history:undefined};
   const changed=peer.revision!==this.version;
   const diag=now-peer.lastDiag>=1000?this.diagnostics(peer,now):undefined;if(diag)peer.lastDiag=now;
   send(peer.socket,{type:'frame',transport:'live',instance:INSTANCE,revision:this.version,...(changed?{room:view(this.r,peer.key)}:{}),frame,checkpointAge:now-this.fresh,resync:false,...(diag?{diag}:{})});peer.revision=this.version;
  }catch{try{peer.socket.close(1008,'Session ended');}catch{}this.remove(peer);}
 }
 diagnostics(peer:Peer,now:number){
  const owners=new Set<string>();for(const row of this.rows.values())if(row.owner&&row.owner.startsWith('live:')&&row.owner_at>now-4000)owners.add(row.owner.split(':')[1]);
  const statements=this.stats.statements.filter(t=>t>now-5000);this.stats.statements=statements;
  const rtt=this.stats.rtt.length?Math.round(this.stats.rtt.reduce((a,b)=>a+b,0)/this.stats.rtt.length):0;
  return{instance:INSTANCE.slice(0,8),conn:peer.conn,peersHere:this.peers.size,ownedHere:this.owned.size,instances:Math.max(1,owners.size),dbRttMs:rtt,dbStatementsPerSec:Math.round(statements.length/5*10)/10,queries:peer.queries,budget:queryBudget(),dbErrors:this.stats.errors,recycles:this.stats.recycles,checkpointAge:now-this.fresh};
 }
 // ---- D1 cycle --------------------------------------------------------------------------
 // Up to MAX_INFLIGHT cycles overlap so the cadence does not depend on the D1 round trip.
 async cycle(driver:Peer){
  const start=Date.now();if(this.closed||this.inflight(start)>=MAX_INFLIGHT)return;const id=++this.cycleSeq;this.cycles.set(id,start);
  {let remote=false;for(const row of this.rows.values())if(!this.owned.has(row.id)&&row.owner&&row.owner_at>start-4000){remote=true;break;}this.nextCycle=start+(remote||this.owned.size===0?CYCLE_MS:QUIET_CYCLE_MS);}
  try{
   const items:unknown[][]=[],flushed:[Owned,number][]=[];
   for(const o of this.owned.values()){if(!o.dirty&&start-o.heartbeat<1000)continue;const q=o.pose;items.push([q.id,q.x,q.y,Math.round(q.at),q.seq,q.ack||0,q.clock??q.at,q.warp||0,q.previous,q.place,o.peer.owner]);flushed.push([o,q.ack||0]);}
   const db=database(),stmts:D1PreparedStatement[]=[];
   if(items.length)stmts.push(db.prepare(FLUSH_SQL).bind(this.r.code,JSON.stringify(items),roomGate(this.r),start));
   stmts.push(db.prepare(READ_SQL).bind(this.version,this.r.code));
   const res=await this.d1(driver,stmts);
   for(const [o] of flushed){o.heartbeat=start;}
   const row=res.at(-1)!.results[0] as {version:number;expires:number;gate:string;state:string|null;poses:string}|undefined;
   if(!row||row.expires<Date.now()){this.closed=true;for(const p of this.peers)p.closeWith=[1001,'Room closed'];return;}
   if(id<this.applied)return;this.applied=id;
   const now=Date.now();
   if(row.state&&row.version>this.version)this.adopt(JSON.parse(row.state) as Room,row.version,now);
   const rows=parsePoses(row.poses);this.ingestRows(rows,now);
   // Persisted owned rows: drop the dirty flag once D1 has our pose; detect takeovers.
   for(const [o,ack] of flushed){const saved=this.rows.get(o.pose.id);if(saved&&saved.owner===o.peer.owner&&(saved.ack||0)>=ack&&saved.seq===o.pose.seq&&(o.pose.ack||0)===ack)o.dirty=false;o.written=Math.max(o.written,saved?.ack||0);}
   for(const o of [...this.owned.values()]){const saved=this.rows.get(o.pose.id);if(!saved||start<o.peer.claimedAt)continue;
    if(saved.owner!==o.peer.owner){
     // Newer live connection elsewhere: step aside. HTTP fallback or a stale row: re-claim.
     if(saved.owner.startsWith('live:')&&saved.owner_at>=o.peer.claimedAt){o.peer.replaced=true;continue;}
     await this.claim(o.peer,o,driver);
    }}
   if(!row.gate&&this.r.phase==='field')void this.d1(driver,[roomWrite(db,this.r,this.r.code,this.version)]).then(()=>{}).catch(()=>{});
   this.fresh=now;
   if(now>=this.nextTick&&now-this.tickingSince>CYCLE_STALE_MS){this.nextTick=now+TICK_MS;this.tickingSince=now;try{await this.tick(driver,now);}finally{this.tickingSince=0;}}
  }catch(error){console.warn('Live cycle unavailable',error instanceof Error?error.message:'unknown');}
  finally{this.cycles.delete(id);}
 }
 async claim(peer:Peer,o:Owned,driver:Peer){
  // Somebody else (HTTP fallback) moved this player: continue from the stored row.
  const saved=this.rows.get(o.pose.id);if(saved&&saved.seq===o.pose.seq&&(saved.ack||0)>(o.pose.ack||0)){o.pose={...o.pose,x:saved.x,y:saved.y,at:Math.max(o.pose.at,saved.at),ack:saved.ack,clock:saved.clock,place:saved.place,previous:saved.previous};o.queue.clear();post(peer,{type:'resend',after:saved.ack||0,warp:o.pose.warp||0,seq:o.pose.seq});}
  const q=o.pose,now=Date.now();peer.claimedAt=now;
  await this.d1(driver,[database().prepare(CLAIM_SQL).bind(this.r.code,q.id,q.x,q.y,Math.round(q.at),q.seq,q.ack||0,q.clock??q.at,q.warp||0,q.previous,q.place,peer.owner,now)]);
  o.dirty=true;
 }
 adopt(r:Room,version:number,now:number){
  if(version<=this.version)return;r.revision=version;this.r=r;this.version=version;
  for(const o of this.owned.values())this.normalize(o,now);
  // Each connection sends the new room on its own next pump (cross-request I/O is not allowed).
  for(const peer of this.peers)peer.force=true;
 }
 async tick(driver:Peer,now:number){
  const draft=structuredClone(this.r);if(!tick(draft,now))return;
  const v=this.version;draft.revision=v+1;
  const res=await this.d1(driver,[roomWrite(database(),draft,this.r.code,v)]);
  if(res[0].meta.changes===1)this.adopt(draft,v+1,Date.now());
 }
 // ---- actions ---------------------------------------------------------------------------
 async act(peer:Peer,msg:Record<string,unknown>){
  const id=String(msg.id||''),body=(msg.body||{}) as FieldBody&{inputs?:unknown;warp?:number};
  const reply=(data:Record<string,unknown>)=>send(peer.socket,{type:'actResult',id,...data});
  try{
   if(typeof body.action!=='string'||body.action==='frame')throw Error('알 수 없는 현장 행동입니다.');
   const o=peer.id?this.owned.get(peer.id):undefined;
   // Inputs sent with the action are applied first, in order, by this same owner.
   if(o&&o.peer===peer){this.queue(o,{inputs:body.inputs,seq:body.seq,warp:body.warp},Date.now());this.advance(o,Date.now());}
   for(let attempt=0;attempt<8;attempt++){
    const now=Date.now(),v=this.version,draft:Room=structuredClone(this.r);draft.revision=v;
    const poses=this.poses(now,true);
    fieldAct(draft,peer.key,body,poses,now);draft.revision=v+1;
    const res=await this.d1(peer,[roomWrite(database(),draft,this.r.code,v)]);
    if(res[0].meta.changes===1){
     if(this.version===v)this.adopt(draft,v+1,Date.now());
     const after=Date.now();
     reply({ok:true,revision:this.version,room:view(this.r,peer.key),frame:{...fieldSnapshot(this.r,peer.key,this.poses(after),after,peer.visible),...(o?{own:{...o.pose,history:undefined}}:{})}});
     peer.revision=this.version;return;
    }
    // Someone else changed the room first: back off briefly, load it and try again.
    await new Promise(resolve=>setTimeout(resolve,Math.random()*30));
    const fresh=await this.d1(peer,[database().prepare(READ_SQL).bind(this.version,this.r.code)]);
    const row=fresh[0].results[0] as {version:number;state:string|null;poses:string}|undefined;
    if(!row)throw Error('방을 찾을 수 없습니다.');
    if(row.state&&row.version>this.version)this.adopt(JSON.parse(row.state) as Room,row.version,Date.now());
    this.ingestRows(parsePoses(row.poses),Date.now());
   }
   throw Error('요청이 몰리고 있습니다. 다시 시도해 주세요.');
  }catch(e){reply({ok:false,error:e instanceof Error?e.message:'현장 연결을 다시 시도해 주세요.'});}
 }
}

export function acceptLive(server:WebSocket){
 INSTANCE||=crypto.randomUUID().replaceAll('-','');server.accept();
 let peer:Peer|undefined,room:LiveRoom|undefined,authenticating=false;let pumpTimer:ReturnType<typeof setTimeout>|undefined;
 const authTimeout=setTimeout(()=>{if(!peer)server.close(1008,'Authentication timeout');},5000);
 const close=()=>{clearTimeout(authTimeout);clearTimeout(pumpTimer);if(peer&&room)room.remove(peer);};server.addEventListener('close',close);server.addEventListener('error',close);
 server.addEventListener('message',async event=>{
  try{
   if(typeof event.data!=='string'||event.data.length>24000){server.close(1008,'Invalid message');return;}
   const b=JSON.parse(event.data);if(peer&&room){room.ingest(peer,b);return;}
   if(authenticating)return;if(b.type!=='auth'||!/^[a-f0-9]{64}$/.test(b.token)||!/^[A-Z2-9]{6}$/.test(b.code)){server.close(1008,'Authentication required');return;}
   authenticating=true;const key=await hash(b.token),db=database(),conn=crypto.randomUUID().slice(0,8);
   let existing=rooms.get(b.code);if(existing?.closed)existing=undefined;
   const results=await db.batch([db.prepare(READ_SQL).bind(existing?existing.version:-1,b.code)]);
   const row=results[0].results[0] as (RoomRow&{poses:string;gate:string})|undefined;if(!row||row.expires<Date.now())throw Error('Room expired');
   const rows=parsePoses(row.poses);
   let r:Room;if(row.state){r=JSON.parse(row.state);r.revision=row.version;}else r=existing!.r;
   const who=actor(r,key);if(r.phase!=='field'||!r.field)throw Error('Field phase required');
   if(server.readyState!==1)return;
   room=rooms.get(b.code);if(!room||room.closed){if(rooms.size>=64)throw Error('Connection capacity');room=new LiveRoom(r,row.version,rows);rooms.set(b.code,room);}
   else{if(row.state&&row.version>room.version)room.adopt(r,row.version,Date.now());room.ingestRows(rows,Date.now());}
   if(room.peers.size>=64)throw Error('Room capacity');
   const now=Date.now();
   peer={socket:server,key,id:who.p?.id||null,conn,owner:`live:${INSTANCE}:${conn}`,claimedAt:now,revision:-1,seen:now,rateAt:now,rateCount:0,lastBroadcast:0,lastDiag:0,queries:1,visible:new Map(),outbox:[]};
   room.add(peer,who.p?rows.find(x=>x.id===who.p!.id):undefined,now);
   const o=who.p?room.owned.get(who.p.id):undefined;
   if(o)await room.claim(peer,o,peer);
   clearTimeout(authTimeout);
   // The client re-sends every input it has not seen persisted beyond this point.
   send(server,{type:'ready',instance:INSTANCE.slice(0,8),conn,ack:o?.pose.ack||0,warp:o?.pose.warp||0,seq:o?.pose.seq??r.seq});
   const pump=()=>{if(peer&&room&&server.readyState===1&&room.pump(peer))pumpTimer=setTimeout(pump,BROADCAST_MS);};pump();
  }catch{send(server,{type:'error',error:'실시간 연결을 인증하지 못했습니다. 일반 연결로 복구합니다.'});try{server.close(1008,'Live connection rejected');}catch{}close();}
 });
}
