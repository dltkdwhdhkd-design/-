import assert from 'node:assert/strict';
import {newRoom,defaults,act,view,addPlayer} from '../lib/game.ts';
import {fieldWin,fieldAct,poseFor} from '../lib/field.ts';
import {mapFor,ventsFor} from '../lib/map.ts';
import {scienceProblem} from '../lib/science.ts';
for(const mapId of ['aurora','nereid'])for(const count of [6,16,29]){
 const r=newRoom('ABC234','host',{...defaults,mode:'field',mapId,count},1000000);
 assert.throws(()=>act(r,'stranger',{action:'soloStart',seq:r.seq},1000000));
 act(r,'host',{action:'soloStart',seq:r.seq},1000000);assert.equal(r.phase,'field');assert.equal(r.field.epoch,r.seq);assert.equal(view(r,'host').host,false);assert.equal(view(r,'host').solo,true);assert.equal(r.config.count,count);assert.equal(fieldWin(r,1000000),false);assert.throws(()=>addPlayer(r,'student','학생',1));
 const p=r.players[0],station=mapFor(r.config).stations.find(s=>s.id===r.field.tasks[p.id][0].station),pos={...poseFor(r,p,[],1000000),x:station.x,y:station.y};
 fieldAct(r,'host',{action:'taskStart',seq:r.seq,station:station.id},[pos],1000000);
 const c=r.field.challenges[p.id],answer=station.kind.startsWith('science_')?scienceProblem(station.kind,c.solution[0]).answer:station.kind==='calibrate'?[50,50,50]:c.solution;
 fieldAct(r,'host',{action:'taskFinish',seq:r.seq,station:station.id,nonce:c.nonce,answer},[pos],1010000);assert.equal(r.field.tasks[p.id][0].done,true);
 act(r,'host',{action:'soloStop',seq:r.seq},1020000);assert.equal(r.phase,'lobby');assert.equal(r.players.length,0);assert.equal(view(r,'host').host,true);assert.equal(r.config.count,count);addPlayer(r,'student','학생',1);assert.throws(()=>act(r,'host',{action:'soloStart',seq:r.seq},1020000));
}
console.log('PASS solo authorization, preserved multiplayer maps and counts, real mission validation, no premature win, lobby restoration and join guards');
