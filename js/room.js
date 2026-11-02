// Интерьер квартиры: расстановка мебели, гости, чат-пузыри.
import * as THREE from 'three';
import {FURN} from './config.js';

const WALLS={dorm:[0x8a8f7a,0x6b5a45],khrush:[0xc9b79c,0x8b5a2b],panel9:[0xb8c4c9,0x9c6b3e],panel16:[0xd6cfc2,0xa0743f],novostroy:[0xeae6df,0xc8a26b],tower:[0x2f3640,0x3b3b3b]};

export function createRoom(renderer){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x15121c);
  scene.add(new THREE.HemisphereLight(0xfff4e0,0x3a3040,1.2));
  const sun=new THREE.DirectionalLight(0xffe8c0,1.6);sun.position.set(-6,10,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10});scene.add(sun);
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,200);
  const MC=new Map();const mat=c=>{if(!MC.has(c))MC.set(c,new THREE.MeshLambertMaterial({color:c,flatShading:true}));return MC.get(c);};
  const BOX=new THREE.BoxGeometry(1,1,1);
  function B(g,w,h,d,c,x=0,y=0,z=0,basic=false){const m=new THREE.Mesh(BOX,basic?new THREE.MeshBasicMaterial({color:c}):mat(c));m.scale.set(w,h,d);m.position.set(x,y+h/2,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;}

  // модели мебели: начало координат — угол клетки (0,0), размер w×d
  function makeItem(it){const g=new THREE.Group(),f=FURN[it];
    switch(it){
    case 'bed':B(g,1.9,.25,.95,0x6b4a2f,1,0,.5);B(g,1.8,.15,.9,0xf0ece2,1,.25,.5);B(g,1.1,.08,.92,0x3d6ea6,1.3,.4,.5);B(g,.35,.12,.6,0xffffff,.3,.4,.5);B(g,.1,.6,.95,0x6b4a2f,.05,0,.5);break;
    case 'sofa':B(g,1.9,.3,.85,0x8e3b46,1,0,.5);B(g,1.9,.45,.25,0x8e3b46,1,.3,.15);B(g,.2,.3,.85,0x7a2f3a,.1,.3,.5);B(g,.2,.3,.85,0x7a2f3a,1.9,.3,.5);break;
    case 'table':B(g,.9,.08,.9,0xa0743f,.5,.62,.5);for(const[x,z]of[[.1,.1],[.9,.1],[.1,.9],[.9,.9]])B(g,.07,.62,.07,0x7a5a3a,x,0,z);break;
    case 'chair':B(g,.45,.06,.45,0xa0743f,.5,.38,.5);B(g,.45,.5,.06,0xa0743f,.5,.38,.28);for(const[x,z]of[[.3,.3],[.7,.3],[.3,.7],[.7,.7]])B(g,.05,.38,.05,0x7a5a3a,x,0,z);break;
    case 'wardrobe':B(g,.9,1.9,.6,0x7a5a3a,.5,0,.4);B(g,.02,1.7,.02,0x3a2a1a,.5,.1,.71);B(g,.05,.12,.03,0xd4af37,.42,.95,.72);B(g,.05,.12,.03,0xd4af37,.58,.95,.72);break;
    case 'shelf':B(g,.9,1.4,.35,0x8b5a2b,.5,0,.25);for(let k=0;k<3;k++)for(let b=0;b<5;b++)B(g,.12,.3,.25,[0xc0392b,0x2980b9,0x27ae60,0xf1c40f,0x8e44ad][(b+k)%5],.18+b*.15,.1+k*.45,.27);break;
    case 'lamp':B(g,.3,.05,.3,0x333333,.5,0,.5);B(g,.05,1.3,.05,0x333333,.5,0,.5);B(g,.4,.3,.4,0xfff1b0,.5,1.3,.5,true);break;
    case 'plant':B(g,.35,.35,.35,0xb5651d,.5,0,.5);for(let k=0;k<5;k++){const l=B(g,.12,.6,.12,0x2e7d32,.5+Math.cos(k*1.3)*.1,.3,.5+Math.sin(k*1.3)*.1);l.rotation.z=Math.cos(k*1.3)*.4;l.rotation.x=Math.sin(k*1.3)*.4;}break;
    case 'aquarium':B(g,.9,.5,.5,0x6b4a2f,.5,0,.5);const w=B(g,.85,.5,.45,0x5dade2,.5,.5,.5);w.material=new THREE.MeshLambertMaterial({color:0x5dade2,transparent:true,opacity:.6});B(g,.12,.06,.04,0xf39c12,.4,.7,.5);B(g,.1,.05,.04,0xe74c3c,.65,.82,.45);break;
    case 'rug':B(g,1.9,.03,1.9,0xd4a76a,1,0,1);B(g,1.5,.035,1.5,0xb5651d,1,0,1);B(g,1,.04,1,0xe8c547,1,0,1);break;
    }
    g.userData={it,w:f.w,d:f.d};return g;}
  function makePerson(shirt){const g=new THREE.Group();B(g,.1,.3,.1,0x34495e,-.08,0,0);B(g,.1,.3,.1,0x34495e,.08,0,0);B(g,.3,.32,.18,shirt,0,.3,0);B(g,.24,.24,.24,0xf1c27d,0,.62,0);B(g,.27,.08,.27,0xffd166,0,.86,0);return g;}

  let st=null;
  const root=new THREE.Group();scene.add(root);
  const ghostMat=new THREE.MeshBasicMaterial({color:0x7bd389,transparent:true,opacity:.5});
  function open({size,tier,layout,editable,owned,elsewhere,onSave,title}){
    root.clear();const[w,d]=size;st={w,d,tier,layout:layout.map(o=>({...o})),editable,owned:owned||{},elsewhere:elsewhere||{},onSave,hand:null,ghost:null,meshes:[],people:new Map()};
    const[wc,fc]=WALLS[tier]||WALLS.panel9;
    for(let x=0;x<w;x++)for(let z=0;z<d;z++){const m=new THREE.Mesh(BOX,mat(new THREE.Color(fc).multiplyScalar((x+z)%2?.92:1).getHex()));m.scale.set(1,.1,1);m.position.set(x+.5,-.05,z+.5);m.receiveShadow=true;root.add(m);}
    const wallH=2.6;B(root,w,wallH,.12,wc,w/2,0,-.06);B(root,.12,wallH,d,new THREE.Color(wc).multiplyScalar(.85).getHex(),-.06,0,d/2);
    B(root,w,.12,.14,0xf4ecd8,w/2,0,0);B(root,.14,.12,d,0xf4ecd8,0,0,d/2);
    // окна
    if(tier==='tower'){const win=B(root,w-1,1.8,.05,0x0b1a33,w/2,.5,.01,true);for(let k=0;k<40;k++)B(root,.08,.08+Math.random()*.6,.02,Math.random()<.5?0xffd977:0x4a7aa8,.8+Math.random()*(w-1.6),.55,.04,true);}
    else{const n=Math.max(1,Math.floor(w/3));for(let k=0;k<n;k++){const x=(k+.5)*w/n;B(root,1,1,.05,0x9fd3ff,x,1,.01,true);B(root,1.1,.08,.1,0xffffff,x,.95,.05);}}
    if(tier==='dorm'){B(root,.8,.03,.6,0x5a4a3a,1.5,1.4,.01);}
    rebuild();resize();
    if(title)document.getElementById('roomTitle').textContent=title;
  }
  const rot=(it,r)=>{const f=FURN[it];return r%2?[f.d,f.w]:[f.w,f.d];};
  function cells(o){const[w,d]=rot(o.i,o.r||0),out=[];for(let x=0;x<w;x++)for(let z=0;z<d;z++)out.push(`${o.x+x},${o.y+z}`);return out;}
  function fits(o,ignore){const[w,d]=rot(o.i,o.r||0);if(o.x<0||o.y<0||o.x+w>st.w||o.y+d>st.d)return false;
    const fl=!!FURN[o.i].floor;const occ=new Set();for(const q of st.layout){if(q===ignore||!!FURN[q.i].floor!==fl)continue;cells(q).forEach(c=>occ.add(c));}
    return cells(o).every(c=>!occ.has(c));}
  function place(m,o){const[w,d]=rot(o.i,o.r||0);m.rotation.y=-(o.r||0)*Math.PI/2;
    const r=o.r||0;const off=[[0,0],[d,0],[w,d],[0,w]][r]; // компенсация поворота вокруг угла
    m.position.set(o.x+(r===1?w:r===2?w:0),0,o.y+(r===2?d:r===3?d:0));}
  function rebuild(){for(const m of st.meshes)root.remove(m);st.meshes=[];for(const o of st.layout){const m=makeItem(o.i);place(m,o);root.add(m);st.meshes.push(m);m.userData.o=o;}}
  function free(it){const placed=st.layout.filter(o=>o.i===it).length+(st.hand&&st.hand.i===it&&!st.hand.fromLayout?0:0);return Math.floor(st.owned[it]||0)-placed-(st.elsewhere[it]||0);}
  function takeToHand(it){if(!st.editable||free(it)<=0)return false;setHand({i:it,x:0,y:0,r:0});return true;}
  function setHand(h){if(st.ghost){root.remove(st.ghost);st.ghost=null;}st.hand=h;if(h){st.ghost=makeItem(h.i);st.ghost.traverse(m=>{if(m.isMesh)m.material=ghostMat;});root.add(st.ghost);place(st.ghost,h);}}
  function rotateHand(){if(st.hand){st.hand.r=((st.hand.r||0)+1)%4;place(st.ghost,st.hand);}}
  function dropHand(){setHand(null);}
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  function tileAt(cx,cy){ndc.set(cx/innerWidth*2-1,-(cy/innerHeight)*2+1);ray.setFromCamera(ndc,cam);const p=ray.ray.intersectPlane(plane,new THREE.Vector3());return p?{x:Math.floor(p.x),y:Math.floor(p.z)}:null;}
  function pointer(cx,cy,tap){if(!st||!st.editable)return;const t=tileAt(cx,cy);if(!t)return;
    if(st.hand){st.hand.x=t.x;st.hand.y=t.y;place(st.ghost,st.hand);ghostMat.color.setHex(fits(st.hand)?0x7bd389:0xff6b6b);
      if(tap&&fits(st.hand)){st.layout.push({i:st.hand.i,x:t.x,y:t.y,r:st.hand.r||0});setHand(null);rebuild();st.onSave&&st.onSave(st.layout);}}
    else if(tap){const k=`${t.x},${t.y}`;const o=[...st.layout].reverse().find(q=>cells(q).includes(k));
      if(o){st.layout.splice(st.layout.indexOf(o),1);rebuild();setHand({i:o.i,x:o.x,y:o.y,r:o.r||0});st.onSave&&st.onSave(st.layout);}}}
  // люди в комнате
  function setPeople(list){if(!st)return;const ids=new Set(list.map(p=>p.uid));
    for(const[uid,p]of st.people)if(!ids.has(uid)){root.remove(p.mesh);p.label.remove();st.people.delete(uid);}
    for(const p of list)if(!st.people.has(p.uid)){const m=makePerson(new THREE.Color(p.color).getHex());let x,z,k=0;
      do{x=Math.floor(Math.random()*st.w);z=Math.floor(Math.random()*st.d);k++;}while(k<30&&st.layout.some(o=>!FURN[o.i].floor&&cells(o).includes(`${x},${z}`)));
      m.position.set(x+.5,0,z+.5);m.rotation.y=Math.random()*6;root.add(m);const label=document.createElement('div');label.className='wlab other roomlab';label.textContent=p.nick;label.style.color=p.color;document.getElementById('labels').appendChild(label);
      st.people.set(p.uid,{mesh:m,label,bubble:null,bt:0});}}
  function say(uid,text){const p=st&&st.people.get(uid);if(!p)return;if(!p.bubble){p.bubble=document.createElement('div');p.bubble.className='bubble';document.getElementById('labels').appendChild(p.bubble);}p.bubble.textContent=text;p.bt=5;}
  function close(){if(!st)return;for(const[,p]of st.people){p.label.remove();p.bubble&&p.bubble.remove();}st=null;root.clear();}
  function resize(){if(!st)return;const asp=innerWidth/innerHeight,s=Math.max(st.w,st.d)*.85+1;const z=asp<1?s/asp*.75:s;cam.left=-z*asp;cam.right=z*asp;cam.top=z;cam.bottom=-z;cam.updateProjectionMatrix();
    cam.position.set(st.w/2+30,32,st.d/2+30);cam.lookAt(st.w/2,.6,st.d/2);}
  addEventListener('resize',resize);
  const _v=new THREE.Vector3();
  function render(dt){if(!st)return;renderer.render(scene,cam);
    for(const[,p]of st.people){_v.set(p.mesh.position.x,1.3,p.mesh.position.z).project(cam);const x=(_v.x+1)/2*innerWidth,y=(1-_v.y)/2*innerHeight;
      p.label.style.left=x+'px';p.label.style.top=y+'px';p.label.style.display='';
      if(p.bubble){p.bt-=dt;p.bubble.style.left=x+'px';p.bubble.style.top=(y-18)+'px';p.bubble.style.opacity=Math.min(1,p.bt);if(p.bt<=0){p.bubble.remove();p.bubble=null;}}}}
  return {open,close,render,pointer,takeToHand,rotateHand,dropHand,free,setPeople,say,get state(){return st;},resize};
}
