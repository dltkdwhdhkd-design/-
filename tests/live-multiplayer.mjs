import assert from 'node:assert/strict';
const origin='http://terminal.local:4173',total=29;
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(key,path,body){const res=await fetch(origin+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;}
const host=token();let r=await request(host,'/api/game',{action:'create',config:{mode:'field',count:total,discussion:300}});const code=r.code;
const clients=Array.from({length:total},(_,i)=>({key:token(),name:'실시간'+i,avatar:i%16}));
await Promise.all(clients.map(c=>request(c.key,'/api/game',{action:'join',code,...c})));
await Promise.all(clients.map(c=>request(c.key,'/api/game',{action:'ready',code,ready:true})));
r=await request(host,'/api/game',{action:'start',code,seq:r.seq});r=await request(host,'/api/game',{action:'next',code,seq:r.seq});const seq=r.seq;
const base=await Promise.all(clients.map(c=>request(c.key,'/api/field',{action:'frame',protocol:2,inputs:[],warp:0,code,seq})));
async function connect(key){const res=await fetch(origin+'/api/live',{headers:{Upgrade:'websocket'}});assert.equal(res.status,101,res.status===101?'':await res.text());const socket=res.webSocket;socket.accept();const frames=[];let ready=false;socket.addEventListener('message',e=>{const b=JSON.parse(e.data);if(b.type==='ready')ready=true;if(b.type==='frame')frames.push(b);});socket.send(JSON.stringify({type:'auth',code,token:key}));for(let i=0;i<80&&!frames.length;i++)await pause(25);assert.ok(ready&&frames.length,'authenticated frame stream');return {socket,frames};}
const peers=await Promise.all(clients.map(c=>connect(c.key))),observer=await connect(host);
assert.equal(observer.frames.at(-1).frame.people.length,total);
const before=base[0].frame.own;
const inputs=Array.from({length:10},(_,i)=>({n:(before.ack||0)+i+1,dx:0,dy:1,ms:20}));
peers[0].socket.send(JSON.stringify({type:'input',seq,warp:0,inputs}));
for(let i=0;i<100&&(peers[0].frames.at(-1).frame.own.ack||0)<inputs.at(-1).n;i++)await pause(25);
const own=peers[0].frames.at(-1).frame.own;assert.equal(own.ack,inputs.at(-1).n);assert.ok(own.y>before.y+20&&own.y<=before.y+42);
await pause(200);assert.ok(observer.frames.some(f=>f.frame.people.some(p=>p.id===before.id&&p.y>before.y+20)),'movement visible to observer');
assert.ok(peers.every(p=>p.frames.every(f=>!JSON.stringify(f).includes('"history":'))),'no private movement history leaks');
// Resending or reconnecting cannot apply the same input twice.
peers[0].socket.send(JSON.stringify({type:'input',seq,warp:0,inputs}));await pause(250);assert.equal(peers[0].frames.at(-1).frame.own.y,own.y);
peers[0].socket.close();const reconnected=await connect(clients[0].key);assert.equal(reconnected.frames.at(-1).frame.own.ack,own.ack);assert.equal(reconnected.frames.at(-1).frame.own.y,own.y);
// Invalid coordinates/speed do not become authoritative.
reconnected.socket.send(JSON.stringify({type:'input',seq,warp:0,x:99999,y:99999,inputs:[{n:own.ack+1,dx:999,dy:0,ms:20}]}));await pause(250);assert.equal(reconnected.frames.at(-1).frame.own.y,own.y);
// Continuous input from every player, with no HTTP movement polling.
const active=[reconnected,...peers.slice(1)],acks=active.map(p=>p.frames.at(-1).frame.own.ack||0),queued=active.map(()=>[]),starts=observer.frames.length;
for(let n=1;n<=20;n++){active.forEach((p,i)=>{queued[i].push({n:acks[i]+n,dx:.5,dy:0,ms:50});p.socket.send(JSON.stringify({type:'input',seq,warp:0,inputs:queued[i]}));});await pause(50);}
for(let i=0;i<80&&!active.every((p,j)=>p.frames.at(-1).frame.own.ack===acks[j]+20);i++)await pause(25);
assert.ok(active.every((p,j)=>p.frames.at(-1).frame.own.ack===acks[j]+20),'29 continuous movement streams acknowledged');assert.ok(observer.frames.length-starts>=10,'observer receives live updates throughout movement');
// HTTP kill racing the live movement checkpoint must still commit exactly once.
const saved=await workerDb.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first(),state=JSON.parse(saved.state);
// Joins ran in parallel, so state.players order is not client order: assign roles by id.
state.players.find(p=>p.id===base[0].frame.own.id).role='impostor';state.players.find(p=>p.id===base[1].frame.own.id).role='crewmate';state.field.cooldowns={};
await workerDb.prepare('UPDATE mafia_rooms SET state=?,version=version+1 WHERE code=?').bind(JSON.stringify(state),code).run();
// v22: a live connection owns its player's movement in memory, so positions are no longer
// teleported by writing field_positions (the owner would overwrite them); the attacker walks
// next to the victim with real inputs instead.
let last=acks[0]+20;{const me=reconnected.frames.at(-1).frame.own,victim=peers[1].frames.at(-1).frame.own,d=Math.hypot(victim.x-me.x,victim.y-me.y);
 if(d>60){const k=Math.ceil((d-45)/4.1),walk=Array.from({length:k},(_,i)=>({n:last+i+1,dx:(victim.x-me.x)/d,dy:(victim.y-me.y)/d,ms:20}));reconnected.socket.send(JSON.stringify({type:'input',seq,warp:0,inputs:walk}));last+=k;for(let i=0;i<80&&(reconnected.frames.at(-1).frame.own.ack||0)<last;i++)await pause(25);}}
// The HTTP fallback validates against the persisted checkpoint: wait until the live owner has flushed it.
for(let i=0;i<80;i++){const row=await workerDb.prepare('SELECT ack FROM field_positions WHERE code=? AND player=?').bind(code,base[0].frame.own.id).first();if((row?.ack||0)>=last)break;await pause(25);}
{const me=reconnected.frames.at(-1).frame.own,victim=peers[1].frames.at(-1).frame.own;assert.ok(Math.hypot(victim.x-me.x,victim.y-me.y)<90,'attacker reached the victim');}
await pause(100);const attackInputs=[{n:last+1,dx:1,dy:0,ms:20}];reconnected.socket.send(JSON.stringify({type:'input',seq,warp:0,inputs:attackInputs}));
const killed=await request(clients[0].key,'/api/field',{action:'kill',protocol:2,code,seq,warp:0,inputs:attackInputs,target:base[1].frame.own.id,requestId:crypto.randomUUID()});assert.ok(killed.frame.bodies.some(p=>p.id===base[1].frame.own.id));assert.equal(killed.frame.own.ack,last+1);
await pause(400);assert.ok(observer.frames.at(-1).frame.bodies.some(p=>p.id===base[1].frame.own.id),'live observers see authoritative kill');
await request(host,'/api/game',{action:'pause',code,seq});await pause(250);const frozen=reconnected.frames.at(-1).frame.own;
reconnected.socket.send(JSON.stringify({type:'input',seq,warp:0,inputs:[{n:last+2,dx:0,dy:1,ms:20}]}));await pause(250);assert.equal(reconnected.frames.at(-1).frame.own.y,frozen.y);
const bad=await fetch(origin+'/api/live',{headers:{Upgrade:'websocket',Origin:'https://attacker.example'}});assert.equal(bad.status,403);
const unauthorized=await fetch(origin+'/api/live',{headers:{Upgrade:'websocket'}});const unauth=unauthorized.webSocket;unauth.accept();let rejected=false;unauth.addEventListener('close',()=>rejected=true);unauth.send(JSON.stringify({type:'auth',code,token:token()}));for(let i=0;i<40&&!rejected;i++)await pause(25);assert.ok(rejected);
for(const p of [...peers,observer,reconnected]){if(p.socket.readyState===1)p.socket.close();}if(unauth.readyState===1)unauth.close();
console.log('PASS: 29 authenticated live players + host, continuous movement, concurrent kill, persisted ack, reconnect, duplicate replay, forged-speed rejection, pause and origin/auth isolation.');
