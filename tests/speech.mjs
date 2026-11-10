import assert from 'node:assert/strict';
import {newRoom,defaults,addPlayer,act,next,view} from '../lib/game.ts';
import {fieldAct,fieldSnapshot,startMeeting} from '../lib/field.ts';
import {securityConsole} from '../lib/surveillance.ts';
const now=1000000,r=newRoom('ABC234','host',{...defaults,count:29},now);for(let i=0;i<29;i++){addPlayer(r,'k'+i,'학생'+i,i%16);act(r,'k'+i,{action:'ready',ready:true},now);}act(r,'host',{action:'start',seq:r.seq},now);next(r,now);
const [a,b,c]=r.players,ps=r.players.map(p=>({id:p.id,x:1000,y:950,seq:r.field.epoch,at:now,place:'중앙 홀',previous:'중앙 홀'})),say=(p,text,at=now+40000,requestId=crypto.randomUUID())=>fieldAct(r,p.key,{action:'say',seq:r.seq,text,requestId},ps,at),speech=(key,id,at=now+40001)=>fieldSnapshot(r,key,ps,at).people.find(p=>p.id===id)?.speech;
say(a,'같이 가요!');assert.equal(speech(b.key,a.id).text,'같이 가요!');assert.equal(speech('host',a.id).text,'같이 가요!');assert.equal(speech(a.key,a.id).text,'같이 가요!');assert.ok(!JSON.stringify(view(r,b.key)).includes('같이 가요!'));assert.throws(()=>say(a,'spam',now+40002));
ps.find(p=>p.id===b.id).x=2000;assert.equal(speech(b.key,a.id),undefined);ps.find(p=>p.id===b.id).x=1000;
// Nearby but separated by solid room wall: no message in the response.
Object.assign(ps.find(p=>p.id===a.id),{x:1430,y:1120});Object.assign(ps.find(p=>p.id===b.id),{x:1570,y:1270});assert.equal(speech(b.key,a.id),undefined);for(const p of ps)Object.assign(p,{x:1000,y:950});
assert.equal(speech(b.key,a.id,now+46501),null);
a.alive=false;assert.equal(speech(b.key,a.id),undefined);say(a,'유령 단서',now+47000);assert.equal(speech(b.key,a.id,now+47001),undefined);assert.equal(speech('host',a.id,now+47001),null);c.alive=false;assert.equal(speech(c.key,a.id,now+47001).text,'유령 단서');assert.equal(speech(a.key,a.id,now+47001).text,'유령 단서');
say(b,'살아 있는 친구',now+48000);assert.equal(speech(c.key,b.id,now+48001).text,'살아 있는 친구');assert.equal(speech(c.key,a.id,now+48001).text,'유령 단서');
r.field.invisible[b.id]=now+60000;assert.throws(()=>say(b,'숨은 말',now+50000));assert.equal(speech(c.key,b.id,now+50000),null);r.field.invisible[b.id]=0;r.field.venting[b.id]={vent:'atrium',until:now+60000};assert.throws(()=>say(b,'벤트 속',now+50000));delete r.field.venting[b.id];
const requestId=crypto.randomUUID();say(b,'🙂'.repeat(80),now+51000,requestId);say(b,'중복',now+51001,requestId);assert.equal(Array.from(speech(c.key,b.id,now+51002).text).length,60);assert.throws(()=>say(b,'\n\t',now+53000));
// A disguise attaches the bubble to the visible identity, not the original name.
r.field.disguises[b.id]={target:r.players[5].id,until:now+70000};assert.equal(fieldSnapshot(r,c.key,ps,now+51002).people.find(p=>p.id===b.id).name,r.players[5].name);
act(r,'host',{action:'pause',seq:r.seq},now+52000);assert.ok(speech(c.key,b.id,now+62000));assert.throws(()=>say(b,'멈춤',now+62000));act(r,'host',{action:'pause',seq:r.seq},now+62000);assert.ok(speech(c.key,b.id,now+63000));
const watcher=r.players[6],terminal=securityConsole(29);Object.assign(ps.find(p=>p.id===watcher.id),terminal);fieldAct(r,watcher.key,{action:'cameraStart',seq:r.seq},ps,now+64000);const snap=fieldSnapshot(r,watcher.key,ps,now+64001);assert.deepEqual(snap.people,[]);assert.ok(!JSON.stringify(snap.cameras).includes('🙂'));assert.throws(()=>say(watcher,'CCTV',now+64002));
startMeeting(r,'회의',now+65000);assert.deepEqual(r.field.speech,{});assert.throws(()=>say(b,'회의 중 말풍선',now+65001));
console.log('PASS: nearby speech, distance/wall filtering, expiration, ghost/host privacy, hidden/vent/camera restrictions, disguise identity, pause/resume, Unicode cap, dedup/rate limit and meeting cleanup.');
