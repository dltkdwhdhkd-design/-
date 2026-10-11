import assert from 'node:assert/strict';
import {newRoom,configOf,next,view} from '../lib/game.ts';
import {initField,resumeField,fieldAct,fieldWin,progress} from '../lib/field.ts';
import {fieldDistribution,isImpostor,isNeutral,isCrew} from '../lib/field-roles.ts';
import {pushRemote,sampleRemote} from '../lib/remote-motion.ts';
const now=Date.now();
function fixture(roles){const r=newRoom('ABC234','host',configOf({mode:'field',count:roles.length}),now);r.players=roles.map((role,i)=>({id:`p${i}`,key:`k${i}`,name:`학생${i}`,avatar:i,role,alive:true,ready:true,connected:false,used:false,shield:true,publicRole:false,intel:[]}));initField(r,now);resumeField(r,now);r.field.cooldowns={};return r;}
const positions=r=>r.players.map(p=>({id:p.id,x:1000,y:900,at:now,seq:r.field.epoch,warp:0,ack:0,clock:now,place:'중앙 홀',previous:'중앙 홀'}));
for(let n=6;n<=29;n++){const d=fieldDistribution(n);assert.equal(Object.values(d).reduce((a,b)=>a+b,0),n);assert.ok(Object.values(d).every(x=>x>=0));assert.equal(Object.entries(d).filter(([k])=>isNeutral(k)).reduce((a,[,v])=>a+v,0),n-Math.ceil(n/2)-(n<=8?1:n<=12?2:n<=18?3:n<=24?4:5));}
for(let n=6;n<=29;n++){const d=fieldDistribution(n);assert.equal(Object.entries(d).filter(([k])=>isCrew(k)).reduce((a,[,v])=>a+v,0),Math.ceil(n/2));assert.ok(d.lonewolf<=1);}
assert.equal(fieldDistribution(16).jester,1);assert.equal(fieldDistribution(16).scavenger,1);assert.equal(fieldDistribution(16).lonewolf,1);
let r=fixture(['impostor','jester','scavenger','lonewolf','crewmate','crewmate']);assert.equal(progress(r).total,12);assert.equal(fieldWin(r,now),false);
r.phase='vote';r.votes={p0:'p1',p2:'p1',p3:'p1'};next(r,now);assert.equal(r.winner,'neutral');assert.deepEqual(r.winnerIds,['p1']);assert.ok(r.events.some(e=>e.text.includes('임포스터가 아니었습니다')));
r=fixture(['impostor','jester','crewmate','crewmate','crewmate','crewmate']);fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1'},positions(r),now);assert.equal(r.winner,null);assert.equal(r.field.guardians.includes('p1'),false);
r=fixture(['impostor','scavenger','crewmate','crewmate','crewmate','crewmate']);r.field.bodies=[{id:'p2',x:1000,y:900,at:now},{id:'p3',x:1000,y:900,at:now}];r.players[2].alive=false;r.players[3].alive=false;
fieldAct(r,'k1',{action:'collect',seq:r.seq,target:'p2'},positions(r),now);assert.equal(r.field.collected.p1,1);assert.throws(()=>fieldAct(r,'k1',{action:'collect',seq:r.seq,target:'p3'},positions(r),now));
fieldAct(r,'k1',{action:'collect',seq:r.seq,target:'p3'},positions(r),now+15001);assert.equal(r.winner,'neutral');assert.deepEqual(r.winnerIds,['p1']);assert.equal(r.field.bodies.length,0);
r=fixture(['impostor','lonewolf','crewmate','crewmate','crewmate','crewmate']);r.players.slice(2).forEach(p=>p.alive=false);assert.equal(fieldWin(r,now),false);fieldAct(r,'k1',{action:'kill',seq:r.seq,target:'p0'},positions(r),now);assert.equal(r.winner,'neutral');assert.deepEqual(r.winnerIds,['p1']);
r=fixture(['impostor','lonewolf','crewmate','crewmate','crewmate','crewmate']);for(const p of r.players.filter(p=>!isImpostor(p.role)&&!isNeutral(p.role)))r.field.tasks[p.id].forEach(t=>t.done=true);assert.equal(fieldWin(r,now),true);assert.equal(r.winner,'town');
r=fixture(['impostor','impostor','scavenger','crewmate','crewmate','crewmate']);r.phase='vote';r.votes={p1:'p0',p2:'p0',p3:'p0'};next(r,now);assert.ok(r.announcement.includes('임포스터였습니다'));assert.equal(view(r,'k3').players[0].role,null);
r=fixture(['impostor','impostor','crewmate','crewmate','crewmate','crewmate']);r.config.confirmEject=false;r.phase='vote';r.votes={p1:'p0',p2:'p0',p3:'p0'};next(r,now);assert.ok(!r.announcement.includes('임포스터였습니다'));
r=fixture(['impostor','jester','jester','crewmate','crewmate','crewmate']);r.phase='vote';r.votes={p0:'p1',p3:'p1',p4:'p1'};next(r,now);assert.deepEqual(r.winnerIds,['p1']);
r=fixture(['impostor','scavenger','scavenger','crewmate','crewmate','crewmate']);r.players[3].alive=false;r.field.bodies=[{id:'p3',x:1000,y:900,at:now}];fieldAct(r,'k1',{action:'collect',seq:r.seq,target:'p3'},positions(r),now);assert.equal(r.field.collected.p1,1);assert.equal(r.field.collected.p2||0,0);assert.throws(()=>fieldAct(r,'k2',{action:'collect',seq:r.seq,target:'p3'},positions(r),now));
let track;for(let i=0;i<8;i++)track=pushRemote(track,{x:1000+i*20.5,y:900,at:now+i*100,warp:0,alive:true});let last=sampleRemote(track,now+200,6);for(let t=216;t<800;t+=16){const p=sampleRemote(track,now+t,6);assert.ok(Math.hypot(p.x-last.x,p.y-last.y)<4,'no packet jump');last=p;}assert.equal(pushRemote(track,{x:1800,y:900,at:now+900,warp:1,alive:true}).samples.length,1);
console.log('PASS: 6–29 balanced roles; all neutral win paths; mission priority; ghost restrictions; confirm-eject privacy/toggle; smooth remote movement and true warp reset.');
