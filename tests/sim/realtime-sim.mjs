// Multi-isolate realtime simulator.
//   node --import ./tests/sim/register.mjs tests/sim/realtime-sim.mjs [scenario...] [--client baseline|current] [--out file]
// Runs the real route handlers and N independent copies of lib/live-server.ts (one per
// simulated Worker isolate) against a shared SQLite database that is reached through a
// D1-like facade with injected round-trip latency. Clients follow the real client logic.
// This reproduces the cross-isolate data flow; it is NOT a measurement of Cloudflare.
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {SimD1} from './d1.mjs';
import {Link,rng,socketPair} from './net.mjs';
import {distance,sight,spawn,WORLD,walkable} from '../../lib/map.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),flag=(k,d)=>{const i=args.indexOf(k);return i>=0?args[i+1]:d;};
const clientKind=flag('--client','baseline'),outFile=flag('--out',null),duration=Number(flag('--seconds','20'))*1000;
const SCENARIOS={
 'p6c2-iso1-d25':{room:6,clients:2,isolates:1,d1:[25,8],net:[20,8],loss:0},
 'p16-iso16-d25':{room:16,clients:16,isolates:16,d1:[25,8],net:[20,8],loss:0},
 'p29-iso29-d25':{room:29,clients:29,isolates:29,d1:[25,8],net:[20,8],loss:0},
 'p29-iso1-d170':{room:29,clients:29,isolates:1,d1:[170,40],net:[20,8],loss:0},
 'p29-iso29-d170':{room:29,clients:29,isolates:29,d1:[170,40],net:[20,8],loss:0},
 'p29-iso29-d25-recycle':{room:29,clients:29,isolates:29,d1:[25,8],net:[20,8],loss:0,budget:120},
 'p29-iso29-d170-adverse':{room:29,clients:29,isolates:29,d1:[170,40],net:[30,15],loss:.02,hide:{client:5,from:6000,to:11000},reconnect:{client:7,at:12000}},
};
const chosen=args.filter(a=>SCENARIOS[a]);const list=chosen.length?chosen:Object.keys(SCENARIOS);
const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.floor(p/100*s.length))]*10)/10;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const {createClient}=await import(clientKind==='baseline'?'./baseline-client.mjs':'./current-client.mjs');
const gameRoute=await import(pathToFileURL(path.join(root,'app/api/game/route.ts')).href);
const fieldRoute=await import(pathToFileURL(path.join(root,'app/api/field/route.ts')).href);

async function runScenario(name,S){
 const random=rng(name.length*7919+S.clients);
 process.env.LIVE_D1_QUERY_BUDGET=S.budget?String(S.budget):'';
 const db=new SimD1({rtt:()=>Math.max(2,S.d1[0]+(random()*2-1)*S.d1[1]),commitMs:1.5}).migrate(path.join(root,'drizzle'));globalThis.__SIM_DB__=db;
 const isolates=[];for(let k=0;k<S.isolates;k++)isolates.push(await import(pathToFileURL(path.join(root,'lib/live-server.ts')).href+`?scenario=${encodeURIComponent(name)}&iso=${k}`));
 const metrics=makeMetrics();
 // Edge HTTP: client network latency in both directions around the real route handler.
 const httpLinks=new Map();
 const http=async(key,p,body,index=-1)=>{const link=httpLinks.get(index)||{up:new Link({base:S.net[0],jitter:S.net[1],loss:S.loss,random}),down:new Link({base:S.net[0],jitter:S.net[1],loss:S.loss,random})};httpLinks.set(index,link);
  await new Promise(r=>link.up.schedule(r));const route=p==='/api/game'?gameRoute:fieldRoute;const t=performance.now();
  const res=await route.POST(new Request('http://sim'+p,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)}));const data=await res.json();metrics.serverMs(p+':'+(body.action),performance.now()-t);
  await new Promise(r=>link.down.schedule(r));return data;};
 // Room setup through the real API.
 const host=token();let r=await gameRoute.POST(new Request('http://sim/api/game',{method:'POST',headers:{Authorization:'Bearer '+host},body:JSON.stringify({action:'create',config:{mode:'field',mapId:'aurora',count:S.room,discussion:300,vote:120}})})).then(x=>x.json());
 const code=r.code,keys=Array.from({length:S.room},token);
 const call=(key,body)=>gameRoute.POST(new Request('http://sim/api/game',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify({code,...body})})).then(x=>x.json());
 const joined=[];for(let i=0;i<S.room;i++)joined.push(await call(keys[i],{action:'join',name:'학생'+i,avatar:i%16}));
 for(const k of keys)await call(k,{action:'ready',ready:true});
 r=await call(host,{action:'start',seq:r.seq});r=await call(host,{action:'next',seq:r.seq});
 if(r.phase!=='field')throw Error('field phase expected: '+JSON.stringify(r).slice(0,200));
 // Deterministic attackers and victims; cooldowns cleared so attacks can happen on schedule.
 const kills=S.clients>=6?[[0,1,7000],[2,3,11000],[4,5,15000]]:[[0,1,9000]];
 const row=await db.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first();const state=JSON.parse(row.state);
 const ids=joined.map(j=>j.me);
 state.players.forEach((p,i)=>{p.role=kills.some(k=>k[0]===i)?'impostor':kills.some(k=>k[1]===i)?'crewmate':(['impostor','shapeshifter','phantom','viper'].includes(p.role)?'crewmate':p.role);});
 state.field.cooldowns={};state.field.meetingAt=Date.now()+3600e3;state.field.sabotageAt=Date.now()+3600e3;
 await db.prepare('UPDATE mafia_rooms SET state=?,version=version+1 WHERE code=?').bind(JSON.stringify(state),code).run();
 // Clients.
 globalThis.window=globalThis;
 const routeOf=i=>i%S.isolates;let reconnectShift=0;
 globalThis.WebSocket=class{static OPEN=1;constructor(url){const i=Number(new URL(url).searchParams.get('client'));const iso=(routeOf(i)+(i===S.reconnect?.client?reconnectShift:0))%S.isolates;metrics.count('ws.connect');
  return socketPair({up:new Link({base:S.net[0],jitter:S.net[1],loss:S.loss,random}),down:new Link({base:S.net[0],jitter:S.net[1],loss:S.loss,random}),acceptOn:server=>isolates[iso].acceptLive(server),onServerCreated:server=>{clients[i].serverSocket=server;}});}};
 const clients=[];
 for(let i=0;i<S.clients;i++){const initial=await (await gameRoute.GET(new Request('http://sim/api/game?code='+code,{headers:{Authorization:'Bearer '+keys[i]}}))).json();
  const c=createClient({index:i,code,token:keys[i],room:initial,http:(k,p,b)=>http(k,p,b,i),metrics:metrics.scope(i),wsUrl:`ws://sim/api/live?client=${i}`});c.id=ids[i];clients.push(c);}
 // Ground truth: each player's own rendered position over time.
 const truth=clients.map(()=>[]);const truthAt=(i,t)=>{const h=truth[i];for(let k=h.length-1;k>=0;k--)if(h[k].t<=t)return h[k];return h[0];};
 const t0=performance.now(),perfToDate=Date.now()-performance.now();for(const c of clients)c.start();
 const loop=monitorEventLoopDelay({resolution:5});loop.enable();
 // Intents: bounded random walk around the central hall; attackers chase their target.
 const plan=clients.map((_,i)=>({until:0,dir:{x:0,y:0}}));
 const center={x:1210,y:940};
 const killState=kills.map(([a,v,at])=>({a,v,at,attempts:[],done:false}));
 const vis=new Map();let last=performance.now(),frames=0,lastVisCheck=0;
 const hideState={applied:false,cleared:false},reconnectDone={v:false};const killedAt=new Map();
 await new Promise(resolve=>{const tick=async()=>{
  const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;const t=now-t0;frames++;
  if(S.hide&&!hideState.applied&&t>=S.hide.from){hideState.applied=true;clients[S.hide.client].hidden=true;const s=clients[S.hide.client].live?.socket;if(s)s.hidden=true;}
  if(S.hide&&hideState.applied&&!hideState.cleared&&t>=S.hide.to){hideState.cleared=true;for(const key of [...vis.keys()])if(Math.floor(key/1000)===S.hide.client)vis.delete(key);clients[S.hide.client].hidden=false;const s=clients[S.hide.client].live?.socket;if(s)s.hidden=false;metrics.event('tabReturn',{t});}
  if(S.reconnect&&!reconnectDone.v&&t>=S.reconnect.at){reconnectDone.v=true;reconnectShift=1;const c=clients[S.reconnect.client];c.serverSocket?.close(1001,'Reconnect');metrics.event('forcedReconnect',{t});}
  for(let i=0;i<clients.length;i++){const c=clients[i],p=plan[i],me=c.position();
   const k=killState.find(k=>k.a===i&&!k.done&&t>=k.at);
   if(k){const target=c.rendered.get(clients[k.v].id),goal=target||truthAt(k.v,performance.now());const d=distance(me,goal);if(process.env.SIM_SKIPS&&frames%30===0)console.error('[chase]',Math.round(t),'target?',!!target,Math.round(d),'me',Math.round(me.x),Math.round(me.y),'pending',c.net?.pending.length,'conn',c.net?.connected,'boot',c.net?.bootstrapped);c.intent=d>40?{x:(goal.x-me.x)/d,y:(goal.y-me.y)/d}:{x:0,y:0};
    if(target&&distance(me,target)<75&&!k.inflight&&now-(k.lastTry||0)>250){k.inflight=true;k.lastTry=now;const sent=performance.now();if(!k.witnesses){k.witnesses=new Set();clients.forEach((o,j)=>{if(j!==i&&j!==k.v&&o.rendered.has(clients[k.v].id))k.witnesses.add(j);});}const truthGap=distance(truthAt(i,sent),truthAt(k.v,sent));
     c.tryKill(clients[k.v].id).then(res=>{const rec={sent,at:Math.round(sent-t0),ms:performance.now()-sent,truthGap,result:res?.error?'error:'+res.error:res?.skipped?'skip:'+res.skipped:'ok'};if(!res?.skipped)k.attempts.push(rec);else if(process.env.SIM_SKIPS)console.error('[skip]',Math.round(sent-t0),res.skipped,Math.round(distance(me,target)));if(!res?.error&&!res?.skipped&&res?.frame?.bodies?.some(b=>b.id===clients[k.v].id)){k.done=true;k.confirmed=performance.now();k.sent=sent;metrics.event('killConfirmed',{...rec,a:i,v:k.v});killedAt.set(k.v,performance.now());}}).finally(()=>{k.inflight=false;});}
    if(t>k.at+6000&&!k.done){k.done=true;k.timeout=true;}
   }else if(!c.alive){c.intent={x:0,y:0};}
   else{if(now>p.until){const tether=killState.some(k=>k.a===i||k.v===i)?200:420,still=random()<.15,toCenter=distance(me,center)>tether;let a=random()*Math.PI*2;if(toCenter)a=Math.atan2(center.y-me.y,center.x-me.x)+(random()-.5);p.dir=still?{x:0,y:0}:{x:Math.cos(a),y:Math.sin(a)};p.until=now+700+random()*1800;}c.intent=t<1500?{x:0,y:0}:p.dir;}
   if(process.env.SIM_DEBUG_CLIENT===String(i)&&frames%20===0&&c.net){const n=c.net,own=n.snapshot?.own;console.error('[dbg]',Math.round(t),'hidden',c.hidden,'vis',Math.round(n.visual.x),Math.round(n.visual.y),'srv',own&&Math.round(own.x),own&&Math.round(own.y),'ack',own?.ack,'lastAck',n.lastAck,'next',n.inputNumber,'pend',n.pending.length,'healthy',n.healthy(),'counts',JSON.stringify(n.stats.counts));}
   c.frame(now,dt);if(!c.hidden)truth[i].push({t:now,x:c.position().x,y:c.position().y});if(truth[i].length>400)truth[i].splice(0,100);
  }
  // Observer quality.
  const checkVisibility=now-lastVisCheck>100;if(checkVisibility)lastVisCheck=now;
  // Bodies anyone has been shown: such a victim is legitimately gone (both client adapters expose their latest snapshot).
  const bodyIds=new Set();if(checkVisibility)for(const c of clients)for(const b of (c.net?c.net.snapshot:c.snapshot?.())?.bodies||[])bodyIds.add(b.id);
  for(let o=0;o<clients.length;o++){const obs=clients[o];if(obs.hidden||!obs.alive)continue;const O=truthAt(o,now);
   for(let k=0;k<clients.length;k++){if(k===o)continue;const key=o*1000+k,R=truthAt(k,now),shown=obs.rendered.get(clients[k].id),prev=vis.get(key);
    if(shown&&prev?.pos){const jump=distance(prev.pos,shown);metrics.jump(jump);if(jump>40&&process.env.SIM_JUMPS)console.error('[jump]',Math.round(t),'obs',o,'remote',k,Math.round(jump),'track',obs.trackOf?.(clients[k].id)?.samples.length);
     // Stall = the remote's true motion at the displayed moment was moving but the display did not move.
     if(Number.isFinite(shown.at)){const tp=shown.at-perfToDate,moving=distance(truthAt(k,tp-120),truthAt(k,tp))>205*.12*.5;if(moving)metrics.motionFrame(jump<.05);}}
    if(process.env.SIM_TRACK===`${o},${k}`&&frames%6===0){const tr=obs.trackOf?.(clients[k].id);console.error('[track]',Math.round(t),'delay',shown?Date.now()-shown.at:null,'err',shown?Math.round(distance(shown,R)):null,'last',tr?Date.now()-tr.samples.at(-1).at:null,'n',tr?.samples.length,'off',tr?Math.round(tr.offset):null,'int',tr?Math.round(tr.interval):null,'excess',tr?Math.round(tr.delay-tr.target):null,'need',tr?Math.round(tr.target-Math.min(...tr.lags)):null,'gaps',tr?JSON.stringify(tr.gaps.slice(-6).map(Math.round)):null,'lagsMinusBase',tr?JSON.stringify(tr.lags.slice(-4).map(v=>Math.round(v-Math.min(...tr.lags)))):null,'moving',Math.round(distance(truthAt(k,now-100),R)));}
    if(shown){metrics.displayError(distance(shown,R));if(Number.isFinite(shown.at)){const tp=shown.at-perfToDate;metrics.displayDelay(Date.now()-shown.at);metrics.trajError(distance(shown,truthAt(k,tp)));}}
    if(checkVisibility){const should=clients[k].alive&&!killedAt.has(k)&&!bodyIds.has(clients[k].id)&&!clients[k].hidden&&[0,200,400].every(back=>{const a=truthAt(o,now-back),b=truthAt(k,now-back);return distance(a,b)<=WORLD.vision*.8&&sight(a,b,{count:S.room,mapId:'aurora'});});
     if(should&&t>3000){metrics.visCheck(!!shown);if(!shown&&prev?.shownWhenShould&&prev?.should&&prev?.wasShown){metrics.count('vanish.event');if(process.env.SIM_VANISH&&obs.net){const n=obs.net,id=clients[k].id,snap=n.snapshot,inSnap=snap?.people.some(p=>p.id===id),pr=n.presence[id],own=snap?.own,known=pr?.person;console.error('[vanish]',Math.round(t),'obs',o,'remote',k,'truthDist',Math.round(distance(O,R)),'inSnap',inSnap,'snapAge',snap?Math.round(Date.now()+n.serverOffset-snap.serverNow):null,'missingFor',pr?.missingAt!==undefined?Math.round(performance.now()-pr.missingAt):null,'srvDist',own&&known?Math.round(distance(own,known)):null,'srvSight',own&&known?sight(own,known,{count:S.room,mapId:'aurora'}):null,'ownErr',own?Math.round(distance(own,O)):null,'knownErr',known?Math.round(distance(known,R)):null,'knownAge',known?Math.round(Date.now()-known.at):null);}}}
     // A vanish is: shown and in clear view at the previous check, still in clear view, now gone.
     vis.set(key,{pos:shown?{...shown}:null,shownWhenShould:should?!!shown:prev?.shownWhenShould,should,wasShown:!!shown});}
    else vis.set(key,{...prev,pos:shown?{...shown}:null});
   }}
  if(t<duration)setTimeout(tick,16);else resolve();
 };tick();});
 loop.disable();
 // Client-side counters (FieldNet): HTTP frames/actions, live frames, resends, rebases, reconnects.
 for(const c of clients){for(const [k,v] of Object.entries(c.net?.stats.counts||{}))for(let n=0;n<v;n++)metrics.count('client.'+k);if(c.net?.live)for(let n=0;n<c.net.live.reconnects;n++)metrics.count('client.reconnects');}
 for(const c of clients)c.stop();
 // Kill outcomes: when did the victim and observers learn about it?
 const killReport=killState.map(k=>{const conf=metrics.events.find(e=>e.type==='killConfirmed'&&e.v===k.v);const death=metrics.events.find(e=>e.type==='deathSeen'&&e.who===k.v);const bodySeen=metrics.events.filter(e=>e.type==='bodySeen'&&e.victim===clients[k.v].id&&k.witnesses?.has(e.observer)).map(e=>e.t);
  const first=k.attempts[0];return{attacker:k.a,victim:k.v,attempts:k.attempts.length,errors:k.attempts.filter(a=>a.result!=='ok').map(a=>a.result).slice(0,4),confirmMs:conf?Math.round(conf.ms):null,pressToConfirmMs:conf&&first?Math.round(conf.sent+conf.ms-first.sent):null,firstPressAt:first?first.at:null,victimSeesDeathMs:death&&first?Math.round(death.t-first.sent):null,observersSeeBodyP50:first&&bodySeen.length?Math.round(pct(bodySeen.map(t=>t-first.sent),50)):null,observersSeeBodyMax:first&&bodySeen.length?Math.round(Math.max(...bodySeen.map(t=>t-first.sent))):null,truthGapAtPress:first?Math.round(first.truthGap):null,witnesses:k.witnesses?.size??0,timeout:!!k.timeout};});
 const seconds=duration/1000;
 const summary={scenario:name,client:clientKind,...S,
  ackMs:{p50:pct(metrics.acks,50),p95:pct(metrics.acks,95),max:pct(metrics.acks,100)},
  correctionPx:{events:metrics.corrections.length,p95:pct(metrics.corrections,95),max:pct(metrics.corrections,100)},
  remoteSampleAgeMs:{p50:pct(metrics.ages,50),p95:pct(metrics.ages,95),max:pct(metrics.ages,100)},
  observer:{frameJumpPxMax:pct(metrics.jumps,100),frameJumpPxP99:pct(metrics.jumps,99),stalledMovingFramesPct:metrics.motion.total?Math.round(metrics.motion.stalled/metrics.motion.total*1000)/10:null,displayErrorPx:{p50:pct(metrics.errors,50),p95:pct(metrics.errors,95)},displayDelayMs:{p50:pct(metrics.delays,50),p95:pct(metrics.delays,95),max:pct(metrics.delays,100)},trajectoryErrorPx:{p50:pct(metrics.traj,50),p95:pct(metrics.traj,95),max:pct(metrics.traj,100)},missingWhileVisiblePct:metrics.vis.total?Math.round(metrics.vis.missing/metrics.vis.total*1000)/10:null,vanishEvents:metrics.counts['vanish.event']||0},
  kills:killReport,
  db:{roundTripsPerSec:Math.round(db.stats.roundTrips/seconds),statementsPerSec:Math.round(db.stats.statements/seconds),writeStatementsPerSec:Math.round(db.stats.writeStatements/seconds),kbReadPerSec:Math.round(db.stats.bytesRead/1024/seconds),primaryBusyPct:Math.round(db.stats.busyMs/duration*1000)/10,avgQueueWaitMs:Math.round(db.stats.waitMs/Math.max(1,db.stats.roundTrips)*10)/10,stateBytes:(await db.prepare('SELECT length(state) n FROM mafia_rooms WHERE code=?').bind(code).first()).n},
  counts:metrics.counts,
  simFidelity:{eventLoopP99Ms:Math.round(loop.percentile(99)/1e6),framesPerSec:Math.round(frames/seconds)},
 };
 delete globalThis.__SIM_DB__;await sleep(1500);
 return summary;
}
function makeMetrics(){
 const m={lastAt:new Map(),delays:[],traj:[],counts:{},acks:[],corrections:[],ages:[],jumps:[],errors:[],motion:{total:0,stalled:0},vis:{total:0,missing:0},events:[],server:{}};
 m.count=k=>{m.counts[k]=(m.counts[k]||0)+1;};
 m.event=(type,data)=>m.events.push({type,t:performance.now(),...data});
 m.jump=d=>{if(m.jumps.length<400000)m.jumps.push(d);};m.motionFrame=stalled=>{m.motion.total++;if(stalled)m.motion.stalled++;};
 m.displayDelay=d=>{if(m.delays.length<400000)m.delays.push(d);};m.trajError=d=>{if(m.traj.length<400000)m.traj.push(d);};
 m.displayError=d=>{if(m.errors.length<400000)m.errors.push(d);};m.visCheck=shown=>{m.vis.total++;if(!shown)m.vis.missing++;};
 m.serverMs=(k,ms)=>{(m.server[k]||=[]).push(ms);};
 m.scope=i=>({count:m.count,event:(t,d)=>m.event(t,{...d,observer:i}),ack:ms=>m.acks.push(ms),correction:px=>m.corrections.push(px),sampleAge:ms=>{if(m.ages.length<400000)m.ages.push(ms);},sample:(id,at,serverNow)=>{const k=i+':'+id;if((m.lastAt.get(k)??-1)>=at)return;m.lastAt.set(k,at);if(m.ages.length<400000)m.ages.push(Date.now()-at);},bodySeen:victim=>m.event('bodySeen',{victim,observer:i})});
 return m;
}
const results=[];
for(const name of list){process.stderr.write(`▶ ${name} (${clientKind})\n`);const s=await runScenario(name,SCENARIOS[name]);results.push(s);console.log(JSON.stringify(s));}
if(outFile)writeFileSync(outFile,JSON.stringify(results,null,1));
process.exit(0);
