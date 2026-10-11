import assert from 'node:assert/strict';
import {newRoom,configOf} from '../lib/game.ts';
import {initField,resumeField,fieldAct} from '../lib/field.ts';
const now=1000000;
function fixture(){const r=newRoom('ABC234','host',configOf({mode:'field',count:6}),now);r.players=Array.from({length:6},(_,i)=>({id:`p${i}`,key:`k${i}`,name:`학생${i}`,avatar:i,role:i?'crewmate':'impostor',alive:true,ready:true,connected:false,used:false,shield:true,publicRole:false,intel:[]}));initField(r,now);resumeField(r,now);r.field.cooldowns={};const poses=r.players.map(p=>({id:p.id,x:p.id==='p1'?1160:1000,y:940,at:now,seq:r.seq,warp:0,ack:0,clock:now,previous:'중앙 홀',place:'중앙 홀'}));poses[1].history=JSON.stringify([{x:1060,y:940,at:now-500,warp:0,seq:r.seq}]);return{r,poses};}
let {r,poses}=fixture();assert.throws(()=>fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1'},poses,now));assert.throws(()=>fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-900},poses,now));fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-400},poses,now);assert.equal(r.players[1].alive,false);
({r,poses}=fixture());r.field.invisible.p1=now+2000;assert.throws(()=>fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-400},poses,now));
({r,poses}=fixture());r.field.venting.p1={vent:'x',until:now+2000};assert.throws(()=>fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-400},poses,now));
({r,poses}=fixture());poses[1].warp=now-100;assert.throws(()=>fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-400},poses,now));
({r,poses}=fixture());r.field.protects.p1=now+1000;fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-400},poses,now);assert.equal(r.players[1].alive,true);assert.equal(r.field.effects.at(-1).kind,'blocked');
// The rewind window is bounded even when history covers the rendered moment.
({r,poses}=fixture());poses[1].history=JSON.stringify([{x:1060,y:940,at:now-1600,warp:0,seq:r.seq},{x:1060,y:940,at:now-1000,warp:0,seq:r.seq}]);fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-1050},poses,now);assert.equal(r.players[1].alive,false,'inside the window');
({r,poses}=fixture());poses[1].history=JSON.stringify([{x:1060,y:940,at:now-1600,warp:0,seq:r.seq},{x:1060,y:940,at:now-1000,warp:0,seq:r.seq}]);assert.throws(()=>fieldAct(r,'k0',{action:'kill',seq:r.seq,target:'p1',targetAt:now-1150},poses,now),'beyond the window');
// v22: the attacker's view decides. The target was in range and in sight on the attacker's screen and has
// since stepped round a corner (out of sight now): the press still kills. Aimed at where the target is now
// (out of sight, out of range) it does not.
{const A={x:600,y:1040},H={x:670,y:1040},C={x:705.36,y:1075.36};
 const corner=()=>{const {r,poses}=fixture();poses[0]={...poses[0],...A};poses[1]={...poses[1],...C,at:now,history:JSON.stringify([{...H,at:now-1000,warp:0,seq:r.seq},{...H,at:now-400,warp:0,seq:r.seq}])};return{r,poses};};
 let t=corner();fieldAct(t.r,'k0',{action:'kill',seq:t.r.seq,target:'p1',targetAt:now-450},t.poses,now);assert.equal(t.r.players[1].alive,false,'kill what you saw');
 t=corner();assert.throws(()=>fieldAct(t.r,'k0',{action:'kill',seq:t.r.seq,target:'p1',targetAt:now},t.poses,now),'no kill through the wall');}
console.log('PASS: attack uses validated recent rendered target position (kills what the attacker saw, even round a corner since); expired rewind, invisibility, vents and warp history rejected; current protection still blocks.');
