'use client';
import {useEffect,useState} from 'react';
import {AVATAR_3D} from '@/lib/first-person';
import {DOLL_NAMES} from '@/lib/doll-names';
export default function DollAvatar({index,className=''}:{index:number;className?:string}){const [src,setSrc]=useState('');const id=((index%16)+16)%16;useEffect(()=>{let active=true;setSrc('');void import('@/lib/doll-portraits').then(m=>m.dollPortrait(id)).then(url=>{if(active)setSrc(url);/* Warm the top-view frames of this figure for the field game (cached per avatar). */void import('@/lib/doll-sprites').then(m=>m.dollSheet(id)).catch(()=>{});}).catch(()=>{});return()=>{active=false;};},[id]);return <div className={`avatar doll-avatar ${className}`} style={{background:AVATAR_3D[id][0]}}>{src?<img src={src} alt={`${DOLL_NAMES[id]} 피규어 캐릭터`} draggable={false}/>:<span className="doll-placeholder">{DOLL_NAMES[id]}</span>}</div>;}
