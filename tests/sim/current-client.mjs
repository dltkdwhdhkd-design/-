// Simulator adapter around the shipped client netcode (lib/field-net.ts).
import {FieldNet} from '../../lib/field-net.ts';
import {isImpostor} from '../../lib/field-roles.ts';
import {spawn,distance} from '../../lib/map.ts';
export function createClient({index,code,token,room,http,metrics,wsUrl}){
 const c={index,code,token,hidden:false,intent:{x:0,y:0},alive:true};
 const seenBodies=new Set();
 const net=new FieldNet({code,token,room,spawn:spawn(index,room.config),liveUrl:wsUrl,http:body=>http(token,'/api/field',body),
  onRoom:v=>{const me=v.players.find(p=>p.id===v.me);if(me&&!me.alive&&c.alive){c.alive=false;metrics.event('deathSeen',{who:index});}},
  onFrame:f=>{for(const b of f.bodies)if(!seenBodies.has(b.id)){seenBodies.add(b.id);metrics.bodySeen(b.id);}for(const p of f.people)if(p.id!==net.room.me)metrics.sample(p.id,p.at||f.serverNow,f.serverNow);}});
 net.setHiddenProbe(()=>c.hidden);
 c.net=net;Object.defineProperty(c,'live',{get:()=>net.live});
 c.rendered=new Map();c.trackOf=id=>net.tracks[id];c.position=()=>net.visual;c.view=()=>net.room;
 const tap=(w,fn)=>{const push=w.push.bind(w);w.push=v=>{push(v);fn(v);};};tap(net.stats.ack,v=>metrics.ack(v));tap(net.stats.correction,v=>metrics.correction(v));
 c.start=()=>net.start();c.stop=()=>net.stop();
 c.frame=(time,dt)=>{
  if(c.hidden)return;
  net.step(dt,c.alive?c.intent:{x:0,y:0},!!net.room.paused);
  c.rendered.clear();
  for(const p of net.render(time,{retain:true}))if(!p.mine&&p.alive&&!p.vented&&!p.invisible)c.rendered.set(p.id,{x:p.x,y:p.y,at:p.at});
 };
 c.tryKill=async targetId=>{
  const s=net.snapshot,role=net.room.myRole;const p=s?.people.find(p=>p.id===targetId&&p.alive&&!p.vented&&!p.invisible);if(!p)return{skipped:'not-visible'};
  const pos={...p,...net.interpolated[p.id]};if(distance(net.visual,pos)>=93)return{skipped:'far'};
  if(!isImpostor(role)&&role!=='lonewolf')return{skipped:'role'};
  if(process.env.SIM_KILLDBG){const tr=net.tracks[targetId],last=tr?.samples.at(-1),sn=Date.now()+net.serverOffset;console.error('[kill]',index,'target',Math.round(pos.x),Math.round(pos.y),'renderAge',Math.round(sn-pos.at),'lastSampleAge',last?Math.round(sn-last.at):null,'lastSample',last&&Math.round(last.x),last&&Math.round(last.y),'delay',tr&&Math.round(tr.delay),'tgt',tr&&Math.round(tr.target),'n',tr?.samples.length,'me',Math.round(net.visual.x),Math.round(net.visual.y));}
  try{return await net.act('kill',{target:targetId,targetAt:pos.at});}catch(e){return{error:e.message};}
 };
 return c;
}
