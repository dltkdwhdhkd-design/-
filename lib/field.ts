import {neutralSummary,neutralAction,refreshNeutralTargets,survivalWinner,type NeutralProgress} from './neutral.ts';
import {rewindTarget} from './lag-compensation.ts';
import {camerasFor,cameraSees,atSecurity,communicationsConsole} from './surveillance.ts';
import { puzzleSolution,puzzleCorrect,puzzleDuration } from './puzzles.ts';
import { isImpostor, isNeutral, isCrew } from './field-roles.ts';
import type { Room, Player } from './game';
import { ventsFor, mapFor, emergencyFor, repairFor, WORLD, spawn, distance, sight, locationAt, type Point } from './map.ts';
export type Pose=Point&{history?:string;id:string;at:number;seq:number;previous:string;place:string;ack?:number;clock?:number;warp?:number};
export type Task={station:string;done:boolean};
export type Challenge={station:string;nonce:string;started:number;solution:number[]};
export type Effect={id:string;kind:'attack'|'blocked'|'shield'|'scan'|'shift'|'vanish'|'vent'|'task';actor:string;target?:string;avatar:number;victimAvatar?:number;acid?:boolean;x:number;y:number;tx:number;ty:number;at:number};
export type CaseFile={id:string;victim:string;day:number;at:number;released:boolean;locations:Record<string,string>};
export type CaseNote={memo:string;answers:Record<string,string>};
export type FieldState={neutralProgress?:Record<string,NeutralProgress>;collected?:Record<string,number>;speech?:Record<string,{text:string;at:number;until:number;alive:boolean}>;mapVersion?:number;cases?:CaseFile[];caseNotes?:Record<string,Record<string,CaseNote>>;judgments?:{judge:string;target:string;at:number}[];watching?:Record<string,Point&{at:number;until:number;killRemaining:number}>;commsUntil?:number;venting?:Record<string,{vent:string;until:number}>;rules?:number;effects?:Effect[];skillCooldowns?:Record<string,number>;ventCooldowns?:Record<string,number>;vitals?:Record<string,number>;tracking?:Record<string,{target:string;until:number}>;disguises?:Record<string,{target:string;until:number}>;invisible?:Record<string,number>;guardians?:string[];alerts?:({id:string;until:number}&Point)[];warps?:Record<string,Point&{at:number}>;tasks:Record<string,Task[]>;challenges:Record<string,Challenge>;bodies:({id:string;at:number;dissolveAt?:number}&Point)[];cooldowns:Record<string,number>;protects:Record<string,number>;meetings:Record<string,number>;knownDead:string[];lightsUntil:number;sabotageAt:number;meetingAt:number;epoch:number;pausedAt?:number};
function shuffled<T>(a:T[]){for(let i=a.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
const roleNames:Record<string,string>={mafia:'마피아',spy:'스파이',police:'경찰',doctor:'의사',soldier:'군인',reporter:'기자',detective:'사립탐정',medium:'영매',politician:'정치인',priest:'성직자',citizen:'시민'};
export function red(p:Player){return isImpostor(p.role)||p.role==='mafia'||p.role==='spy';}
function note(p:Player,r:Room,text:string){p.intel.push({day:r.day,text});p.intel=p.intel.slice(-60);}
function announce(r:Room,text:string){r.announcement=text;r.events.push({id:crypto.randomUUID(),day:r.day,text});r.events=r.events.slice(-60);}
function phase(r:Room,p:Room['phase'],seconds:number,now:number){r.phase=p;r.seq++;r.deadline=seconds?now+seconds*1000:0;r.paused=false;r.remaining=0;}
export function initField(r:Room,now:number){r.field={mapVersion:3,watching:{},commsUntil:0,venting:{},rules:2,effects:[],skillCooldowns:{},ventCooldowns:{},vitals:{},tracking:{},disguises:{},invisible:{},guardians:[],alerts:[],warps:{},tasks:{},challenges:{},bodies:[],cooldowns:{},protects:{},meetings:{},knownDead:[],lightsUntil:0,sabotageAt:now+30000,meetingAt:now+40000,epoch:0};for(const p of r.players){const map=mapFor(r.config),pool=shuffled([...map.stations]),used=new Set<string>(),kinds=shuffled([...new Set(map.stations.map(s=>s.kind))]);r.field.tasks[p.id]=kinds.slice(0,map.tasksPerPlayer).map(kind=>{const s=pool.find(s=>s.kind===kind&&!used.has(s.room))||pool.find(s=>s.kind===kind)!;used.add(s.room);return{station:s.id,done:false};});}refreshNeutralTargets(r);}
export function resumeField(r:Room,now:number){const f=r.field!;r.day++;phase(r,'field',0,now);f.epoch=r.seq;f.speech={};f.judgments=[];for(const p of r.players)if(p.role==='investigator'){f.skillCooldowns||={};f.skillCooldowns[p.id]=Math.max(f.skillCooldowns[p.id]||0,now+15000);}f.watching={};f.commsUntil=0;f.venting={};f.effects=[];f.warps={};f.tracking={};f.disguises={};f.invisible={};f.vitals={};f.alerts=[];f.challenges={};f.bodies=[];f.knownDead=r.players.filter(p=>!p.alive).map(p=>p.id);f.lightsUntil=0;f.protects={};f.meetingAt=now+20000;f.sabotageAt=Math.max(f.sabotageAt,now+18000);for(const p of r.players)f.cooldowns[p.id]=Math.max(f.cooldowns[p.id]||0,now+20000);announce(r,'현장 탐색을 시작합니다. 미션을 수행하고 수상한 움직임을 기억하세요.');}
export function progress(r:Room){const f=r.field;if(!f)return{done:0,total:0};const tasks=r.players.filter(p=>!red(p)&&!isNeutral(p.role)).flatMap(p=>f.tasks[p.id]||[]);return{done:tasks.filter(t=>t.done).length,total:tasks.length};}
export function fieldSummary(r:Room,p?:Player){if(!r.field)return null;const f=r.field;return{...progress(r),neutral:neutralSummary(r,p),cases:p?.role==='investigator'?(f.cases||[]).filter(c=>c.released).map(c=>({id:c.id,victim:r.players.find(x=>x.id===c.victim)?.name||'',day:c.day,memo:f.caseNotes?.[p.id]?.[c.id]?.memo||'',answers:Object.entries(f.caseNotes?.[p.id]?.[c.id]?.answers||{}).map(([id,place])=>({id,name:r.players.find(x=>x.id===id)?.name||'',place}))})):[],judge:p?.role==='judge'?{done:(f.tasks[p.id]||[]).filter(t=>t.done).length,required:3,used:p.used,pending:f.judgments?.find(j=>j.judge===p.id)?.target||null}:null,watching:!!p&&!!f.watching?.[p.id],commsUntil:f.commsUntil||0,vent:p?f.venting?.[p.id]||null:null,rules:f.rules||1,guardian:!!p&&!!f.guardians?.includes(p.id),skillCooldown:p?f.skillCooldowns?.[p.id]||0:0,ventCooldown:p?f.ventCooldowns?.[p.id]||0:0,invisibleUntil:p?f.invisible?.[p.id]||0:0,disguisedUntil:p?f.disguises?.[p.id]?.until||0:0,tasks:p?f.tasks[p.id]||[]:[],challenge:p?f.challenges[p.id]||null:null,cooldown:p?f.watching?.[p.id]?Date.now()+f.watching[p.id].killRemaining:f.cooldowns[p.id]||0:0,protectUntil:p?f.protects[p.id]||0:0,emergenciesLeft:p?Math.max(0,1-(f.meetings[p.id]||0)):0,lightsUntil:f.lightsUntil,sabotageAt:red(p||{role:null} as Player)?f.sabotageAt:0,meetingAt:f.meetingAt,epoch:f.epoch};}
export function neutralWin(r:Room,p:Player,now:number,reason:string){r.winner='neutral';r.winnerIds=[p.id];phase(r,'finished',0,now);announce(r,`${p.name} 님이 ${reason}`);return true;}
export function fieldWin(r:Room,now:number){
 refreshNeutralTargets(r);
 const alive=r.players.filter(p=>p.alive),m=alive.filter(p=>r.field?.rules===2?isImpostor(p.role):p.role==='mafia').length,hunter=alive.find(p=>['lonewolf','arsonist'].includes(p.role||'')),pr=progress(r);
 if(hunter&&alive.length===1)return neutralWin(r,hunter,now,'최후의 생존자가 되어 독립 승리했습니다.');
 if(pr.total>0&&pr.done===pr.total){r.winner='town';phase(r,'finished',0,now);announce(r,'모든 크루 미션이 완료되었습니다. 크루 팀 승리!');return true;}
 const survivor=survivalWinner(r);if(survivor)return neutralWin(r,survivor,now,'개인 미션 3개를 완료하고 마지막 4명 안에 살아남아 독립 승리했습니다.');
 if(r.solo)return false;
 if(!m&&!hunter){r.winner='town';phase(r,'finished',0,now);announce(r,'모든 임포스터와 중립 사냥꾼·방화범이 탈락했습니다. 크루 팀 승리!');return true;}
 if(!hunter&&m>=alive.length-m){r.winner='mafia';phase(r,'finished',0,now);announce(r,'임포스터가 시설을 장악했습니다. 임포스터 팀 승리!');return true;}return false;
}
export function startMeeting(r:Room,text:string,now:number){const f=r.field!;f.speech={};f.judgments=[];for(const c of f.cases||[])c.released=true;for(const id of Object.keys(f.watching||{}))stopCameras(r,id,now);f.commsUntil=0;f.knownDead=r.players.filter(p=>!p.alive).map(p=>p.id);f.challenges={};f.bodies=[];f.lightsUntil=0;r.votes={};r.trial={};r.candidate=null;phase(r,'discussion',r.config.discussion,now);announce(r,text);}
export function fieldTick(r:Room,now:number){if(r.phase!=='field'||!r.field||r.paused)return false;const f=r.field;let changed=false;if(f.mapVersion!==3){f.mapVersion=3;f.watching={};f.venting={};f.challenges={};f.bodies=[];f.warps=Object.fromEntries(r.players.map((p,i)=>[p.id,{...spawn(i,r.config),at:now}]));r.seq++;f.epoch=r.seq;changed=true;}const bodies=f.bodies.filter(b=>!b.dissolveAt||b.dissolveAt>now);if(bodies.length!==f.bodies.length){f.bodies=bodies;changed=true;}for(const [id,w] of Object.entries(f.watching||{}))if(now>=w.until||!r.players.find(p=>p.id===id)?.alive){stopCameras(r,id,now);changed=true;}if(f.commsUntil&&now>=f.commsUntil){f.commsUntil=0;changed=true;}if(f.lightsUntil&&now>=f.lightsUntil){f.lightsUntil=0;changed=true;}for(const [id,v] of Object.entries(f.venting||{}))if(now>=v.until){delete f.venting![id];const p=r.players.find(p=>p.id===id)!;f.ventCooldowns||={};f.ventCooldowns[id]=now+(p.role==='engineer'?25000:8000);const location=ventsFor(r.config).find(x=>x.id===v.vent);if(location){f.warps||={};f.warps[id]={x:location.x,y:location.y,at:now};effect(r,p,'vent',location,location,undefined,now);}changed=true;}return changed;}
export function stopCameras(r:Room,id:string,now:number){const f=r.field!,w=f.watching?.[id];if(!w)return;f.cooldowns[id]=Math.min(now,w.until)+w.killRemaining;f.warps||={};f.warps[id]={x:w.x,y:w.y,at:now};delete f.watching![id];}
export function poseFor(r:Room,p:Player,poses:Pose[],now:number):Pose{const saved=poses.find(x=>x.id===p.id&&x.seq===r.field?.epoch),warp=r.field?.warps?.[p.id];const pose=saved||{id:p.id,...spawn(r.players.indexOf(p),r.config),at:now,seq:r.field?.epoch||0,ack:0,clock:now,warp:0,previous:'중앙 홀',place:'중앙 홀'};if(warp&&warp.at>(pose.warp||0))return{...pose,x:warp.x,y:warp.y,at:warp.at,clock:warp.at,warp:warp.at,place:locationAt(warp,r.config)};return pose;}
function effect(r:Room,p:Player,kind:Effect['kind'],a:Point,b:Point=a,target?:Player,now=Date.now()){const f=r.field!,d=f.disguises?.[p.id],appearance=d&&d.until>now?r.players.find(x=>x.id===d.target):p;f.effects=[...(f.effects||[]).filter(e=>now-e.at<3500),{id:crypto.randomUUID(),kind,actor:p.id,target:target?.id,acid:kind==='attack'&&p.role==='viper',avatar:appearance?.avatar??p.avatar,victimAvatar:target?.avatar,x:a.x,y:a.y,tx:b.x,ty:b.y,at:now}].slice(-32);}
export type FieldBody={targetAt?:number;action:string;seq?:number;target?:string;station?:string;nonce?:string;answer?:number[];requestId?:string;caseId?:string;text?:string};
export function fieldAct(r:Room,key:string,b:FieldBody,poses:Pose[],now=Date.now()){
 const f=r.field,p=r.players.find(x=>x.key===key);if(!f||r.phase!=='field')throw Error('지금은 현장 탐색 시간이 아닙니다.');if(r.paused)throw Error('진행자가 게임을 일시정지했습니다.');if(b.seq!==r.seq)throw Error('회의가 시작되었거나 탐색 단계가 바뀌었습니다.');if(!p)throw Error('참가자만 행동할 수 있습니다.');
 const dedup=`${key}:${b.requestId||''}`;if(b.requestId&&r.processed.includes(dedup))return;
 const near=(a:Point,b:Point,radius=105)=>distance(a,b)<=radius&&sight(a,b,r.config);
 const pos=poseFor(r,p,poses,now),target=r.players.find(x=>x.id===b.target),tp=target?poseFor(r,target,poses,now):null;
 if(f.venting?.[p.id]&&!['ventMove','ventExit'].includes(b.action))throw Error('환기구에서 나온 뒤 행동할 수 있습니다.');
 if(target&&f.venting?.[target.id])throw Error('환기구 안의 대상에게 행동할 수 없습니다.');
 if(f.watching?.[p.id]&&b.action!=='cameraStop')throw Error('CCTV를 닫은 뒤 행동할 수 있습니다.');
 const station=mapFor(r.config).stations.find(s=>s.id===b.station),task=f.tasks[p.id]?.find(t=>t.station===b.station);
 if(b.action==='cameraStop'){stopCameras(r,p.id,now);}
 else if(b.action==='say'){
  if((f.invisible?.[p.id]||0)>now)throw Error('은신이 끝난 뒤 주변 대화를 사용할 수 있습니다.');
  if(f.challenges[p.id])throw Error('미션 장치를 닫은 뒤 말할 수 있습니다.');
  if(typeof b.text!=='string')throw Error('메시지를 입력하세요.');
  const text=Array.from(b.text.replace(/[\u0000-\u001f\u007f]/g,' ').trim()).slice(0,60).join('');if(!text)throw Error('메시지를 입력하세요.');
  f.speech||={};if(f.speech[p.id]&&now-f.speech[p.id].at<1500)throw Error('1.5초 후 다시 말할 수 있습니다.');
  f.speech[p.id]={text,at:now,until:now+6500,alive:p.alive};
 }
 else if(b.action==='taskStart'){
  if(!station||!task||task.done||!near(pos,station,105))throw Error('내 미션 장치 가까이 이동해 주세요.');
  const solution=puzzleSolution(station.kind);
  f.challenges[p.id]={station:station.id,nonce:crypto.randomUUID(),started:now,solution};
 }else if(b.action==='taskFinish'){
  const c=f.challenges[p.id];if(!c||c.nonce!==b.nonce||!station||!task||task.done||c.station!==station.id||!near(pos,station,105))throw Error('미션을 다시 열어 주세요.');
  if(now-c.started<puzzleDuration(station.kind))throw Error('장치가 처리 중입니다. 잠시 후 다시 시도해 주세요.');const answer=b.answer;if(!Array.isArray(answer)||answer.length>12||answer.some(n=>!Number.isFinite(n)))throw Error('미션 입력을 확인해 주세요.');
  const correct=puzzleCorrect(station.kind,c.solution,answer);
  if(!correct)throw Error('미션 답이 맞지 않습니다. 다시 시도해 주세요.');task.done=true;delete f.challenges[p.id];if(p.role==='scientist'){f.skillCooldowns||={};f.skillCooldowns[p.id]=0;}effect(r,p,'task',pos,pos,undefined,now);fieldWin(r,now);
 }else if(b.action==='cancelTask'){delete f.challenges[p.id];}
 else {
  const guardian=!!f.guardians?.includes(p.id);if(!p.alive&&!(guardian&&b.action==='skill'))throw Error('유령은 미션과 사망자 대화만 할 수 있습니다.');
  f.skillCooldowns||={};f.ventCooldowns||={};f.invisible||={};f.disguises||={};f.tracking||={};f.vitals||={};
  if((f.invisible[p.id]||0)>now&&['kill','ability','report','emergency','vent','ventEnter'].includes(b.action))throw Error('은신이 끝난 뒤 사용할 수 있습니다.');
  if(['ignite','cashout','escape','examine','submitEvidence'].includes(b.action)||(b.action==='skill'&&['survivor','arsonist','thief'].includes(p.role||''))){
   const result=neutralAction(r,p,b.action,target,tp,pos,now);effect(r,p,result.effect,result.point,result.point,undefined,now);
   if(result.won)neutralWin(r,p,now,result.won);
  }else if(b.action==='collect'){
   if(p.role!=='scavenger')throw Error('수집가만 시체를 수집할 수 있습니다.');
   if((f.skillCooldowns[p.id]||0)>now)throw Error('수집 재사용 시간이 남았습니다.');
   const body=f.bodies.find(x=>x.id===b.target);if(!body||(body.dissolveAt&&body.dissolveAt<=now)||!near(pos,body,105))throw Error('수집할 시체 가까이 이동하세요.');
   f.bodies=f.bodies.filter(x=>x.id!==body.id);f.collected||={};f.collected[p.id]=(f.collected[p.id]||0)+1;f.skillCooldowns[p.id]=now+15000;
   effect(r,p,'scan',pos,body,undefined,now);const required=r.config.count<=15?2:r.config.count<=22?3:4;note(p,r,`시체 수집 ${f.collected[p.id]} / ${required}`);
   if(f.collected[p.id]>=required)neutralWin(r,p,now,'시체 수집 목표를 달성하여 독립 승리했습니다.');
  }else if(b.action==='cameraStart'){
   if(!atSecurity(pos,r.config))throw Error('보안 모니터 가까이 이동하세요.');if((f.invisible[p.id]||0)>now)throw Error('은신이 끝난 뒤 이용하세요.');if((f.commsUntil||0)>now)throw Error('통신실에서 통신 방해를 먼저 복구하세요.');if(f.challenges[p.id])throw Error('미션 장치를 닫은 뒤 이용하세요.');f.watching||={};f.watching[p.id]={x:pos.x,y:pos.y,at:now,until:now+12000,killRemaining:Math.max(0,(f.cooldowns[p.id]||0)-now)};f.warps||={};f.warps[p.id]={x:pos.x,y:pos.y,at:now};
  }else if(b.action==='commsSabotage'){
   if(!red(p)||now<f.sabotageAt||f.lightsUntil>now||(f.commsUntil||0)>now)throw Error('아직 통신 방해를 사용할 수 없습니다.');f.commsUntil=now+45000;f.sabotageAt=now+65000;f.vitals={};f.tracking={};
  }else if(b.action==='commsRepair'){
   if(!near(pos,communicationsConsole(r.config),105)||(f.commsUntil||0)<=now)throw Error('통신실의 복구 장치 가까이 이동하세요.');f.commsUntil=0;
  }else if(['ventEnter','ventMove','ventExit'].includes(b.action)){
   if(!isImpostor(p.role)&&p.role!=='engineer')throw Error('환기구를 사용할 수 없는 역할입니다.');
   f.venting||={};f.warps||={};const vents=ventsFor(r.config),inside=f.venting[p.id];
   if(b.action==='ventEnter'){
    if((f.ventCooldowns[p.id]||0)>now)throw Error('환기구 재사용 시간이 남았습니다.');const from=vents.find(v=>near(pos,v,85));if(!from)throw Error('환기구 가까이 이동해 주세요.');
    f.venting[p.id]={vent:from.id,until:now+(p.role==='engineer'?10000:30000)};f.warps[p.id]={x:from.x,y:from.y,at:now};effect(r,p,'vent',from,from,undefined,now);
   }else if(b.action==='ventMove'){
    const from=vents.find(v=>v.id===inside?.vent),to=vents.find(v=>v.id===b.target);if(!inside||!from||!to||!from.links.includes(to.id))throw Error('연결된 환기구를 선택하세요.');inside.vent=to.id;f.warps[p.id]={x:to.x,y:to.y,at:Math.max(now,(f.warps[p.id]?.at||0)+1)};
   }else{
    if(!inside)throw Error('환기구 안에 있지 않습니다.');const from=vents.find(v=>v.id===inside.vent)!;delete f.venting[p.id];f.warps[p.id]={x:from.x,y:from.y,at:Math.max(now,(f.warps[p.id]?.at||0)+1)};f.ventCooldowns[p.id]=now+(p.role==='engineer'?25000:8000);effect(r,p,'vent',from,from,undefined,now);
   }
  }else if(b.action==='skill'){
   if((f.commsUntil||0)>now&&['scientist','tracker'].includes(p.role||''))throw Error('통신 방해 중에는 정보 장치를 사용할 수 없습니다.');if((f.skillCooldowns[p.id]||0)>now)throw Error('특수 능력 재사용 시간이 남았습니다.');
   if(guardian){if(!target?.alive||!tp||!near(pos,tp,120))throw Error('보호할 생존자 가까이 이동하세요.');f.protects[target.id]=now+8000;f.skillCooldowns[p.id]=now+35000;effect(r,p,'shield',tp,tp,target,now);}
   else if(p.role==='investigator'){
    const c=f.cases?.find(c=>c.id===b.caseId&&c.released);if(!c)throw Error('수첩에서 회의에 공개된 사건을 선택하세요.');
    if(!target?.alive||!tp||target.id===p.id||!near(pos,tp,150)||(f.invisible[target.id]||0)>now)throw Error('검문할 생존자 가까이 이동하세요.');
    f.caseNotes||={};f.caseNotes[p.id]||={};const n=f.caseNotes[p.id][c.id]||={memo:'',answers:{}};
    if(n.answers[target.id])throw Error('이미 검문한 대상입니다.');if(Object.keys(n.answers).length>=3)throw Error('이 사건의 검문 3회를 모두 사용했습니다.');
    n.answers[target.id]=c.locations[target.id]||'당시 생존 기록 없음';f.skillCooldowns[p.id]=now+20000;
    note(p,r,`${r.players.find(x=>x.id===c.victim)?.name} 사건 · ${target.name}의 당시 위치: ${n.answers[target.id]}. 직업 판정이 아닙니다.`);
   }
   else if(p.role==='scientist'){f.vitals[p.id]=now+10000;f.skillCooldowns[p.id]=now+30000;}
   else if(p.role==='tracker'){if(!target?.alive||!tp||target.id===p.id||!near(pos,tp,150))throw Error('추적할 생존자 가까이 이동하세요.');f.tracking[p.id]={target:target.id,until:now+15000};f.skillCooldowns[p.id]=now+40000;}
   else if(p.role==='shapeshifter'){if(!target?.alive||!tp||target.id===p.id||!near(pos,tp,150))throw Error('외형을 복제할 생존자 가까이 이동하세요.');f.disguises[p.id]={target:target.id,until:now+15000};f.skillCooldowns[p.id]=now+45000;effect(r,p,'shift',pos,pos,undefined,now);}
   else if(p.role==='phantom'){f.invisible[p.id]=now+8000;f.skillCooldowns[p.id]=now+45000;f.cooldowns[p.id]=Math.max(f.cooldowns[p.id]||0,now+10000);effect(r,p,'vanish',pos,pos,undefined,now);}
   else throw Error('직접 사용하는 특수 능력이 없습니다.');
  }else if(b.action==='kill'&&(isImpostor(p.role)||p.role==='lonewolf')){
   // What the attacker saw is what counts: the target as rendered on the attacker's screen (rewound up to
   // REWIND_MS, in range and in sight there), even if it has since stepped behind a wall. Pressing on a
   // visible, in-range target and seeing nothing happen is the failure this genre cannot afford.
   const historical=tp?rewindTarget(tp,b.targetAt,now,r.config):null;
   if(now<(f.cooldowns[p.id]||0))throw Error('공격 재사용 시간이 남았습니다.');if(!target?.alive||!tp||(isImpostor(p.role)&&isImpostor(target.role))||((f.invisible[target.id]||0)>now)||!(near(pos,tp,95)||(historical&&near(pos,historical,95)))||p.id===target.id)throw Error('공격할 대상 가까이 이동하세요.');f.cooldowns[p.id]=now+30000;
   if((f.protects[target.id]||0)>now){delete f.protects[target.id];effect(r,p,'blocked',pos,tp,target,now);note(p,r,'보호막이 공격을 막았습니다.');}
   else{target.alive=false;stopCameras(r,target.id,now);delete f.challenges[target.id];f.bodies.push({id:target.id,x:tp.x,y:tp.y,at:now,...(p.role==='viper'?{dissolveAt:now+12000}:{})});
    f.cases||=[];f.cases.push({id:crypto.randomUUID(),victim:target.id,day:r.day,at:now,released:false,locations:Object.fromEntries(r.players.filter(x=>x.alive).map(x=>[x.id,locationAt(poseFor(r,x,poses,now),r.config)]))});f.guardians||=[];if(isCrew(target.role)&&f.guardians.length<(r.config.count>=23?2:1)){f.guardians.push(target.id);note(target,r,'수호천사 능력이 생겼습니다. 가까운 생존자를 보호할 수 있습니다.');}if(target.role==='noisemaker'){f.alerts||=[];f.alerts.push({id:target.id,x:tp.x,y:tp.y,until:now+12000});}effect(r,p,'attack',pos,tp,target,now);note(target,r,'공격받아 탈락했습니다. 유령으로 미션을 계속하세요.');fieldWin(r,now);}
  }else
 if(b.action==='report'){
   const body=f.bodies.find(x=>x.id===b.target);if(!body||(body.dissolveAt&&body.dissolveAt<=now)||!near(pos,body,125))throw Error('신고할 수 있는 현장이 가까이에 없습니다.');const victim=r.players.find(x=>x.id===body.id);startMeeting(r,`${p.name} 님이 ${locationAt(body,r.config)}에서 ${victim?.name} 님을 발견하고 신고했습니다.`,now);
  }else if(b.action==='emergency'){
   if(!near(pos,emergencyFor(r.config),100))throw Error('중앙 홀의 회의 버튼으로 이동해 주세요.');if(now<f.meetingAt)throw Error('긴급회의 대기 시간이 남아 있습니다.');if((f.meetings[p.id]||0)>=1)throw Error('긴급회의는 각자 한 번만 부를 수 있습니다.');if(f.lightsUntil>now||(f.commsUntil||0)>now)throw Error('방해 장치를 먼저 복구해 주세요. 현장 신고는 가능합니다.');f.meetings[p.id]=(f.meetings[p.id]||0)+1;startMeeting(r,`${p.name} 님이 긴급회의를 소집했습니다.`,now);
  }else if(b.action==='sabotage'){
   if(!red(p)||now<f.sabotageAt||f.lightsUntil>now||(f.commsUntil||0)>now)throw Error('아직 정전을 일으킬 수 없습니다.');f.lightsUntil=now+35000;f.sabotageAt=now+65000;
  }else if(b.action==='repair'){
   if(!near(pos,repairFor(r.config),105)||f.lightsUntil<=now)throw Error('전력실의 복구 장치 가까이 이동해 주세요.');f.lightsUntil=0;
  }else if(b.action==='ability'){
   if(now<(f.cooldowns[p.id]||0))throw Error('능력 재사용 시간이 남아 있습니다.');
   if(['soldier','politician','citizen'].includes(p.role||''))throw Error('직접 사용하는 능력이 없습니다.');
   if(['medium','priest'].includes(p.role||'')){
    const body=f.bodies.find(x=>x.id===b.target);if(!body||!target||target.alive||!near(pos,body,105))throw Error('쓰러진 사람 가까이 이동해 주세요.');
    if(p.role==='medium'){note(p,r,`${target.name}의 직업은 ${roleNames[target.role!]}입니다.`);f.cooldowns[p.id]=now+30000;}
    else{if(p.used)throw Error('부활 기회를 이미 사용했습니다.');p.used=true;target.alive=true;f.bodies=f.bodies.filter(x=>x.id!==target.id);f.knownDead=f.knownDead.filter(id=>id!==target.id);f.cooldowns[target.id]=now+20000;announce(r,`${target.name} 님이 성직자의 능력으로 부활했습니다.`);}
   }else{
    if(!target?.alive||!tp||!near(pos,tp,p.role==='mafia'?90:110)||(p.role!=='doctor'&&p.id===target.id))throw Error('대상 가까이 이동해 주세요.');
    if(p.role==='mafia'){
     if(target.role==='mafia'||(target.role==='spy'&&target.connected))throw Error('동료를 공격할 수 없습니다.');f.cooldowns[p.id]=now+35000;
     if((f.protects[target.id]||0)>now){delete f.protects[target.id];note(target,r,'보호막이 공격을 막았습니다.');note(p,r,'보호막으로 공격이 막혔습니다.');}
     else if(target.role==='soldier'&&target.shield){target.shield=false;note(target,r,'방탄이 공격을 막았습니다. 방탄이 소모되었습니다.');note(p,r,'방탄으로 공격이 막혔습니다.');}
     else{target.alive=false;stopCameras(r,target.id,now);delete f.challenges[target.id];f.bodies.push({id:target.id,x:tp.x,y:tp.y,at:now});note(target,r,'현장에서 탈락했습니다. 유령으로 미션을 계속 수행하세요.');fieldWin(r,now);}
    }else if(p.role==='doctor'){f.protects[target.id]=now+20000;f.cooldowns[p.id]=now+40000;note(p,r,`${target.name} 님에게 20초간 보호막을 부여했습니다.`);}
    else if(p.role==='police'){note(p,r,`${target.name}: ${target.role==='mafia'?'마피아입니다.':'마피아가 아닙니다.'}`);f.cooldowns[p.id]=now+45000;}
    else if(p.role==='spy'){note(p,r,`${target.name}의 직업은 ${roleNames[target.role!]}입니다.`);if(target.role==='mafia'){p.connected=true;note(p,r,'마피아와 접선했습니다.');}f.cooldowns[p.id]=now+45000;}
    else if(p.role==='detective'){note(p,r,`${target.name}의 직전 방문 장소: ${tp.previous}. (현재 ${locationAt(tp,r.config)})`);f.cooldowns[p.id]=now+35000;}
    else if(p.role==='reporter'){if(p.used)throw Error('취재 기회를 이미 사용했습니다.');p.used=true;target.publicRole=true;announce(r,`[특종] ${target.name}의 직업은 ${roleNames[target.role!]}입니다.`);}
   }
  }else throw Error('알 수 없는 현장 행동입니다.');
 }
 if(b.requestId){r.processed.push(dedup);r.processed=r.processed.slice(-160);}
}
// memory (optional, per live connection): players this viewer saw recently. They stay
// listed for a short grace period near the edge of vision so that position updates
// arriving at slightly different times do not make them blink in and out of view.
const VISIBILITY_GRACE_MS=450,VISIBILITY_GRACE_RANGE=1.15;
// `predict` (live server only): where an actor whose pose came from another server
// instance probably is now. Their stored pose is a few hundred ms old; near a doorway that
// old pose can sit behind the wall while the actor is already in plain view.
export function fieldSnapshot(r:Room,key:string,poses:Pose[],now=Date.now(),memory?:Map<string,number>,predict?:(id:string)=>Point|undefined){
 const p=r.players.find(p=>p.key===key),host=r.host===key&&!r.solo,f=r.field;if(!p&&!host)throw Error('입장 정보를 확인해 주세요.');const own=p?poseFor(r,p,poses,now):{...emergencyFor(r.config),id:'host',at:now,seq:f?.epoch||0,ack:0,clock:now,warp:0,previous:'중앙 홀',place:'중앙 홀'};
 const speechTime=r.paused?(f?.pausedAt||now):now;
 const radius=p?.alive&&!red(p)&&((f?.lightsUntil||0)>now)?145:WORLD.vision;
 const canSee=(point:Point)=>host||(distance(own,point)<=radius&&sight(own,point,r.config));
 const seePerson=(x:Player)=>{const at=poseFor(r,x,poses,now);let seen=canSee(at);if(!seen&&predict&&distance(own,at)<=radius+110){const guess=predict(x.id);seen=!!guess&&canSee(guess);}if(seen){memory?.set(x.id,now);return true;}const last=memory?.get(x.id);return last!==undefined&&now-last<=VISIBILITY_GRACE_MS&&distance(own,at)<=radius*VISIBILITY_GRACE_RANGE;};
 if(memory)for(const [id,at] of memory)if(now-at>VISIBILITY_GRACE_MS*4)memory.delete(id);
 const people=r.players.filter(x=>x.id===p?.id||((x.alive||!p?.alive||host)&&(!f?.venting?.[x.id]||host)&&(!(f?.invisible?.[x.id]&&f.invisible[x.id]>now)||host||!p?.alive)&&seePerson(x))).map(x=>{const loc=poseFor(r,x,poses,now),d=f?.disguises?.[x.id],disguise=d&&d.until>now?r.players.find(t=>t.id===d.target):null;const bubble=f?.speech?.[x.id],speech=bubble&&bubble.until>speechTime&&bubble.alive===x.alive&&!f?.venting?.[x.id]&&!((f?.invisible?.[x.id]||0)>now)&&(x.alive||!!p&&!p.alive)?{text:bubble.text,at:bubble.at,until:bubble.until}:null;return{speech,at:loc.at,warp:loc.warp||0,id:x.id,x:loc.x,y:loc.y,avatar:disguise?.avatar??x.avatar,name:disguise?.name??x.name,alive:x.alive,vented:!!f?.venting?.[x.id],protected:(f?.protects[x.id]||0)>now,invisible:(f?.invisible?.[x.id]||0)>now};});
 const tr=p?f?.tracking?.[p.id]:null,tracked=tr&&tr.until>now?r.players.find(x=>x.id===tr.target&&x.alive):null;
 const watching=!!p&&p.alive&&r.phase==='field'&&!!f?.watching?.[p.id]&&f.watching[p.id].until>now&&atSecurity(own,r.config),comms=(f?.commsUntil||0)>now;
 const activeCameras=r.phase==='field'&&!comms&&r.players.some(x=>x.alive&&f?.watching?.[x.id]&&f.watching[x.id].until>now&&atSecurity(poseFor(r,x,poses,now),r.config));
 const cameras=watching?camerasFor(r.config).map(camera=>{const visible=(q:Point)=>cameraSees(camera,q,r.config);return{...camera,offline:comms,people:comms?[]:r.players.filter(x=>x.alive&&!f?.venting?.[x.id]&&!((f?.invisible?.[x.id]||0)>now)&&visible(poseFor(r,x,poses,now))).map(x=>{const loc=poseFor(r,x,poses,now),d=f?.disguises?.[x.id],appearance=d&&d.until>now?r.players.find(t=>t.id===d.target):x;return{id:x.id,x:loc.x,y:loc.y,name:appearance?.name||x.name,avatar:appearance?.avatar??x.avatar};}),bodies:comms?[]:(f?.bodies||[]).filter(b=>(!b.dissolveAt||b.dissolveAt>now)&&visible(b)).map(b=>({...b,avatar:r.players.find(x=>x.id===b.id)?.avatar||0})),effects:comms?[]:(f?.effects||[]).filter(e=>e.at>=f!.watching![p!.id].at&&now-e.at<1500&&visible({x:e.tx,y:e.ty}))};}):null;

 return{own:{...own,history:undefined},people:watching?[]:people,cameras,activeCameras,bodies:(watching?[]:f?.bodies||[]).filter(b=>(!b.dissolveAt||b.dissolveAt>now)&&canSee(b)).map(b=>({...b,name:r.players.find(p=>p.id===b.id)?.name||'',avatar:r.players.find(p=>p.id===b.id)?.avatar||0})),effects:(f?.effects||[]).filter(e=>now-e.at<2800&&(e.actor===p?.id||e.target===p?.id||!watching&&canSee(e))).map(e=>({...e})),alerts:p&&!red(p)?(f?.alerts||[]).filter(a=>a.until>now):[],vitals:p&&(f?.vitals?.[p.id]||0)>now?r.players.map(x=>({id:x.id,name:x.name,alive:x.alive})):null,tracked:tracked?{name:tracked.name,...poseFor(r,tracked,poses,now),history:undefined,until:tr!.until}:null,radius,serverNow:now,seq:r.seq};
}
export type FieldSnapshot=ReturnType<typeof fieldSnapshot>;
