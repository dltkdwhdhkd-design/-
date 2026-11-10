import assert from 'node:assert/strict';
import {LiveClient} from '../lib/live-client.ts';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
globalThis.window=globalThis;
class Socket{static OPEN=1;static all=[];readyState=0;bufferedAmount=0;sent=[];constructor(){Socket.all.push(this);}send(value){this.sent.push(JSON.parse(value));}open(){this.readyState=1;this.onopen();}receive(value){this.onmessage({data:JSON.stringify(value)});}close(){this.readyState=3;this.onclose();}}
globalThis.WebSocket=Socket;
let frames=0;const pending=[{n:1,dx:1,dy:0,ms:20}],client=new LiveClient({url:'wss://test.invalid/api/live',token:'private',code:'ABCDEF',input:()=>({inputs:pending}),frame:()=>frames++,status:()=>{}});
client.start();const first=Socket.all[0];first.open();assert.deepEqual(first.sent[0],{type:'auth',code:'ABCDEF',token:'private'});first.receive({type:'ready'});first.receive({type:'frame',checkpointAge:0});assert.ok(client.healthy());
await pause(170);assert.ok(first.sent.filter(m=>m.type==='input').length>=3,'send continues without input acknowledgements');assert.equal(pending.length,1,'transport never discards unacknowledged input');
first.receive({type:'frame',checkpointAge:1500});assert.equal(client.healthy(),false,'stale checkpoint enables HTTP fallback');first.receive({type:'frame',checkpointAge:0,resync:true});assert.equal(client.healthy(),false,'warp asks HTTP to establish new checkpoint');
first.receive({type:'frame',checkpointAge:0});assert.ok(client.healthy());client.lastFrame=performance.now()-3000;await pause(80);assert.equal(first.readyState,3,'hung stream closes');assert.equal(client.healthy(),false);await pause(1550);const second=Socket.all[1];assert.ok(second,'automatic reconnect');second.open();second.receive({type:'ready'});second.receive({type:'frame',checkpointAge:0});await pause(70);assert.ok(second.sent.some(m=>m.type==='input'&&m.inputs[0].n===1),'unacknowledged inputs survive reconnect');client.stop();assert.equal(second.readyState,3);assert.equal(client.healthy(),false);console.log('PASS: independent sending, stale-stream/warp HTTP fallback, timeout, reconnect, retained input and cleanup.');
