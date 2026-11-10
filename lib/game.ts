import {drawRoles} from './role-draw.ts';
import {executionWinner} from './neutral.ts';
import { FIELD_ROLES, fieldDistribution, isImpostor, isCrew, type FieldRole } from './field-roles.ts';
import { initField, resumeField, fieldWin, neutralWin, fieldSummary, fieldTick, startMeeting, type FieldState } from './field.ts';
export type Role = FieldRole | 'mafia' | 'spy' | 'police' | 'doctor' | 'soldier' | 'reporter' | 'detective' | 'medium' | 'politician' | 'priest' | 'citizen';
export type Phase = 'field' | 'lobby' | 'reveal' | 'night' | 'dawn' | 'discussion' | 'vote' | 'defense' | 'trial' | 'verdict' | 'finished';
export type Config = { viewMode?:'topdown'|'fps'; mapId?: 'aurora'|'nereid'; mode?: 'classic' | 'field'; count: number; discussion: number; night: number; vote: number; revealDead: boolean; confirmEject?: boolean };
export type Player = { id: string; key: string; name: string; avatar: number; role: Role | null; previousRole?: Role | null; alive: boolean; ready: boolean; connected: boolean; used: boolean; shield: boolean; publicRole: boolean; intel: { day: number; text: string }[] };
export type Message = { id: string; player: string; name: string; text: string; channel: 'town' | 'mafia' | 'ghost'; at: number };
export type Room = { solo?: boolean; field?: FieldState; revision?: number; code: string; host: string; config: Config; players: Player[]; phase: Phase; seq: number; day: number; deadline: number; paused: boolean; remaining: number; votes: Record<string,string>; trial: Record<string,string>; candidate: string | null; actions: Record<string,string>; messages: Message[]; events: { id: string; day: number; text: string }[]; announcement: string; winner: 'mafia' | 'town' | 'neutral' | null; winnerIds?:string[]; created: number; processed: string[] };
export const ROLE: Record<Role,{ name: string; en: string; color: string; description: string; mission: string; index: number; art: 'base' | 'spy' | 'special' }> = {
  ...FIELD_ROLES,
  mafia: { name:'마피아', en:'MAFIA', color:'#fa586b', description:'어둠 속에서 움직이는 자', mission:'밤마다 동료와 공격 대상을 지목합니다. 마피아의 최다 지목이 동률이면 공격하지 않습니다. 스파이는 접선 후 동료로 표시됩니다.', index:0, art:'base' },
  spy: { name:'스파이', en:'SPY', color:'#bd99ff', description:'시민의 얼굴을 한 조력자', mission:'밤마다 한 사람의 직업을 알아냅니다. 마피아를 찾으면 접선하여 비밀 대화에 합류합니다. 직접 공격하지 못하고 경찰에게 마피아가 아닌 것으로 조사됩니다.', index:0, art:'spy' },
  police: { name:'경찰', en:'POLICE', color:'#68baff', description:'거짓 속에서 진실을 찾는 자', mission:'밤마다 한 생존자의 마피아 여부를 조사합니다. 결과는 아침에 나만 볼 수 있습니다. 스파이는 마피아가 아닌 것으로 나타납니다.', index:1, art:'base' },
  doctor: { name:'의사', en:'DOCTOR', color:'#6ae0ba', description:'마지막 희망을 지키는 자', mission:'밤마다 한 사람을 마피아의 공격으로부터 보호합니다. 자기 자신과 같은 대상을 연속해서 보호할 수 있습니다.', index:2, art:'base' },
  soldier: { name:'군인', en:'SOLDIER', color:'#b5cc86', description:'한 번의 위기를 견디는 자', mission:'마피아의 밤 공격을 한 번 버팁니다. 자동으로 발동하며 투표 추방은 막지 못합니다. 의사가 보호했다면 방탄은 소모되지 않습니다.', index:0, art:'special' },
  reporter: { name:'기자', en:'REPORTER', color:'#efaf72', description:'숨겨진 정체를 세상에 밝히는 자', mission:'두 번째 밤부터 게임 중 한 번, 생존자 한 명을 취재합니다. 아침까지 자신과 대상이 살아 있으면 대상의 직업을 모두에게 공개합니다. 실패해도 사용 횟수는 소모됩니다.', index:1, art:'special' },
  detective: { name:'사립탐정', en:'DETECTIVE', color:'#89c9e8', description:'말보다 흔적을 믿는 자', mission:'밤마다 생존자 한 명을 추적하여 그 사람이 최종적으로 선택한 행동 대상을 알아냅니다. 직업이나 능력 성공 여부는 알 수 없습니다.', index:2, art:'special' },
  medium: { name:'영매', en:'MEDIUM', color:'#b69cee', description:'침묵한 이들의 목소리를 듣는 자', mission:'밤에는 사망자 대화를 읽고 참여할 수 있습니다. 매일 밤 탈락자 한 명을 선택해 직업을 확인합니다. 사망자는 마피아 비밀 대화를 볼 수 없습니다.', index:3, art:'special' },
  politician: { name:'정치인', en:'POLITICIAN', color:'#e0c580', description:'한 표 이상의 무게를 가진 자', mission:'후보 지목 투표가 2표로 계산됩니다. 최종 추방이 가결되면 정체를 공개하고 살아남습니다. 밤 공격은 막지 못하며 찬반 투표는 1표입니다.', index:4, art:'special' },
  priest: { name:'성직자', en:'PRIEST', color:'#ccd9f0', description:'떠난 이를 다시 부르는 자', mission:'게임 중 한 번, 밤에 탈락자 한 명을 선택해 아침에 부활시킵니다. 자신이 그 밤에 탈락하면 부활은 실패합니다. 대상의 원래 진영과 소모 능력은 유지됩니다.', index:5, art:'special' },
  citizen: { name:'시민', en:'CITIZEN', color:'#e6bd77', description:'도시의 운명을 결정하는 자', mission:'밤 능력은 없습니다. 대화와 조사 결과를 비교하고 투표로 모든 마피아를 찾아내세요. 거짓 주장과 서로 모순되는 증언을 놓치지 마세요.', index:3, art:'base' },
};
export const PHASE: Record<Phase,{ name: string; sub: string }> = {
  field:{name:'도시의 비밀을 추적하세요',sub:'이동하며 미션을 수행하고, 발견한 현장을 신고하세요.'},
  lobby:{name:'시민들이 모이고 있습니다',sub:'캐릭터를 선택하고 준비를 완료하세요.'},
  reveal:{name:'당신의 정체를 확인하세요',sub:'직업은 자신만 볼 수 있습니다. 화면을 조심하세요.'},
  night:{name:'도시에 밤이 찾아왔습니다',sub:'모두 조용히, 각자의 비밀 행동을 선택하세요.'},
  dawn:{name:'새로운 아침이 밝았습니다',sub:'지난밤 도시에서 일어난 일을 확인하세요.'},
  discussion:{name:'누구의 말을 믿겠습니까?',sub:'친구들과 대화하며 마피아를 찾아내세요.'},
  vote:{name:'도시의 운명을 결정하세요',sub:'의심되는 한 사람을 지목하세요. 마감 전 변경할 수 있습니다.'},
  defense:{name:'마지막 변론을 듣겠습니다',sub:'후보자의 이야기를 듣고 추방 여부를 판단하세요.'},
  trial:{name:'이 사람을 추방하겠습니까?',sub:'후보자를 제외한 생존자 과반수가 찬성해야 추방됩니다.'},
  verdict:{name:'시민들의 선택',sub:'최종 투표 결과를 공개합니다.'},
  finished:{name:'모든 비밀이 밝혀졌습니다',sub:'각자의 정체를 확인하세요.'},
};
export const defaults: Config = { mode:'field', count:16, discussion:120, night:45, vote:35, revealDead:false,confirmEject:true };
export function distribution(n:number,mode?:Config['mode']):Record<Role,number> {
  const empty=Object.fromEntries(Object.keys(ROLE).map(k=>[k,0])) as Record<Role,number>;if(mode==='field')return {...empty,...fieldDistribution(n)};
  const d:Record<Role,number> = { ...empty,mafia:Math.min(5,Math.max(1,Math.floor((n-1)/5))), spy:n>=8?1:0, police:n>=26?2:1, doctor:n>=22?2:1, soldier:n>=24?2:n>=8?1:0, detective:n>=28?2:n>=10?1:0, reporter:n>=12?1:0, medium:n>=13?1:0, politician:n>=14?1:0, priest:n>=16?1:0, citizen:0 };
  d.citizen=n-Object.values(d).reduce((a,b)=>a+b,0); return d;
}
export function configOf(v:Partial<Config>):Config { const range=(n:unknown,lo:number,hi:number,fallback:number)=>typeof n==='number'&&Number.isInteger(n)?Math.max(lo,Math.min(hi,n)):fallback; return { viewMode:v.mapId==='nereid'?'fps':'topdown', mapId:v.mapId==='nereid'?'nereid':'aurora', mode:v.mode==='classic'?'classic':'field', count:range(v.count,6,29,16),discussion:range(v.discussion,30,300,120),night:range(v.night,20,120,45),vote:range(v.vote,20,120,35),revealDead:v.revealDead===true,confirmEject:v.confirmEject!==false }; }
export function newRoom(code:string,host:string,config:Config,now=Date.now()):Room { return {code,host,config,players:[],phase:'lobby',seq:0,day:0,deadline:0,paused:false,remaining:0,votes:{},trial:{},candidate:null,actions:{},messages:[],events:[],announcement:'',winner:null,created:now,processed:[]}; }
function event(r:Room,text:string) { r.announcement=text; r.events.push({id:crypto.randomUUID(),day:r.day,text}); r.events=r.events.slice(-60); }
function intel(p:Player,day:number,text:string) { p.intel.push({day,text}); p.intel=p.intel.slice(-60); }
function enter(r:Room,phase:Phase,seconds:number,now:number) { r.phase=phase;r.seq++;r.deadline=seconds?now+seconds*1000:0;r.paused=false;r.remaining=0; }
function checkWin(r:Room,now:number) { if(r.field?.rules===2)return fieldWin(r,now);const alive=r.players.filter(p=>p.alive),m=alive.filter(p=>r.field?.rules===2?isImpostor(p.role):p.role==='mafia').length; if(!m||m>=alive.length-m) { r.winner=m?'mafia':'town';enter(r,'finished',0,now);event(r,r.field?.rules===2?(m?'임포스터가 시설을 장악했습니다.':'모든 임포스터를 찾아냈습니다. 크루 팀 승리!'):(m?'마피아가 도시를 장악했습니다.':'시민들이 도시를 되찾았습니다.'));return true; } return false; }
export function tally(votes:Record<string,string>,players?:Player[]) { const counts:Record<string,number>={};for(const [id,target] of Object.entries(votes)) counts[target]=(counts[target]||0)+(players?.find(p=>p.id===id)?.role==='politician'?2:1);return counts; }
function uniqueTop(votes:Record<string,string>,players?:Player[]) { const e=Object.entries(tally(votes,players)).sort((a,b)=>b[1]-a[1]);return e.length&&(e.length===1||e[0][1]>e[1][1])?e[0][0]:null; }
export function next(r:Room,now=Date.now()) {
  if(r.field&&['reveal','verdict'].includes(r.phase)){resumeField(r,now);return;}
  if(r.field&&r.phase==='field'){startMeeting(r,'진행자가 회의를 소집했습니다.',now);return;}
  if(r.phase==='reveal'||r.phase==='verdict') {r.day++;r.actions={};r.votes={};r.trial={};r.candidate=null;enter(r,'night',r.config.night,now);event(r,`${r.day}번째 밤, 도시가 잠들었습니다.`);}
  else if(r.phase==='night') {
    const active=r.players.filter(p=>p.alive),oldEvents=r.events.length;
    const mafiaVotes:Record<string,string>={};
    for(const p of active) {
      const target=r.players.find(t=>t.id===r.actions[p.id]); if(!target)continue;
      if(p.role==='mafia'&&target.alive&&target.role!=='mafia')mafiaVotes[p.id]=target.id;
      if(p.role==='police'&&target.alive)intel(p,r.day,`${target.name}: ${target.role==='mafia'?'마피아입니다.':'마피아가 아닙니다.'}`);
      if(p.role==='spy'&&target.alive) {intel(p,r.day,`${target.name}의 직업은 ${ROLE[target.role!].name}입니다.`);if(target.role==='mafia'){p.connected=true;intel(p,r.day,'마피아와 접선했습니다. 다음 밤부터 비밀 대화에 합류합니다.');}}
      if(p.role==='detective'&&target.alive) {const selected=r.players.find(t=>t.id===r.actions[target.id]);intel(p,r.day,`${target.name}: ${selected?`${selected.name}을(를) 선택했습니다.`:'선택한 행동 대상이 없습니다.'}`);}
      if(p.role==='medium'&&!target.alive)intel(p,r.day,`${target.name}의 직업은 ${ROLE[target.role!].name}입니다.`);
    }
    const victim=r.players.find(p=>p.id===uniqueTop(mafiaVotes));
    const protects=active.filter(p=>p.role==='doctor').map(p=>r.actions[p.id]);
    if(victim&&!protects.includes(victim.id)) {
      if(victim.role==='soldier'&&victim.shield){victim.shield=false;intel(victim,r.day,'방탄이 발동해 공격을 막았습니다. 이제 방탄은 없습니다.');event(r,'지난밤에는 아무도 탈락하지 않았습니다.');}
      else {victim.alive=false;event(r,`${victim.name} 님이 지난밤 탈락했습니다.${r.config.revealDead?` 정체는 ${ROLE[victim.role!].name}였습니다.`:''}`);}
    } else event(r,'지난밤에는 아무도 탈락하지 않았습니다.');
    for(const p of active) {
      const target=r.players.find(t=>t.id===r.actions[p.id]);if(!target)continue;
      if(p.role==='reporter'&&!p.used&&r.day>=2){p.used=true;if(p.alive&&target.alive){target.publicRole=true;event(r,`[특종] ${target.name}의 직업은 ${ROLE[target.role!].name}입니다.`);}else intel(p,r.day,'취재가 실패했습니다. 특종 기회가 소모되었습니다.');}
      if(p.role==='priest'&&!p.used&&!target.alive){p.used=true;if(p.alive){target.alive=true;event(r,`${target.name} 님이 성직자의 능력으로 돌아왔습니다.`);}else intel(p,r.day,'탈락하여 부활이 실패했습니다.');}
    }
    r.announcement=r.events.slice(oldEvents).map(e=>e.text).join(' ');enter(r,'dawn',12,now);checkWin(r,now);
  } else if(r.phase==='dawn')enter(r,'discussion',r.config.discussion,now);
  else if(r.phase==='discussion'){r.votes={};enter(r,'vote',r.config.vote,now);}
  else if(r.phase==='vote') {
    if(r.field?.rules===2){
      const j=r.field.judgments?.find(j=>r.players.some(p=>p.id===j.judge&&p.alive&&p.role==='judge'&&!p.used)&&r.players.some(p=>p.id===j.target&&p.alive));
      if(j){const judge=r.players.find(p=>p.id===j.judge)!,target=r.players.find(p=>p.id===j.target)!,victim=isImpostor(target.role)?target:judge;judge.used=true;victim.alive=false;r.candidate=victim.id;r.field.judgments=[];r.field.guardians||=[];if(isCrew(victim.role)&&r.field.guardians.length<(r.config.count>=23?2:1))r.field.guardians.push(victim.id);event(r,victim===target?`[판결] ${judge.name} 님이 지목한 ${target.name} 님은 임포스터입니다. 투표 결과 대신 추방합니다.`:`[오판] ${target.name} 님은 임포스터가 아닙니다. 판사 ${judge.name} 님이 대신 추방됩니다.`);enter(r,'verdict',8,now);checkWin(r,now);return;}
      const top=uniqueTop(r.votes),p=r.players.find(p=>p.id===top&&p.alive);r.candidate=p?.id||null;if(p){p.alive=false;r.field.guardians||=[];if(isCrew(p.role)&&r.field.guardians.length<(r.config.count>=23?2:1))r.field.guardians.push(p.id);event(r,`${p.name} 님이 최다 득표로 추방되었습니다.${r.config.confirmEject!==false?` ${p.name} 님은 임포스터${isImpostor(p.role)?'였습니다':'가 아니었습니다'}.`:''}${r.config.revealDead?` 정체: ${ROLE[p.role!].name}`:''}`);if(p.role==='jester'){neutralWin(r,p,now,'일반 투표로 추방되어 독립 승리했습니다.');return;}const executioner=executionWinner(r,p.id);if(executioner){neutralWin(r,executioner,now,'목표를 일반 투표로 추방시켜 독립 승리했습니다.');return;}}else event(r,'동률 또는 건너뛰기로 아무도 추방되지 않았습니다.');enter(r,'verdict',8,now);checkWin(r,now);return;}
    const top=uniqueTop(r.votes,r.players),candidate=r.players.find(p=>p.id===top&&p.alive);
    if(candidate){r.candidate=candidate.id;event(r,`${candidate.name} 님이 추방 후보로 지목되었습니다. 최후 변론을 시작합니다.`);enter(r,'defense',25,now);}
    else {event(r,'동률 또는 기권으로 추방 후보가 결정되지 않았습니다.');enter(r,'verdict',10,now);}
  } else if(r.phase==='defense'){r.trial={};enter(r,'trial',20,now);}
  else if(r.phase==='trial') {
    const p=r.players.find(p=>p.id===r.candidate&&p.alive),eligible=r.players.filter(p=>p.alive&&p.id!==r.candidate).length,yes=Object.values(r.trial).filter(v=>v==='yes').length;
    if(p&&yes>eligible/2){if(p.role==='politician'){p.publicRole=true;event(r,`${p.name} 님은 정치인입니다. 추방을 피하고 살아남았습니다.`);}else{p.alive=false;event(r,`${p.name} 님이 찬성 ${yes}표로 추방되었습니다.${r.config.revealDead?` 정체는 ${ROLE[p.role!].name}였습니다.`:''}`);}}
    else event(r,'추방 찬성이 과반수에 미치지 않아 부결되었습니다.');
    enter(r,'verdict',10,now);checkWin(r,now);
  }
}
export function tick(r:Room,now=Date.now()) { if(fieldTick(r,now))return true; if(!r.paused&&r.deadline&&now>=r.deadline){next(r,now);return true;}return false; }
export function actor(r:Room,key:string) {const host=key===r.host,p=r.players.find(p=>p.key===key);if(!host&&!p)throw new Error('입장 정보가 만료되었습니다. 다시 입장해 주세요.');return{host,p};}
export function addPlayer(r:Room,key:string,name:string,avatar:number) {if(r.players.some(p=>p.key===key))return;if(r.phase!=='lobby')throw new Error('이미 게임이 시작된 방입니다.');if(r.players.length>=r.config.count)throw new Error('방의 정원이 모두 찼습니다.');name=name.trim().slice(0,12);if(!name)throw new Error('이름을 입력해 주세요.');if(r.players.some(p=>p.name===name))throw new Error('같은 이름이 있습니다. 이름 뒤에 번호를 붙여 주세요.');r.players.push({id:crypto.randomUUID(),key,name,avatar:Math.max(0,Math.min(15,Math.floor(avatar)||0)),role:null,alive:true,ready:false,connected:false,used:false,shield:true,publicRole:false,intel:[]});}
export function canNight(p:{role:Role|null;alive:boolean;used?:boolean},day:number) {return p.alive&&!!p.role&&!['citizen','politician','soldier'].includes(p.role)&&!(['reporter','priest'].includes(p.role)&&p.used)&&!(p.role==='reporter'&&day<2);}
export function act(r:Room,key:string,body:{action:string;seq?:number;target?:string;text?:string;channel?:string;ready?:boolean;config?:Partial<Config>;requestId?:string;caseId?:string;memo?:string},now=Date.now()) {
  const{host,p}=actor(r,key),dedup=`${key}:${body.requestId||''}`;if(body.requestId&&r.processed.includes(dedup))return;const a=body.action;
  if(['start','next','pause','settings','reset','kick','soloStart','soloStop'].includes(a)&&!host)throw new Error('진행자만 사용할 수 있습니다.');
  if(['vote','trial','night','next','pause','start','reset','judge','caseNote','soloStart','soloStop'].includes(a)&&body.seq!==r.seq)throw new Error('단계가 바뀌었습니다. 현재 화면에서 다시 선택해 주세요.');
  if(a==='soloStart'){
    if(r.phase!=='lobby'||r.config.mode!=='field'||r.players.length)throw Error('참가자가 없는 현장 수사 대기실에서만 혼자 입장할 수 있습니다.');
    addPlayer(r,key,'진행자',0);const solo=r.players[0];solo.role='engineer';solo.ready=true;r.solo=true;r.day=0;r.winner=null;r.winnerIds=[];r.paused=false;r.messages=[];r.events=[];r.actions={};r.votes={};r.trial={};r.candidate=null;initField(r,now);resumeField(r,now);event(r,'진행자 단독 입장 · 멀티플레이와 같은 맵과 미션입니다. 엔지니어로 벤트도 확인할 수 있습니다.');
  } else if(a==='soloStop'){
    if(!r.solo)throw Error('단독 입장 중이 아닙니다.');
    r.players=[];delete r.solo;delete r.field;r.paused=false;r.winner=null;r.winnerIds=[];r.messages=[];r.events=[];r.actions={};r.votes={};r.trial={};r.candidate=null;r.day=0;r.announcement='';enter(r,'lobby',0,now);
  } else if(a==='settings'){if(r.phase!=='lobby')throw new Error('대기실에서만 변경할 수 있습니다.');const c=configOf(body.config||{});if(c.count<r.players.length)throw new Error('현재 입장 인원보다 적게 설정할 수 없습니다.');r.config=c;}
  else if(a==='caseNote'){
    if(!p?.alive||p.role!=='investigator'||!r.field||r.paused||!['field','discussion','vote'].includes(r.phase))throw Error('지금 사건 수첩을 수정할 수 없습니다.');
    const c=r.field.cases?.find(c=>c.id===body.caseId&&c.released);if(!c)throw Error('공개된 사건을 선택하세요.');r.field.caseNotes||={};r.field.caseNotes[p.id]||={};const n=r.field.caseNotes[p.id][c.id]||={memo:'',answers:{}};n.memo=(body.memo||'').slice(0,400);
  }
  else if(a==='judge'){
    if(!p?.alive||p.role!=='judge'||!r.field||r.field.rules!==2||r.phase!=='vote'||r.paused||p.used)throw Error('지금 판결할 수 없습니다.');
    if((r.field.tasks[p.id]||[]).filter(t=>t.done).length<3)throw Error('미션 3개를 먼저 완료하세요.');const t=r.players.find(x=>x.id===body.target&&x.alive&&x.id!==p.id);if(!t)throw Error('다른 생존자를 선택하세요.');r.field.judgments||=[];if(r.field.judgments.some(j=>j.judge===p.id))throw Error('이미 판결을 예약했습니다.');r.field.judgments.push({judge:p.id,target:t.id,at:now});
  }
  else if(a==='ready'){if(!p||r.phase!=='lobby')throw new Error('대기실에서만 준비할 수 있습니다.');p.ready=body.ready===true;}
  else if(a==='kick'){if(r.phase!=='lobby')throw new Error('대기실에서만 내보낼 수 있습니다.');r.players=r.players.filter(p=>p.id!==body.target);}
  else if(a==='start') {
    if(r.phase!=='lobby'||r.players.length!==r.config.count||!r.players.every(p=>p.ready))throw new Error('설정한 인원이 모두 입장하고 준비를 완료해야 합니다.');
    const deck=Object.entries(distribution(r.players.length,r.config.mode)).flatMap(([role,n])=>Array(n).fill(role)) as Role[];
    const roles=drawRoles(deck,r.players.map(p=>p.role??p.previousRole));

    r.players.forEach((p,i)=>{p.role=roles[i];p.alive=true;p.connected=false;p.used=false;p.shield=true;p.publicRole=false;p.intel=[];});r.day=0;r.winner=null;r.winnerIds=[];r.messages=[];r.events=[];r.actions={};r.votes={};r.trial={};r.candidate=null;if(r.config.mode==='field')initField(r,now);else delete r.field;enter(r,'reveal',20,now);event(r,'직업이 배정되었습니다. 자신의 정체를 확인하세요.');
  } else if(a==='next'){if(r.phase==='lobby'||r.phase==='finished')throw new Error('지금은 단계를 넘길 수 없습니다.');next(r,now);}
  else if(a==='pause'){if(r.phase==='field'&&r.field){r.paused=!r.paused;if(r.paused)r.field.pausedAt=now;else{const delta=now-(r.field.pausedAt||now);for(const id of Object.keys(r.field.cooldowns))r.field.cooldowns[id]+=delta;for(const id of Object.keys(r.field.protects))r.field.protects[id]+=delta;for(const record of [r.field.skillCooldowns,r.field.ventCooldowns,r.field.vitals,r.field.invisible])if(record)for(const id of Object.keys(record))record[id]+=delta;for(const record of [r.field.tracking,r.field.disguises,r.field.venting])if(record)for(const value of Object.values(record))value.until+=delta;for(const watcher of Object.values(r.field.watching||{})){watcher.at+=delta;watcher.until+=delta;}for(const speech of Object.values(r.field.speech||{})){speech.at+=delta;speech.until+=delta;}for(const body of r.field.bodies)if(body.dissolveAt)body.dissolveAt+=delta;if(r.field.commsUntil)r.field.commsUntil+=delta;for(const alert of r.field.alerts||[])alert.until+=delta;if(r.field.lightsUntil)r.field.lightsUntil+=delta;r.field.sabotageAt+=delta;r.field.meetingAt+=delta;delete r.field.pausedAt;}return;}if(!r.deadline)throw new Error('진행 중인 게임이 아닙니다.');r.paused=!r.paused;if(r.paused)r.remaining=Math.max(0,r.deadline-now);else r.deadline=now+r.remaining;}
  else if(a==='reset'){if(r.phase!=='finished')throw new Error('게임이 끝난 뒤 다시 시작할 수 있습니다.');r.players.forEach(p=>{p.previousRole=p.role??p.previousRole;p.role=null;p.alive=true;p.ready=false;p.connected=false;p.used=false;p.shield=true;p.publicRole=false;p.intel=[];});r.winner=null;r.winnerIds=[];r.messages=[];r.events=[];r.actions={};r.votes={};r.trial={};r.candidate=null;r.day=0;r.announcement='';delete r.field;enter(r,'lobby',0,now);}
  else if(a==='vote'||a==='night'||a==='trial') {
    if(!p?.alive||r.paused)throw new Error('지금은 선택할 수 없습니다.');if(r.phase!==a)throw new Error('선택 시간이 아닙니다.');
    const t=r.players.find(t=>t.id===body.target);
    if(a==='vote'){if(body.target!=='skip'&&(!t?.alive||t.id===p.id))throw new Error('자신 이외의 생존자를 선택해 주세요.');r.votes[p.id]=body.target!;}
    else if(a==='trial'){if(p.id===r.candidate||!['yes','no'].includes(body.target||''))throw new Error('지금은 찬반 투표를 할 수 없습니다.');r.trial[p.id]=body.target!;}
    else {
      if(!canNight(p,r.day))throw new Error('지금 사용할 수 있는 밤 능력이 없습니다.');
      if(body.target==='skip')delete r.actions[p.id];
      else {const deadTarget=p.role==='medium'||p.role==='priest';if(!t||t.alive===deadTarget||(p.role!=='doctor'&&t.id===p.id)||(p.role==='mafia'&&(t.role==='mafia'||(t.role==='spy'&&t.connected))))throw new Error('이 대상에게는 능력을 사용할 수 없습니다.');r.actions[p.id]=t.id;}
    }
  } else if(a==='chat') {
    const text=(body.text||'').trim().slice(0,200);if(!text)throw new Error('메시지를 입력해 주세요.');let channel:Message['channel']='town';
    if(p&&!p.alive&&r.phase!=='finished')channel='ghost';
    else if(r.phase==='night'||r.phase==='field') {if(p?.role==='medium')channel='ghost';else if(isImpostor(p?.role)||p?.role==='mafia'||(p?.role==='spy'&&p.connected))channel='mafia';else throw new Error('밤에는 자신의 비밀 대화만 사용할 수 있습니다.');}
    else if(!['lobby','discussion','vote','defense','trial','finished'].includes(r.phase))throw new Error('지금은 대화 시간이 아닙니다.');
    if(r.phase==='defense'&&channel==='town'&&!host&&p?.id!==r.candidate)throw new Error('최후 변론 중에는 후보자만 말할 수 있습니다.');
    const last=r.messages.findLast(m=>m.player===(p?.id||'host'));if(last&&now-last.at<900)throw new Error('잠시 후 전송해 주세요.');r.messages.push({id:crypto.randomUUID(),player:p?.id||'host',name:p?.name||'진행자',text,channel,at:now});r.messages=r.messages.slice(-120);
  } else throw new Error('지원하지 않는 요청입니다.');
  if(body.requestId){r.processed.push(dedup);r.processed=r.processed.slice(-160);}
}
export function view(r:Room,key:string,now=Date.now()) {
  const{host,p}=actor(r,key),mafia=isImpostor(p?.role)||p?.role==='mafia'||(p?.role==='spy'&&p.connected),finished=r.phase==='finished';const mafiaVotes:Record<string,string>={};if(mafia&&p?.alive&&r.phase==='night')for(const m of r.players.filter(x=>x.role==='mafia'&&x.alive))if(r.actions[m.id])mafiaVotes[m.id]=r.actions[m.id];
  return {field:fieldSummary(r,p),revision:r.revision||0,code:r.code,config:r.config,phase:r.phase,seq:r.seq,day:r.day,deadline:r.deadline,paused:r.paused,remaining:r.remaining,serverNow:now,host:host&&!r.solo,solo:!!r.solo&&host,me:p?.id||null,myRole:p?.role||null,connected:p?.connected||false,used:p?.used||false,shield:p?.shield||false,
    players:r.players.map(x=>({id:x.id,name:x.name,avatar:x.avatar,alive:r.phase==='field'&&x.id!==p?.id&&!host?!(r.field?.knownDead.includes(x.id)):x.alive,ready:x.ready,role:finished||x.publicRole||(r.config.revealDead&&!x.alive&&(r.phase!=='field'||r.field?.knownDead.includes(x.id)))||x.id===p?.id||(mafia&&(isImpostor(x.role)||x.role==='mafia'||(x.role==='spy'&&x.connected)))?x.role:null})),
    intel:p?.intel||[],myAction:p?(r.phase==='vote'?r.votes[p.id]:r.phase==='night'?r.actions[p.id]:r.phase==='trial'?r.trial[p.id]:null)||null:null,
    votes:['vote','defense','trial','verdict','finished'].includes(r.phase)?tally(r.votes,r.field?.rules===2?undefined:r.players):{},voted:['vote','defense','trial','verdict'].includes(r.phase)?Object.keys(r.votes):[],trial:tally(r.trial),candidate:r.candidate,mafiaVotes,
    messages:r.messages.filter(m=>m.channel==='town'||(m.channel==='mafia'&&mafia&&p?.alive&&['night','field'].includes(r.phase))||(m.channel==='ghost'&&p&&(!p.alive||(p.role==='medium'&&['night','field'].includes(r.phase))))),events:r.events,announcement:r.announcement,winner:r.winner,winnerIds:r.winnerIds||[]};
}
export type View=ReturnType<typeof view>;
