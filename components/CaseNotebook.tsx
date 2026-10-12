'use client';
import {useState} from 'react';
import {Search,Save} from 'lucide-react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {View} from '@/lib/game';
type Case=NonNullable<View['field']>['cases'][number];
function CasePage({file,readOnly,send}:{file:Case;readOnly:boolean;send:(a:string,e?:Record<string,unknown>)=>Promise<boolean>}){
 const [memo,setMemo]=useState(file.memo),[saving,setSaving]=useState(false),[saved,setSaved]=useState(file.memo);
 return <div className="case-page"><div className="case-stamp">탐색 {file.day} · {file.victim} 사건 <span>검문 {file.answers.length} / 3</span></div><p className="case-help">검문은 다음 탐색에서 대상 가까이 이동한 뒤 사용하세요. 위치는 사건 당시의 기록이며 직업을 판정하지 않습니다.</p><div className="case-answers">{file.answers.length?file.answers.map(a=><div key={a.id}><strong>{a.name}</strong><span>{a.place}</span></div>):<p>아직 검문한 사람이 없습니다.</p>}</div><label className="field"><span>내 추리 메모 · 현장 / 용의자 / 임포스터 유형</span><textarea maxLength={400} rows={4} value={memo} disabled={readOnly} onChange={e=>setMemo(e.target.value)} placeholder="회의에서 들은 주장과 목격 내용을 기록하세요. 이 메모는 나만 볼 수 있습니다."/></label><button className="secondary" disabled={readOnly||saving||memo===saved} onClick={async()=>{setSaving(true);try{if(await send('caseNote',{caseId:file.id,memo}))setSaved(memo);}finally{setSaving(false);}}}><Save size={16}/>{saving?'저장 중…':memo===saved?'저장됨':'메모 저장'}</button></div>;
}
export default function CaseNotebook({room,send,selected,onSelect}:{room:View;send:(a:string,e?:Record<string,unknown>)=>Promise<boolean>;selected?:string;onSelect?:(id:string)=>void}){
 const [current,setCurrent]=useState('');const files=room.field?.cases||[],file=files.find(c=>c.id===(selected??current))||files.at(-1),me=room.players.find(p=>p.id===room.me);
 return <section className="case-notebook"><h3><Search size={20}/> 탐정 사건 수첩</h3>{file?<><Select value={file.id} onValueChange={id=>{setCurrent(id);onSelect?.(id);}}><SelectTrigger className="select-box" aria-label="조사할 사건"><SelectValue/></SelectTrigger><SelectContent>{files.map(c=><SelectItem key={c.id} value={c.id}>탐색 {c.day} · {c.victim} 사건</SelectItem>)}</SelectContent></Select><CasePage key={file.id} file={file} readOnly={!me?.alive||room.paused||!['field','discussion','vote'].includes(room.phase)} send={send}/></>:<p className="case-help">회의가 열리면 탈락한 크루의 사건 파일이 생깁니다. 현재는 미션과 목격 정보에 집중하세요.</p>}</section>;
}
