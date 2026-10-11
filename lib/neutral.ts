import type {MapContext} from './map.ts';
import type {Room,Player} from './game';
import {isCrew,isNeutral} from './field-roles.ts';
import {emergencyFor,mapFor,distance,sight,type Point} from './map.ts';

export type NeutralProgress={target?:string;marks:string[];shields:number};
export function neutralPoint(role:string,count:MapContext):Point{
 const id=role==='escapeartist'?'loading':role==='coroner'?'archive':'atrium';
 if(id==='atrium')return emergencyFor(count);
 const room=mapFor(count).locations.find(r=>r.id===id)!;return{x:room.x+room.w/2,y:room.y+room.h/2};
}
export function refreshNeutralTargets(r:Room){
 const f=r.field!;f.neutralProgress||={};
 for(const p of r.players.filter(p=>p.role==='executioner'&&p.alive)){
  const state=f.neutralProgress[p.id]||={marks:[],shields:0};
  if(r.players.some(t=>t.id===state.target&&t.alive))continue;
  const others=r.players.filter(t=>t.alive&&t.id!==p.id&&t.role!=='jester');
  const crew=others.filter(t=>isCrew(t.role)),pool=crew.length?crew:others;
  state.target=pool.length?pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length].id:undefined;
  if(state.target)p.intel.push({day:r.day,text:`처형 목표: ${r.players.find(t=>t.id===state.target)!.name}. 일반 투표로 추방시켜야 합니다.`});
 }
}
export function executionWinner(r:Room,ejected:string){return r.players.find(p=>p.alive&&p.role==='executioner'&&r.field?.neutralProgress?.[p.id]?.target===ejected);}
export function survivalWinner(r:Room){return r.players.filter(p=>p.alive).length<=4?r.players.find(p=>p.alive&&p.role==='survivor'&&(r.field?.tasks[p.id]||[]).filter(t=>t.done).length>=3):undefined;}
export function neutralSummary(r:Room,p?:Player){
 if(!p||!isNeutral(p.role))return null;
 const f=r.field!,state=f.neutralProgress?.[p.id],marks=state?.marks||[],tasks=f.tasks[p.id]||[],done=tasks.filter(t=>t.done).length;
 const target=r.players.find(t=>t.id===state?.target),required=r.config.count<=15?2:r.config.count<=22?3:4,collected=f.collected?.[p.id]||0;
 const allDoused=r.players.filter(t=>t.alive&&t.id!==p.id).every(t=>marks.includes(t.id));
 const objectives:Record<string,string>={
  jester:'일반 투표로 추방되면 나 혼자 승리',scavenger:`시체 수집 ${collected}/${required} · 시체 가까이에서 수집`,
  lonewolf:'크루와 임포스터를 모두 탈락시키고 최후의 1인으로 생존',
  executioner:target?`처형 목표: ${target.name} · 내가 살아 있는 동안 일반 투표로 추방시키기`:'새 처형 목표를 기다리고 있습니다.',
  survivor:`개인 미션 ${Math.min(done,3)}/3 · 생존자가 4명 이하일 때 살아남기 · 보호막 ${Math.max(0,2-(state?.shields||0))}회 남음`,
  arsonist:`기름을 묻힌 대상 ${marks.length}명 · ${allDoused?'점화 가능':'나를 제외한 모든 생존자에게 기름을 묻히세요'}`,
  thief:`전리품 ${marks.length}/4 · 모두 모으면 중앙 홀 회의 버튼 근처에서 반출`,
  escapeartist:`탈출 준비 ${done}/${tasks.length} · 전부 완료하고 하역장 중앙에서 탈출`,
  coroner:`검시 증거 ${marks.length}/3 · 모두 모으면 기록실 중앙에서 증거 제출`,
 };
 return{role:p.role,collected,required,objective:objectives[p.role!]||'',marks:[...marks],target:target?{id:target.id,name:target.name}:null,ready:p.role==='arsonist'?allDoused:p.role==='thief'?marks.length>=4:p.role==='coroner'?marks.length>=3:p.role==='escapeartist'?tasks.length>0&&done===tasks.length:false,shields:Math.max(0,2-(state?.shields||0))};
}
export function neutralAction(r:Room,p:Player,action:string,target:Player|undefined,tp:Point|null,pos:Point,now:number):{won?:string;effect:'scan'|'shield'|'task';point:Point}{
 const f=r.field!;if(!p.alive)throw Error('살아 있을 때만 중립 능력을 사용할 수 있습니다.');
 const near=(q:Point,range=110)=>distance(pos,q)<=range&&sight(pos,q,r.config);
 f.neutralProgress||={};const state=f.neutralProgress[p.id]||={marks:[],shields:0};
 f.skillCooldowns||={};
 if(action==='skill'&&p.role==='survivor'){
  if(state.shields>=2)throw Error('자기 보호막을 모두 사용했습니다.');
  if((f.skillCooldowns[p.id]||0)>now)throw Error('보호막 재사용 시간이 남았습니다.');
  state.shields++;f.protects[p.id]=now+8000;f.skillCooldowns[p.id]=now+45000;return{effect:'shield',point:pos};
 }
 if(action==='skill'&&['arsonist','thief'].includes(p.role||'')){
  if((f.skillCooldowns[p.id]||0)>now)throw Error('특수 능력 재사용 시간이 남았습니다.');
  if(!target?.alive||target.id===p.id||!tp||!near(tp)||(f.invisible?.[target.id]||0)>now)throw Error('다른 생존자 가까이 이동하세요.');
  if(state.marks.includes(target.id))throw Error('이미 능력을 사용한 대상입니다.');
  state.marks.push(target.id);f.skillCooldowns[p.id]=now+(p.role==='thief'?25000:20000);
  p.intel.push({day:r.day,text:`${target.name}: ${p.role==='thief'?'전리품 확보':'기름 묻히기'} 완료.`});return{effect:'scan',point:tp};
 }
 if(action==='ignite'&&p.role==='arsonist'){
  if(!r.players.filter(t=>t.alive&&t.id!==p.id).every(t=>state.marks.includes(t.id)))throw Error('모든 생존자에게 기름을 먼저 묻히세요.');
  return{effect:'task',point:pos,won:'모든 생존자에게 기름을 묻힌 뒤 점화하여 독립 승리했습니다.'};
 }
 if(action==='examine'&&p.role==='coroner'){
  if((f.skillCooldowns[p.id]||0)>now)throw Error('검시 재사용 시간이 남았습니다.');
  const body=f.bodies.find(b=>b.id===target?.id);if(!body||(body.dissolveAt&&body.dissolveAt<=now)||!near(body,105))throw Error('검시할 시체 가까이 이동하세요.');
  if(state.marks.includes(body.id))throw Error('이미 검시한 시체입니다.');
  state.marks.push(body.id);f.skillCooldowns[p.id]=now+15000;return{effect:'scan',point:body};
 }
 const finishes:Record<string,{role:string;ready:boolean;reason:string}>={
  cashout:{role:'thief',ready:state.marks.length>=4,reason:'전리품을 중앙 홀에서 반출하여 독립 승리했습니다.'},
  escape:{role:'escapeartist',ready:(f.tasks[p.id]||[]).length>0&&(f.tasks[p.id]||[]).every(t=>t.done),reason:'미션을 마치고 하역장에서 탈출하여 독립 승리했습니다.'},
  submitEvidence:{role:'coroner',ready:state.marks.length>=3,reason:'검시 증거를 기록실에 제출하여 독립 승리했습니다.'},
 };
 const finish=finishes[action];if(finish&&p.role===finish.role){const point=neutralPoint(p.role,r.config);if(!finish.ready)throw Error('개인 승리 목표를 먼저 완료하세요.');if(!near(point,105))throw Error('목표에 표시된 제출·탈출 장소 중앙으로 이동하세요.');return{effect:'task',point,won:finish.reason};}
 throw Error('이 직업이 사용할 수 없는 중립 능력입니다.');
}
