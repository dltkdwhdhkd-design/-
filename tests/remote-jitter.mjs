import assert from 'node:assert/strict';
import {pushRemote,sampleRemote} from '../lib/remote-motion.ts';
import {rewindTarget} from '../lib/lag-compensation.ts';
import {distance} from '../lib/map.ts';
const start=100000,delays=[80,180,350,100,450,140],packets=[];
for(let t=0;t<=10000;t+=100)packets.push({arrive:t+delays[t/100%delays.length],sample:{x:1200+140*Math.sin(t/700),y:940+100*Math.cos(t/700),at:start+t,warp:0,alive:true}});
packets.sort((a,b)=>a.arrive-b.arrive);let tr,index=0,prev,maxJump=0,stalled=0,frames=0;
for(let t=0;t<10000;t+=1000/60){while(index<packets.length&&packets[index].arrive<=t){const p=packets[index++];tr=pushRemote(tr,p.sample,p.arrive);}if(!tr)continue;const point=sampleRemote(tr,t,29);if(prev&&t>1000){maxJump=Math.max(maxJump,distance(prev,point));if(distance(prev,point)<.05)stalled++;frames++;}prev=point;}
assert.ok(maxJump<=4.5,`packet teleport ${maxJump}`);assert.ok(stalled/frames<.15,`stalled ${stalled}/${frames}`);
const s={x:1160,y:940,at:start+1000,seq:2,warp:0,history:JSON.stringify([{x:1080,y:940,at:start+500,seq:2,warp:0}])};
assert.equal(Math.round(rewindTarget(s,start+600,start+1100,29).x),1096);
assert.equal(rewindTarget(s,start+300,start+1100,29),null);assert.equal(rewindTarget({...s,warp:1},start+600,start+1100,29),null);assert.equal(rewindTarget(s,start+1300,start+1100,29),null);
console.log(`PASS: observer rendering with 80–450 ms jitter, reordered packets and turns; max frame movement ${maxJump.toFixed(2)}px; stalls ${(stalled/frames*100).toFixed(1)}%; bounded server-only history rewind rejects expired/future/warp history.`);
