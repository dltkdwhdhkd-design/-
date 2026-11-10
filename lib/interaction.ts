import type {Point} from './map.ts';
export type DeviceTarget={action:'taskStart'|'emergency'|'cameraStart'|'repair'|'commsRepair';station?:string;point:Point;height:number;label:string};
export type Reach={target:DeviceTarget;started:number};
export const CONTACT_MS=260;
export function reachAmount(elapsed:number){if(elapsed<0||elapsed>=620)return 0;const t=elapsed<260?elapsed/260:elapsed<360?1:1-(elapsed-360)/260;return t*t*(3-2*t);}
