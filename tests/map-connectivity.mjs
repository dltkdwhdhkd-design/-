import assert from 'node:assert/strict';
import {mapFor,walkable,spawn,ventsFor,EMERGENCY,REPAIR} from '../lib/map.ts';
for(const count of [6,16,20,22,29]){
 const map=mapFor(count),step=20,start=spawn(0),key=(x,y)=>`${x},${y}`,seen=new Set([key(start.x,start.y)]),queue=[start];
 for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(!seen.has(k)&&walkable({x,y},count)){seen.add(k);queue.push({x,y});}}}
 for(const p of [...map.stations,...ventsFor(count),EMERGENCY,REPAIR])assert.ok(queue.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<30),`unreachable: ${count} ${p.id||JSON.stringify(p)}`);
 for(const vent of ventsFor(count)){assert.ok(vent.links.length>=1);for(const id of vent.links){const to=ventsFor(count).find(v=>v.id===id);assert.equal(to.network,vent.network);assert.ok(to.links.includes(vent.id));}}
 assert.equal(new Set(map.stations.map(s=>s.kind)).size,12);assert.equal(map.stations.length,map.locations.length*3);
 console.log(`PASS: ${count} players, ${map.locations.length} rooms, ${map.stations.length} consoles, ${map.tasksPerPlayer} tasks each; all consoles/vents connected through walkable corridors (${seen.size} grid points).`);
}
