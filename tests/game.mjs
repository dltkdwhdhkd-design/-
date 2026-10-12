import assert from 'node:assert/strict';
import { newRoom, defaults, distribution, addPlayer, act, next, view, tick } from '../lib/game.ts';
function setup(){const r=newRoom('ABC234','host',{...defaults,mode:'classic'});for(let i=0;i<16;i++){addPlayer(r,`p${i}`,`학생${i+1}`,i);act(r,`p${i}`,{action:'ready',ready:true});}act(r,'host',{action:'start',seq:r.seq});return r;}
function p(r,role){return r.players.find(x=>x.role===role)}
function doAct(r,x,action,target){act(r,x.key,{action,target,seq:r.seq,requestId:crypto.randomUUID()});}
function night(r){r.phase='night';r.day=2;r.actions={};}
for(let n=6;n<=29;n++){const d=distribution(n);assert.equal(Object.values(d).reduce((a,b)=>a+b),n);assert.ok(d.citizen>=0);}
assert.equal(distribution(16).mafia,3);assert.equal(distribution(16).spy,1);assert.equal(distribution(16).citizen,4);
let r=setup();assert.equal(r.phase,'reveal');assert.deepEqual(Object.fromEntries(Object.keys(distribution(16)).map(role=>[role,r.players.filter(p=>p.role===role).length])),distribution(16));
assert.ok(view(r,'host').players.every(p=>p.role===null));assert.equal(view(r,p(r,'citizen').key).players.filter(p=>p.role).length,1);assert.equal(view(r,p(r,'mafia').key).players.filter(p=>p.role).length,3);
assert.throws(()=>act(r,p(r,'citizen').key,{action:'next',seq:r.seq}));
next(r);doAct(r,p(r,'mafia'),'night',p(r,'soldier').id);next(r);assert.equal(p(r,'soldier').alive,true);assert.equal(p(r,'soldier').shield,false);
night(r);doAct(r,p(r,'mafia'),'night',p(r,'soldier').id);doAct(r,p(r,'doctor'),'night',p(r,'soldier').id);next(r);assert.equal(p(r,'soldier').alive,true);
night(r);doAct(r,p(r,'mafia'),'night',p(r,'soldier').id);next(r);assert.equal(p(r,'soldier').alive,false);assert.throws(()=>doAct(r,p(r,'soldier'),'vote',p(r,'mafia').id));
night(r);doAct(r,p(r,'spy'),'night',p(r,'mafia').id);doAct(r,p(r,'police'),'night',p(r,'spy').id);doAct(r,p(r,'detective'),'night',p(r,'police').id);doAct(r,p(r,'medium'),'night',p(r,'soldier').id);doAct(r,p(r,'priest'),'night',p(r,'soldier').id);next(r);
assert.ok(p(r,'spy').connected);assert.match(p(r,'police').intel.at(-1).text,/아닙니다/);assert.match(p(r,'detective').intel.at(-1).text,new RegExp(p(r,'spy').name));assert.match(p(r,'medium').intel.at(-1).text,/군인/);assert.equal(p(r,'soldier').alive,true);assert.equal(p(r,'soldier').shield,false);assert.ok(p(r,'priest').used);
night(r);doAct(r,p(r,'reporter'),'night',p(r,'mafia').id);next(r);assert.ok(p(r,'mafia').publicRole);assert.ok(p(r,'reporter').used);
night(r);act(r,p(r,'spy').key,{action:'chat',text:'비밀 접선',requestId:crypto.randomUUID()});assert.ok(view(r,p(r,'mafia').key).messages.some(m=>m.text==='비밀 접선'));assert.ok(!view(r,'host').messages.some(m=>m.text==='비밀 접선'));assert.ok(!view(r,p(r,'citizen').key).messages.some(m=>m.text==='비밀 접선'));
r=setup();r.phase='vote';const c=p(r,'citizen'),politician=p(r,'politician');doAct(r,politician,'vote',c.id);doAct(r,p(r,'mafia'),'vote',politician.id);assert.equal(view(r,'host').votes[c.id],2);next(r);assert.equal(r.candidate,c.id);assert.equal(r.phase,'defense');next(r);assert.equal(r.phase,'trial');for(const x of r.players.filter(x=>x.id!==c.id).slice(0,8))doAct(r,x,'trial','yes');next(r);assert.equal(c.alive,false);
r=setup();r.phase='trial';r.candidate=p(r,'politician').id;for(const x of r.players.filter(x=>x.id!==r.candidate).slice(0,8))doAct(r,x,'trial','yes');next(r);assert.ok(p(r,'politician').alive);assert.ok(p(r,'politician').publicRole);
r=setup();r.phase='night';r.deadline=100;assert.equal(tick(r,101),true);const seq=r.seq;assert.equal(tick(r,102),false);assert.equal(r.seq,seq);
r=setup();r.players.filter(x=>x.role==='mafia').forEach(x=>x.alive=false);night(r);next(r);assert.equal(r.winner,'town');assert.equal(r.phase,'finished');assert.ok(view(r,'host').players.every(p=>p.role));
r=setup();const keys=JSON.stringify(view(r,p(r,'citizen').key));assert.ok(!keys.includes('"key"'));assert.ok(!keys.includes('"processed"'));assert.ok(!keys.includes('"actions"'));
console.log('PASS: 6–29 role totals, 16-player allocation, hidden roles, host authorization, night defense/heal, spy contact, police/spy distinction, tracking, medium, resurrection, reporter, private chat, weighted nominations, trial majority, politician survival, clock, victory.');
