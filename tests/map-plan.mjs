import assert from 'node:assert/strict';
import {mapFor,floor,roomFloors,emergencyFor} from '../lib/map.ts';
import {doorways} from '../lib/map-render.ts';
import {planFor} from '../lib/map-plan.ts';
// The full map (M) is drawn from the collision geometry, so it must show exactly where players
// can walk: every wall on the map is a border between floor and no floor, every border players
// bump into is a wall on the map, every doorway joins a room and a corridor.
const inside=(p,rects)=>rects.some(r=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h);
let checked=0;
for(const mapId of ['aurora','nereid'])for(const count of [8,16,24,29]){
 const config={mapId,count},map=mapFor(config),plan=planFor(config),label=`${mapId} ${count}`;
 assert.equal(plan.rooms.length,map.locations.length,label);
 // Corridors carry SVG rect attributes (the old map spread {x,y,w,h}, which SVG ignores, so no
 // corridor was ever drawn).
 for(const c of plan.corridors)assert.ok(c.width>0&&c.height>0,`${label}: corridor size`);
 // Walls: floor on exactly one side of every wall segment.
 for(const e of plan.walls){const vertical=e.x1===e.x2,len=vertical?e.y2-e.y1:e.x2-e.x1;assert.ok(len>0,label);for(const t of [.2,.5,.8]){const m={x:e.x1+(e.x2-e.x1)*t,y:e.y1+(e.y2-e.y1)*t},a=floor(vertical?{x:m.x-3,y:m.y}:{x:m.x,y:m.y-3},config),b=floor(vertical?{x:m.x+3,y:m.y}:{x:m.x,y:m.y+3},config);assert.notEqual(a,b,`${label}: wall ${JSON.stringify(e)} is not on a floor border`);}}
 // Every floor border (sampled on a grid) is covered by a wall on the map.
 const onWall=(p,q)=>plan.walls.some(e=>e.x1===e.x2?(Math.min(p.x,q.x)<=e.x1&&Math.max(p.x,q.x)>=e.x1&&p.y>=e.y1&&p.y<=e.y2):(Math.min(p.y,q.y)<=e.y1&&Math.max(p.y,q.y)>=e.y1&&p.x>=e.x1&&p.x<=e.x2));
 for(let y=7;y<map.height;y+=23)for(let x=7;x<map.width;x+=23){const p={x,y};if(!floor(p,config))continue;for(const q of [{x:x+11,y},{x,y:y+11},{x:x-11,y},{x,y:y-11}])if(!floor(q,config)){assert.ok(onWall(p,q),`${label}: border at ${x},${y} has no wall on the map`);checked++;}}
 // Doorways open from a room floor onto a corridor.
 const doors=doorways(map);assert.ok(doors.length>=map.locations.length,label);
 for(const d of doors){const m=(d.a+d.b)/2,into=d.edge===(d.vertical?d.room.x:d.room.y)?1:-1,a=d.vertical?{x:d.edge+into*6,y:m}:{x:m,y:d.edge+into*6},b=d.vertical?{x:d.edge-into*6,y:m}:{x:m,y:d.edge-into*6};assert.ok(inside(a,roomFloors(d.room)),`${label}: door inside ${d.room.id}`);assert.ok(inside(b,map.corridors),`${label}: door outside ${d.room.id}`);}
 // Every room is reachable through at least one doorway.
 for(const r of map.locations)assert.ok(doors.some(d=>d.room===r),`${label}: ${r.id} has a door`);
 // Room labels stay on the map and never cover another room's floor.
 for(const [i,r] of plan.rooms.entries()){const room=map.locations[i];assert.equal(r.id,room.id);assert.ok(r.label.x>0&&r.label.x<map.width&&r.label.y>0&&r.label.y<map.height,`${label}: ${r.id} label on map`);for(const other of map.locations)if(other!==room)assert.ok(!inside(r.label,roomFloors(other)),`${label}: ${r.id} label over ${other.id}`);}
 // Nereid room numbers follow the 3D signs (01, 02, ...), the emergency button is on the floor.
 assert.deepEqual(plan.rooms.map(r=>r.number),map.locations.map((_,i)=>String(i+1).padStart(2,'0')));
 assert.ok(floor(emergencyFor(config),config),label);
}
assert.ok(checked>1000);
console.log(`PASS: full map plan matches the collision floors on Aurora/Nereid at 8-29 players (walls on every border, ${checked} border samples, doorways join rooms and corridors, labels clear of other rooms).`);
