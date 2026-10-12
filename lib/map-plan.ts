import {mapFor,roomFloors,roomOutline,emergencyFor,type Location,type MapContext,type Point} from './map.ts';
import {floorEdges,doorways,type FacilityMap} from './map-render.ts';
import {securityConsole,camerasFor} from './surveillance.ts';
// Floor plan for the full map (M): the walkable shapes, their outside walls and the doorways,
// all from the collision geometry, so the map shows exactly the space players walk in.
// Corridors carry SVG rect attributes (width/height). Room names sit where the game shows
// them, clear of the device points: Aurora inside the room, at the top like the in-game label
// when free; Nereid rooms are full of consoles, so the name goes just outside the building
// like a sign, or at the clearest spot inside when bridges surround it.
type Box={x1:number;y1:number;x2:number;y2:number};
const gap=(a:Box,b:Box)=>Math.max(a.x1-b.x2,b.x1-a.x2,a.y1-b.y2,b.y1-a.y2);
export function mapPlan(map:FacilityMap,points:Point[]=[]){const floors=[...map.locations.flatMap(roomFloors),...map.corridors],marks=points.map(p=>({x1:p.x-50,y1:p.y-50,x2:p.x+50,y2:p.y+50})),sea=map.id==='nereid';
 const label=(r:Location)=>{const w=Math.max(80,[...r.name].reduce((n,c)=>n+(c===' '?14:45),0))+16,h=sea?124:60;const clear=(box:Box)=>Math.min(Infinity,...marks.map(m=>gap(box,m))),open=(box:Box)=>box.x1>0&&box.y1>0&&box.x2<map.width&&box.y2<map.height&&floors.every(f=>gap(box,{x1:f.x,y1:f.y,x2:f.x+f.w,y2:f.y+f.h})>=8);
  if(!sea){let best={x:r.x+r.w/2,y:r.y+h/2+16,clear:-Infinity};const inside=(x:number,y:number)=>roomFloors(r).some(f=>x>=f.x+8&&x<=f.x+f.w-8&&y>=f.y+8&&y<=f.y+f.h-8);
   for(const y of [r.y+h/2+16,r.y+r.h-h/2-16,r.y+r.h/2])for(const fx of [.5,.3,.7,.22,.78]){const x=r.x+r.w*fx,box={x1:x-w/2,y1:y-h/2,x2:x+w/2,y2:y+h/2};if(!inside(box.x1,box.y1)||!inside(box.x2,box.y1)||!inside(box.x1,box.y2)||!inside(box.x2,box.y2))continue;const c=clear(box);if(c>=10)return{x,y};if(c>best.clear)best={x,y,clear:c};}
   return{x:best.x,y:best.y};}
  const outside=[[r.x+r.w/2,r.y-h/2-14],[r.x+r.w/2,r.y+r.h+h/2+14],[r.x+w/2,r.y-h/2-14],[r.x+r.w-w/2,r.y-h/2-14],[r.x+w/2,r.y+r.h+h/2+14],[r.x+r.w-w/2,r.y+r.h+h/2+14],[r.x-w/2-14,r.y+r.h/2],[r.x+r.w+w/2+14,r.y+r.h/2]];
  for(const [x,y] of outside)if(open({x1:x-w/2,y1:y-h/2,x2:x+w/2,y2:y+h/2}))return{x,y};
  let best={x:r.x+r.w/2,y:r.y+r.h/2,clear:-Infinity};for(const fy of [.24,.5,.78])for(const fx of [.5,.3,.7]){const x=r.x+r.w*fx,y=Math.min(Math.max(r.y+r.h*fy,r.y+h/2+12),r.y+r.h-h/2-12),c=clear({x1:x-w/2,y1:y-h/2,x2:x+w/2,y2:y+h/2});if(c>best.clear)best={x,y,clear:c};}
  return{x:best.x,y:best.y};};
 return{rooms:map.locations.map((r,i)=>({id:r.id,name:r.name,color:r.color,number:String(i+1).padStart(2,'0'),path:roomOutline(r),label:label(r)})),corridors:map.corridors.map(c=>({x:c.x,y:c.y,width:c.w,height:c.h})),walls:floorEdges(floors),doors:doorways(map)};}
// The plan for a game's map, avoiding the devices that are always on the map (consoles,
// emergency button, CCTV monitor, cameras). Built once per map.
export type MapPlan=ReturnType<typeof mapPlan>;
const plans=new WeakMap<FacilityMap,MapPlan>();
export function planFor(context:MapContext){const map=mapFor(context);let plan=plans.get(map);if(!plan){plan=mapPlan(map,[...map.stations,emergencyFor(context),securityConsole(context),...camerasFor(context).map(c=>c.mount)]);plans.set(map,plan);}return plan;}
