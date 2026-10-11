import { env } from 'cloudflare:workers';
import { type Room, actor, tick } from './game';
// D1 counts queries per Worker invocation and a WebSocket stays one invocation, so a live
// connection reconnects (seamlessly) before reaching this many statements.
export function liveQueryBudget(){const v=Number((env as unknown as {LIVE_D1_QUERY_BUDGET?:string}).LIVE_D1_QUERY_BUDGET);return Number.isFinite(v)&&v>=20?v:800;}
export function database() { const db = (env as unknown as { DB?: D1Database }).DB; if (!db) throw new Error('서버 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.'); return db.withSession('first-primary'); }
export async function hash(token: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)); return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join(''); }
export type RoomRow={state:string;version:number;expires:number};
// Plain columns mirrored from the JSON state on every write. Live movement writes are
// guarded by these instead of parsing the whole room JSON inside SQLite each time.
export function roomGate(r:Room){return `${r.phase}|${r.paused?1:0}|${r.seq}|${r.field?.epoch??-1}`;}
export function roomLocks(r:Room){const f=r.field;return '|'+[...Object.keys(f?.venting||{}),...Object.keys(f?.watching||{})].join('|')+'|';}
export const ROOM_WRITE_SQL='UPDATE mafia_rooms SET state = ?, version = version + 1, live_gate = ?, live_locks = ? WHERE code = ? AND version = ?';
export function roomWrite(db:ReturnType<typeof database>,r:Room,code:string,version:number){return db.prepare(ROOM_WRITE_SQL).bind(JSON.stringify(r),roomGate(r),roomLocks(r),code,version);}
export type RoomSeed={row:RoomRow;db:ReturnType<typeof database>};
export async function mutate(code: string, key: string | null, fn?: (r:Room)=>void, seed?:RoomSeed) {
  const db = seed?.db||database();
  for (let attempt = 0; attempt < 48; attempt++) {
    const row = attempt===0&&seed?seed.row:await db.prepare('SELECT state, version, expires FROM mafia_rooms WHERE code = ?').bind(code).first<RoomRow>();
    if (!row || row.expires < Date.now()) throw new Error('방을 찾을 수 없거나 만료되었습니다. 코드를 확인해 주세요.');
    const r:Room = JSON.parse(row.state); r.revision = row.version; if (key) actor(r,key);
    const changed = tick(r); if (fn) fn(r);
    if (!changed && !fn) return r;
    r.revision = row.version + 1;
    const result = await roomWrite(db,r,code,row.version).run();
    if (result.meta.changes === 1) return r;
    await new Promise(resolve => setTimeout(resolve, Math.random() * 45));
  }
  throw new Error('요청이 몰리고 있습니다. 잠시 후 다시 눌러 주세요.');
}
