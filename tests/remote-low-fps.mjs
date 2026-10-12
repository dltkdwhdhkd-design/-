import assert from 'node:assert/strict';
import {pushRemote,sampleRemote} from '../lib/remote-motion.ts';
import {distance,WORLD} from '../lib/map.ts';
// A slow device (7.5 fps, measured in headless Chromium) must still show a walking actor at
// walking speed. With a per-frame cap the actor fell behind and the delay kept growing.
// Back and forth across the open hall centre at walking speed (164 px legs).
const xAt=ms=>{const d=(ms*WORLD.speed/1000)%328;return 1128+(d<164?d:328-d);};
let track,last=null;const delays=[],steps=[];
for(let now=0;now<8000;now+=133){
 // Server samples every 50 ms, received 120 ms later; delivered in the frame after they arrive.
 for(let s=Math.ceil((now-133-120)/50)*50;s+120<=now;s+=50){if(s<0||s+120<=now-133)continue;track=pushRemote(track,{x:xAt(s),y:940,at:10000+s,warp:0,alive:true},s+120);}
 if(!track)continue;const p=sampleRemote(track,now,29);if(last&&now>2000){steps.push(distance(last,p));delays.push(10000+now-p.at);}last=p;
}
const avg=steps.reduce((a,b)=>a+b,0)/steps.length,expected=WORLD.speed*.133;
assert.ok(Math.abs(avg-expected)<expected*.15,`average step ${avg.toFixed(1)}px vs ${expected.toFixed(1)}px at 7.5 fps`);
assert.ok(Math.max(...delays)-Math.min(...delays)<120,`render delay stays bounded (${Math.round(Math.min(...delays))}-${Math.round(Math.max(...delays))} ms)`);
console.log(`PASS: 7.5 fps observer shows walking speed (avg ${avg.toFixed(1)} px/frame), delay ${Math.round(Math.min(...delays))}-${Math.round(Math.max(...delays))} ms.`);
