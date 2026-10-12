import assert from 'node:assert/strict';
import {drawRoles} from '../lib/role-draw.ts';
import {newRoom,defaults,distribution,addPlayer,act,view} from '../lib/game.ts';
const counts=a=>Object.fromEntries([...new Set(a)].sort().map(r=>[r,a.filter(x=>x===r).length]));
for(const mode of ['classic','field'])for(let n=6;n<=29;n++){
 const r=newRoom('ABC234','host',{...defaults,mode,count:n});for(let i=0;i<n;i++)addPlayer(r,'key'+i,'학생'+i,i%16);
 let previous=[];const results=new Set();
 for(let round=0;round<30;round++){
  r.players.forEach(p=>p.ready=true);act(r,'host',{action:'start',seq:r.seq});const roles=r.players.map(p=>p.role);results.add(roles.join(','));const expected=Object.entries(distribution(n,mode)).flatMap(([r,c])=>Array(c).fill(r));assert.deepEqual(counts(roles),counts(expected));
  if(round){const old=counts(previous),fresh=counts(roles),minimum=Math.max(0,...Object.keys(fresh).map(role=>(old[role]||0)+fresh[role]-n));assert.equal(roles.filter((role,i)=>role===previous[i]).length,minimum);}
  assert.ok(!JSON.stringify(view(r,'key0')).includes('previousRole'));
  const stable=r.players.map(p=>p.role);view(r,'key1');assert.deepEqual(r.players.map(p=>p.role),stable);
  previous=roles;r.phase='finished';act(r,'host',{action:'reset',seq:r.seq});assert.deepEqual(r.players.map(p=>p.previousRole),previous);assert.ok(r.players.every(p=>p.role===null));
 }
 // Classic with 6 players is 3 special roles + 3 citizens: the minimum-repeat rule makes the
 // two halves swap every round, so only 2×3! = 12 allocations are reachable and >10 of 12 in
 // 30 rounds failed ~14% of runs. The bound below still rejects a fixed or 2-cycle draw.
 assert.ok(results.size>(mode==='classic'&&n===6?6:10),'fresh random allocation each game');
}
// Changed player count or role composition, and a mathematically unavoidable repeat.
assert.deepEqual(counts(drawRoles(['a','a','a','b'],['a','a','a','b'])),{a:3,b:1});
for(let i=0;i<100;i++){const p=['a','a','a','b'],v=drawRoles(p,p);assert.equal(v.filter((r,j)=>r===p[j]).length,2);assert.equal(drawRoles(['a','b','c'],['a',null,'b']).length,3);}
console.log('PASS: both modes, 6–29 players, 30 consecutive rounds each; exact counts, minimum possible repeats, randomized assignments, reset persistence, unchanged active roles and private history.');
