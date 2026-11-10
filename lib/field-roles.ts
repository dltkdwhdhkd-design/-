export const FIELD_ROLES = {
 executioner:{name:'처형인',en:'EXECUTIONER',color:'#d7a6ce',description:'비밀 목표를 투표로 추방시키는 중립',mission:'나에게만 보이는 목표를 일반 투표로 추방시키고 내가 살아 있으면 혼자 승리합니다. 판사의 판결이나 공격으로는 승리하지 않습니다. 목표가 다른 이유로 탈락하면 새 목표를 받습니다. 공격 능력은 없습니다.',index:4,art:'special' as const},
 survivor:{name:'생존주의자',en:'SURVIVOR',color:'#b9c889',description:'임무를 준비하고 마지막까지 버티는 중립',mission:'자신의 미션 3개를 마치고 생존자가 4명 이하일 때 살아 있으면 혼자 승리합니다. 크루 전체 미션 완료가 동시에 성립하면 크루 승리가 우선입니다. F로 8초 동안 공격 1회를 막는 자기 보호막을 사용합니다. 게임당 2회, 재사용 45초이며 투표는 막지 못합니다.',index:0,art:'special' as const},
 arsonist:{name:'방화범',en:'ARSONIST',color:'#efa178',description:'몰래 기름을 묻히고 점화하는 중립',mission:'가까운 다른 생존자에게 F로 기름을 묻힙니다. 재사용 20초이며 회의 뒤에도 유지됩니다. 자신을 제외한 모든 생존자에게 묻힌 뒤 점화 버튼을 누르면 혼자 승리합니다. 직접 공격이나 벤트는 사용할 수 없습니다. 생존 중에는 크루의 적 전멸과 임포스터의 인원수 승리를 막지만 크루 미션 승리는 막지 못합니다.',index:1,art:'special' as const},
 thief:{name:'도둑',en:'THIEF',color:'#c6afe8',description:'서로 다른 사람에게서 전리품을 훔쳐 탈출하세요',mission:'가까운 서로 다른 생존자에게 F로 전리품을 훔칩니다. 재사용 25초이며 대상의 직업이나 능력은 바뀌지 않습니다. 서로 다른 4명에게 성공한 뒤 중앙 홀 회의 버튼 근처에서 반출 버튼을 누르면 혼자 승리합니다. 생존 상태에서만 가능하며 공격·벤트는 사용할 수 없습니다.',index:2,art:'special' as const},
 escapeartist:{name:'탈출 전문가',en:'ESCAPIST',color:'#87cbbb',description:'자신의 장치를 모두 정비하고 시설에서 탈출하세요',mission:'자신에게 배정된 미션을 모두 완료한 뒤 하역장 중앙의 탈출 지점에서 탈출 버튼을 누르면 혼자 승리합니다. 크루 미션에는 합산되지 않습니다. 죽은 뒤에는 탈출할 수 없습니다. 미션 완료 뒤에도 하역장까지 살아서 이동해야 하며 공격·벤트는 사용할 수 없습니다.',index:3,art:'special' as const},
 coroner:{name:'검시관',en:'CORONER',color:'#9fb4dd',description:'현장에서 증거를 확보해 독립 수사를 완성하세요',mission:'시체 가까이에서 검시 버튼으로 서로 다른 시체 3구의 증거를 확보하세요. 시체는 남아 있어 다른 사람이 신고하거나 수집할 수 있습니다. 15초마다 검시하며 같은 시체는 중복 계산되지 않습니다. 3구를 검시한 뒤 기록실 중앙에서 증거 제출 버튼을 누르면 혼자 승리합니다. 살아 있어야 합니다.',index:2,art:'special' as const},

 jester:{name:'광대',en:'JESTER',color:'#dfa5ff',description:'투표로 추방되면 혼자 승리하는 중립',mission:'회의의 일반 추방 투표에서 단독 최다 득표로 추방되면 즉시 혼자 승리합니다. 공격으로 죽거나 판결로 탈락하면 승리하지 않습니다. 미션은 위장이며 팀 진행률에 포함되지 않습니다.',index:4,art:'special' as const},
 scavenger:{name:'수집가',en:'SCAVENGER',color:'#d5a4ff',description:'신고되기 전에 시체를 확보하는 중립',mission:'시체 가까이에서 수집 버튼을 누르세요. 수집한 시체는 사라져 신고할 수 없습니다. 15명 이하는 2구, 16~22명은 3구, 23~29명은 4구를 수집하면 혼자 승리합니다. 수집 후 15초 대기하며 회의 뒤에도 누적됩니다. 공격과 벤트는 사용할 수 없습니다.',index:2,art:'special' as const},
 lonewolf:{name:'고독한 사냥꾼',en:'LONE HUNTER',color:'#c09dff',description:'양쪽 진영을 모두 노리는 중립 살인자',mission:'크루와 임포스터 모두 공격할 수 있으며 공격 후 30초 대기합니다. 최후의 1인이 되면 혼자 승리합니다. 살아 있는 동안 임포스터의 인원수 승리와 크루의 적 전멸 승리를 막지만, 크루의 미션 완료 승리는 막지 못합니다. 벤트와 방해 공작은 사용할 수 없습니다.',index:0,art:'special' as const},
 crewmate:{name:'크루원',en:'CREWMATE',color:'#8bd4ec',description:'미션과 목격 정보로 시설을 지키세요',mission:'배정된 미션을 완료하고 동료의 동선을 관찰하세요. 모든 크루 미션을 완료하거나 모든 임포스터와 고독한 사냥꾼·방화범을 탈락시키면 승리합니다. 탈락 후에도 미션을 계속할 수 있습니다.',index:3,art:'base' as const},
 engineer:{name:'엔지니어',en:'ENGINEER',color:'#eebc75',description:'환기구로 빠르게 이동하는 크루',mission:'벤트 가까이에서 V를 눌러 몸을 숨기고 연결된 장소로 이동합니다. 최대 10초간 머무르며 나온 뒤 25초 대기합니다. 임포스터도 환기구를 쓰므로 환기구 사용만으로 범인을 단정하지 마세요.',index:0,art:'special' as const},
 scientist:{name:'과학자',en:'SCIENTIST',color:'#84e4c7',description:'생체 신호로 사망 시점을 확인하세요',mission:'어디서든 10초간 생체 신호를 확인합니다. 누가 살아 있는지 볼 수 있지만 직업이나 범인은 알 수 없습니다. 사용 후 30초 대기하며, 미션 하나를 완료하면 즉시 충전됩니다.',index:2,art:'base' as const},
 tracker:{name:'추적자',en:'TRACKER',color:'#9faefb',description:'직업이 아닌 이동 경로를 추적하세요',mission:'가까운 플레이어를 지정하면 15초 동안 지도에서 위치를 확인합니다. 추적은 40초마다 사용할 수 있습니다. 대상의 직업이나 공격 여부는 알려주지 않습니다.',index:2,art:'special' as const},
 noisemaker:{name:'경보원',en:'NOISEMAKER',color:'#f1d57d',description:'공격받으면 현장 위치를 알립니다',mission:'임포스터에게 공격받아 탈락하면 12초 동안 크루에게 경보와 현장 위치를 보냅니다. 범인의 정체는 공개하지 않습니다. 별도의 사용 버튼이 없는 자동 능력입니다.',index:1,art:'special' as const},
 impostor:{name:'임포스터',en:'IMPOSTOR',color:'#fa7387',description:'크루 사이에 숨어 임무를 방해하세요',mission:'가까운 크루를 공격하고 정전이나 환기구 이동으로 교란합니다. 공격 후 30초 대기합니다. 고독한 사냥꾼·방화범이 없고 임포스터 수가 나머지 생존자 수 이상이면 승리합니다. 위장 미션은 진행률에 포함되지 않습니다.',index:0,art:'base' as const},
 shapeshifter:{name:'변신술사',en:'SHAPESHIFTER',color:'#df95ec',description:'다른 플레이어의 외형으로 위장하는 임포스터',mission:'가까운 플레이어의 이름과 외형을 15초 동안 복제합니다. 변신·해제 순간은 주변에서 볼 수 있습니다. 변신은 45초마다 사용하며 공격·정전·환기구 이동도 가능합니다.',index:0,art:'spy' as const},
 phantom:{name:'팬텀',en:'PHANTOM',color:'#b99cf0',description:'잠시 모습을 감추는 임포스터',mission:'8초 동안 모습을 숨깁니다. 은신 중에는 공격·신고·환기구 이동을 할 수 없습니다. 나타나는 순간 효과가 보이며 이후 2초간 공격할 수 없습니다. 재사용 시간은 45초입니다.',index:3,art:'special' as const},
 investigator:{name:'탐정',en:'DETECTIVE',color:'#83cde7',description:'사건 당시 위치를 검문하고 증언을 비교하세요',mission:'회의에서 공개된 사건을 선택한 뒤, 탐색 중 가까운 생존자를 검문합니다. 사건 당시 대상이 있던 장소를 확인하며 직업은 알려주지 않습니다. 사건당 3명까지 검문하며 재사용 20초, 회의 직후 15초 대기합니다. 사건 수첩에 장소·용의자·범인 유형에 대한 추측을 적을 수 있습니다.',index:2,art:'special' as const},
 judge:{name:'판사',en:'JUDGE',color:'#e6c17d',description:'미션으로 판결권을 얻고 한 번의 결정을 내리세요',mission:'내 미션 3개를 완료하면 추방 투표 중 판결을 예약할 수 있습니다. 게임당 한 번, 투표 종료 때 대상이 임포스터면 대상을 추방하고 임포스터가 아니면 판사 자신이 추방됩니다. 여러 판사가 예약하면 가장 먼저 예약한 판결만 적용합니다.',index:4,art:'special' as const},
 viper:{name:'바이퍼',en:'VIPER',color:'#b6df7a',description:'현장의 흔적을 녹여 없애는 임포스터',mission:'산성 공격으로 쓰러뜨린 시체는 12초 동안 서서히 소멸합니다. 사라지기 전에는 신고할 수 있습니다. 경보원의 신호는 막지 못하며, 일반 임포스터처럼 벤트와 방해 공작을 사용합니다. 공격 재사용 시간은 30초입니다.',index:0,art:'spy' as const},
 guardian:{name:'수호천사',en:'GUARDIAN ANGEL',color:'#c0e8ff',description:'탈락한 뒤 동료를 보호하는 크루',mission:'먼저 탈락한 크루에게 추가로 주어지는 유령 능력입니다. 가까운 생존자에게 8초 동안 공격 1회를 막는 보호막을 줍니다. 35초마다 사용하며 미션도 계속할 수 있습니다.',index:5,art:'special' as const},
};
export type FieldRole=keyof typeof FIELD_ROLES;
export const FIELD_ROLE_KEYS=Object.keys(FIELD_ROLES) as FieldRole[];
export function isImpostor(role:string|null|undefined){return ['impostor','shapeshifter','phantom','viper'].includes(role||'');}
export function isNeutral(role:string|null|undefined){return ['jester','scavenger','lonewolf','executioner','survivor','arsonist','thief','escapeartist','coroner'].includes(role||'');}
export function isCrew(role:string|null|undefined){return !!role&&!isImpostor(role)&&!isNeutral(role);}
export function fieldDistribution(n:number){
 const d=Object.fromEntries(FIELD_ROLE_KEYS.map(k=>[k,0])) as Record<FieldRole,number>;
 const bad=n<=8?1:n<=12?2:n<=18?3:n<=24?4:5;
 d.shapeshifter=n>=9?1:0;d.phantom=n>=13?1:0;d.viper=n>=14?1:0;d.impostor=bad-d.shapeshifter-d.phantom-d.viper;
 d.engineer=n>=25?4:n>=20?3:n>=14?2:1;
 d.scientist=n>=25?3:n>=15?2:1;
 d.tracker=n>=26?3:n>=16?2:n>=9?1:0;
 d.noisemaker=n>=27?3:n>=18?2:n>=10?1:0;
 d.investigator=n>=23?2:n>=11?1:0;d.judge=n>=12?1:0;
 // Crew keep roughly half the seats; the remaining seats go to independent neutrals.
 const crew=Math.ceil(n/2),slots=n-crew-bad;
 // Every neutral role appears at most once, including the single Jester.
 const neutrals:FieldRole[]=['jester','scavenger',...(n>=13?['lonewolf' as const]:[]),'executioner','survivor','arsonist','thief','escapeartist','coroner'];
 for(const role of neutrals.slice(0,slots))d[role]=1;
 const crewRoles=['engineer','scientist','tracker','noisemaker','investigator','judge'] as const;
 const reserve=Math.max(1,Math.floor(crew*.2));
 let used=crewRoles.reduce((total,key)=>total+d[key],0);
 while(used>crew-reserve){const key=[...crewRoles].sort((a,b)=>d[b]-d[a]).find(k=>d[k]>1);if(!key)break;d[key]--;used--;}
 for(const key of [...crewRoles].reverse())if(used>crew-reserve&&d[key]){d[key]--;used--;}
 d.crewmate=crew-used;
 return d;
}
