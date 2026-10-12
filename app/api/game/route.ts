import { act, addPlayer, configOf, newRoom, view } from '@/lib/game';
import { database, hash, mutate, roomGate, roomLocks } from '@/lib/store';
const headers = { 'Cache-Control':'no-store, private', 'Vary':'Authorization', 'X-Content-Type-Options':'nosniff' };
const reply = (body:unknown,status=200) => Response.json(body,{status,headers});
function tokenOf(req:Request) { const t = (req.headers.get('authorization') || '').replace(/^Bearer /,''); if (!/^[a-f0-9]{64}$/.test(t)) throw new Error('입장 정보가 없습니다. 다시 접속해 주세요.'); return t; }
function roomCode(s:unknown) { const c = String(s || '').toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(c)) throw new Error('6자리 방 코드를 확인해 주세요.'); return c; }
export async function GET(req:Request) { try { const code = roomCode(new URL(req.url).searchParams.get('code')); const key = await hash(tokenOf(req)); return reply(view(await mutate(code,key),key)); } catch(e) { return reply({error:e instanceof Error ? e.message : '연결 오류가 발생했습니다.'},400); } }
export async function POST(req:Request) {
  try {
    const origin=req.headers.get('origin'); if(origin && origin!==new URL(req.url).origin) return reply({error:'잘못된 요청입니다.'},403);
    const raw = await req.text(); if (raw.length > 4000) return reply({error:'요청이 너무 큽니다.'},413);
    const b = JSON.parse(raw); const key = await hash(tokenOf(req));
    if (b.action === 'create') {
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>alphabet[x%alphabet.length]).join('');
      const r = newRoom(code,key,configOf(b.config || {}));
      await database().prepare('INSERT INTO mafia_rooms (code,state,version,expires,live_gate,live_locks) VALUES (?,?,0,?,?,?)').bind(code,JSON.stringify(r),Date.now()+86400000,roomGate(r),roomLocks(r)).run();
      return reply(view(r,key));
    }
    const code=roomCode(b.code);
    const r= b.action==='join' ? await mutate(code,null,r=>addPlayer(r,key,String(b.name||''),Number(b.avatar))) : await mutate(code,key,r=>act(r,key,b));
    return reply(view(r,key));
  } catch(e) { console.error('Game request:',e instanceof Error ? e.message : 'unknown'); return reply({error:e instanceof Error ? e.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.'},400); }
}
