import assert from 'node:assert/strict';
import {pushRemote,sampleRemote} from '../lib/remote-motion.ts';
import {distance} from '../lib/map.ts';
export function scenario(name,delays,outage=false){
 const start=100000,events=[],duration=60000;
 function polls(kind,id){let t=id*7,i=0;while(t<duration){const trip=delays[(i+id)%delays.length],send=t,read=t+trip*.6,receive=t+trip;if(!outage||!(send>20000&&send<21500))events.push({kind,id,send,read,at:kind==='peer'?read:receive});t=receive+12;i++;}}
 for(let i=0;i<29;i++)polls('peer',i);polls('observer',0);events.sort((a,b)=>a.at-b.at);
 const poses=Array.from({length:29},(_,i)=>({x:1200+120*Math.sin(i),y:940+100*Math.cos(i),at:start,warp:0,alive:true})),hist=[],tracks=[],last=[],stall=Array(29).fill(0);let index=0,maxJump=0,longest=0,stalled=0,total=0,lag=0;
 // Snapshot reads and response deliveries are distinct: include the time of the other player's last update.
 const reads=events.filter(e=>e.kind==='observer').map(e=>({...e,kind:'read',at:e.read}));events.push(...reads);events.sort((a,b)=>a.at-b.at);
 const snapshots=new Map();
 for(let t=0;t<duration;t+=1000/60){while(index<events.length&&events[index].at<=t){const e=events[index++];if(e.kind==='peer'){poses[e.id]={x:1200+120*Math.sin(e.send/650+e.id),y:940+100*Math.cos(e.send/650+e.id),at:start+e.read,warp:0,alive:true};}else if(e.kind==='read')snapshots.set(e.send,structuredClone(poses));else{const ps=snapshots.get(e.send);for(let i=0;i<29;i++)tracks[i]=pushRemote(tracks[i],ps[i],e.at);snapshots.delete(e.send);}}
 for(let i=0;i<29;i++){if(!tracks[i])continue;const p=sampleRemote(tracks[i],t,29);if(last[i]&&t>3000){const d=distance(last[i],p);maxJump=Math.max(maxJump,d);if(d<.05){stall[i]+=1000/60;stalled++;longest=Math.max(longest,stall[i]);}else stall[i]=0;total++;lag=Math.max(lag,start+t-p.at);}last[i]=p;}}
 return{name,maxJump:Math.round(maxJump*100)/100,longestStall:Math.round(longest),stalledPercent:Math.round(stalled/total*1000)/10,maxLag:Math.round(lag)};
}
const cases=[['stable',[180]],['varying',[100,220,350,150,450]],['slow',[400,700,500]],['outage',[180],true]];
for(const c of cases){const result=scenario(...c);console.log(result);assert.ok(result.maxJump<=4.6,'remote actors must not teleport between frames');if(c[0]==='stable')assert.equal(result.longestStall,0);if(c[0]==='varying'){assert.ok(result.longestStall<=100);assert.ok(result.stalledPercent<1);}if(c[0]==='outage')assert.ok(result.longestStall>500,'a genuine connection outage cannot be hidden indefinitely');}
