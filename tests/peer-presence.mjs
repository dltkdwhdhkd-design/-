import assert from 'node:assert/strict';
import {updatePresence,retainedPeers,presenceOpacity} from '../lib/peer-presence.ts';
import {pushRemote,sampleRemote} from '../lib/remote-motion.ts';
import {drawCharacter} from '../lib/characters.ts';
const cache={},peer={id:'p1',x:1120,y:940,alive:true,at:10000,warp:0},own={x:1100,y:940};
updatePresence(cache,[peer],0);let track=pushRemote(undefined,peer,0);sampleRemote(track,0,16);
updatePresence(cache,[],100);assert.equal(retainedPeers(cache,150,own,350,16).length,1);assert.equal(presenceOpacity(cache.p1,150),1);assert.equal(retainedPeers(cache,321,own,350,16).length,0);assert.equal(retainedPeers(cache,150,{x:500,y:950},350,16).length,0);
// A brief visibility gap must not reset interpolation to the next packet's raw position.
updatePresence(cache,[{...peer,x:1160,at:10200}],250);track=pushRemote(track,{...peer,x:1160,at:10200},250);const before=track.rendered;const after=sampleRemote(track,250,16);
// v22: interpolation advances by real elapsed time (low-fps devices), so 250 ms without frames may move up to
// walking speed x1.3 for 250 ms (66 px) -- but along the interpolated path, never snapping to the raw packet.
assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<=1.3*205*.25&&Math.abs(after.x-1160)>5);assert.equal(cache.p1.missingAt,undefined);
updatePresence(cache,[],300,['p1']);assert.equal(cache.p1,undefined,'observed death, vanish or vent removes retained actor immediately');
updatePresence(cache,[peer],400);updatePresence(cache,[],500);updatePresence(cache,[],1800);assert.equal(cache.p1,undefined,'old visibility history expires');
let spriteDraws=0,fallbackDraws=0;
const ctx={save(){},restore(){},scale(){},rotate(){},beginPath(){},roundRect(){},fill(){fallbackDraws++;},arc(){},fillRect(){},fillText(){},drawImage(image){assert.ok(image.complete&&image.naturalWidth>0);spriteDraws++;}};
const loaded={complete:true,naturalWidth:1086},broken={complete:true,naturalWidth:0};
drawCharacter(ctx,[loaded,broken,broken],0,{phase:0,stride:0,face:1,attack:.5});assert.equal(spriteDraws,1,'failed knife or other character atlas must not hide a loaded character');
drawCharacter(ctx,[loaded,broken,broken],9,{phase:0,stride:0,face:1,attack:0});assert.ok(fallbackDraws>0,'loading or failed sprite must have a visible placeholder');
console.log('PASS: dropped visibility packet retains known actor briefly without new information; re-entry keeps bounded motion; death/vent/vanish and expiry clear history; one failed asset never hides all characters.');
