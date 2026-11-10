import type {Point} from './map.ts';
// Positive yaw turns right; the existing server still receives world-space input.
export function cameraMovement(p:Point,yaw:number):Point{const c=Math.cos(yaw),s=Math.sin(yaw);return{x:p.x*c-p.y*s,y:p.x*s+p.y*c};}
export function inFront(own:Point,target:Point,yaw:number,halfAngle=Math.PI*.42){const x=target.x-own.x,y=target.y-own.y,d=Math.hypot(x,y);return d<12||(x*Math.sin(yaw)-y*Math.cos(yaw))/d>=Math.cos(halfAngle);}
export const AVATAR_3D=[
 ['#282934','#211c1c','#bc292c','#edb185','#171c27'],['#202c45','#202735','#74c4d9','#f1bf99','#172333'],
 ['#ece0c1','#302321','#e1a342','#a76642','#4a493d'],['#273e35','#953d25','#9cbfaf','#f2c6a0','#29282a'],
 ['#742936','#412523','#e6dacf','#f2c2a0','#26242b'],['#282635','#231c30','#6946a7','#eabea0','#22222c'],
 ['#194b91','#c3a566','#17243d','#e9bc93','#ded2ad'],['#624132','#453026','#bd5522','#c59069','#2e4254'],
 ['#5c6849','#231f1c','#333738','#dfac7f','#233044'],['#9983b8','#1d1c23','#e4d5d8','#f1c4a3','#2b2933'],
 ['#26646c','#705033','#303b40','#edb884','#60636b'],['#b65422','#3d2523','#292732','#a75d34','#2d2d36'],
 ['#6e737b','#492f2a','#b26777','#f2bd98','#242c39'],['#c28a3b','#b38947','#283949','#ecc29b','#293b52'],
 ['#50293d','#b5adb6','#222631','#eac1b0','#303547'],['#293a52','#1d2027','#c7c5c3','#d9a988','#252b3c'],
] as const;
