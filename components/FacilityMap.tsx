'use client';
import type {ReactNode} from 'react';
import type {FacilityMap as Facility} from '@/lib/map-render';
import type {MapPlan} from '@/lib/map-plan';
import type {Point} from '@/lib/map';
// Full map (M). Everything is drawn in world coordinates from the collision geometry
// (mapPlan): room and bridge floors, the walls players bump into, the doorways, and markers at
// the exact points the devices stand on. Room names go on top of markers (with a halo) and
// the player on top of everything. Room numbers (Nereid) match the room signs in the 3D view.
export type MapMarker={id:string;x:number;y:number;color:string;text:string;label?:string;ring?:boolean;onClick?:()=>void};
type Props={map:Facility;plan:MapPlan;me:Point;yaw:number|null;here?:string;devices?:Point[];markers:MapMarker[];onRoom?:(id:string)=>void;children?:ReactNode;label:string};
const plank=(id:string,vertical:boolean)=><pattern id={id} width={vertical?200:34} height={vertical?34:200} patternUnits="userSpaceOnUse"><rect width={vertical?200:34} height={vertical?34:200} fill="#8f7a58"/><path d={vertical?'M0 33H200':'M33 0V200'} stroke="#5d4c35" strokeWidth={4}/><path d={vertical?'M0 12H200':'M12 0V200'} stroke="#a58d68" strokeWidth={2} opacity={.5}/></pattern>;
export default function FacilityMap({map,plan,me,yaw,here,devices=[],markers,onRoom,children,label}:Props){
 const sea=map.id==='nereid',walls=plan.walls.map(e=>`M${e.x1} ${e.y1}L${e.x2} ${e.y2}`).join(''),deg=yaw===null?0:yaw*180/Math.PI;
 return <svg viewBox={`0 0 ${map.width} ${map.height}`} className={`minimap ${sea?'minimap-sea':''}`} role="img" aria-label={label}>
  <defs>{plank('plank-x',true)}{plank('plank-y',false)}
   <pattern id="map-waves" width={260} height={120} patternUnits="userSpaceOnUse"><path d="M0 60q32-22 65 0t65 0 65 0 65 0" fill="none" stroke="#8fe6ee" strokeWidth={4} opacity={.13}/></pattern>
   <pattern id="map-grid" width={60} height={60} patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#9fd4e6" strokeWidth={2} opacity={.07}/></pattern>
   <radialGradient id="map-view"><stop offset="0" stopColor="#8adbff" stopOpacity={.55}/><stop offset="1" stopColor="#8adbff" stopOpacity={0}/></radialGradient></defs>
  <rect width={map.width} height={map.height} fill={sea?'#0f4658':'#0a121d'}/>{sea&&<rect width={map.width} height={map.height} fill="url(#map-waves)"/>}
  {plan.corridors.map((c,i)=><rect key={i} {...c} fill={sea?`url(#plank-${c.width>c.height?'x':'y'})`:'#2c4152'}/>)}
  {plan.rooms.map(r=><g key={r.id} className={onRoom?'host-map-room':undefined} role={onRoom?'button':undefined} tabIndex={onRoom?0:undefined} aria-label={onRoom?`${r.name} 확대 보기`:undefined} onClick={onRoom&&(()=>onRoom(r.id))} onKeyDown={onRoom&&(e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onRoom(r.id);}})}>
   <path d={r.path} fill={sea?'#28485a':'#1a2d3e'}/><path d={r.path} fill="url(#map-grid)"/><path d={r.path} fill={r.color} fillOpacity={r.id===here?.24:.1} stroke={r.color} strokeOpacity={r.id===here?.9:.35} strokeWidth={r.id===here?14:6}/></g>)}
  <path d={walls} fill="none" stroke={sea?'#d5eef0':'#a9c3d0'} strokeWidth={10} strokeLinecap="square"/>
  {plan.doors.map((d,i)=>{const t=22,len=12;return <g key={i} fill={d.room.color}>{d.vertical?<><rect x={d.edge-t/2} y={d.a} width={t} height={len}/><rect x={d.edge-t/2} y={d.b-len} width={t} height={len}/></>:<><rect x={d.a} y={d.edge-t/2} width={len} height={t}/><rect x={d.b-len} y={d.edge-t/2} width={len} height={t}/></>}</g>;})}
  {devices.map((d,i)=><rect key={i} x={d.x-26} y={d.y-20} width={52} height={40} rx={8} fill="#0e1d28" stroke="#86a9b4" strokeWidth={5} opacity={.75}/>)}
  {children}
  {markers.map(m=><g key={m.id} onClick={m.onClick} className={m.onClick?'map-marker-button':undefined} textAnchor="middle">{m.ring&&<circle cx={m.x} cy={m.y} r={58} fill="none" stroke={m.color} strokeWidth={8}/>}<circle cx={m.x} cy={m.y} r={34} fill={m.color} stroke="#0b1622" strokeWidth={6}/><text x={m.x} y={m.y+14} fontSize={40} fontWeight={700} fill="#0d1b26">{m.text}</text>{m.label&&<text x={m.x} y={m.y+84} fontSize={34} fill={m.color} stroke="#0b1622" strokeWidth={8} paintOrder="stroke">{m.label}</text>}</g>)}
  {plan.rooms.map(r=><g key={r.id} pointerEvents="none" textAnchor="middle">{sea&&<><circle cx={r.label.x} cy={r.label.y-30} r={31} fill={r.color}/><text x={r.label.x} y={r.label.y-18} fontSize={34} fontWeight={700} fill="#0d1b26">{r.number}</text></>}<text x={r.label.x} y={r.label.y+(sea?48:16)} fontSize={46} fontWeight={600} fill="#f1f6f8" stroke="#0b1622" strokeWidth={10} paintOrder="stroke">{r.name}</text></g>)}
  <g transform={`translate(${me.x} ${me.y})`}>{yaw!==null&&<g transform={`rotate(${deg})`}><path d="M0 0L-150 -260A300 300 0 0 1 150 -260Z" fill="url(#map-view)"/><path d="M0 -66L-20 -40H20Z" fill="#ffffff"/></g>}<circle r={36} fill="#8adbff" stroke="#ffffff" strokeWidth={8}/><text y={13} fontSize={36} fontWeight={700} textAnchor="middle" fill="#0d1b26">나</text></g>
 </svg>;
}
