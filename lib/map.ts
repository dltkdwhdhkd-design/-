import {SCIENCE_KINDS,SCIENCE_TITLES,type ScienceKind} from './science.ts';
import { FIELD_ROLES } from './field-roles.ts';
import type { Role } from './game';
export const WORLD={width:4650,height:2760,speed:205,vision:350};
export type MapContext=number|{count:number;mapId?:'aurora'|'nereid'};
export const population=(c:MapContext)=>typeof c==='number'?c:c.count;
export const mapIdentity=(c:MapContext)=>typeof c==='number'?'aurora':c.mapId==='nereid'?'nereid':'aurora';
export type Point={x:number;y:number};
export type Location={id:string;name:string;en:string;x:number;y:number;w:number;h:number;color:string;tile:number;science?:boolean};
export type Rect={x:number;y:number;w:number;h:number};
export type Puzzle=ScienceKind|'wires'|'code'|'sequence'|'pattern'|'calibrate'|'swipe'|'asteroids'|'upload'|'fuel'|'filter'|'align'|'switches';
export const PUZZLES:Puzzle[]=['wires','code','sequence','pattern','calibrate','swipe','asteroids','upload','fuel','filter','align','switches'];
const layouts=[
 ['lab','연구실','LAB','#68d8ed',0,0,0],['control','관제실','CONTROL','#92b6ff',1,0,1],['medical','의무실','MEDICAL','#76dcb3',2,0,2],
 ['power','전력실','POWER','#f1be6c',0,1,3],['atrium','중앙 홀','ATRIUM','#d5c4a2',1,1,4],['archive','기록실','ARCHIVE','#c7a1ef',2,1,5],
 ['storage','물류 창고','STORAGE','#d0a17b',0,2,6],['comms','통신실','COMMS','#7faee7',1,2,7],['garden','온실','GARDEN','#a6d88b',2,2,8],
 ['cooling','냉각실','COOLING','#94dbde',0,3,2],['server','서버실','SERVER','#aca4ed',1,3,7],['loading','하역장','LOADING','#d6ba87',2,3,6],
 ['engine','기관실','ENGINE','#dd936d',3,0,3],['security','보안실','SECURITY','#abacd9',3,1,1],['observatory','관측실','OBSERVATORY','#88cfe2',3,2,0],['lounge','휴게실','LOUNGE','#bed48b',3,3,8],
 ['reactor','반응로','REACTOR','#eb8b79',4,0,3],['navigation','항법실','NAVIGATION','#83b1ff',4,1,1],['oxygen','산소실','OXYGEN','#76ddba',4,2,8],['hangar','격납고','HANGAR','#d1b78c',4,3,6],
] as const;
// Deliberately asymmetric wings: staggered doors and elbow corridors break long sight lines.
const roomBounds:Record<string,[number,number,number,number]>={
 lab:[210,160,490,380],control:[1040,140,500,330],medical:[1790,130,520,380],
 power:[150,850,460,360],atrium:[900,690,620,500],archive:[1920,830,520,360],
 storage:[650,1510,610,460],comms:[1420,1730,390,420],garden:[2100,1530,540,380],
 cooling:[160,2130,470,320],server:[880,2230,490,300],loading:[1770,2280,580,280],
 engine:[2800,100,550,370],security:[2780,750,470,400],observatory:[2840,1450,500,390],lounge:[2790,2140,480,390],
 reactor:[3980,150,480,360],navigation:[3880,820,540,360],oxygen:[3970,1530,450,370],hangar:[3810,2250,680,300],
};
export const LOCATIONS:Location[]=layouts.map(([id,name,en,color,,,tile])=>{const [x,y,w,h]=roomBounds[id];return{id,name,en,color,tile,x,y,w,h};});
const insetRooms=new Set(['lab','control','medical','storage','security','observatory','reactor','oxygen']);
export function roomFloors(r:Location):Rect[]{return !r.science&&insetRooms.has(r.id)?[{x:r.x,y:r.y,w:r.w*.72,h:r.h},{x:r.x+r.w*.72,y:r.y+r.h*.25,w:r.w*.28,h:r.h*.75}]:[{x:r.x,y:r.y,w:r.w,h:r.h}];}
export function roomOutline(r:Location){return !r.science&&insetRooms.has(r.id)?`M${r.x},${r.y}h${r.w*.72}v${r.h*.25}h${r.w*.28}v${r.h*.75}h${-r.w}Z`:`M${r.x},${r.y}h${r.w}v${r.h}h${-r.w}Z`;}
const titles:Record<Puzzle,string>={...SCIENCE_TITLES,wires:'배선 연결',code:'접근 코드 입력',sequence:'표본 순서 분류',pattern:'기억 회로 복구',calibrate:'주파수 보정',swipe:'출입 카드 스캔',asteroids:'우주 잔해 제거',upload:'데이터 전송',fuel:'연료 주입',filter:'필터 이물질 제거',align:'항로 정렬',switches:'차단기 복구'};
export const STATIONS=LOCATIONS.flatMap((l,i)=>[0,1,2].map(j=>{const kind=PUZZLES[(i*3+j)%PUZZLES.length];return{id:`${l.id}-${kind}`,name:titles[kind],room:l.id,kind,x:l.x+l.w*[.22,.75,.7][j],y:l.y+l.h*[.36,.38,.79][j]};}));
export const EMERGENCY:Point={x:1140,y:925};
export const REPAIR:Point={x:265,y:1010};
const mapCache=new Map<string,ReturnType<typeof buildMap>>();
export function mapFor(context:MapContext){const count=population(context),key=mapIdentity(context)+':'+count;let map=mapCache.get(key);if(!map){map=mapIdentity(context)==='nereid'?buildScienceMap(count):buildMap(count);mapCache.set(key,map);}return map;}
function buildMap(count:number){
 const size=count<=10?12:count<=20?16:20,locations=LOCATIONS.slice(0,size),corridors:Rect[]=[];
 const route=(points:[number,number][],width=112)=>{for(let i=1;i<points.length;i++){const [ax,ay]=points[i-1],[bx,by]=points[i];if(ax!==bx&&ay!==by)throw Error('Corridors must be orthogonal');corridors.push({x:Math.min(ax,bx)-width/2,y:Math.min(ay,by)-width/2,w:Math.abs(bx-ax)+width,h:Math.abs(by-ay)+width});}};
 // Three interlocking circulation loops, narrow alternate passages and secluded mission rooms.
 route([[680,340],[840,340],[840,260],[1060,260]]);
 route([[1520,300],[1650,300],[1650,395],[1810,395]]);
 route([[230,400],[100,400],[100,1040],[170,1040]],104);
 route([[1280,450],[1280,575],[1080,575],[1080,710]]);
 route([[2100,490],[2100,655],[2410,655],[2410,850]]);
 route([[1940,1030],[1740,1030],[1740,845],[1500,845]]);
 route([[590,1000],[745,1000],[745,1110],[920,1110]]);
 route([[470,1190],[470,1390],[780,1390],[780,1530]]);
 route([[1180,1170],[1180,1320],[1020,1320],[1020,1530]]);
 route([[2190,1170],[2190,1360],[2390,1360],[2390,1550]]);
 route([[1420,1170],[1420,1480],[1620,1480],[1620,1750]],104);
 route([[1240,1770],[1330,1770],[1330,1990],[1440,1990]]);
 route([[1790,1910],[1970,1910],[1970,1740],[2120,1740]]);
 route([[850,1950],[850,2070],[410,2070],[410,2150]],104);
 route([[1090,1950],[1090,2120],[1140,2120],[1140,2250]]);
 route([[1350,2380],[1540,2380],[1540,2490],[1790,2490]]);
 route([[1640,2130],[1640,2220],[2010,2220],[2010,2300]],104);
 route([[610,2320],[750,2320],[750,2410],[900,2410]]);
 route([[2500,1890],[2500,2170],[2310,2170],[2310,2300]]);
 // Hallway junctions offer bypasses without crossing a room.
 route([[840,340],[840,575],[1080,575]],100);
 route([[745,1110],[745,1320],[1180,1320]],100);
 route([[2190,1360],[1740,1360],[1740,1480],[1420,1480]],100);
 route([[1970,1740],[1970,2220]],100);
 if(size>=16){
  route([[2290,370],[2540,370],[2540,250],[2820,250]]);
  route([[3050,450],[3050,590],[2910,590],[2910,770]],104);
  route([[2420,1030],[2610,1030],[2610,900],[2800,900]]);
  route([[3120,1130],[3120,1300],[2980,1300],[2980,1470]]);
  route([[2620,1750],[2730,1750],[2730,1650],[2860,1650]],104);
  route([[3160,1820],[3160,2000],[2950,2000],[2950,2160]]);
  route([[2330,2450],[2560,2450],[2560,2330],[2810,2330]]);
 }
 if(size>=16)route([[3120,1300],[3420,1300],[3420,1010],[3230,1010]],100);
 if(size===20){
  route([[3330,330],[3550,330],[3550,250],[4000,250]]);
  route([[4210,490],[4210,660],[4090,660],[4090,840]],104);
  route([[3230,1010],[3500,1010],[3500,900],[3900,900]]);
  route([[4280,1160],[4280,1370],[4150,1370],[4150,1550]]);
  route([[3320,1720],[3600,1720],[3600,1620],[3990,1620]],104);
  route([[4250,1880],[4250,2080],[4070,2080],[4070,2270]]);
  route([[3250,2380],[3470,2380],[3470,2470],[3830,2470]]);
 }
 return{id:'aurora' as 'aurora'|'nereid',width:size===20?4650:size===16?3490:2750,height:2760,locations,corridors,floors:locations.flatMap(roomFloors),stations:STATIONS.filter(s=>locations.some(l=>l.id===s.room)),tasksPerPlayer:count<=10?6:count<=16?8:count<=22?10:12,label:size===20?'오로라 기지 · 심층 구역':size===16?'오로라 기지 · 동부 확장':'오로라 기지 · 중앙 시설'};
}
const maps=[mapFor(10),mapFor(20),mapFor(29)];
export const CORRIDORS=maps[1].corridors;
export function locationAt(p:Point,count:MapContext=16){return mapFor(count).locations.find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)?.name||'연결 통로';}
const FLOOR_CELL=128;
const floorIndexes=new Map<string,Map<string,Rect[]>>();
export function floor(p:Point,count:MapContext=16){const key=mapIdentity(count)+':'+population(count);let index=floorIndexes.get(key);if(!index){index=new Map();const m=mapFor(count);for(const r of [...m.floors,...m.corridors])for(let y=Math.floor(r.y/FLOOR_CELL);y<=Math.floor((r.y+r.h)/FLOOR_CELL);y++)for(let x=Math.floor(r.x/FLOOR_CELL);x<=Math.floor((r.x+r.w)/FLOOR_CELL);x++){const k=x+','+y,cell=index.get(k)||[];cell.push(r);index.set(k,cell);}floorIndexes.set(key,index);}return !!index.get(Math.floor(p.x/FLOOR_CELL)+','+Math.floor(p.y/FLOOR_CELL))?.some(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);}
export function walkable(p:Point,count:MapContext=16){return [{x:p.x-12,y:p.y},{x:p.x+12,y:p.y},{x:p.x,y:p.y-12},{x:p.x,y:p.y+12}].every(q=>floor(q,count));}
export function distance(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y);}
export function sight(a:Point,b:Point,count:MapContext=16){const n=Math.max(1,Math.ceil(distance(a,b)/12));for(let i=1;i<n;i++)if(!floor({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},count))return false;return true;}
export function moveTo(a:Point,b:Point,budget:number,count:MapContext=16){const d=distance(a,b);if(!d||!Number.isFinite(d))return a;const scale=Math.min(1,budget/d),dx=(b.x-a.x)*scale,dy=(b.y-a.y)*scale,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/6));let p={...a};for(let i=0;i<n;i++){const x={x:p.x+dx/n,y:p.y};if(walkable(x,count))p=x;const y={x:p.x,y:p.y+dy/n};if(walkable(y,count))p=y;}return{x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10};}
export function spawn(i:number,count:MapContext=16):Point{return{x:(mapIdentity(count)==='nereid'?1450:1000)+(i%6)*36,y:(mapIdentity(count)==='nereid'?1390:900)+Math.floor(i/6)*38};}
export const FIELD_ROLE:Record<Role,{label:string;mission:string}>={
...Object.fromEntries(Object.entries(FIELD_ROLES).map(([k,v])=>[k,{label:({crewmate:'미션',engineer:'환기구',scientist:'생체 신호',tracker:'추적',noisemaker:'자동 경보',impostor:'공격',shapeshifter:'변신',phantom:'은신',guardian:'보호',investigator:'검문',judge:'회의 판결',viper:'산성 공격',executioner:'목표 추방',survivor:'자기 보호',arsonist:'기름 묻히기',thief:'훔치기',escapeartist:'탈출',coroner:'검시',jester:'투표 유도',scavenger:'시체 수집',lonewolf:'공격'} as Record<string,string>)[k],mission:v.mission}])) as Record<keyof typeof FIELD_ROLES,{label:string;mission:string}>,
mafia:{label:'공격',mission:'가까운 시민을 공격합니다(90 이내). 공격 후 35초 대기. 정전으로 시민의 시야를 좁힐 수 있습니다. 가짜 미션은 승리 게이지에 반영되지 않습니다.'},
spy:{label:'직업 확인',mission:'가까운 사람의 직업을 조사합니다(45초 대기). 마피아를 조사하면 접선합니다. 공격은 못 하지만 정전 방해는 가능합니다.'},
police:{label:'수사',mission:'가까운 생존자의 마피아 여부를 조사합니다(45초 대기). 스파이는 마피아가 아닌 것으로 나옵니다. 미션도 수행하세요.'},
doctor:{label:'보호',mission:'가까운 생존자 또는 자신에게 20초간 1회 보호막을 줍니다(40초 대기). 마피아의 공격 한 번을 막습니다.'},
soldier:{label:'자동 방탄',mission:'공격을 한 번 자동으로 버팁니다. 투표 추방은 막지 못합니다. 다른 시민처럼 이동하고 미션을 수행하세요.'},
reporter:{label:'취재 공개',mission:'게임 중 한 번 가까운 생존자의 직업을 모두에게 공개합니다. 탐색 시작 20초 이후 사용할 수 있습니다.'},
detective:{label:'흔적 추적',mission:'가까운 생존자가 이번 탐색 중 직전에 방문한 장소를 알아냅니다(35초 대기). 직업이나 공격 여부는 알려주지 않습니다.'},
medium:{label:'영혼 조사',mission:'발견한 쓰러진 사람의 직업을 확인합니다(30초 대기). 탐색 중 사망자 대화에 참여할 수 있습니다.'},
politician:{label:'2표 · 추방 면역',mission:'회의의 후보 지목에서 2표를 행사하고 투표 추방을 피합니다. 근접 공격은 막지 못합니다. 미션을 완료하세요.'},
priest:{label:'부활',mission:'게임 중 한 번 가까운 쓰러진 사람을 부활시킵니다. 회의로 현장이 정리되면 부활할 수 없습니다. 원래 진영과 소모한 능력은 유지됩니다.'},
citizen:{label:'미션 수행',mission:'지도에 표시된 인원수에 따라 배정된 나의 미션 6~12개를 수행하세요. 시민 팀 전체 미션을 완료하거나 모든 마피아를 추방하면 승리합니다. 탈락해도 유령으로 미션을 계속할 수 있습니다.'},
};


// Separate vent networks cross distant wings; adjacency is explicit, never array-index based.
const networks=[{id:'A',name:'과학 · 의료망',color:'#7cdbdf',rooms:['lab','medical','garden','observatory','oxygen']},{id:'B',name:'동력 · 화물망',color:'#edaf79',rooms:['power','storage','cooling','engine','reactor','hangar']},{id:'C',name:'관제 · 정보망',color:'#ba9cf4',rooms:['control','archive','comms','server','security','navigation']},{id:'D',name:'중앙 · 보급망',color:'#d9cc8a',rooms:['atrium','loading','lounge']}];
function makeVents(count:MapContext){const rooms=mapFor(count).locations;return networks.flatMap(n=>{const members=n.rooms.filter(id=>rooms.some(l=>l.id===id));return members.map((id,i)=>{const l=rooms.find(l=>l.id===id)!;return{id,name:l.name,x:l.x+82,y:l.y+l.h-64,network:n.id,networkName:n.name,color:n.color,links:[...new Set([members[(i+1)%members.length],members[(i+members.length-1)%members.length]])].filter(x=>x!==id)};});});}

const ventCache=new Map<string,ReturnType<typeof makeVents>>();
export function ventsFor(count:MapContext){const key=mapIdentity(count)+':'+population(count);let vents=ventCache.get(key);if(!vents){vents=makeVents(count);ventCache.set(key,vents);}return vents;}
export function emergencyFor(c:MapContext){return mapIdentity(c)==='nereid'?{x:1600,y:1470}:EMERGENCY;}
export function repairFor(c:MapContext){if(mapIdentity(c)==='aurora')return REPAIR;const r=mapFor(c).locations.find(r=>r.id==='power')!;return{x:r.x+100,y:r.y+r.h*.7};}
function buildScienceMap(count:number):ReturnType<typeof buildMap>{
 const bounds:[number,number,number,number][]=[
 [420,380,440,320],[1370,230,460,340],[2380,390,420,360],[2680,1100,400,330],[1350,1220,500,440],[2370,1910,500,330],
 [1380,2410,470,320],[440,1950,440,330],[130,1080,450,420],[810,920,360,300],[2030,1040,360,340],[1350,1900,410,300],
 [3350,370,440,350],[3490,1270,430,360],[3360,2150,440,330],[2240,2700,450,320],
 [430,2820,440,330],[1450,3150,450,340],[3150,3020,430,340],[4180,2300,460,350]];
 const names=['물질 분석동','탐사 관제동','생명 연구동','전기 실험동','중앙 홀','지질 기록동','시료 보관동','통신실','광합성 온실','열 실험동','광학 연구동','탐사 부두','에너지 연구동','보안실','천문 관측동','생태 연구동','화학 반응동','항법 연구동','해양 환경동','수중 장비동'];
 const size=count<=10?12:count<=20?16:20,locations=LOCATIONS.slice(0,size).map((r,i)=>({...r,name:names[i],x:bounds[i][0],y:bounds[i][1],w:bounds[i][2],h:bounds[i][3],science:true,color:['#73eed3','#7bdcff','#ffe58a','#c6b7ff'][i%4]})),corridors:Rect[]=[];
 const center=(id:string)=>{const r=locations.find(r=>r.id===id)!;return{x:r.x+r.w/2,y:r.y+r.h/2};};
 const connect=(a:string,b:string,vertical=false)=>{if(!locations.some(r=>r.id===a)||!locations.some(r=>r.id===b))return;const p=center(a),q=center(b),bend=vertical?{x:p.x,y:q.y}:{x:q.x,y:p.y};for(const [u,v] of [[p,bend],[bend,q]])corridors.push({x:Math.min(u.x,v.x)-58,y:Math.min(u.y,v.y)-58,w:Math.abs(u.x-v.x)+116,h:Math.abs(u.y-v.y)+116});};
 const ring=['lab','control','medical','power','archive','storage','comms','garden'];ring.forEach((id,i)=>connect(id,ring[(i+1)%ring.length],i%2===0));
 for(const [a,b] of [['garden','cooling'],['cooling','atrium'],['atrium','server'],['server','power'],['control','atrium'],['atrium','loading'],['loading','storage'],['medical','engine'],['engine','security'],['security','observatory'],['observatory','lounge'],['lounge','loading'],['server','security'],['comms','reactor'],['reactor','navigation'],['navigation','oxygen'],['oxygen','hangar'],['hangar','observatory'],['lounge','oxygen']])connect(a,b,true);
 const kinds=SCIENCE_KINDS,stations=locations.flatMap((r,i)=>[0,1,2].map(j=>{const kind=kinds[(i*3+j)%kinds.length];return{id:`nereid-${r.id}-${kind}`,name:SCIENCE_TITLES[kind],room:r.id,kind,x:r.x+r.w*[.23,.75,.72][j],y:r.y+r.h*[.37,.38,.78][j]};}));
 return{id:'nereid',width:size===20?4780:size===16?4050:3250,height:size===20?3660:size===16?3150:2900,locations,corridors,floors:locations.flatMap(roomFloors),stations,tasksPerPlayer:count<=10?6:count<=16?8:count<=22?10:12,label:'네레이드 · 해양 과학기지'};
}
