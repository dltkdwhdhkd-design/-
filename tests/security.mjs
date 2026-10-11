import assert from 'node:assert/strict';
import {newRoom,defaults,addPlayer,act,next} from '../lib/game.ts';
import {fieldAct,fieldSnapshot,fieldTick,poseFor} from '../lib/field.ts';
import {securityConsole,communicationsConsole,camerasFor} from '../lib/surveillance.ts';
import {walkable} from '../lib/map.ts';
const now=1000000;
function setup(count=29){const r=newRoom('ABC234','host',{...defaults,count},now);for(let i=0;i<count;i++){addPlayer(r,'k'+i,'학생'+i,i%16);act(r,'k'+i,{action:'ready',ready:true},now);}act(r,'host',{action:'start',seq:r.seq},now);next(r,now);return r;}
const action=(r,p,b,poses,at=now+40000)=>fieldAct(r,p.key,{seq:r.seq,requestId:crypto.randomUUID(),...b},poses,at);
for(const count of [6,10,16,20,29]){const r=setup(count),console=securityConsole(count);assert.ok(walkable(console,count));assert.ok(walkable(communicationsConsole(count),count));assert.equal(camerasFor(count).length,count<=10?4:count<=20?6:8);}
let r=setup(),crew=r.players.find(p=>p.role==='crewmate'),imp=r.players.find(p=>p.role==='impostor'),shifter=r.players.find(p=>p.role==='shapeshifter'),phantom=r.players.find(p=>p.role==='phantom'),cam=camerasFor(29)[0],terminal=securityConsole(29);
const poses=r.players.map(p=>({id:p.id,x:terminal.x,y:terminal.y,at:now,seq:r.field.epoch,ack:0,clock:now,warp:0,place:'보안실',previous:'중앙 홀'}));
Object.assign(poses.find(p=>p.id===imp.id),{x:cam.x,y:cam.y});
assert.throws(()=>action(r,imp,{action:'cameraStart'},poses));assert.equal(fieldSnapshot(r,crew.key,poses,now+40000).cameras,null);
action(r,crew,{action:'cameraStart'},poses);let snap=fieldSnapshot(r,crew.key,poses,now+40001);assert.equal(snap.cameras.length,8);assert.ok(snap.cameras[0].people.some(p=>p.id===imp.id));assert.ok(snap.activeCameras);assert.equal(snap.people.length,0);assert.equal(snap.bodies.length,0);assert.equal(fieldSnapshot(r,imp.key,poses,now+40001).cameras,null);assert.ok(fieldSnapshot(r,imp.key,poses,now+40001).activeCameras);
assert.throws(()=>action(r,crew,{action:'emergency'},poses));assert.throws(()=>action(r,crew,{action:'taskStart',station:r.field.tasks[crew.id][0].station},poses));
// Lighting does not affect camera vision, but only camera bounds are exposed.
r.field.lightsUntil=now+60000;snap=fieldSnapshot(r,crew.key,poses,now+40002);assert.ok(snap.cameras[0].people.some(p=>p.id===imp.id));assert.ok(!snap.cameras[0].people.some(p=>p.id===crew.id));r.field.lightsUntil=0;
// Concealed players stay concealed; copied names and appearances remain copied.
for(const p of [shifter,phantom])Object.assign(poses.find(x=>x.id===p.id),{x:cam.x+30,y:cam.y});r.field.invisible[phantom.id]=now+50000;r.field.disguises[shifter.id]={target:crew.id,until:now+50000};r.field.venting[imp.id]={vent:'lab',until:now+50000};snap=fieldSnapshot(r,crew.key,poses,now+40003);assert.ok(!snap.cameras[0].people.some(p=>[imp.id,phantom.id].includes(p.id)));assert.equal(snap.cameras[0].people.find(p=>p.id===shifter.id).name,crew.name);assert.equal(snap.cameras[0].people.find(p=>p.id===shifter.id).avatar,crew.avatar);delete r.field.venting[imp.id];
// Communications blocks the data on the server, and repair requires physical presence.
action(r,imp,{action:'commsSabotage'},poses,now+40004);snap=fieldSnapshot(r,crew.key,poses,now+40005);assert.ok(snap.cameras.every(c=>c.offline&&!c.people.length&&!c.bodies.length&&!c.effects.length));assert.equal(snap.activeCameras,false);assert.throws(()=>action(r,imp,{action:'commsRepair'},poses));const repairer=r.players.find(p=>p.role==='engineer');Object.assign(poses.find(p=>p.id===repairer.id),communicationsConsole(29));action(r,repairer,{action:'commsRepair'},poses,now+40006);assert.ok(fieldSnapshot(r,crew.key,poses,now+40007).cameras[0].people.length);
// A watcher can be killed; the feed closes immediately.
Object.assign(poses.find(p=>p.id===imp.id),terminal);r.field.cooldowns[imp.id]=0;action(r,imp,{action:'kill',target:crew.id},poses,now+40008);assert.equal(crew.alive,false);assert.equal(fieldSnapshot(r,crew.key,poses,now+40009).cameras,null);assert.equal(r.field.watching[crew.id],undefined);
// Impostors may watch, but cannot attack, sabotage or advance their kill cooldown.
r.field.cooldowns[imp.id]=now+60000;action(r,imp,{action:'cameraStart'},poses,now+41000);assert.throws(()=>action(r,imp,{action:'commsSabotage'},poses,now+41001));action(r,imp,{action:'cameraStop'},poses,now+43000);assert.equal(r.field.cooldowns[imp.id],now+62000);assert.equal(poseFor(r,imp,poses,now+43001).warp,now+43000);
action(r,imp,{action:'cameraStart'},poses,now+44000);fieldTick(r,now+57000);assert.equal(r.field.watching[imp.id],undefined);assert.equal(fieldSnapshot(r,imp.key,poses,now+57001).cameras,null);assert.equal(fieldSnapshot(r,imp.key,poses,now+57001).activeCameras,false);
console.log('PASS: 4/6/8 reachable cameras; remote access rejected; server-limited live feeds; no nearby view while watching; lights unaffected; ghost/vent/phantom concealment; disguise; comms outage and proximity repair; vulnerable watchers; frozen kill cooldown; disconnect expiry.');
