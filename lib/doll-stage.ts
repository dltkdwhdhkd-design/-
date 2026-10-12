import * as T from 'three';
// The 3D map's light rig (lib/scene3d.ts). Portraits and the top-view sprites use the same
// lights so a character looks the same on the selection card and in both maps.
export function stageLights(scene:T.Scene){
 scene.add(new T.HemisphereLight('#c5ebff','#314044',2.4));
 const sun=new T.DirectionalLight('#ffdfb3',2);sun.position.set(-25,50,12);scene.add(sun);
 const rim=new T.DirectionalLight('#93c8ef',1.1);rim.position.set(12,15,-15);scene.add(rim);
}
