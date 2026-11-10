import type {MapContext} from './map.ts';
import {HISTORY_SQL} from './lag-compensation.ts';
import {consumeInputs} from './motion.ts';
import {locationAt} from './map.ts';
import type {Pose} from './field.ts';
// A client checkpoint is only a proposal. The database must match every field before writing.
export function proposeMotion(raw:unknown,inputs:unknown,now:number,count:MapContext):Pose|null{
 const b=raw as Pose;if(!b||typeof b.id!=='string'||b.id.length>80||!Array.isArray(inputs)||!inputs.length||inputs.length>200)return null;
 for(const k of ['x','y','at','seq','ack','clock','warp'] as const)if(!Number.isFinite(b[k]))return null;
 if(!Number.isSafeInteger(b.ack)||!Number.isSafeInteger(b.seq)||b.at>now+100||b.clock!>now+100||Math.abs(b.x)>6000||Math.abs(b.y)>4000)return null;
 const next=consumeInputs({...b,ack:b.ack!,clock:b.clock!},inputs,now,count);if(next.ack===b.ack)return null;
 const place=locationAt(next,count);return{...next,id:b.id,at:Math.max(now,b.at+1),seq:b.seq,warp:b.warp||0,place,previous:place!==b.place?b.place:b.previous};
}
// A live WebSocket connection holds a lease on its player's movement (owner/owner_at,
// refreshed at least every second). HTTP may only move a player whose lease has lapsed,
// so the two transports never fight over the same row.
export const LIVE_LEASE_MS=2500;
export const HTTP_MOVE_ALLOWED=`(field_positions.owner IN ('','http') OR field_positions.owner_at<?)`;
// D1 checks identity, phase, live map size, movement locks, warp and exact saved checkpoint atomically.
// Bind: x,y,at,ack,clock,place,place,now, code,player,bx,by,bat,bseq,back,bclock,bwarp, now,key,seq,count,map, leaseCutoff
export const MOVE_CHECKPOINT_SQL=`UPDATE field_positions SET history=${HISTORY_SQL},x=?,y=?,at=?,ack=?,clock=?,previous=CASE WHEN place<>? THEN place ELSE previous END,place=?,owner='http',owner_at=?
 WHERE code=? AND player=? AND x=? AND y=? AND at=? AND seq=? AND ack=? AND clock=? AND warp=?
 AND EXISTS (SELECT 1 FROM mafia_rooms r,json_each(r.state,'$.players') p
 WHERE r.code=field_positions.code AND r.expires>? AND json_extract(p.value,'$.id')=field_positions.player AND json_extract(p.value,'$.key')=?
 AND json_extract(r.state,'$.phase')='field' AND json_extract(r.state,'$.paused')=0
 AND json_extract(r.state,'$.seq')=? AND json_extract(r.state,'$.field.epoch')=field_positions.seq AND json_extract(r.state,'$.config.count')=? AND COALESCE(json_extract(r.state,'$.config.mapId'),'aurora')=?
 AND NOT EXISTS (SELECT 1 FROM json_each(r.state,'$.field.venting') v WHERE v.key=field_positions.player)
 AND NOT EXISTS (SELECT 1 FROM json_each(r.state,'$.field.watching') w WHERE w.key=field_positions.player)
 AND NOT EXISTS (SELECT 1 FROM json_each(r.state,'$.field.warps') w WHERE w.key=field_positions.player AND json_extract(w.value,'$.at')>field_positions.warp))
 AND ${HTTP_MOVE_ALLOWED}`;
