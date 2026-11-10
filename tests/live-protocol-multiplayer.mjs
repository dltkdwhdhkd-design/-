import assert from 'node:assert/strict';
// Live protocol added in v22: actions over the socket, requestId de-duplication across
// socket/HTTP, the movement lease (HTTP cannot move a live-owned player), input-gap resend,
// and D1 query-budget recycling (set LIVE_D1_QUERY_BUDGET=40 to exercise the last part).
// Runs inside one Miniflare isolate: it checks protocol behaviour, not distributed timing.
const origin='http://terminal.local:4173',total=6;
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(key,path,body,status=200){const res=await fetch(origin+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,status,JSON.stringify(data).slice(0,300));return data;}
const host=token();let r=await request(host,'/api/game',{action:'create',config:{mode:'field',count:total,discussion:300}});const code=r.code;
const clients=Array.from({length:total},(_,i)=>({key:token(),name:'규약'+i,avatar:i%16}));
for(const c of clients)await request(c.key,'/api/game',{action:'join',code,...c});
await Promise.all(clients.map(c=>request(c.key,'/api/game',{action:'ready',code,ready:true})));
r=await request(host,'/api/game',{action:'start',code,seq:r.seq});r=await request(host,'/api/game',{action:'next',code,seq:r.seq});const seq=r.seq;
const base=await Promise.all(clients.map(c=>request(c.key,'/api/field',{action:'frame',protocol:2,inputs:[],warp:0,code,seq})));
const ids=base.map(b=>b.frame.own.id);
// Make player 0 an impostor next to crewmate 1; the live isolate adopts the new version.
const saved=await workerDb.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first(),state=JSON.parse(saved.state);
state.players.forEach((p,i)=>{p.role=i===0?'impostor':'crewmate';});state.field.cooldowns={};
await workerDb.prepare('UPDATE mafia_rooms SET state=?,version=version+1 WHERE code=?').bind(JSON.stringify(state),code).run();
async function connect(key){const res=await fetch(origin+'/api/live',{headers:{Upgrade:'websocket'}});assert.equal(res.status,101);const socket=res.webSocket;socket.accept();const frames=[],messages=[];let ready=null;
 socket.addEventListener('message',e=>{const b=JSON.parse(e.data);messages.push(b);if(b.type==='ready')ready=b;if(b.type==='frame')frames.push(b);});
 socket.send(JSON.stringify({type:'auth',code,token:key}));for(let i=0;i<80&&!frames.length;i++)await pause(25);
 // Like the real client: a ping every 2 s (the server drops connections silent for 12 s).
 const ping=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'ping',sent:performance.now()}));else clearInterval(ping);},2000);assert.ok(ready&&frames.length,'authenticated frame stream');
 const act=(body,id=crypto.randomUUID())=>new Promise((resolve,reject)=>{const started=performance.now(),timer=setTimeout(()=>reject(Error('act timeout')),4000);const on=e=>{const b=JSON.parse(e.data);if(b.type==='actResult'&&b.id===id){clearTimeout(timer);socket.removeEventListener('message',on);resolve({...b,ms:performance.now()-started});}};socket.addEventListener('message',on);socket.send(JSON.stringify({type:'act',id,body}));});
 return {socket,frames,messages,ready,act};}
const a=await connect(clients[0].key),b=await connect(clients[1].key),c=await connect(clients[2].key),watcher=await connect(host);
for(let i=0;i<60&&a.frames.at(-1).room?.myRole!=='impostor'&&!a.frames.some(f=>f.room?.myRole==='impostor');i++)await pause(25);
assert.ok(a.frames.some(f=>f.room?.myRole==='impostor'),'live isolate adopted the role change');
// 1) Attack over the socket: confirmed in the reply, applied once, seen by observers.
const requestId=crypto.randomUUID(),kill={action:'kill',protocol:2,code,seq,warp:0,inputs:[],target:ids[1],requestId};
const result=await a.act(kill);assert.equal(result.ok,true,result.error);assert.ok(result.frame.bodies.some(x=>x.id===ids[1]),'kill confirmed in actResult');
console.log(`live kill request→confirm ${Math.round(result.ms)}ms (single local isolate)`);
// Same requestId over HTTP (client fallback after a lost reply) is accepted without a second effect.
const before=(await workerDb.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first()).state;
const replay=await request(clients[0].key,'/api/field',kill);assert.ok(replay.frame.bodies.filter(x=>x.id===ids[1]).length===1);
const after=JSON.parse((await workerDb.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first()).state);
assert.equal(after.field.bodies.filter(x=>x.id===ids[1]).length,1,'no duplicate body');assert.equal(JSON.parse(before).field.cooldowns[ids[0]],after.field.cooldowns[ids[0]],'cooldown not reset by replay');
// A refused action is reported as an error, not a transport failure.
const refused=await a.act({...kill,requestId:crypto.randomUUID()});assert.equal(refused.ok,false);assert.ok(typeof refused.error==='string'&&refused.error.length>0);
for(let i=0;i<40&&!c.frames.at(-1).frame.bodies.some(x=>x.id===ids[1]);i++)await pause(25);
assert.ok(c.frames.at(-1).frame.bodies.some(x=>x.id===ids[1]),'other live player sees the body');
assert.ok(watcher.frames.at(-1).frame.bodies.some(x=>x.id===ids[1]),'host sees the body');
// 2) Movement lease: HTTP cannot move a player whose socket owns the movement.
const own=c.frames.at(-1).frame.own,owned=await workerDb.prepare('SELECT owner,x,y FROM field_positions WHERE code=? AND player=?').bind(code,ids[2]).first();
assert.ok(owned.owner.startsWith('live:'),'live connection holds the lease');
const steps=Array.from({length:10},(_,i)=>({n:(own.ack||0)+i+1,dx:1,dy:0,ms:20}));
const http=await request(clients[2].key,'/api/field',{action:'frame',protocol:2,base:own,inputs:steps,warp:0,code,seq,count:total,mapId:'aurora'});
assert.notEqual(http.transport,'checkpoint','HTTP checkpoint refused while leased');
const row=await workerDb.prepare('SELECT owner,x FROM field_positions WHERE code=? AND player=?').bind(code,ids[2]).first();assert.equal(row.x,owned.x);assert.ok(row.owner.startsWith('live:'));
// 3) Input gap: the server asks for the missing inputs instead of skipping them.
c.socket.send(JSON.stringify({type:'input',seq,warp:0,inputs:[{n:(own.ack||0)+5,dx:1,dy:0,ms:20}]}));
for(let i=0;i<40&&!c.messages.some(m=>m.type==='resend');i++)await pause(25);
const resend=c.messages.find(m=>m.type==='resend');assert.ok(resend,'resend requested');assert.equal(resend.after,own.ack||0);
c.socket.send(JSON.stringify({type:'input',seq,warp:0,inputs:steps}));
for(let i=0;i<60&&(c.frames.at(-1).frame.own.ack||0)<steps.at(-1).n;i++)await pause(25);
const moved=c.frames.at(-1).frame.own;assert.equal(moved.ack,steps.at(-1).n);assert.ok(moved.x>own.x+20,'resent inputs applied in order');
// 4) After the socket closes and the lease expires, HTTP movement works again.
c.socket.close();await pause(2700);
const fresh=await request(clients[2].key,'/api/field',{action:'frame',protocol:2,inputs:[],warp:0,code,seq});
const next=Array.from({length:5},(_,i)=>({n:(fresh.frame.own.ack||0)+i+1,dx:0,dy:1,ms:20}));
const resumed=await request(clients[2].key,'/api/field',{action:'frame',protocol:2,base:fresh.frame.own,inputs:next,warp:0,code,seq,count:total,mapId:'aurora'});
assert.equal(resumed.transport,'checkpoint','HTTP movement resumes after the lease');assert.equal(resumed.frame.own.ack,next.at(-1).n);
// 5) Query-budget recycling: the server asks for a replacement socket before the budget runs out.
if(Number(process.env.LIVE_D1_QUERY_BUDGET)>=20){
 // ~3 queries/s per connection here (3 connections share ~9/s), so 40 is reached within ~15 s.
 for(let i=0;i<500&&!a.messages.some(m=>m.type==='recycle')&&!b.messages.some(m=>m.type==='recycle')&&!watcher.messages.some(m=>m.type==='recycle');i++)await pause(50);
 const retiring=[a,b,watcher].find(p=>p.messages.some(m=>m.type==='recycle'));assert.ok(retiring,'recycle requested');
 const key=retiring===a?clients[0].key:retiring===b?clients[1].key:host;const replacement=await connect(key);
 assert.ok(replacement.frames.length,'replacement socket streams frames');
 if(retiring!==watcher)assert.equal(replacement.ready.ack,retiring.frames.at(-1).frame.own.ack,'ack carried over');
 for(let i=0;i<40&&retiring.socket.readyState===1;i++)await pause(250);assert.notEqual(retiring.socket.readyState,1,'old socket closed after handover');
 replacement.socket.close();console.log('recycle handover verified');
}
// 6) A room change made through another request (host calls a meeting over HTTP) reaches
// every live connection. Workers forbid writing to a socket from another request's context,
// so each connection's own pump must deliver it (found with a real browser in v22 work).
const live=[a,b,watcher].filter(p=>p.socket.readyState===1);const gameState=await fetch(origin+'/api/game?code='+code,{headers:{Authorization:'Bearer '+host}}).then(r=>r.json());
await request(host,'/api/game',{action:'next',code,seq:gameState.seq});
for(let i=0;i<60&&!live.every(p=>p.frames.some(f=>f.room&&f.room.phase!=='field'));i++)await pause(50);
assert.ok(live.length>=2&&live.every(p=>p.frames.some(f=>f.room&&f.room.phase!=='field')),'meeting reaches every live connection');
for(const p of [a,b,watcher])if(p.socket.readyState===1)p.socket.close();
console.log('PASS: live actions with confirmation, requestId de-dup across socket and HTTP, refused-action errors, live/host body visibility, movement lease, input-gap resend, lease expiry fallback, room changes reach every connection'+(Number(process.env.LIVE_D1_QUERY_BUDGET)>=20?', query-budget recycle.':'.'));
