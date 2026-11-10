import assert from 'node:assert/strict';
import {SCIENCE_KINDS,scienceProblem} from '../lib/science.ts';
import {puzzleCorrect} from '../lib/puzzles.ts';
import {newRoom,defaults,addPlayer,act,next,view} from '../lib/game.ts';
import {fieldAct,progress,fieldWin} from '../lib/field.ts';
import {isCrew,isImpostor} from '../lib/field-roles.ts';
import {mapFor,spawn,walkable} from '../lib/map.ts';
for(const kind of SCIENCE_KINDS)for(let seed=0;seed<4;seed++){const p=scienceProblem(kind,seed);assert.ok(puzzleCorrect(kind,[seed],p.answer));assert.ok(!puzzleCorrect(kind,[seed],[99]));assert.ok(p.hint&&p.explanation);}
const now=1000000;
for(const count of [6,16,29]){
 const r=newRoom('ABC234','host',{...defaults,mode:'field',mapId:'nereid',count},now);
 for(let i=0;i<count;i++){addPlayer(r,'key'+i,'학생'+i,i%16);act(r,'key'+i,{action:'ready',ready:true},now);assert.ok(walkable(spawn(i,r.config),r.config));}
 act(r,'host',{action:'start',seq:r.seq},now);next(r,now);
 const map=mapFor(r.config),crew=r.players.find(p=>isCrew(p.role)),imp=r.players.find(p=>isImpostor(p.role));
 assert.ok(Object.values(r.field.tasks).every(ts=>ts.length===map.tasksPerPlayer&&ts.every(t=>map.stations.some(s=>s.id===t.station&&s.kind.startsWith('science_')))));
 const ps=r.players.map((p,i)=>({id:p.id,...spawn(i,r.config),at:now,seq:r.field.epoch,ack:0,clock:now,warp:0,place:'집결동',previous:'집결동'}));
 const action=(b,at=now+40000)=>fieldAct(r,crew.key,{seq:r.seq,requestId:crypto.randomUUID(),...b},ps,at);
 for(const kind of SCIENCE_KINDS){const station=map.stations.find(s=>s.kind===kind);r.field.tasks[crew.id]=[{station:station.id,done:false}];Object.assign(ps.find(p=>p.id===crew.id),{x:station.x,y:station.y});
 action({action:'taskStart',station:station.id});const c=r.field.challenges[crew.id],answer=scienceProblem(kind,c.solution[0]).answer;
 assert.throws(()=>action({action:'taskFinish',station:station.id,nonce:'bad',answer},now+43000));
 assert.throws(()=>action({action:'taskFinish',station:station.id,nonce:c.nonce,answer:[99]},now+43000));
 action({action:'taskFinish',station:station.id,nonce:c.nonce,answer},now+43000);assert.ok(r.field.tasks[crew.id][0].done);
 }
 r.phase='vote';const iv=view(r,imp.key),cv=view(r,crew.key);assert.equal(iv.players.filter(p=>isImpostor(p.role)).length,r.players.filter(p=>isImpostor(p.role)).length);assert.equal(cv.players.filter(p=>isImpostor(p.role)).length,0);
 r.phase='field';for(const p of r.players.filter(p=>isCrew(p.role)))for(const t of r.field.tasks[p.id])t.done=true;
 assert.equal(progress(r).done,progress(r).total);fieldWin(r,now+50000);assert.equal(r.phase,'finished');assert.equal(r.winner,'town');
}
console.log('PASS: 48 science problem variants, wrong answers/nonces rejected, new-map 6/16/29-player science allocation and spawns, impostor teammate privacy, complete crew missions win.');
