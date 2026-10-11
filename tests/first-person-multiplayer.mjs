import assert from 'node:assert/strict';
const origin='http://terminal.local:4173',token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const key=token();async function req(body,field=false){const response=await fetch(origin+(field?'/api/field':'/api/game'),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
for(const mapId of ['aurora','nereid']){let r=await req({action:'create',config:{mode:'field',mapId,viewMode:'fps',count:29}});const code=r.code;r=await req({action:'soloStart',code,seq:r.seq});assert.equal(r.config.viewMode,mapId==='nereid'?'fps':'topdown');assert.equal(r.host,false);assert.equal(r.solo,true);assert.equal(r.players.length,1);
 const frame=await req({action:'frame',code,seq:r.seq,protocol:2,inputs:[],warp:0},true);await new Promise(resolve=>setTimeout(resolve,130));const base=frame.frame.own;
 const moved=await req({action:'frame',code,seq:r.seq,count:29,mapId,protocol:2,warp:0,base,inputs:Array.from({length:5},(_,i)=>({n:i+1,dx:1,dy:0,ms:20}))},true);assert.equal(moved.transport,'checkpoint');assert.equal(moved.frame.own.ack,5);assert.ok(moved.frame.own.x>base.x);
 r=await req({action:'soloStop',code,seq:r.seq});assert.equal(r.phase,'lobby');assert.equal(r.host,true);assert.equal(r.config.count,29);assert.equal(r.players.length,0);
}
console.log('PASS both maps: solo host uses multiplayer HTTP checkpoint transport and server positions, then returns to unchanged 29-player lobby.');
