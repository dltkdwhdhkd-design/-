'use client';
import {useEffect,useState} from 'react';
import {Maximize,Minimize} from 'lucide-react';

export default function FullscreenButton(){
 const [active,setActive]=useState(false);
 useEffect(()=>{
  const changed=()=>setActive(Boolean(document.fullscreenElement));
  document.addEventListener('fullscreenchange',changed);
  return()=>{document.removeEventListener('fullscreenchange',changed);document.body.classList.remove('immersive-play');if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});};
 },[]);
 useEffect(()=>{document.body.classList.toggle('immersive-play',active);},[active]);
 async function toggle(){
  if(active){setActive(false);if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});return;}
  // Fullscreen the document so portal-based maps, missions and votes remain visible.
  setActive(true);
  try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{/* Unsupported devices still get the viewport-filling layout. */}
 }
 return <button type="button" className={`fullscreen-toggle secondary ${active?'is-active':''}`} onClick={()=>void toggle()} aria-pressed={active} aria-label={active?'전체화면 나가기':'전체화면으로 플레이'} title={active?'전체화면 나가기':'전체화면으로 플레이'}>{active?<Minimize size={17}/>:<Maximize size={17}/>}<span>{active?'화면 축소':'전체화면'}</span></button>;
}
