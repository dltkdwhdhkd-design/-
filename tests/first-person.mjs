import assert from 'node:assert/strict';
import {cameraMovement,inFront,AVATAR_3D} from '../lib/first-person.ts';
import {stepInput} from '../lib/motion.ts';
import {mapFor,spawn,walkable,distance} from '../lib/map.ts';
import {floorEdges} from '../lib/map-render.ts';
import {configOf} from '../lib/game.ts';
assert.equal(AVATAR_3D.length,16);assert.equal(configOf({mapId:'nereid',viewMode:'fps'}).viewMode,'fps');assert.equal(configOf({}).viewMode,'topdown');
for(let deg=0;deg<360;deg+=15){const yaw=deg*Math.PI/180,v=cameraMovement({x:0,y:-1},yaw);assert.ok(Math.abs(Math.hypot(v.x,v.y)-1)<1e-10);assert.ok(inFront({x:0,y:0},{x:v.x*100,y:v.y*100},yaw));assert.ok(!inFront({x:0,y:0},{x:-v.x*100,y:-v.y*100},yaw));for(const count of [6,16,29]){const c={count,mapId:'nereid'},start=spawn(0,c);let p=start;for(let i=0;i<500;i++){p=stepInput(p,{n:i,dx:v.x,dy:v.y,ms:20},c);assert.ok(walkable(p,c),`${count}/${deg}: collision mismatch`);}assert.ok(distance(start,p)<=205*10+.001);}}
for(const count of [6,16,29]){const m=mapFor({count,mapId:'nereid'}),edges=floorEdges([...m.floors,...m.corridors]);assert.ok(edges.length>20);for(const e of edges){assert.ok(e.x1===e.x2||e.y1===e.y2);for(const n of Object.values(e))assert.ok(Number.isFinite(n));}}
console.log('PASS: 24 first-person headings × 3 map sizes × 500 server movement steps; forward/back target selection; 3D walls share server floor boundaries; default 2D preserved.');
