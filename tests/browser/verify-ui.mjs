// End-to-end UI check against a running local server (pnpm run start), with bot players that
// move over the real WebSocket protocol. Not part of the default test list: it needs
// Playwright + Chromium.  Usage:
//   BASE=http://127.0.0.1:8787 OUT=./verify-out node tests/browser/verify-ui.mjs [step...]
//   (PW_MODULE=/path/to/playwright/index.mjs if playwright is not resolvable; CHROMIUM=path)
// Steps: lobby aurora nereid host solo mobile perf29 hitches   (default: all)
// Headless Chromium renders WebGL in software (SwiftShader): frame times are not device numbers.
import fs from 'node:fs';
const BASE=process.env.BASE||'http://127.0.0.1:8787',OUT=process.env.OUT||'verify-out';fs.mkdirSync(OUT,{recursive:true});
const {chromium}=await import(process.env.PW_MODULE||'playwright');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(key,path,body){const res=await fetch(BASE+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Origin:BASE},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw Error(path+' '+JSON.stringify(data).slice(0,200));return data;}
const report={};const note=(k,v)=>{report[k]=v;console.log(k,typeof v==='object'?JSON.stringify(v):v);};
async function room({mapId='aurora',count=16,start=true,mode='field'}={}){
 const host=token();let r=await api(host,'/api/game',{action:'create',config:{mode,mapId,count,discussion:300,vote:120}});const code=r.code;
 const players=Array.from({length:count},(_,i)=>({key:token(),name:i?`학생${String(i).padStart(2,'0')}`:'브라우저',avatar:i%16}));
 for(const p of players){const v=await api(p.key,'/api/game',{action:'join',code,name:p.name,avatar:p.avatar});p.id=v.me;}
 if(start){await Promise.all(players.map(p=>api(p.key,'/api/game',{action:'ready',code,ready:true})));r=await api(host,'/api/game',{action:'start',code,seq:r.seq});if(mode==='field')r=await api(host,'/api/game',{action:'next',code,seq:r.seq});}
 return {code,host,players,seq:r.seq};
}
// A bot: authenticates on /api/live and walks around its spawn with held-key style input.
function bot(code,p,seq,{wander=true}={}){
 const url=BASE.replace(/^http/,'ws')+'/api/live';let ws,pending=[],n=0,warp=0,ack=0,dir={x:0,y:0},timer,closed=false,ready=false;const stats={frames:0};
 const connect=()=>{ws=new WebSocket(url);ws.onopen=()=>ws.send(JSON.stringify({type:'auth',code,token:p.key}));
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='ready'){ack=m.ack;n=ack;warp=m.warp;pending=[];ready=true;}if(m.type==='frame'){stats.frames++;const own=m.frame.own;if((own.warp||0)!==warp){warp=own.warp||0;pending=[];n=own.ack||0;}ack=own.ack||0;pending=pending.filter(i=>i.n>ack);stats.own=own;}if(m.type==='resend'){pending=pending.filter(i=>i.n>m.after);}if(m.type==='rebase'){pending=[];n=m.own.ack||0;}};
  ws.onclose=()=>{ready=false;if(!closed)setTimeout(connect,500);};};
 connect();let turn=0;
 timer=setInterval(()=>{if(!ready||ws.readyState!==1)return;if(wander&&Date.now()>turn){const a=Math.random()*Math.PI*2,still=Math.random()<.2;dir=still?{x:0,y:0}:{x:Math.cos(a),y:Math.sin(a)};turn=Date.now()+800+Math.random()*1600;}
  if(dir.x||dir.y){for(let k=0;k<2;k++)pending.push({n:++n,dx:dir.x,dy:dir.y,ms:20});if(pending.length>120)pending=pending.slice(-120);}
  ws.send(JSON.stringify({type:'input',seq,warp,hold:false,inputs:pending}));},40);
 return {stats,stop(){closed=true;clearInterval(timer);try{ws.close();}catch{}},act(body){return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),t=setTimeout(()=>reject(Error('timeout')),5000);const on=e=>{const m=JSON.parse(e.data);if(m.type==='actResult'&&m.id===id){clearTimeout(t);ws.removeEventListener('message',on);resolve(m);}};ws.addEventListener('message',on);ws.send(JSON.stringify({type:'act',id,body:{...body,protocol:2,code,seq,warp,inputs:pending,requestId:crypto.randomUUID()}}));});},set dir(v){dir=v;wander=false;}};
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/opt/pw-browsers/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
async function page(key,code,{viewport={width:1280,height:800},mobile=false,query='?netdebug=1',resume=true,init=null}={}){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});if(init)await ctx.addInitScript(init);
 await ctx.addInitScript(([c,k])=>{try{localStorage.setItem('nightfall-session',JSON.stringify({code:c,token:k}));}catch{}},[code,key]);
 const pg=await ctx.newPage();const errors=[];pg.on('pageerror',e=>errors.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/favicon|404/.test(m.text()))errors.push(m.text());});
 await pg.goto(BASE+'/'+query,{waitUntil:'domcontentloaded'});
 // The entry screen offers the saved session as "이전 방 … 돌아가기".
 if(resume)await pg.locator('button.resume').click({timeout:30000}).catch(async e=>{await pg.screenshot({path:`${OUT}/resume-missing-${Date.now()}.png`});console.log('resume button missing:',(await pg.evaluate(()=>document.body.innerText)).slice(0,300).replace(/\n/g,' '));throw e;});return {pg,ctx,errors};
}
// Per-frame sampling of what this browser draws for other players (needs ?netdebug=1).
async function sampleMotion(pg,ms){return pg.evaluate(ms=>new Promise(resolve=>{const net=window.__fieldNet;if(!net)return resolve({error:'no __fieldNet'});const last={},jumps=[],dts=[];let vanish=0,frames=0,prevT=performance.now();const seen=new Map();
 const tick=t=>{dts.push(t-prevT);prevT=t;frames++;const ids=new Set((net.snapshot?.people||[]).map(p=>p.id).filter(id=>net.interpolated[id]));for(const id of ids){const p=net.interpolated[id];if(id===net.room.me)continue;if(last[id]){jumps.push(Math.hypot(p.x-last[id].x,p.y-last[id].y));}last[id]={x:p.x,y:p.y};seen.set(id,t);}
  for(const id of Object.keys(last))if(!ids.has(id)){const own=net.visual,q=last[id];if(Math.hypot(q.x-own.x,q.y-own.y)<(net.snapshot?.radius||350)*.7)vanish++;delete last[id];}
  if(t-start<ms)requestAnimationFrame(tick);else{jumps.sort((a,b)=>a-b);dts.sort((a,b)=>a-b);resolve({frames,maxJumpPx:+(jumps.at(-1)||0).toFixed(1),p99JumpPx:+(jumps[Math.floor(jumps.length*.99)]||0).toFixed(1),vanishNearby:vanish,frameDtP50:+dts[Math.floor(dts.length*.5)].toFixed(1),frameDtP95:+dts[Math.floor(dts.length*.95)].toFixed(1),stats:net.stats.summary(),transport:net.healthy()?'live':'http'});}};const start=performance.now();requestAnimationFrame(tick);}),ms);}
const steps=process.argv.slice(2);const want=s=>!steps.length||steps.includes(s);

if(want('lobby')){
 const {code,players}=await room({count:16,start:false});const {pg,ctx,errors}=await page(players[0].key,code,{resume:false});
 await pg.waitForSelector('.doll-avatar img',{timeout:60000});await pause(2500);await pg.screenshot({path:`${OUT}/lobby.png`,fullPage:true});note('lobby.errors',errors);await ctx.close();
}
async function fieldStep(name,mapId,count){
 const R=await room({mapId,count});const bots=R.players.slice(1).map(p=>bot(R.code,p,R.seq));
 const {pg,ctx,errors}=await page(R.players[0].key,R.code);
 await pg.waitForSelector(mapId==='nereid'?'.fps-surface canvas':'.field-viewport canvas',{timeout:90000}).catch(async e=>{await pg.screenshot({path:`${OUT}/${name}-fail.png`});console.log('PAGE TEXT:',(await pg.evaluate(()=>document.body.innerText)).slice(0,600),'ERRORS',errors);throw e;});
 await pg.waitForFunction(()=>window.__fieldNet?.healthy(),null,{timeout:60000}).catch(()=>{});await pause(4000);
 await pg.screenshot({path:`${OUT}/${name}-play.png`});
 // Hold D for a second: own movement must be acknowledged over the socket.
 const before=await pg.evaluate(()=>({...window.__fieldNet.visual,ack:window.__fieldNet.lastAck}));
 await pg.locator(mapId==='nereid'?'.fps-surface canvas':'.field-viewport canvas').first().focus().catch(()=>{});
 await pg.keyboard.down('KeyW');await pause(1000);await pg.keyboard.up('KeyW');await pause(600);
 const after=await pg.evaluate(()=>({...window.__fieldNet.visual,ack:window.__fieldNet.lastAck,pending:window.__fieldNet.pending.length}));
 note(`${name}.ownMove`,{movedPx:+Math.hypot(after.x-before.x,after.y-before.y).toFixed(1),acked:after.ack-before.ack,pendingAfter:after.pending});
 note(`${name}.remoteMotion`,await sampleMotion(pg,8000));
 // Network panel (F3) is on via ?netdebug=1.
 note(`${name}.netPanel`,(await pg.locator('.net-debug').innerText().catch(()=>'missing')).replace(/\n/g,' | '));
 // Fullscreen + M map + Esc.
 await pg.click('.fullscreen-toggle');await pause(800);
 const fs1=await pg.evaluate(()=>({fullscreenElement:document.fullscreenElement?.tagName||null,immersive:document.body.classList.contains('immersive-play'),overflowX:document.scrollingElement.scrollWidth>innerWidth}));note(`${name}.fullscreen`,fs1);
 await pg.keyboard.press('KeyM');await pause(700);
 const map=await pg.evaluate(()=>{const d=document.querySelector('[role=dialog]');if(!d)return null;const b=d.getBoundingClientRect();return{visible:b.width>0&&b.height>0,insideFullscreen:!document.fullscreenElement||document.fullscreenElement.contains(d)};});note(`${name}.mapInFullscreen`,map);
 await pg.screenshot({path:`${OUT}/${name}-fullscreen-map.png`});
 await pg.keyboard.press('Escape');
 // Software WebGL runs the 3D map at a few fps, so give the closing animation time.
 note(`${name}.escClosesMap`,await pg.waitForFunction(()=>!document.querySelector('[role=dialog]'),null,{timeout:4000}).then(()=>true,()=>false));
 note(`${name}.afterEsc`,await pg.evaluate(()=>({fullscreenElement:document.fullscreenElement?.tagName||null,immersive:document.body.classList.contains('immersive-play')})));
 if(mapId==='nereid'){await pg.mouse.click(640,400);await pause(400);note(`${name}.pointerLock`,await pg.evaluate(()=>document.pointerLockElement?.tagName||null));await pg.keyboard.press('Escape');}
 // Meeting transition while fullscreen: the host calls a meeting.
 if(!(await pg.evaluate(()=>!!document.fullscreenElement||document.body.classList.contains('immersive-play'))))await pg.click('.fullscreen-toggle');
 const state=await fetch(`${BASE}/api/game?code=${R.code}`,{headers:{Authorization:'Bearer '+R.host}}).then(r=>r.json()).catch(()=>null);
 await api(R.host,'/api/game',{action:'next',code:R.code,seq:state?.seq??R.seq}).catch(e=>note(`${name}.meetingError`,e.message));
 await pause(3500);await pg.screenshot({path:`${OUT}/${name}-meeting.png`});
 note(`${name}.meeting`,await pg.evaluate(()=>({fullscreenElement:document.fullscreenElement?.tagName||null,fieldGone:!document.querySelector('.field-game'),text:document.body.innerText.slice(0,160).replace(/\n/g,' ')})));
 note(`${name}.errors`,errors);bots.forEach(b=>b.stop());await ctx.close();return R;
}
if(want('aurora'))await fieldStep('aurora','aurora',16);
if(want('nereid'))await fieldStep('nereid','nereid',16);
if(want('host')){
 for(const mapId of ['aurora','nereid']){const R=await room({mapId,count:16});const bots=R.players.map(p=>bot(R.code,p,R.seq));const {pg,ctx,errors}=await page(R.host,R.code);
  await pg.waitForSelector('.host-viewport canvas,.field-viewport canvas',{timeout:90000});await pause(5000);await pg.screenshot({path:`${OUT}/host-${mapId}.png`});
  note(`host-${mapId}.view`,await pg.evaluate(()=>({hostBar:!!document.querySelector('.host-camera-bar'),fps:!!document.querySelector('.fps-viewport')})));note(`host-${mapId}.errors`,errors);bots.forEach(b=>b.stop());await ctx.close();}
}
if(want('solo')){
 const host=token();let r=await api(host,'/api/game',{action:'create',config:{mode:'field',mapId:'nereid',count:6}});const {pg,ctx,errors}=await page(host,r.code);
 await pg.getByRole('button',{name:/진행자 혼자 입장/}).click({timeout:30000});await pg.waitForSelector('.fps-surface canvas',{timeout:90000});await pause(4000);
 await pg.screenshot({path:`${OUT}/solo-nereid.png`});note('solo.view',await pg.evaluate(()=>({fps:!!document.querySelector('.fps-viewport'),role:document.body.innerText.includes('엔지니어')})));note('solo.errors',errors);await ctx.close();
}
if(want('mobile')){
 const R=await room({mapId:'aurora',count:8});const bots=R.players.slice(1).map(p=>bot(R.code,p,R.seq));
 for(const [label,vp] of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){const {pg,ctx,errors}=await page(R.players[0].key,R.code,{viewport:vp,mobile:true});
  await pg.waitForSelector('.field-viewport canvas',{timeout:90000});await pause(3500);await pg.click('.fullscreen-toggle');await pause(800);
  const layout=await pg.evaluate(()=>{const inside=sel=>{const e=document.querySelector(sel);if(!e)return null;const b=e.getBoundingClientRect();return b.left>=-1&&b.top>=-1&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1;};return{overflowX:document.scrollingElement.scrollWidth>innerWidth,joystick:inside('.joystick'),actions:inside('.field-actions'),toggle:inside('.fullscreen-toggle'),immersive:document.body.classList.contains('immersive-play')};});
  note(`mobile-${label}`,layout);await pg.screenshot({path:`${OUT}/mobile-${label}.png`});
  // Touch joystick drag moves the player.
  const box=await pg.locator('.joystick').boundingBox();const before=await pg.evaluate(()=>({...window.__fieldNet.visual}));
  if(box){await pg.mouse.move(box.x+box.width/2,box.y+box.height/2);await pg.mouse.down();await pg.mouse.move(box.x+box.width/2+30,box.y+box.height/2,{steps:4});await pause(900);await pg.mouse.up();await pause(400);}
  const after=await pg.evaluate(()=>({...window.__fieldNet.visual}));note(`mobile-${label}.stickMovePx`,+Math.hypot(after.x-before.x,after.y-before.y).toFixed(1));note(`mobile-${label}.errors`,errors);await ctx.close();}
 bots.forEach(b=>b.stop());
}
if(want('perf29')){
 for(const mapId of ['aurora','nereid']){const R=await room({mapId,count:29});const bots=R.players.slice(1).map(p=>bot(R.code,p,R.seq));const {pg,ctx,errors}=await page(R.players[0].key,R.code);
  await pg.waitForSelector(mapId==='nereid'?'.fps-surface canvas':'.field-viewport canvas',{timeout:120000});await pg.waitForFunction(()=>window.__fieldNet?.healthy(),null,{timeout:60000}).catch(()=>{});await pause(5000);
  note(`perf29-${mapId}`,await sampleMotion(pg,10000));await pg.screenshot({path:`${OUT}/perf29-${mapId}.png`});note(`perf29-${mapId}.errors`,errors);bots.forEach(b=>b.stop());await ctx.close();}
}
// Hitches: main-thread long tasks from page load through the first 12 s of play (a player
// rejoining straight into a running game, 20 players), time until the game screen shows and
// frame intervals after the first 4 s. Software WebGL: compare builds with it, not devices.
if(want('hitches')){
 const watch=()=>{window.__long=[];window.__raf=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push([e.startTime,e.duration]);}).observe({type:'longtask',buffered:true});}catch{}let last=0;const tick=t=>{if(last)window.__raf.push([t,t-last]);last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);};
 for(const mapId of ['nereid','aurora']){const R=await room({mapId,count:20});const bots=R.players.slice(1).map(p=>bot(R.code,p,R.seq));const {pg,ctx,errors}=await page(R.players[0].key,R.code,{query:'',init:watch});
  await pg.waitForSelector(mapId==='nereid'?'.fps-surface canvas':'.field-viewport canvas',{timeout:120000});const appear=await pg.evaluate(()=>performance.now());await pause(12000);
  const d=await pg.evaluate(()=>({long:window.__long,raf:window.__raf})),long=d.long.filter(([t])=>t>=appear-500&&t<appear+12000).map(([,v])=>v),raf=d.raf.filter(([t])=>t>appear+4000).map(([,v])=>v).sort((a,b)=>a-b),q=p=>Math.round(raf[Math.min(raf.length-1,Math.floor(p*raf.length))]||0);
  note(`hitches-${mapId}`,{gameScreenMs:Math.round(appear),longTasks:long.length,longTotalMs:Math.round(long.reduce((a,b)=>a+b,0)),longMaxMs:Math.round(Math.max(0,...long)),frameP50:q(.5),frameP95:q(.95),frameP99:q(.99)});note(`hitches-${mapId}.errors`,errors);bots.forEach(b=>b.stop());await ctx.close();}
}
fs.writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,1));await browser.close();process.exit(0);
