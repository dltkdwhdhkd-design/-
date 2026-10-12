import {roomFloors} from './map.ts';
import type {Location,Point,Rect} from './map.ts';
export type FacilityMap={id?:string;width:number;height:number;locations:Location[];corridors:Rect[]};
type Edge={x1:number;y1:number;x2:number;y2:number};
function merge(intervals:number[][]){const result:number[][]=[];for(const pair of intervals.sort((a,b)=>a[0]-b[0])){const last=result.at(-1);if(last&&pair[0]<=last[1])last[1]=Math.max(last[1],pair[1]);else result.push([...pair]);}return result;}
// Only the outside boundary gets a wall: adjoining corridor pieces remain open.
export function floorEdges(rects:Rect[]):Edge[]{const result:Edge[]=[],seen=new Set<string>();for(const r of rects)for(const side of [0,1,2,3]){const vertical=side<2,edge=vertical?r.x+(side?r.w:0):r.y+(side===3?r.h:0),outside=edge+(side===0||side===2?-.1:.1),low=vertical?r.y:r.x,high=low+(vertical?r.h:r.w),covered=merge(rects.filter(n=>n!==r&&(vertical?outside>n.x&&outside<n.x+n.w:outside>n.y&&outside<n.y+n.h)).map(n=>[Math.max(low,vertical?n.y:n.x),Math.min(high,vertical?n.y+n.h:n.x+n.w)]).filter(([a,b])=>b>a));let cursor=low;for(const [a,b] of [...covered,[high,high]]){if(a>cursor){const e=vertical?{x1:edge,y1:cursor,x2:edge,y2:a}:{x1:cursor,y1:edge,x2:a,y2:edge},key=JSON.stringify(e);if(!seen.has(key)){seen.add(key);result.push(e);}}cursor=Math.max(cursor,b);}}return result;}
// Doorways: where a corridor crosses a room's outline, as [a,b] along that edge (the same
// intersections the collision floors produce). Used by the 2D floor art, the M map and the
// 3D door frames, so all three agree on where the doors are.
export type Doorway={room:Location;vertical:boolean;edge:number;a:number;b:number};
export function doorways(map:FacilityMap):Doorway[]{const result:Doorway[]=[];for(const r of map.locations)for(const side of [0,1,2,3]){const vertical=side<2,edge=vertical?r.x+(side?r.w:0):r.y+(side===3?r.h:0),low=vertical?r.y:r.x,high=low+(vertical?r.h:r.w);for(const [a,b] of merge(map.corridors.filter(c=>vertical?c.x<edge&&c.x+c.w>edge:c.y<edge&&c.y+c.h>edge).map(c=>[Math.max(low,vertical?c.y:c.x),Math.min(high,vertical?c.y+c.h:c.x+c.w)]).filter(([a,b])=>b>a)))result.push({room:r,vertical,edge,a,b});}return result;}
export function roomAtPoint(map:FacilityMap,p:Point){return map.locations.find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);}
export function viewForRoom(map:FacilityMap,id:string|null,width:number,height:number){const room=map.locations.find(r=>r.id===id);return room?{x:room.x+room.w/2,y:room.y+room.h/2,scale:Math.min((width-40)/(room.w+180),(height-100)/(room.h+180),1.8)}:{x:map.width/2,y:map.height/2,scale:Math.min((width-30)/map.width,(height-100)/map.height)};}
export function screenToWorld(p:Point,view:Point&{scale:number;width:number;height:number}):Point{return{x:view.x+(p.x-view.width/2)/view.scale,y:view.y+(p.y-view.height/2)/view.scale};}
export function drawFacility(ctx:CanvasRenderingContext2D,map:FacilityMap,rooms:CanvasImageSource|null){
 if(map.id==='nereid'){drawMarineFacility(ctx,map);return;}
 ctx.clearRect(0,0,map.width,map.height);ctx.fillStyle='#080f1a';ctx.fillRect(0,0,map.width,map.height);
 const edges=floorEdges([...map.locations.flatMap(roomFloors),...map.corridors]);ctx.beginPath();for(const e of edges){ctx.moveTo(e.x1,e.y1+9);ctx.lineTo(e.x2,e.y2+9);}ctx.lineWidth=26;ctx.lineJoin='round';ctx.strokeStyle='#020711';ctx.stroke();
 for(const r of map.locations){ctx.save();ctx.beginPath();for(const f of roomFloors(r))ctx.rect(f.x,f.y,f.w,f.h);ctx.clip();ctx.fillStyle='#193140';ctx.fillRect(r.x,r.y,r.w,r.h);if(rooms){const ys=[0,390,787,1254],row=Math.floor(r.tile/3);ctx.drawImage(rooms,(r.tile%3)*418,ys[row],418,ys[row+1]-ys[row],r.x,r.y,r.w,r.h);}ctx.fillStyle=r.color+'0c';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.restore();}
 ctx.save();ctx.beginPath();for(const c of map.corridors)ctx.rect(c.x,c.y,c.w,c.h);ctx.fillStyle='#233947';ctx.fill();ctx.clip();ctx.strokeStyle='#69849425';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<map.width;x+=48){ctx.moveTo(x,0);ctx.lineTo(x,map.height);}for(let y=0;y<map.height;y+=48){ctx.moveTo(0,y);ctx.lineTo(map.width,y);}ctx.stroke();ctx.strokeStyle='#9ac6d553';ctx.lineWidth=2;ctx.setLineDash([12,18]);for(const c of map.corridors)if(Math.max(c.w,c.h)>180){ctx.beginPath();if(c.w>c.h){ctx.moveTo(c.x+20,c.y+c.h/2);ctx.lineTo(c.x+c.w-20,c.y+c.h/2);}else{ctx.moveTo(c.x+c.w/2,c.y+20);ctx.lineTo(c.x+c.w/2,c.y+c.h-20);}ctx.stroke();}ctx.restore();
 // Door thresholds use the same corridor intersections as collision geometry.
 for(const {room:r,vertical,edge,a,b} of doorways(map)){ctx.fillStyle='#293f4c';if(vertical)ctx.fillRect(edge-26,a,52,b-a);else ctx.fillRect(a,edge-26,b-a,52);ctx.fillStyle=r.color;if(vertical){ctx.fillRect(edge-29,a,58,5);ctx.fillRect(edge-29,b-5,58,5);}else{ctx.fillRect(a,edge-29,5,58);ctx.fillRect(b-5,edge-29,5,58);}ctx.strokeStyle='#aecbd34a';ctx.lineWidth=2;ctx.beginPath();if(vertical){ctx.moveTo(edge,a+10);ctx.lineTo(edge,b-10);}else{ctx.moveTo(a+10,edge);ctx.lineTo(b-10,edge);}ctx.stroke();}
 ctx.beginPath();for(const e of edges){ctx.moveTo(e.x1,e.y1);ctx.lineTo(e.x2,e.y2);}ctx.strokeStyle='#0d1c29';ctx.lineWidth=12;ctx.stroke();ctx.strokeStyle='#637f8b';ctx.lineWidth=3;ctx.stroke();
}
export function drawRoomLabel(ctx:CanvasRenderingContext2D,r:Location,scale:number,overview=false,count?:number){const size=overview?Math.max(22,12/scale):18;ctx.font=`bold ${size}px Arial,"Malgun Gothic",sans-serif`;const text=r.name+(count===undefined?'':` · ${count}`),w=ctx.measureText(text).width+36,h=size+20,x=r.x+r.w/2-w/2,y=r.y+14;ctx.fillStyle='#07141eed';ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.fill();ctx.fillStyle=r.color;ctx.fillRect(x,y+7,4,h-14);ctx.textAlign='center';ctx.fillText(text,r.x+r.w/2,y+size+4);}
let facilityBuffer:{map:FacilityMap;canvas:HTMLCanvasElement;painted:boolean}|null=null;
// All live camera panels share the same background buffer rather than allocating one per feed.
export function facilityLayer(map:FacilityMap,rooms?:HTMLImageElement){if(!facilityBuffer||facilityBuffer.map!==map){const canvas=document.createElement('canvas');canvas.width=map.width;canvas.height=map.height;drawFacility(canvas.getContext('2d')!,map,null);facilityBuffer={map,canvas,painted:false};}if(rooms?.complete&&rooms.naturalWidth&&!facilityBuffer.painted){drawFacility(facilityBuffer.canvas.getContext('2d')!,map,rooms);facilityBuffer.painted=true;}return facilityBuffer.canvas;}

// Nereid uses open-water research pavilions and timber bridges, never the Aurora room atlas.
function drawMarineFacility(ctx:CanvasRenderingContext2D,map:FacilityMap){
 const sea=ctx.createLinearGradient(0,0,map.width,map.height);sea.addColorStop(0,'#073b51');sea.addColorStop(.6,'#092b43');sea.addColorStop(1,'#061c33');ctx.fillStyle=sea;ctx.fillRect(0,0,map.width,map.height);
 ctx.strokeStyle='#64d5dc15';ctx.lineWidth=2;for(let y=30;y<map.height;y+=72){ctx.beginPath();for(let x=0;x<map.width;x+=12){const yy=y+Math.sin(x/120+y)*9;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.stroke();}
 const floors=[...map.locations.flatMap(roomFloors),...map.corridors],edges=floorEdges(floors);
 ctx.beginPath();for(const e of edges){ctx.moveTo(e.x1,e.y1+12);ctx.lineTo(e.x2,e.y2+12);}ctx.lineWidth=28;ctx.strokeStyle='#001623a0';ctx.stroke();
 ctx.save();ctx.beginPath();for(const c of map.corridors)ctx.rect(c.x,c.y,c.w,c.h);ctx.fillStyle='#766b55';ctx.fill();ctx.clip();ctx.strokeStyle='#aa997245';ctx.lineWidth=2;ctx.beginPath();for(let y=0;y<map.height;y+=20){ctx.moveTo(0,y);ctx.lineTo(map.width,y);}for(let x=0;x<map.width;x+=80){ctx.moveTo(x,0);ctx.lineTo(x,map.height);}ctx.stroke();ctx.restore();
 for(const [i,r] of map.locations.entries()){
  ctx.fillStyle=['#284e5b','#304963','#3c465f','#42564c'][i%4];ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.strokeStyle='#b9eee01c';ctx.lineWidth=1;ctx.beginPath();for(let x=r.x+24;x<r.x+r.w;x+=48){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.h);}for(let y=r.y+24;y<r.y+r.h;y+=48){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.w,y);}ctx.stroke();
  ctx.strokeStyle=r.color+'65';ctx.lineWidth=3;ctx.strokeRect(r.x+18,r.y+18,r.w-36,r.h-36);
  ctx.fillStyle=r.color+'12';ctx.beginPath();ctx.arc(r.x+r.w/2,r.y+r.h/2,Math.min(r.w,r.h)*.3,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=r.color+'55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(r.x+r.w/2,r.y+r.h/2,44,0,Math.PI*2);ctx.moveTo(r.x+r.w/2-60,r.y+r.h/2);ctx.lineTo(r.x+r.w/2+60,r.y+r.h/2);ctx.moveTo(r.x+r.w/2,r.y+r.h/2-60);ctx.lineTo(r.x+r.w/2,r.y+r.h/2+60);ctx.stroke();
  // Flush wall displays decorate the pavilion without implying solid obstacles.
  for(let k=0;k<3;k++){const x=r.x+r.w-104,y=r.y+72+k*55;ctx.fillStyle='#102f40';ctx.fillRect(x,y,76,38);ctx.fillStyle=r.color+'90';ctx.fillRect(x+7,y+7,4,24);ctx.fillStyle='#b3e6df55';ctx.fillRect(x+20,y+9,44,3);ctx.fillRect(x+20,y+19,28,3);}
  ctx.font='bold 14px monospace';ctx.fillStyle='#c2e7df66';ctx.textAlign='left';ctx.fillText('NEREID / '+String(i+1).padStart(2,'0'),r.x+30,r.y+r.h-26);
 }
 ctx.beginPath();for(const e of edges){ctx.moveTo(e.x1,e.y1);ctx.lineTo(e.x2,e.y2);}ctx.lineWidth=12;ctx.strokeStyle='#153242';ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='#87c9c4';ctx.stroke();
}
