import * as T from 'three';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
import {createDoll} from '../lib/doll-character.ts';
import {writeFileSync} from 'node:fs';
class Node{constructor(tag){this.tag=tag;this.attrs={};this.childNodes=[];this.style={};}setAttribute(k,v){this.attrs[k]=v;}appendChild(n){this.childNodes.push(n);}removeChild(n){this.childNodes=this.childNodes.filter(c=>c!==n);}get outerHTML(){return `<${this.tag} ${Object.entries(this.attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${this.childNodes.map(n=>n.outerHTML).join('')}</${this.tag}>`;}}
globalThis.document={createElementNS:(_,tag)=>new Node(tag)};
const scene=new T.Scene();scene.add(new T.AmbientLight('#ffffff',.65));const light=new T.DirectionalLight('#fff2df',.85);light.position.set(-3,5,-5);scene.add(light);
for(let n=0;n<4;n++){const doll=createDoll([0,3,10,14][n]);doll.root.position.x=(n-1.5)*1.35;doll.root.rotation.y=-.12;scene.add(doll.root);}
const camera=new T.OrthographicCamera(-3,3,1.5,-1.5,.1,20);camera.position.set(0,1.4,-6);camera.lookAt(0,.95,0);const renderer=new SVGRenderer();renderer.setSize(1400,700);renderer.setPrecision(3);renderer.render(scene,camera);renderer.domElement.setAttribute('xmlns','http://www.w3.org/2000/svg');writeFileSync('/workspace/dolls-check.svg',renderer.domElement.outerHTML);
