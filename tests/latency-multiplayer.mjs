import assert from 'node:assert/strict';
const {STATIONS}=await import('file://'+process.cwd()+'/lib/map.ts');
const origin='http://terminal.local:4173',token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
async function request(key,body,game=false){const res=await fetch(origin+(game?'/api/game':'/api/field'),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;}
const host=token();let r=await request(host,{action:'create',config:{mode:'field',count:6}},true);const code=r.code,users=Array.from({length:6},(_,i)=>({key:token(),name:'반응'+i,avatar:i}));const joins=await Promise.all(users.map(u=>request(u.key,{action:'join',code,...u},true)));await Promise.all(users.map(u=>request(u.key,{action:'ready',code,ready:true},true)));r=await request(host,{action:'start',code,seq:r.seq},true);r=await request(host,{action:'next',code,seq:r.seq},true);
const saved=await workerDb.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first(),state=JSON.parse(saved.state),station=STATIONS[0],id=joins[0].me;state.field.tasks[id]=[{station:station.id,done:false}];await workerDb.prepare('UPDATE mafia_rooms SET state=?,version=version+1 WHERE code=?').bind(JSON.stringify(state),code).run();
const x=station.x+130,y=station.y,now=Date.now();await workerDb.prepare('INSERT INTO field_positions (code,player,x,y,at,seq,ack,clock,warp,previous,place) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(code,id,x,y,now-1000,state.field.epoch,0,now-1000,0,'중앙 홀','연구실').run();
const payload={protocol:2,code,seq:r.seq,warp:0,inputs:Array.from({length:10},(_,i)=>({n:i+1,dx:-1,dy:0,ms:20}))};
// An in-flight frame may overlap the immediate action. Inputs must apply exactly once.
const [frame,action]=await Promise.all([request(users[0].key,{...payload,action:'frame'}),request(users[0].key,{...payload,action:'taskStart',station:station.id,requestId:crypto.randomUUID()})]);
assert.equal(action.room.field.challenge.station,station.id);assert.equal(action.frame.own.ack,10);assert.ok(Math.abs(action.frame.own.x-(x-41))<.2);
const compact=await request(users[0].key,{...payload,action:'frame',revision:action.room.revision});assert.equal(compact.room,undefined);assert.equal(compact.revision,action.room.revision);assert.equal(compact.frame.own.ack,10);assert.ok(Math.abs(compact.frame.own.x-(x-41))<.2);
const full=await request(users[0].key,{...payload,action:'frame'});assert.ok(full.room);const compactBytes=JSON.stringify(compact).length,fullBytes=JSON.stringify(full).length;assert.ok(compactBytes<fullBytes*.5);
const cancelled=await request(users[0].key,{...payload,action:'cancelTask'});const changed=await request(users[0].key,{...payload,action:'frame',revision:action.room.revision});assert.ok(changed.room);assert.equal(changed.room.field.challenge,null);
console.log(`PASS: one-request movement + task action; overlapping frame/action applies movement once; compact unchanged frames ${compactBytes}/${fullBytes} bytes; revision changes resend authoritative room.`);
// Combat uses the same atomic input+action path, even with an overlapping movement request.
const currentRow=await workerDb.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first(),combat=JSON.parse(currentRow.state);
for(let i=0;i<users.length;i++){const p=combat.players.find(p=>p.id===joins[i].me);p.role=i===0?'impostor':i===1?'jester':'crewmate';p.alive=true;}
combat.field.cooldowns={};combat.field.challenges={};combat.field.warps={};
await workerDb.prepare('UPDATE mafia_rooms SET state=?,version=version+1 WHERE code=?').bind(JSON.stringify(combat),code).run();
await workerDb.prepare('DELETE FROM field_positions WHERE code=?').bind(code).run();
const ct=Date.now();await workerDb.prepare('INSERT INTO field_positions (code,player,x,y,at,seq,ack,clock,warp,previous,place) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(code,joins[0].me,1000,900,ct-1000,combat.field.epoch,0,ct-1000,0,'중앙 홀','중앙 홀').run();
await workerDb.prepare('INSERT INTO field_positions (code,player,x,y,at,seq,ack,clock,warp,previous,place) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(code,joins[1].me,1036,900,ct-1000,combat.field.epoch,0,ct-1000,0,'중앙 홀','중앙 홀').run();
const attack={action:'kill',code,seq:combat.seq,protocol:2,warp:0,requestId:crypto.randomUUID(),target:joins[1].me,inputs:Array.from({length:5},(_,i)=>({n:i+1,dx:1,dy:0,ms:20}))};
const started=performance.now();const [,killed]=await Promise.all([request(users[0].key,{...attack,action:'frame'}),request(users[0].key,attack)]);
assert.equal(killed.frame.own.ack,5);assert.ok(killed.frame.bodies.some(p=>p.id===joins[1].me));assert.equal(killed.room.winner,null);assert.equal(killed.frame.effects.filter(e=>e.kind==='attack').length,1);
const duplicate=await request(users[0].key,attack);assert.equal(duplicate.frame.effects.filter(e=>e.kind==='attack').length,1);assert.equal(duplicate.frame.own.x,killed.frame.own.x);
console.log(`PASS: atomic movement + kill, concurrent frame race, jester kill is not victory, duplicate attack produces one result (${Math.round(performance.now()-started)} ms local Worker verification; not a production latency measurement).`);
// The target has moved away by the time the request arrives; validate its recent displayed position.
const afterRow=await workerDb.prepare('SELECT state FROM mafia_rooms WHERE code=?').bind(code).first(),after=JSON.parse(afterRow.state),lagNow=Date.now();after.players.find(p=>p.id===joins[1].me).alive=true;after.field.cooldowns={};after.field.protects={};after.field.bodies=[];
await workerDb.prepare('UPDATE mafia_rooms SET state=?,version=version+1 WHERE code=?').bind(JSON.stringify(after),code).run();
await workerDb.prepare('UPDATE field_positions SET x=?,y=?,at=?,history=? WHERE code=? AND player=?').bind(1160,900,lagNow,JSON.stringify([{x:1060,y:900,at:lagNow-500,seq:after.field.epoch,warp:0}]),code,joins[1].me).run();
const lagKill=await request(users[0].key,{...attack,inputs:[],requestId:crypto.randomUUID(),targetAt:lagNow-350});assert.ok(lagKill.frame.bodies.some(p=>p.id===joins[1].me));assert.ok(!Object.hasOwn(lagKill.frame.own,'history'));
console.log('PASS: compiled Worker attack rewind uses stored server position history without exposing it to clients.');
