// Интерьер квартиры: ходьба по тапу, посадка на мебель, режим ремонта (мебель, стены, пол), гости.
import * as THREE from 'three';
import {FURN} from './config.js';

const WALLS={khrush:[0xc9b79c,0x8b5a2b],panel9:[0xb8c4c9,0x9c6b3e],panel16:[0xd6cfc2,0xa0743f],novostroy:[0xeae6df,0xc8a26b],tower:[0x2f3640,0x3b3b3b],club:[0xe8d8b0,0x8a5a3a],cinema:[0x3a2030,0x5a2a3a]};
export const WALL_COLORS=['#c9b79c','#e8dcc0','#b8c4c9','#9fc5b0','#f4c7c3','#c3b1e1','#f6e7a1','#8fa3b8','#5d6d7e','#ffffff','#7a4a3a','#2f3640'];
export const FLOOR_COLORS=['#8b5a2b','#a0743f','#c8a26b','#6b4a2f','#d9cbb0','#7f8c8d','#3b3b3b','#9c6b3e','#b5651d','#e8e2d4'];
// где можно сесть/лечь: смещение внутри предмета (до поворота) и поза
const SEATS={chair:[{x:.5,z:.55,pose:'sit',face:0}],sofa:[{x:.6,z:.55,pose:'sit',face:0},{x:1.4,z:.55,pose:'sit',face:0}],bed:[{x:1,z:.5,pose:'lie',face:0}]};

export function createRoom(renderer){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x15121c);
  scene.add(new THREE.HemisphereLight(0xfff4e0,0x3a3040,1.2));
  const sun=new THREE.DirectionalLight(0xffe8c0,1.6);sun.position.set(-6,10,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10});scene.add(sun);
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,200);
  const MC=new Map();const mat=c=>{if(!MC.has(c))MC.set(c,new THREE.MeshLambertMaterial({color:c,flatShading:true}));return MC.get(c);};
  const BOX=new THREE.BoxGeometry(1,1,1);
  function B(g,w,h,d,c,x=0,y=0,z=0,basic=false){const m=new THREE.Mesh(BOX,basic?new THREE.MeshBasicMaterial({color:c}):mat(c));m.scale.set(w,h,d);m.position.set(x,y+h/2,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;}

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
    case 'aquarium':{B(g,.9,.5,.5,0x6b4a2f,.5,0,.5);const w=B(g,.85,.5,.45,0x5dade2,.5,.5,.5);w.material=new THREE.MeshLambertMaterial({color:0x5dade2,transparent:true,opacity:.6});B(g,.12,.06,.04,0xf39c12,.4,.7,.5);B(g,.1,.05,.04,0xe74c3c,.65,.82,.45);}break;
    case 'rug':B(g,1.9,.03,1.9,0xd4a76a,1,0,1);B(g,1.5,.035,1.5,0xb5651d,1,0,1);B(g,1,.04,1,0xe8c547,1,0,1);break;
    }
    g.userData={it,w:f.w,d:f.d};return g;}

  let st=null;
  const root=new THREE.Group();scene.add(root);
  const ghostMat=new THREE.MeshBasicMaterial({color:0x7bd389,transparent:true,opacity:.5});
  const marker=new THREE.Mesh(new THREE.BoxGeometry(.8,.02,.8),new THREE.MeshBasicMaterial({color:0xffd166,transparent:true,opacity:.6}));marker.visible=false;
  function open(o){
    root.clear();const[w,d]=o.size;const decor=(o.layout.find(e=>e.i==='_decor'))||{};
    st={w,d,tier:o.tier,layout:o.layout.filter(e=>e.i!=='_decor').map(e=>({...e})),decor:{wall:decor.wall||null,floor:decor.floor||null},editable:o.editable,edit:false,
      owned:o.owned||{},elsewhere:o.elsewhere||{},onSave:o.onSave,onMove:o.onMove,makeAvatar:o.makeAvatar,meId:o.meId,hand:null,ghost:null,meshes:[],people:new Map(),shell:new THREE.Group()};
    root.add(st.shell);root.add(marker);buildShell();rebuild();resize();
    if(o.title)document.getElementById('roomTitle').textContent=o.title;
  }
  function buildShell(){const g=st.shell;g.clear();const{w,d}=st;const[wc0,fc0]=WALLS[st.tier]||WALLS.panel9;
    const wc=st.decor.wall?new THREE.Color(st.decor.wall).getHex():wc0,fc=st.decor.floor?new THREE.Color(st.decor.floor).getHex():fc0;
    for(let x=0;x<w;x++)for(let z=0;z<d;z++){const m=new THREE.Mesh(BOX,mat(new THREE.Color(fc).multiplyScalar((x+z)%2?.92:1).getHex()));m.scale.set(1,.1,1);m.position.set(x+.5,-.05,z+.5);m.receiveShadow=true;m.userData.floor=1;g.add(m);}
    const wallH=2.6;B(g,w,wallH,.12,wc,w/2,0,-.06);B(g,.12,wallH,d,new THREE.Color(wc).multiplyScalar(.85).getHex(),-.06,0,d/2);
    B(g,w,.12,.14,0xf4ecd8,w/2,0,0);B(g,.14,.12,d,0xf4ecd8,0,0,d/2);
    if(st.tier==='cinema'){B(g,w-2.4,1.5,.05,0xf4f4f4,w/2,.75,.02,true);B(g,w-2.2,.1,.08,0x111111,w/2,.7,.04);B(g,w-2.2,.1,.08,0x111111,w/2,2.25,.04);
      B(g,.6,.9,.04,0xe67e22,.6,.9,.05,true);B(g,.6,.9,.04,0x2e86ab,w-.6,.9,.05,true);}
    else if(st.tier==='club'){B(g,3.6,.25,1.6,0x6b3a2a,w/2,0,.8);B(g,3.6,1.6,.04,0xa8323a,w/2,.9,.02);B(g,1.6,.25,.03,0xffd166,w/2,2.1,.03,true);}
    else if(st.tier==='tower'){B(g,w-1,1.8,.05,0x0b1a33,w/2,.5,.01,true);for(let k=0;k<40;k++)B(g,.08,.08+Math.random()*.6,.02,Math.random()<.5?0xffd977:0x4a7aa8,.8+Math.random()*(w-1.6),.55,.04,true);}
    else{const n=Math.max(1,Math.floor(w/3));for(let k=0;k<n;k++){const x=(k+.5)*w/n;B(g,1,1,.05,0x9fd3ff,x,1,.01,true);B(g,1.1,.08,.1,0xffffff,x,.95,.05);}}}
  const rot=(it,r)=>{const f=FURN[it];return r%2?[f.d,f.w]:[f.w,f.d];};
  function cells(o){const[w,d]=rot(o.i,o.r||0),out=[];for(let x=0;x<w;x++)for(let z=0;z<d;z++)out.push(`${o.x+x},${o.y+z}`);return out;}
  function fits(o,ignore){const[w,d]=rot(o.i,o.r||0);if(o.x<0||o.y<0||o.x+w>st.w||o.y+d>st.d)return false;
    const fl=!!FURN[o.i].floor;const occ=new Set();for(const q of st.layout){if(q===ignore||!!FURN[q.i].floor!==fl)continue;cells(q).forEach(c=>occ.add(c));}
    return cells(o).every(c=>!occ.has(c));}
  function place(m,o){const[w,d]=rot(o.i,o.r||0);m.rotation.y=-(o.r||0)*Math.PI/2;const r=o.r||0;m.position.set(o.x+(r===1||r===2?w:0),0,o.y+(r===2||r===3?d:0));}
  // точка внутри предмета (локальные x,z до поворота) → мировые координаты комнаты
  function localToRoom(o,lx,lz){const r=o.r||0,[w,d]=rot(o.i,r),f=FURN[o.i];
    const p=[[lx,lz],[f.d-lz,lx],[f.w-lx,f.d-lz],[lz,f.w-lx]][r];return{x:o.x+p[0],z:o.y+p[1],ry:-r*Math.PI/2};}
  function rebuild(){for(const m of st.meshes)root.remove(m);st.meshes=[];for(const o of st.layout){const m=makeItem(o.i);place(m,o);root.add(m);st.meshes.push(m);m.userData.o=o;}}
  function save(){st.onSave&&st.onSave([...st.layout,{i:'_decor',wall:st.decor.wall,floor:st.decor.floor}]);}
  function free(it){return Math.floor(st.owned[it]||0)-st.layout.filter(o=>o.i===it).length-(st.elsewhere[it]||0);}
  function takeToHand(it){if(!st.editable||free(it)<=0)return false;st.edit=true;setHand({i:it,x:0,y:0,r:0});return true;}
  function setHand(h){if(st.ghost){root.remove(st.ghost);st.ghost=null;}st.hand=h;if(h){st.ghost=makeItem(h.i);st.ghost.traverse(m=>{if(m.isMesh)m.material=ghostMat;});root.add(st.ghost);place(st.ghost,h);}}
  function rotateHand(){if(st.hand){st.hand.r=((st.hand.r||0)+1)%4;place(st.ghost,st.hand);}}
  function dropHand(){setHand(null);}
  function setEdit(on){st.edit=!!on&&st.editable;if(!st.edit)setHand(null);marker.visible=false;}
  function setDecor(k,v){st.decor[k]=v;buildShell();save();}
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  function tileAt(cx,cy){const r=renderer.domElement.getBoundingClientRect();ndc.set((cx-r.left)/r.width*2-1,-((cy-r.top)/r.height)*2+1);ray.setFromCamera(ndc,cam);const p=ray.ray.intersectPlane(plane,new THREE.Vector3());return p?{x:Math.floor(p.x),y:Math.floor(p.z),fx:p.x,fz:p.z}:null;}
  // ---------- ходьба ----------
  const blocked=()=>{const s=new Set();for(const o of st.layout)if(!FURN[o.i].floor)cells(o).forEach(c=>s.add(c));return s;};
  function bfs(sx,sy,tx,ty){const bl=blocked(),key=(x,y)=>x+','+y,prev=new Map([[key(sx,sy),null]]),q=[[sx,sy]];
    while(q.length){const[x,y]=q.shift();if(x===tx&&y===ty){const path=[];let k=key(x,y);while(k&&k!==key(sx,sy)){const[a,b]=k.split(',').map(Number);path.unshift([a,b]);k=prev.get(k);}return path;}
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=key(nx,ny);if(nx<0||ny<0||nx>=st.w||ny>=st.d||prev.has(k)||bl.has(k))continue;prev.set(k,key(x,y));q.push([nx,ny]);}}
    return null;}
  function freeCell(){const bl=blocked();for(let k=0;k<60;k++){const x=Math.floor(Math.random()*st.w),y=Math.floor(Math.random()*st.d);if(!bl.has(x+','+y))return[x,y];}return[0,0];}
  function walkTo(p,tx,ty,seat){const sx=Math.round(p.x-.5),sy=Math.round(p.z-.5);if(p.seat){p.seat=null;p.pose=null;}
    let goal=[tx,ty];if(seat){const bl=blocked();let best=null;for(const[dx,dy]of[[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,1]]){const c=[Math.floor(seat.x)+dx,Math.floor(seat.z)+dy];
        if(c[0]<0||c[1]<0||c[0]>=st.w||c[1]>=st.d||bl.has(c.join(',')))continue;const path=bfs(sx,sy,c[0],c[1]);if(path&&(!best||path.length<best.length))best=path;}
      if(!best)return false;p.path=best;p.pendingSeat=seat;return true;}
    const path=bfs(sx,sy,goal[0],goal[1]);if(!path)return false;p.path=path;p.pendingSeat=null;return true;}
  function seatAt(fx,fz){for(const o of st.layout){const S=SEATS[o.i];if(!S||!cells(o).includes(Math.floor(fx)+','+Math.floor(fz)))continue;
      let best=null,bd=1e9;for(const s of S){const p=localToRoom(o,s.x,s.z),d2=(p.x-fx)**2+(p.z-fz)**2;if(d2<bd){bd=d2;best={...p,pose:s.pose,o};}}return best;}return null;}
  function pointer(cx,cy,tap){if(!st)return;const t=tileAt(cx,cy);if(!t)return;
    if(st.edit){
      if(st.hand){st.hand.x=t.x;st.hand.y=t.y;place(st.ghost,st.hand);ghostMat.color.setHex(fits(st.hand)?0x7bd389:0xff6b6b);
        if(tap&&fits(st.hand)){st.layout.push({i:st.hand.i,x:t.x,y:t.y,r:st.hand.r||0});setHand(null);rebuild();save();}}
      else if(tap){const k=`${t.x},${t.y}`;const o=[...st.layout].reverse().find(q=>cells(q).includes(k));
        if(o){st.layout.splice(st.layout.indexOf(o),1);rebuild();setHand({i:o.i,x:o.x,y:o.y,r:o.r||0});save();}}
      return;}
    if(!tap)return;const me=st.people.get(st.meId);if(!me)return;
    if(t.x<0||t.y<0||t.x>=st.w||t.y>=st.d)return;
    const seat=seatAt(t.fx,t.fz);
    if(walkTo(me,t.x,t.y,seat)){marker.visible=true;marker.position.set(t.x+.5,.01,t.y+.5);st.onMove&&st.onMove({x:t.x,y:t.y,seat:seat?{x:t.fx,z:t.fz}:null});}}
  function moveOther(uid,m){const p=st&&st.people.get(uid);if(!p)return;const seat=m.seat?seatAt(m.seat.x,m.seat.z):null;walkTo(p,m.x,m.y,seat);}
  // ---------- люди ----------
  function setPeople(list){if(!st)return;const ids=new Set(list.map(p=>p.uid));
    for(const[uid,p]of st.people)if(!ids.has(uid)){root.remove(p.mesh);p.label.remove();p.bubble&&p.bubble.remove();st.people.delete(uid);}
    for(const p of list)if(!st.people.has(p.uid)){const m=st.makeAvatar(p.look,p.skin);m.scale.multiplyScalar(1.25);const[x,z]=freeCell();
      m.position.set(x+.5,0,z+.5);root.add(m);const label=document.createElement('div');label.className='wlab other roomlab';label.textContent=p.nick;label.style.color=p.color;document.getElementById('labels').appendChild(label);
      st.people.set(p.uid,{mesh:m,label,bubble:null,bt:0,x:x+.5,z:z+.5,path:[],face:0,seat:null,pose:null,pendingSeat:null,t:Math.random()*6});}}
  function say(uid,text){const p=st&&st.people.get(uid);if(!p)return;if(!p.bubble){p.bubble=document.createElement('div');p.bubble.className='bubble';document.getElementById('labels').appendChild(p.bubble);}p.bubble.textContent=text;p.bt=5;}
  function close(){if(!st)return;for(const[,p]of st.people){p.label.remove();p.bubble&&p.bubble.remove();}st=null;root.clear();}
  function resize(){if(!st)return;const asp=innerWidth/innerHeight,s=Math.max(st.w,st.d)*.85+1;const z=asp<1?s/asp*.75:s;cam.left=-z*asp;cam.right=z*asp;cam.top=z;cam.bottom=-z;cam.updateProjectionMatrix();
    cam.position.set(st.w/2+30,32,st.d/2+30);cam.lookAt(st.w/2,.6,st.d/2);}
  addEventListener('resize',resize);
  const _v=new THREE.Vector3();
  function animate(p,dt){p.t+=dt;const ud=p.mesh.userData,m=p.mesh;
    if(p.path.length){const[tx,ty]=p.path[0],gx=tx+.5,gz=ty+.5,dx=gx-p.x,dz=gz-p.z,d=Math.hypot(dx,dz),sp=2.4*dt;p.face=Math.atan2(dx,dz);
      if(d<=sp){p.x=gx;p.z=gz;p.path.shift();}else{p.x+=dx/d*sp;p.z+=dz/d*sp;}
      if(!p.path.length&&p.pendingSeat){p.seat=p.pendingSeat;p.pose=p.seat.pose;p.pendingSeat=null;}}
    const moving=p.path.length>0,ph=p.t*12;m.rotation.set(0,0,0);
    if(p.seat&&!moving){m.position.set(p.seat.x,p.pose==='lie'?.45:.17,p.seat.z);m.rotation.y=p.seat.ry;
      if(p.pose==='lie'){m.rotation.y=p.seat.ry+Math.PI/2;m.rotation.x=-Math.PI/2;m.position.y=.5;ud.legL.rotation.x=ud.legR.rotation.x=0;}
      else{ud.legL.rotation.x=ud.legR.rotation.x=-Math.PI/2;}ud.armL.rotation.x=ud.armR.rotation.x=-.3;}
    else{m.position.set(p.x,moving?Math.abs(Math.sin(ph))*.05:0,p.z);m.rotation.y=p.face;
      ud.legL.rotation.x=moving?Math.sin(ph)*.7:0;ud.legR.rotation.x=moving?-Math.sin(ph)*.7:0;ud.armL.rotation.x=moving?Math.sin(ph)*.5:Math.sin(p.t*1.5)*.05;ud.armR.rotation.x=moving?-Math.sin(ph)*.5:-Math.sin(p.t*1.5)*.05;}}
  function render(dt){if(!st)return;for(const[,p]of st.people)animate(p,dt);if(marker.visible){const me=st.people.get(st.meId);if(me&&!me.path.length)marker.visible=false;}
    renderer.render(scene,cam);
    for(const[,p]of st.people){_v.set(p.mesh.position.x,p.pose==='lie'?1:1.5,p.mesh.position.z).project(cam);const x=(_v.x+1)/2*innerWidth,y=(1-_v.y)/2*innerHeight;
      p.label.style.left=x+'px';p.label.style.top=y+'px';p.label.style.display='';
      if(p.bubble){p.bt-=dt;p.bubble.style.left=x+'px';p.bubble.style.top=(y-18)+'px';p.bubble.style.opacity=Math.min(1,p.bt);if(p.bt<=0){p.bubble.remove();p.bubble=null;}}}}
  return {open,close,render,pointer,takeToHand,rotateHand,dropHand,free,setPeople,say,moveOther,setEdit,setDecor,get state(){return st;},resize};
}
