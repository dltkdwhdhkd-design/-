import assert from 'node:assert/strict';
const {securityConsole,camerasFor}=await import('file://'+process.cwd()+'/lib/surveillance.ts');
const origin='http://terminal.local:4173',token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
async function request(key,body,game=false,ok=true){const response=await fetch(origin+(game?'/api/game':'/api/field'),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,ok?200:400,JSON.stringify(data));return data;}
const host=token();let r=await request(host,{action:'create',config:{mode:'field',count:6}},true);const code=r.code,users=Array.from({length:6},(_,i)=>({key:token(),name:'감시'+i,avatar:i}));
const joins=await Promise.all(users.map(u=>request(u.key,{action:'join',code,...u},true)));await Promise.all(users.map(u=>request(u.key,{action:'ready',code,ready:true},true)));r=await request(host,{action:'start',code,seq:r.seq},true);r=await request(host,{action:'next',code,seq:r.seq},true);const seq=r.seq;
const terminal=securityConsole(6),camera=camerasFor(6)[0];
for(let i=0;i<2;i++){const p=i===0?terminal:camera;await workerDb.prepare('INSERT INTO field_positions (code,player,x,y,at,seq,ack,clock,warp,previous,place) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(code,joins[i].me,p.x,p.y,Date.now(),r.field.epoch,0,Date.now(),0,'중앙 홀','관제실').run();}
await request(users[1].key,{action:'cameraStart',code,seq},false,false);
const started=await request(users[0].key,{action:'cameraStart',code,seq});assert.equal(started.frame.cameras.length,4);assert.ok(started.frame.cameras[0].people.some(p=>p.id===joins[1].me));const pos=started.frame.own;
const locked=await request(users[0].key,{action:'frame',code,seq,protocol:2,camera:true,warp:pos.warp,inputs:[{n:1,dx:1,dy:0,ms:50}]});assert.equal(locked.frame.own.x,pos.x);assert.equal(locked.frame.own.y,pos.y);assert.equal(locked.frame.own.ack,0);assert.equal(locked.frame.cameras.length,4);
const outsider=await request(users[1].key,{action:'frame',code,seq,protocol:2,camera:true,inputs:[]});assert.equal(outsider.frame.cameras,null);assert.equal(outsider.frame.activeCameras,true);
await request(users[0].key,{action:'emergency',code,seq},false,false);
const closed=await request(users[0].key,{action:'cameraStop',code,seq});assert.equal(closed.room.field.watching,false);assert.equal(closed.frame.cameras,null);assert.equal(closed.frame.activeCameras,false);
await new Promise(resolve=>setTimeout(resolve,100));const moved=await request(users[0].key,{action:'frame',code,seq,protocol:2,camera:false,warp:closed.frame.own.warp,inputs:[{n:1,dx:1,dy:0,ms:50}]});assert.ok(moved.frame.own.x>pos.x);assert.equal(moved.frame.own.ack,1);
console.log('PASS: compiled Worker + D1 CCTV proximity gate, live distant character, no unauthorized feeds, camera indicators, server movement freeze, action denial, close and movement recovery.');
