import assert from 'node:assert/strict';
import {pushRemote,sampleRemote} from '../lib/remote-motion.ts';
import {distance,WORLD} from '../lib/map.ts';
// An actor that stood still for a while is first seen with its old motion timestamp. When it
// starts walking, observers must show the walk with the normal delay, not 1-2 s late
// (found in the 29-isolate simulator: attacks then failed until the delay drained).
const offset=5000; // receive clock = server clock + offset (unknown to the client)
let track,last=null,maxStep=0;
const idleSince=10000-1600; // last move 1.6 s before the observer first sees it
const shown=[];
for(let now=10000;now<14000;now+=1000/60){
 const server=now; // samples arrive ~120 ms after the server stamped them
 if(Math.round(now)%100<17){
  const moving=server>=11000,at=moving?server-120:idleSince,x=moving?1000+(server-120-11000)*WORLD.speed/1000:1000;
  track=pushRemote(track,{x,y:900,at,warp:0,alive:true},now+offset);
 }
 if(!track)continue;
 const p=sampleRemote(track,now+offset,29);
 if(last)maxStep=Math.max(maxStep,distance(last,p));last=p;shown.push({now,delay:now-p.at,x:p.x});
}
const after=shown.filter(s=>s.now>11800);
assert.ok(after.every(s=>s.delay<450),`delay after the actor started walking: max ${Math.round(Math.max(...after.map(s=>s.delay)))} ms`);
assert.ok(maxStep<=WORLD.speed*1.3/60+.5,`no visible jump (max ${maxStep.toFixed(2)} px/frame)`);
console.log(`PASS: idle actor starts walking; delay ${Math.round(Math.min(...after.map(s=>s.delay)))}–${Math.round(Math.max(...after.map(s=>s.delay)))} ms after 0.8 s, max step ${maxStep.toFixed(2)} px/frame.`);
