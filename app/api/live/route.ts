import {acceptLive} from '@/lib/live-server';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(req.headers.get('upgrade')?.toLowerCase()!=='websocket')return Response.json({error:'실시간 연결이 필요합니다.'},{status:426});
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return new Response('Forbidden',{status:403});
 const [client,server]=Object.values(new WebSocketPair());acceptLive(server);
 return new Response(null,{status:101,webSocket:client});
}
