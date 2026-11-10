import assert from 'node:assert/strict';
import {stepInput,reconcileMotion,consumeInputs} from '../lib/motion.ts';
import {distance,spawn} from '../lib/map.ts';
let clock=100000,server={...spawn(0),ack:0,clock},local=spawn(0),pending=[],n=0,inflight=null,nextSend=clock,corrections=0,replies=0;
for(let tick=0;tick<900;tick++){clock+=20;const elapsed=tick*20;const dir=elapsed<2000?[0,-1]:elapsed<4800?[-1,0]:elapsed<7500?[0,1]:elapsed<10500?[1,0]:[0,0];const input={n:++n,dx:dir[0],dy:dir[1],ms:20};pending.push(input);local=stepInput(local,input,29);
if(inflight?.stage==='request'&&clock>=inflight.arrive){server=consumeInputs(server,inflight.batch,clock,29);inflight={...inflight,stage:'response',snapshot:{...server},arrive:clock+180+(tick%9)*45};}
if(inflight?.stage==='response'&&clock>=inflight.arrive){const before={...local},result=reconcileMotion(inflight.snapshot,pending,29);pending=result.pending;local=result.position;corrections=Math.max(corrections,distance(before,local));replies++;inflight=null;nextSend=clock+150;}
if(!inflight&&clock>=nextSend)inflight={stage:'request',batch:[...pending],arrive:clock+120+(tick%7)*55};}
assert.ok(replies>=12);assert.ok(corrections<.2,`rubber band correction ${corrections}`);
const duplicate=consumeInputs(server,[{n:server.ack,dx:1,dy:0,ms:50}],clock,29);assert.equal(duplicate.ack,server.ack);assert.equal(duplicate.x,server.x);
const speed=consumeInputs({...spawn(0),ack:0,clock},Array.from({length:200},(_,i)=>({n:i+1,dx:1,dy:0,ms:50})),clock,29);assert.ok(speed.x-spawn(0).x<=21);assert.equal(speed.ack,2);
assert.equal(consumeInputs(server,[{n:server.ack+2,dx:1,dy:0,ms:20}],clock,29).ack,server.ack);
console.log(`PASS: ${replies} delayed round trips (300–1000 ms), turns and wall collisions, maximum reconciliation displacement ${corrections.toFixed(3)} px, duplicate/reordered input rejection, speed budget.`);
