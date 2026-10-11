import type {MapContext} from './map.ts';
import {distance,sight,type Point} from './map.ts';
export type HistoricPose=Point&{at:number;warp?:number;seq:number;history?:string|HistoricPose[]};
// How far back an attacker's rendered view may be honoured. It must cover the remote
// sample age plus the observer's interpolation delay (see lib/remote-motion.ts). With D1
// 170 ms away and players on different isolates the simulator measured a p95 render age of
// ~810 ms. A longer window only means more presses on a visible target succeed; it never delays a kill.
export const REWIND_MS=1100;
export const HISTORY_SQL="json_insert(CASE WHEN json_array_length(field_positions.history)>=12 THEN json_remove(field_positions.history,'$[0]') ELSE field_positions.history END,'$[#]',json_object('x',field_positions.x,'y',field_positions.y,'at',field_positions.at,'warp',field_positions.warp,'seq',field_positions.seq))";
export function rewindTarget(target:HistoricPose,at:unknown,now:number,count:MapContext):Point|null{
 if(typeof at!=='number'||!Number.isFinite(at)||at<now-REWIND_MS||at>now+50)return null;
 let history:HistoricPose[]=[];try{history=Array.isArray(target.history)?target.history:JSON.parse(target.history||'[]');}catch{return null;}
 if(!Array.isArray(history))return null;
 const samples=[...history,target].filter(p=>p.seq===target.seq&&(p.warp||0)===(target.warp||0)&&p.at>=now-REWIND_MS-600).sort((a,b)=>a.at-b.at);
 if(!samples.length||at<samples[0].at||at>target.at+50)return null;
 if(at>=target.at)return target;
 for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i];if(at>b.at)continue;if(!sight(a,b,count)||distance(a,b)>205*1.5*(b.at-a.at)/1000+12)return null;const u=(at-a.at)/(b.at-a.at);return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};}return null;
}
