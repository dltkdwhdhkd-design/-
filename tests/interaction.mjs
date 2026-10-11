import assert from 'node:assert/strict';
import {reachAmount,CONTACT_MS} from '../lib/interaction.ts';
import {newRoom,defaults,act} from '../lib/game.ts';
import {fieldAct,poseFor} from '../lib/field.ts';
import {emergencyFor} from '../lib/map.ts';
assert.equal(reachAmount(0),0);assert.equal(reachAmount(CONTACT_MS),1);assert.equal(reachAmount(350),1);assert.equal(reachAmount(620),0);for(let t=0;t<700;t++)assert.ok(reachAmount(t)>=0&&reachAmount(t)<=1);
const now=1000000,r=newRoom('ABC234','host',{...defaults,mapId:'nereid',mode:'field'},now);act(r,'host',{action:'soloStart',seq:r.seq},now);const p=r.players[0],button=emergencyFor(r.config),pose={...poseFor(r,p,[],now),...button};
assert.throws(()=>fieldAct(r,'host',{action:'emergency',seq:r.seq},[{...pose,x:button.x+500}],now+21000));assert.throws(()=>fieldAct(r,'host',{action:'emergency',seq:r.seq},[pose],now+1000));fieldAct(r,'host',{action:'emergency',seq:r.seq},[pose],now+21000);assert.equal(r.phase,'discussion');
console.log('PASS contact timing, return animation, real emergency distance/cooldown validation and meeting transition.');
