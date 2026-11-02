// Рендер мира и косметическая симуляция (рабочие, жители, грузовики, корабли, аватары).
// Экономика считается на сервере — здесь только картинка.
import * as THREE from 'three';
import {GOODS,BLD,EMP,RES,BCT} from './config.js';
import {W,H,STEP,HY,BLOCKS,RING,buildLayout,hash} from './layout.js';

const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,s=t=>t*t*(3-2*t);const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1),u=s(xf),v=s(yf);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
let seed=1337;const srnd=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const I=(x,y)=>y*W+x,inb=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
export const T={GRASS:0,ROAD:1,WATER:2,FOREST:3,ROCK:4,PLOT:5,SAND:6,BRIDGE:7,ASPH:8,YARD:9,RING:10,FIELD:11,SEA:12};

export function createWorld(canvas,{mobile}){
  // ================= КАРТА =================
  const grid=new Uint8Array(W*H);
  const coast=x=>136+Math.round(Math.sin(x*.08)*2+vnoise(x*.2,7)*2);
  const inLake=(x,y,k=1)=>((x-34)/21)**2+((y-142)/7)**2<k;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let t=T.GRASS;const n=vnoise(x*.1,y*.1),n2=vnoise(x*.25+40,y*.25+9);
    if(n>.62)t=T.FOREST;
    if(x<14&&(n>.2||x<5))t=T.FOREST;
    if(y<24){if(x>=48&&x<=152)t=(n2>.34||y<5)?T.ROCK:(n>.35?T.FOREST:T.GRASS);else if(n>.3)t=T.FOREST;}
    if(x>178&&y<60&&n>.3)t=T.FOREST;
    if(y>78&&y<108&&x>12&&x<52&&n2>.45)t=T.FIELD;
    if(y>152&&x<96&&n>.4)t=T.FOREST;
    if(y<136){const rx=9+Math.round(Math.sin(y*.11)*2.5);if(x===rx||x===rx+1)t=T.WATER;else if((x===rx-1||x===rx+2)&&t!==T.FOREST)t=T.SAND;}
    if(inLake(x,y))t=T.WATER;else if(inLake(x,y,1.3))t=T.SAND;
    const c=coast(x);if(x>=96){if(y>=c)t=T.SEA;else if(y>=c-2)t=T.SAND;}
    if(y>=40&&x>=196+Math.round(Math.sin(y*.1)*2))t=T.SEA;
    grid[I(x,y)]=t;
  }
  const clearRect=(x0,y0,x1,y1,t=T.GRASS)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(inb(x,y)&&grid[I(x,y)]!==T.WATER&&grid[I(x,y)]!==T.SEA)grid[I(x,y)]=t;};
  for(const b of BLOCKS)clearRect(b.x-2,b.y-2,b.x+b.cols*STEP+2,b.y+b.rows*STEP+2);
  clearRect(RING.x0-2,RING.y0-2,RING.x1+2,RING.y1+2);
  clearRect(116,130,154,135,T.YARD); // портовая площадка
  const setRoad=(x,y,t)=>{if(!inb(x,y))return;const g=grid[I(x,y)];grid[I(x,y)]=(g===T.WATER||g===T.SEA||g===T.BRIDGE)?T.BRIDGE:(t??(x>=RING.x0-3?T.ASPH:T.ROAD));};
  for(const b of BLOCKS){const rt=(b.reg==='v'||b.reg==='d')?T.ROAD:T.ASPH;
    for(let k=0;k<=b.cols;k++)for(let t=b.y;t<=b.y+b.rows*STEP;t++)setRoad(b.x+STEP*k,t,rt);
    for(let k=0;k<=b.rows;k++)for(let t=b.x;t<=b.x+b.cols*STEP;t++)setRoad(t,b.y+STEP*k,rt);}
  for(let x=0;x<W;x++)if(grid[I(x,HY)]!==T.SEA)setRoad(x,HY);
  for(let y=0;y<RING.y0;y++)setRoad(100,y);
  for(let y=75;y<=112;y++)setRoad(28,y,T.ROAD);
  for(let y=RING.y1;y<=115;y++)setRoad(125,y);
  for(let y=70;y<=115;y++)setRoad(165,y);for(let x=150;x<=165;x++)setRoad(x,115);
  for(let x=RING.x0;x<=RING.x1;x++){grid[I(x,RING.y0)]=T.RING;grid[I(x,RING.y1)]=T.RING;}
  for(let y=RING.y0;y<=RING.y1;y++){grid[I(RING.x0,y)]=T.RING;grid[I(RING.x1,y)]=T.RING;}
  const PIERS=[124,136,148];
  for(const px of PIERS)for(let y=130;y<=147;y++)for(let x=px;x<=px+1;x++)grid[I(x,y)]=grid[I(x,y)]===T.SEA?T.BRIDGE:T.YARD;
  // фоновые высотки за кольцевой
  const BG=[];
  for(let x=60;x<=114;x+=9)BG.push([x,106,9+(x%3)*3]);
  for(let y=30;y<=98;y+=8)if(Math.abs(y-HY)>4){BG.push([146,y,12+(y%4)*2]);BG.push([50,y,9+(y%3)*3]);}
  for(const[bx,by]of BG)for(let y=by;y<by+3;y++)for(let x=bx;x<bx+5;x++)if(inb(x,y)&&grid[I(x,y)]===T.GRASS)grid[I(x,y)]=T.YARD;

  const {plots,units:layoutUnits}=buildLayout();
  const plotIdx=new Int16Array(W*H).fill(-1);
  for(const p of plots){p.owner=null;p.color=null;p.building=null;p.workers=0;p.builtAt=0;p.door={x:p.x0+1,y:p.y0+3};p.stock={x:p.x0+3,y:p.y0+3};p.crops=[];p.wk=[];p.parcels=p.sp==='pvzCity'?8:0;
    for(let y=p.y0;y<p.y0+4;y++)for(let x=p.x0;x<p.x0+4;x++){grid[I(x,y)]=(p.reg==='v'||p.reg==='d')?T.PLOT:T.YARD;plotIdx[I(x,y)]=p.id;}}
  const plotAt=(x,y)=>inb(x,y)&&plotIdx[I(x,y)]>=0?plots[plotIdx[I(x,y)]]:null;
  const SP=k=>plots.find(p=>p.sp===k);
  const marketPlot=SP('market'),sortPlot=SP('sortCenter');
  const resPlots=plots.filter(p=>p.sp==='res'||p.sp==='bc');
  const marketTiles=[[1,0],[2,0],[0,1],[0,2],[3,1],[3,2],[1,3],[2,3]].map(([dx,dy])=>[marketPlot.x0+dx,marketPlot.y0+dy]);

  const walk=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++){const t=grid[i];walk[i]=(t===T.WATER||t===T.ROCK||t===T.SEA)?0:1;}
  for(const[bx,by]of BG)for(let y=by;y<by+2;y++)for(let x=bx+1;x<bx+5;x++)if(inb(x,y)&&grid[I(x,y)]===T.YARD)walk[I(x,y)]=0;
  const blockFoot=(p,full)=>{for(let y=p.y0+(full?0:1);y<=p.y0+(full?1:2);y++)for(let x=p.x0+(full?0:1);x<=p.x0+(full?3:2);x++)walk[I(x,y)]=0;};

  // ================= THREE =================
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.BasicShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x8fbfe0);
  scene.add(new THREE.HemisphereLight(0xd6e8ff,0x4a6b3a,1.0));
  const sun=new THREE.DirectionalLight(0xfff0d0,1.9);scene.add(sun,sun.target);sun.castShadow=true;
  const SM=mobile?1024:2048;sun.shadow.mapSize.set(SM,SM);
  Object.assign(sun.shadow.camera,{left:-50,right:50,top:50,bottom:-50,near:1,far:220});sun.shadow.bias=-0.0006;

  const MC=new Map();const mat=c=>{if(!MC.has(c))MC.set(c,new THREE.MeshLambertMaterial({color:c,flatShading:true}));return MC.get(c);};
  const BMC=new Map();const bmat=c=>{if(!BMC.has(c))BMC.set(c,new THREE.MeshBasicMaterial({color:c}));return BMC.get(c);};
  const BOX=new THREE.BoxGeometry(1,1,1);
  const PYR=new THREE.ConeGeometry(1,1,4);PYR.rotateY(Math.PI/4);PYR.translate(0,.5,0);
  const gs=new THREE.Shape();gs.moveTo(-.5,0);gs.lineTo(.5,0);gs.lineTo(0,1);gs.lineTo(-.5,0);
  const GABLE=new THREE.ExtrudeGeometry(gs,{depth:1,bevelEnabled:false});GABLE.translate(0,0,-.5);
  const WHEEL=new THREE.CylinderGeometry(.09,.09,.06,8);WHEEL.rotateZ(Math.PI/2);
  const shadow=o=>{o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});return o;};
  function B(g,w,h,d,c,x=0,y=0,z=0,basic=false){const m=new THREE.Mesh(BOX,basic?bmat(c):mat(c));m.scale.set(w,h,d);m.position.set(x,y+h/2,z);g.add(m);return m;}
  function GR(g,w,h,d,c,x=0,y=0,z=0){const m=new THREE.Mesh(GABLE,mat(c));m.scale.set(w,h,d);m.position.set(x,y,z);g.add(m);return m;}
  function PY(g,w,h,d,c,x=0,y=0,z=0){const m=new THREE.Mesh(PYR,mat(c));m.scale.set(w/1.4142,h,d/1.4142);m.position.set(x,y,z);g.add(m);return m;}
  function CY(g,rt,rb,h,seg,c,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat(c));m.position.set(x,y+h/2,z);g.add(m);return m;}
  function wheel(g,x,z){const m=new THREE.Mesh(WHEEL,mat(0x222222));m.position.set(x,.09,z);g.add(m);return m;}

  // --- земля ---
  const TC={[T.GRASS]:0x7bb661,[T.ROAD]:0xc2a878,[T.WATER]:0x3f86c6,[T.SEA]:0x2f6fae,[T.FOREST]:0x5a9645,[T.ROCK]:0x8d877f,[T.PLOT]:0x95c266,[T.SAND]:0xe3d29b,[T.BRIDGE]:0x9c6b3e,[T.ASPH]:0x5d6066,[T.YARD]:0xa3ab96,[T.RING]:0x45474d,[T.FIELD]:0xd8c45a};
  function tileColor(x,y){const t=grid[I(x,y)];let c=TC[t];const p=plotAt(x,y);
    if(p&&p.sp==='market')c=0xb9b2a5;else if(p&&(p.reg==='p'||p.reg==='o'))c=0x9c9a92;else if(p&&p.reg==='c'&&p.demand>30)c=0xb4b4ac;
    if(t===T.RING&&((x+y)%3===0))c=0xd8d8d0;if(t===T.FIELD&&x%2)c=0x9fbf4a;return c;}
  {const tiles=new THREE.InstancedMesh(BOX,new THREE.MeshLambertMaterial({color:0xffffff}),W*H);tiles.receiveShadow=true;
    const m4=new THREE.Matrix4(),col=new THREE.Color();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=grid[I(x,y)],top=(t===T.WATER||t===T.SEA)?-.14:(t===T.BRIDGE?.03:0);
      m4.makeScale(1,1,1).setPosition(x,top-.5,y);tiles.setMatrixAt(I(x,y),m4);
      let j=.93+hash(x,y)*.12;if((t===T.PLOT||t===T.YARD)&&(x+y)%2)j*=.96;tiles.setColorAt(I(x,y),col.setHex(tileColor(x,y)).multiplyScalar(j));}
    tiles.instanceColor.needsUpdate=true;scene.add(tiles);}

  // --- деревья ---
  const trees=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=grid[I(x,y)],inPlot=plotIdx[I(x,y)]>=0;
    if((t===T.FOREST&&srnd()<.66)||(t===T.GRASS&&!inPlot&&srnd()<.025))
      trees.push({x,y,px:x+(srnd()-.5)*.35,pz:y+(srnd()-.5)*.35,s:.8+srnd()*.45,rot:srnd()*6.28,pine:srnd()<(x<60?.65:.4),alive:true,grow:1,reserved:null,shake:0});}
  const trunkGeo=new THREE.CylinderGeometry(.07,.1,.5,5);trunkGeo.translate(0,.25,0);
  const pineGeo=new THREE.ConeGeometry(.42,1.05,6);pineGeo.translate(0,.88,0);
  const leafGeo=new THREE.IcosahedronGeometry(.42,0);leafGeo.translate(0,.82,0);
  const trunkIM=new THREE.InstancedMesh(trunkGeo,mat(0x6b4226),trees.length);
  const pineIM=new THREE.InstancedMesh(pineGeo,new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true}),trees.length);
  const leafIM=new THREE.InstancedMesh(leafGeo,new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true}),trees.length);
  for(const im of[trunkIM,pineIM,leafIM]){im.castShadow=!mobile;im.receiveShadow=true;scene.add(im);}
  const _m=new THREE.Matrix4(),_m0=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),ZERO=new THREE.Vector3();
  function setTree(i){const t=trees[i];_e.set(t.shake,t.rot,t.shake*.5);_q.setFromEuler(_e);_p.set(t.px,0,t.pz);const gr=t.alive?1:t.grow;
    _s.set(t.s,t.s*(t.alive?1:Math.max(.35,gr)),t.s);_m.compose(_p,_q,_s);trunkIM.setMatrixAt(i,_m);
    const cs=t.alive?t.s:(gr>.15?t.s*gr:0);_s.set(cs,cs,cs);_m.compose(_p,_q,_s);_m0.compose(_p,_q,ZERO);
    if(t.pine){pineIM.setMatrixAt(i,_m);leafIM.setMatrixAt(i,_m0);}else{leafIM.setMatrixAt(i,_m);pineIM.setMatrixAt(i,_m0);}}
  {const col=new THREE.Color();trees.forEach((t,i)=>{setTree(i);col.setHex(t.pine?[0x2f6b3a,0x3a7d44,0x2d5e34][i%3]:[0x5fa548,0x4f9a3c,0x79b04a][i%3]);pineIM.setColorAt(i,col);leafIM.setColorAt(i,col);});}
  let treesDirty=true;

  // --- скалы, берега ---
  const rockFaces=[],shoreFaces=[];
  {const rocks=[];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=grid[I(x,y)];
      if(t===T.ROCK){rocks.push([x,y]);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const ax=x+dx,ay=y+dy;if(inb(ax,ay)&&walk[I(ax,ay)]){rockFaces.push({x,y,ax,ay});break;}}}
      if(t===T.WATER||t===T.SEA){for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const ax=x+dx,ay=y+dy;if(inb(ax,ay)&&walk[I(ax,ay)]&&grid[I(ax,ay)]!==T.BRIDGE&&plotIdx[I(ax,ay)]<0){shoreFaces.push({x,y,ax,ay});break;}}}}
    const im=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.5,0),new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true}),rocks.length*2);
    const col=new THREE.Color();let k=0;
    for(const[x,y]of rocks)for(let n=0;n<2;n++){const s=n?.4+srnd()*.3:.75+srnd()*.5;_e.set(srnd(),srnd()*6,0);_q.setFromEuler(_e);
      _p.set(x+(srnd()-.5)*.4,s*.3,y+(srnd()-.5)*.4);_s.set(s,s*(y<6?1.9:.8+vnoise(x*.2,y*.2)),s);_m.compose(_p,_q,_s);im.setMatrixAt(k,_m);im.setColorAt(k,col.setHex([0x8a857d,0x9b958c,0x77726b][k%3]));k++;}
    im.castShadow=im.receiveShadow=true;scene.add(im);}
  {const fl=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(grid[I(x,y)]===T.GRASS&&srnd()<.08)fl.push([x+(srnd()-.5)*.8,y+(srnd()-.5)*.8]);
    const im=new THREE.InstancedMesh(BOX,new THREE.MeshLambertMaterial({color:0xffffff}),fl.length);const col=new THREE.Color();
    fl.forEach(([x,z],i)=>{_m.makeScale(.07,.07,.07).setPosition(x,.035,z);im.setMatrixAt(i,_m);im.setColorAt(i,col.setHex(pick([0xffffff,0xffe066,0xff8fab,0xb388eb])));});scene.add(im);}

  // ================= ДОМА =================
  function facadeTex(floors,{base,win='#3b4a5c',lit='#ffd977',stripe=null,cols=8,glass=false,patches=null}){
    const c=document.createElement('canvas');c.width=cols*8;c.height=floors*8;const x=c.getContext('2d');
    x.fillStyle=base;x.fillRect(0,0,c.width,c.height);
    for(let f=0;f<floors;f++){
      if(patches&&Math.random()<.5){x.fillStyle=pick(patches);x.fillRect(Math.floor(Math.random()*cols)*8,f*8,16,8);}
      for(let w=0;w<cols;w++){x.fillStyle=Math.random()<(glass?.35:.22)?lit:(Math.random()<.5?win:'#46576b');
        if(glass)x.fillRect(w*8,f*8+1,7,6);else x.fillRect(w*8+2,f*8+2,4,5);
        if(!glass&&Math.random()<.12){x.fillStyle='#d8d2c4';x.fillRect(w*8+1,f*8+6,6,2);}}
      if(stripe){x.fillStyle=stripe;x.fillRect(0,f*8+7,c.width,1);}}
    const t=new THREE.CanvasTexture(c);t.magFilter=t.minFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;return t;}
  const STYLES={
    khrush:[{base:'#b5654a',stripe:'#9a5038'},{base:'#d9c27a',stripe:'#c0a860'},{base:'#c97b5a',stripe:null}],
    panel9:[{base:'#d9d4c8',stripe:'#b8b2a4'},{base:'#cfd8dc',stripe:'#5b7fa6'},{base:'#e2d6c0',stripe:'#c49a6c'}],
    panel16:[{base:'#e6e1d6',stripe:'#8fa3b8',cols:6},{base:'#dcd6ca',stripe:'#b07a5a',cols:6}],
    novostroy:[{base:'#f1efe9',patches:['#ff8c42','#f6c85f','#6fb3b8'],cols:7},{base:'#ece8e0',patches:['#d65a5a','#5a8bd6','#f2e8cf'],cols:7}],
    tower:[{base:'#2c4a6b',win:'#4a7aa8',lit:'#bfe3ff',glass:true,cols:6},{base:'#203040',win:'#3f6d8c',lit:'#e8f6ff',glass:true,cols:6}],
    bc:[{base:'#2f5d5a',win:'#5aa39b',lit:'#d8fff8',glass:true,cols:8},{base:'#3a4a5a',win:'#6b8aa8',lit:'#f0f6ff',glass:true,cols:8}],
  };
  const FMAT={};
  function facadeMat(type,v,floors){const k=type+v;if(!FMAT[k]){const st=STYLES[type][v];FMAT[k]=new THREE.MeshLambertMaterial({map:facadeTex(floors,st)});FMAT[k].side_=mat(new THREE.Color(st.base).multiplyScalar(.85).getHex());}return FMAT[k];}
  function tower(type,v,floors,fh,w,d){const fm=facadeMat(type,v,floors);const h=floors*fh;
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),[fm,fm,mat(0x6d6a66),mat(0x6d6a66),fm,fm]);m.position.y=h/2;m.castShadow=m.receiveShadow=true;return m;}
  const CAR_COLS=[0xb03a2e,0xe8e8e8,0x2e5e8c,0x3c3c3c,0x6b8e23,0xd4b106];
  function makeCar(c){const g=new THREE.Group();B(g,.42,.17,.78,c,0,.06,0);B(g,.38,.15,.4,c,0,.23,-.04);B(g,.36,.1,.02,0x9fd3ff,0,.26,.165);
    wheel(g,-.2,.24);wheel(g,.2,.24);wheel(g,-.2,-.24);wheel(g,.2,-.24);return shadow(g);}
  function makeResidential(p){
    const g=new THREE.Group(),v=p.id%2,rt=p.rt;
    if(rt==="khrush"){const m=tower("khrush",p.id%3,5,.42,3.7,1.6);m.position.x=1.5;m.position.z=1.2;g.add(m);}
    else if(rt==='panel9'){const m=tower('panel9',p.id%3,9,.42,3.6,1.6);m.position.x=1.5;m.position.z=1.2;g.add(m);}
    else if(rt==='panel16'){const m=tower('panel16',v,16,.42,2.4,2.2);m.position.x=1.5;m.position.z=1.3;g.add(m);}
    else if(rt==='novostroy'){const m=tower('novostroy',v,25,.42,2.6,2);m.position.x=1.1;m.position.z=1.1;g.add(m);
      const m2=tower('novostroy',1-v,16,.42,2,1.6);m2.position.x=2.6;m2.position.z=2;g.add(m2);B(g,3.6,.6,.8,0xb8b2a4,1.5,0,2.9);}
    else if(rt==='tower'){const m=tower('tower',v,42,.36,2.4,2.4);m.position.x=1.5;m.position.z=1.5;g.add(m);
      const h=42*.36;B(g,1.6,.8,1.6,0x2c3e50,1.5,h,1.5);B(g,.1,2,.1,0xdddddd,1.5,h+.8,1.5);B(g,.25,.25,.25,0xff4444,1.5,h+2.8,1.5,true);}
    if(rt!=='tower'){B(g,.4,.5,.15,0x5a4a3a,.7,0,2.05);const car=makeCar(pick(CAR_COLS));car.position.set(3,0,3);car.rotation.y=Math.PI/2;g.add(car);
      B(g,.6,.05,.25,0x8b5a2b,-.2,.25,3.1);}
    g.position.set(p.x0,0,p.y0);scene.add(shadow(g));
  }
  function makeBC(p){const g=new THREE.Group(),v=p.id%2;
    const m=tower('bc',v,20,.4,3.2,2.4);m.position.set(1.5,0,1.2);m.position.y+=.6;g.add(m);B(g,3.6,.6,2.8,0x9aa3ab,1.5,0,1.2);
    B(g,3.25,.35,2.45,0x2ecc71,1.5,8.6,1.2,true);B(g,1.2,.05,.8,0x7f8c8d,1.5,0,3.1);
    g.position.set(p.x0,0,p.y0);scene.add(shadow(g));}

  function makeBuilding(type,color){
    const g=new THREE.Group(),a={};
    switch(type){
    case 'farm':case 'garden':B(g,1.5,.9,1.2,type==='farm'?0xa83a32:0x6b8e23);GR(g,1.65,.7,1.35,0x5b2d2a,0,.9,0);B(g,.5,.55,.04,0xf0e6d2,0,0,.61);if(type==='farm')CY(g,.25,.25,1.3,8,0xd9d4c7,.85,0,-.55);
      else{B(g,1.2,.5,.6,0xcfe8ff,0,0,-1.1).material=new THREE.MeshLambertMaterial({color:0xcfe8ff,transparent:true,opacity:.7});}break;
    case 'cowshed':B(g,1.8,.8,1.2,0xe8dcc0);GR(g,1.95,.6,1.35,0x8a3a2a,0,.8,0);B(g,.6,.5,.04,0x6b4a2f,0,0,.61);
      for(const[x,z]of[[-1,1.2],[.9,1.3]]){const c=new THREE.Group();B(c,.45,.25,.22,0xffffff,0,.18,0);B(c,.15,.15,.15,0x222222,.25,.3,0);B(c,.12,.1,.08,0x222222,-.05,.3,.05);c.position.set(x,0,z);g.add(c);}break;
    case 'lumber':B(g,1.5,.8,1.2,0x8b5a2b);GR(g,1.7,.7,1.4,0x3d6b35,0,.8,0);B(g,.3,.5,.05,0x4a2f1a,0,0,.62);
      for(let k=0;k<3;k++){const l=CY(g,.1,.1,.9,6,0x7a4a24);l.rotation.z=Math.PI/2;l.position.set(.2,.1+(k===2?.17:0),.95+(k===1?.2:k===2?.1:0));}break;
    case 'quarry':B(g,1.6,.7,1.6,0x9a958c);B(g,1.7,.12,1.7,0x5d5650,0,.7,0);B(g,.1,1.5,.1,0x6b4a2f,.7,0,-.7);B(g,.9,.08,.08,0x6b4a2f,.3,1.45,-.7);break;
    case 'fishery':B(g,1.3,.7,1.1,0x8a6f4d);PY(g,1.5,.6,1.3,0x2e5e8c,0,.7,0);{const bt=B(g,.4,.14,.9,0x9c6b3e,-.9,0,.6);bt.rotation.y=.4;}break;
    case 'trawler':B(g,1.6,.6,1.2,0x5d6d7e);B(g,1.7,.1,1.3,0x2c3e50,0,.6,0);B(g,.9,.3,.6,color,0,.7,0);for(let k=0;k<3;k++)B(g,.5,.4,.5,[0xc0392b,0x2980b9,0x27ae60][k],-1+k*.6,0,1.1);break;
    case 'sawmill':B(g,1.8,.12,1.6,0x6b4a2f);for(const[x,z]of[[-.8,-.7],[.8,-.7],[-.8,.7],[.8,.7]])B(g,.1,.95,.1,0x5a3d26,x,0,z);
      {const r=B(g,2,.1,1.8,0x4a3322,0,.95,0);r.rotation.z=.08;}{const s=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.04,12),mat(0xc8c8d0));s.rotation.x=Math.PI/2;s.position.set(0,.45,.1);g.add(s);a.spin=s;}break;
    case 'mill':B(g,1.2,.5,1.2,0xcfc3a4);CY(g,.45,.62,1.6,6,0xe8dcc0,0,.5,0);{const c=new THREE.Mesh(new THREE.ConeGeometry(.6,.6,6),mat(0x8a4a32));c.position.y=2.4;g.add(c);}
      {const bl=new THREE.Group();bl.position.set(0,1.85,.6);for(let k=0;k<4;k++){const arm=new THREE.Group();arm.rotation.z=k*Math.PI/2;B(arm,.07,.85,.03,0x6b4a2f);B(arm,.26,.6,.02,0xf0e6d2,.15,.22,0);bl.add(arm);}g.add(bl);a.blades=bl;}break;
    case 'smokehouse':B(g,1.4,.8,1.2,0x4a3b30);GR(g,1.55,.6,1.35,0x2b2b2b,0,.8,0);B(g,.3,.9,.3,0x6b6b6b,.4,.8,-.3);a.smoke=[.4,1.75,-.3];break;
    case 'dairy':B(g,1.6,.85,1.3,0xf5f0e1);PY(g,1.75,.6,1.45,0x3a6ea5,0,.85,0);CY(g,.3,.3,1,8,0xdcdcdc,.85,0,-.5);B(g,.5,.25,.05,0xf4d03f,0,.6,.66,true);break;
    case 'brickworks':B(g,1.7,.9,1.5,0xa0442c);B(g,1.8,.1,1.6,0x5a3a30,0,.9,0);CY(g,.15,.22,2.3,6,0x8a3a2a,.6,0,-.5);a.smoke=[.6,2.35,-.5];break;
    case 'bakery':B(g,1.5,.85,1.3,0xe0b07a);PY(g,1.7,.8,1.5,0xb5452f,0,.85,0);B(g,.25,.7,.25,0x7a6a5a,.45,.9,-.3);B(g,.3,.25,.04,0xffd27a,-.4,.35,.66,true);a.smoke=[.45,1.65,-.3];break;
    case 'workshop':B(g,1.8,1,1.5,0x7a5a3a);GR(g,1.95,.8,1.65,0x2f4a6b,0,1,0);B(g,.25,.6,.25,0x555555,-.6,1.1,-.4);B(g,.6,.25,.05,0xd9a066,0,.7,.77);a.smoke=[-.6,1.75,-.4];break;
    case 'pvz':case 'pvzCity':{B(g,1.7,.8,1.4,0xefefef);B(g,1.76,.26,1.46,type==='pvz'?color:0xff8c1a,0,.8,0);B(g,1.2,.42,.03,0x9fd3ff,0,.18,.71,true);
      a.boxes=[];for(let k=0;k<6;k++){const b=B(g,.22,.2,.22,0xc8a26b);b.position.set(-1.05,.1+Math.floor(k/2)*.2,-.4+(k%2)*.28);b.visible=false;a.boxes.push(b);}}break;
    case 'shawarma':B(g,1.4,.75,1.1,0xf5e6c8);{const aw=B(g,1.55,.06,.5,0xc0392b,0,.72,.7);aw.rotation.x=.3;}B(g,1.1,.24,.05,0xffcc00,0,.8,.56,true);CY(g,.1,.1,.4,6,0xb5651d,-.2,.2,.4);a.smoke=[.45,1.4,-.3];break;
    case 'fishstall':B(g,1.3,.75,1,0xdfe9f0);{const aw=B(g,1.45,.06,.5,0x2e86ab,0,.72,.65);aw.rotation.x=.3;}B(g,1,.24,.05,0x9fd3ff,0,.8,.51,true);break;
    case 'canteen':B(g,1.8,.9,1.4,0xf0e0c0);B(g,1.85,.15,1.45,0x8e44ad,0,.9,0);B(g,1.4,.35,.03,0xfff1b0,0,.25,.71,true);break;
    case 'market':B(g,2.6,1.1,1.9,0xb0b4b8);GR(g,2.75,.6,2.05,0x7f8a94,0,1.1,0);B(g,1.6,.25,.05,0x2e7d32,0,1.0,.98,true);
      for(const[x,z]of[[-1.6,1.4],[1.6,1.4],[-1.6,-1.3],[1.6,-1.3]]){B(g,.6,.12,.6,0xa0743f,x,0,z);B(g,.4,.3,.4,0xc8a26b,x,.12,z);}break;
    case 'sortCenter':B(g,2.8,1.2,2,0x9aa3ab);B(g,2.9,.12,2.1,0x5b6670,0,1.2,0);B(g,2.82,.22,2.02,0xff8c1a,0,.92,0);break;
    case 'zbi':B(g,1.6,1,1.4,0xb8b8b0);for(const x of[-.5,.4])CY(g,.35,.35,2,8,0xd0d0c8,x,0,-.9);break;
    case 'furnFactory':B(g,2.4,1.1,1.8,0xc8a26b);GR(g,2.5,.6,1.9,0x6b4226,0,1.1,0);B(g,.25,.8,.25,0x555555,.8,1.1,-.5);B(g,1.2,.3,.05,0xffffff,0,.7,.91,true);a.smoke=[.8,1.95,-.5];break;
    case 'lesxoz':B(g,1.8,.9,1.4,0x6b4226);GR(g,1.95,.7,1.55,0x2e5e2e,0,.9,0);for(let k=0;k<4;k++){const l=CY(g,.12,.12,1.4,6,0x7a4a24);l.rotation.z=Math.PI/2;l.position.set(0,.12+(k>1?.22:0),1.1+(k%2)*.25);}break;
    case 'kolkhoz':B(g,1.8,1.0,1.4,0x8c3b2e);GR(g,1.95,.75,1.55,0x6b6b6b,0,1,0);B(g,.6,.65,.04,0xe8dcc0,0,0,.71);break;
    case 'port':B(g,2.2,1,1.6,0x7f8c8d);B(g,2.3,.15,1.7,0x34495e,0,1,0);for(let k=0;k<6;k++)B(g,.9,.45,.4,pick([0xc0392b,0x2980b9,0x27ae60,0xf39c12]),-1.2+(k%2)*1,(Math.floor(k/2)%2)*.45,1.3+(k>3?.45:0));break;
    }
    if(BLD[type]&&!['farm','garden'].includes(type))for(let k=0;k<3;k++)B(g,.28,.28,.28,0x9c6b3e,1.4+(k%2)*.1,k===2?.28:0,1.4-(k===1?.3:0));
    return {g:shadow(g),a};
  }
  function makeFence(p,color){const g=new THREE.Group(),c=new THREE.Color(color).getHex();const x0=p.x0-.45,x1=p.x0+3.45,z0=p.y0-.45,z1=p.y0+3.45;
    B(g,x1-x0,.06,.06,c,(x0+x1)/2,.18,z0);B(g,x1-x0,.06,.06,c,(x0+x1)/2,.18,z1);B(g,.06,.06,z1-z0,c,x0,.18,(z0+z1)/2);B(g,.06,.06,z1-z0,c,x1,.18,(z0+z1)/2);
    for(const[x,z]of[[x0,z0],[x1,z0],[x0,z1],[x1,z1]])B(g,.1,.3,.1,0xe8e0d0,x,0,z);
    B(g,.05,1.3,.05,0xdddddd,x1-.15,0,z0+.15);const fl=B(g,.36,.22,.03,c,x1-.33,1.05,z0+.15);g.userData.flag=fl;return shadow(g);}
  function makeSign(p){const g=new THREE.Group();B(g,.06,.6,.06,0x6b4a2f);B(g,.6,.34,.05,0xf4ecd8,0,.45,0);B(g,.6,.07,.06,0xc0392b,0,.62,0);g.position.set(p.x0+1.5,0,p.y0+2.2);scene.add(shadow(g));return g;}
  const CROPC={wheat:[0x5c8f2e,0x6fae3a,0x8fbf3f,0xb9c84a,0xe3c04a],veg:[0x3e7b27,0x4f9a3c,0x5fa548,0x6ab04c,0xe67e22]};
  function makeCrops(p,kind){for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){if(dx>=1&&dx<=2&&dy>=1&&dy<=2)continue;if(dy===3&&(dx===1||dx===2))continue;
    const x=p.x0+dx,y=p.y0+dy,g=new THREE.Group();g.position.set(x,0,y);B(g,.9,.04,.9,0x6b4a2b);const rows=[];for(let r=0;r<3;r++)rows.push(B(g,.18,1,.8,0x6fae3a,-.28+r*.28,.04,0));
    scene.add(shadow(g));const c={x,y,g:Math.random(),res:null,grp:g,rows,kind};p.crops.push(c);setCrop(c);}}
  function setCrop(c){const h=.05+.42*Math.min(1,c.g),pal=CROPC[c.kind]||CROPC.wheat,m=mat(pal[Math.min(4,Math.floor(c.g*4))]);for(const r of c.rows){r.scale.y=h;r.position.y=.04+h/2;r.material=m;}}

  for(const p of plots){
    if(p.sp==='res'){makeResidential(p);blockFoot(p,true);}
    else if(p.sp==='bc'){makeBC(p);blockFoot(p,true);}
    else if(p.sp){const b=makeBuilding(p.sp,0);b.g.position.set(p.x0+1.5,0,p.y0+1.5);scene.add(b.g);p.anim=b.a;blockFoot(p);if(p.sp==='kolkhoz')makeCrops(p,'wheat');}
    else p.sign=makeSign(p);
  }
  for(const[bx,by,fl]of BG){const m=tower(fl>12?'panel16':'panel9',bx%2,fl,.42,4.6,1.8);m.position.x=bx+2.5;m.position.z=by+.5;scene.add(m);}
  // фонари
  for(const b of BLOCKS){if(b.reg==='v'||b.reg==='d')continue;for(let a=0;a<=b.cols;a+=2)for(let c=0;c<=b.rows;c+=2){const g=new THREE.Group();B(g,.06,1,.06,0x333333);B(g,.14,.12,.14,0xfff1b0,0,1,0,true);g.position.set(b.x+STEP*a+.4,0,b.y+STEP*c+.4);scene.add(g);}}
  // порт: краны, контейнеры
  const cranes=[];
  for(const px of PIERS){const g=new THREE.Group();B(g,.15,3,.15,0xf39c12,0,0,0);const arm=new THREE.Group();arm.position.y=3;B(arm,2.4,.12,.12,0xf39c12,.8,0,0);B(arm,.04,.8,.04,0x333333,1.8,-.8,0);g.add(arm);
    g.position.set(px+.5,0,145);scene.add(shadow(g));cranes.push(arm);}
  for(let k=0;k<26;k++){const x=118+Math.floor(srnd()*34),y=131+Math.floor(srnd()*3);if(grid[I(x,y)]!==T.YARD)continue;const g=new THREE.Group();
    const h=1+Math.floor(srnd()*3);for(let s=0;s<h;s++)B(g,.9,.45,.4,pick([0xc0392b,0x2980b9,0x27ae60,0xf39c12,0x8e44ad]),0,s*.45,0);g.position.set(x,0,y+.3);scene.add(shadow(g));walk[I(x,y)]=0;}
  // деревенские домики и дачные домики-декор
  for(let k=0;k<30;k++){const x=Math.floor(srnd()*40)+12,y=Math.floor(srnd()*30)+78;if(grid[I(x,y)]!==T.GRASS||plotAt(x,y))continue;
    const g=new THREE.Group();B(g,.9,.55,.8,pick([0x8b5a2b,0x7a4a24,0x9c6b3e]));GR(g,1.05,.45,.95,pick([0x3d6b35,0x8a3a2a,0x5a6a7a]),0,.55,0);B(g,.2,.18,.03,0x2e86ab,0,.25,.41);
    g.position.set(x,0,y);scene.add(shadow(g));walk[I(x,y)]=0;}

  // ================= ЛЮДИ И ТРАНСПОРТ =================
  function makePerson(shirt,hat,pants=0x34495e){const g=new THREE.Group();
    const limb=(x,y,w,h,c)=>{const p=new THREE.Group();p.position.set(x,y,0);const m=new THREE.Mesh(BOX,mat(c));m.scale.set(w,h,w);m.position.y=-h/2;p.add(m);g.add(p);return p;};
    const legL=limb(-.07,.26,.09,.26,pants),legR=limb(.07,.26,.09,.26,pants);B(g,.26,.28,.16,shirt,0,.26,0);
    const armL=limb(-.17,.52,.07,.24,shirt),armR=limb(.17,.52,.07,.24,shirt);B(g,.2,.2,.2,0xf1c27d,0,.54,0);if(hat!=null)B(g,.23,.07,.23,hat,0,.74,0);
    const carry=B(g,.22,.2,.22,0xffffff,0,.84,0);carry.visible=false;g.userData={legL,legR,armL,armR,carry};return shadow(g);}
  function makeTruck(cab,cargo){const g=new THREE.Group();B(g,.42,.07,.8,0x444444,0,.1,0);B(g,.4,.3,.28,cab,0,.15,.25);B(g,.34,.1,.02,0x9fd3ff,0,.3,.391);
    B(g,.42,.16,.48,0x8b5a2b,0,.17,-.14);const cg=B(g,.3,.16,.32,cargo,0,.33,-.14);wheel(g,-.21,.25);wheel(g,.21,.25);wheel(g,-.21,-.25);wheel(g,.21,-.25);g.userData.cargo=cg;return shadow(g);}
  function makeVan(){const g=new THREE.Group();B(g,.42,.42,.82,0xf2f2f2,0,.08,0);B(g,.43,.06,.6,0xff8c1a,0,.3,-.06);wheel(g,-.21,.26);wheel(g,.21,.26);wheel(g,-.21,-.26);wheel(g,.21,-.26);return shadow(g);}
  function makeShip(big,color){const g=new THREE.Group();
    if(big){B(g,1.6,.5,6,0x2c3e50,0,-.2,0);B(g,1.62,.12,6.02,0xc0392b,0,-.25,0);B(g,1.2,1,1.1,0xecf0f1,0,.3,-2.3);
      for(let k=0;k<8;k++)B(g,.65,.4,.9,pick([0xc0392b,0x2980b9,0x27ae60,0xf39c12,0x8e44ad]),(k%2)*.7-.35,.3+Math.floor(k/8)*.4,-1.2+Math.floor(k/2)*.95);}
    else{B(g,.5,.25,1.2,0xf2f2f2,0,-.1,0);B(g,.52,.06,1.22,color||0x2e86ab,0,.1,0);B(g,.35,.35,.4,0xdddddd,0,.15,-.2);B(g,.03,.8,.03,0x333333,0,.15,.3);}
    return shadow(g);}

  const bq=new Int32Array(W*H),prev=new Int32Array(W*H);
  function bfs(sx,sy,goal,maxN=W*H){sx=Math.round(sx);sy=Math.round(sy);if(!inb(sx,sy))return[];prev.fill(-2);let h=0,t=0;const s=I(sx,sy);bq[t++]=s;prev[s]=-1;
    while(h<t&&h<maxN){const c=bq[h++],cx=c%W,cy=(c/W)|0;
      if(goal(cx,cy)){const path=[];let k=c;while(k!==s){path.push([k%W,(k/W)|0]);k=prev[k];}return path.reverse();}
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy;if(!inb(nx,ny))continue;const n=I(nx,ny);if(prev[n]!==-2||!walk[n])continue;prev[n]=c;bq[t++]=n;}}
    return[];}
  const pathTo=(u,x,y)=>bfs(u.x,u.y,(a,b)=>a===x&&b===y);
  function stepMove(u,dt){if(!u.path.length){u.moving=false;return true;}const[tx,ty]=u.path[0],dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy),s=u.speed*dt;
    if(d>1e-4)u.face=Math.atan2(dx,dy);if(d<=s){u.x=tx;u.y=ty;u.path.shift();}else{u.x+=dx/d*s;u.y+=dy/d*s;}u.moving=u.path.length>0;return!u.moving;}
  function animPerson(u,time){const ud=u.mesh.userData,ph=time*12+u.ox*20;
    u.mesh.position.set(u.x+u.ox,u.moving?Math.abs(Math.sin(ph))*.04:0,u.y+u.oy);u.mesh.rotation.y=u.face||0;
    ud.legL.rotation.x=u.moving?Math.sin(ph)*.7:0;ud.legR.rotation.x=u.moving?-Math.sin(ph)*.7:0;
    if(u.working){ud.armR.rotation.x=u.fishing?-2.2+Math.sin(time*2)*.15:-1.6+Math.sin(time*14)*1.1;ud.armL.rotation.x=-.4;}
    else if(u.carry){ud.armR.rotation.x=ud.armL.rotation.x=-2.9;}else{ud.armR.rotation.x=u.moving?-Math.sin(ph)*.5:0;ud.armL.rotation.x=u.moving?Math.sin(ph)*.5:0;}
    ud.carry.visible=!!u.carry;if(u.carry)ud.carry.material=mat(u.carry==='parcel'?0xc8a26b:(GOODS[u.carry]?.col||0xffffff));}

  const parts=[];
  function puff(x,y,z,c,n=1,up=.6,spread=.3){for(let k=0;k<n&&parts.length<250;k++){const m=new THREE.Mesh(BOX,mat(c));const s=rand(.06,.13);m.scale.set(s,s,s);m.position.set(x,y,z);scene.add(m);
    parts.push({m,vx:rand(-spread,spread),vy:rand(up*.6,up),vz:rand(-spread,spread),life:0,max:rand(.8,1.6),s});}}

  // ================= СОСТОЯНИЕ УЧАСТКОВ =================
  const units=[],vehicles=[],residents=[],ships=[];
  function setPlotState(id,st){
    const p=plots[id];if(!p||p.sp)return;
    const changedOwner=p.owner!==st.owner||p.color!==st.color,changedB=p.building!==st.building;
    if(changedOwner){if(p.fence){scene.remove(p.fence);p.fence=null;}
      if(st.owner){if(p.sign){scene.remove(p.sign);p.sign=null;}p.fence=makeFence(p,st.color);scene.add(p.fence);}else if(!p.sign)p.sign=makeSign(p);}
    if(changedB||changedOwner&&st.building){if(p.group){scene.remove(p.group);p.group=null;p.anim=null;}for(const c of p.crops)scene.remove(c.grp);p.crops=[];
      if(st.building){const b=makeBuilding(st.building,new THREE.Color(st.color||'#fff').getHex());b.g.position.set(p.x0+1.5,0,p.y0+1.5);scene.add(b.g);p.group=b.g;p.anim=b.a;blockFoot(p);
        if(st.building==='farm')makeCrops(p,'wheat');if(st.building==='garden')makeCrops(p,'veg');}
      else for(let y=p.y0+1;y<=p.y0+2;y++)for(let x=p.x0+1;x<=p.x0+2;x++)walk[I(x,y)]=1;}
    Object.assign(p,{owner:st.owner,color:st.color,building:st.building,workers:st.building?st.workers:0,builtAt:st.builtAt||0});
    syncWorkers(p);
  }
  function syncWorkers(p){const want=p.building&&p.builtAt<=Date.now()?p.workers:0;
    while(p.wk.length>want){const u=p.wk.pop();if(u.target&&u.target.reserved===u)u.target.reserved=null;if(u.crop)u.crop.res=null;scene.remove(u.mesh);units.splice(units.indexOf(u),1);if(u.boat){scene.remove(u.boat.mesh);ships.splice(ships.indexOf(u.boat),1);}}
    while(p.wk.length<want){const d=BLD[p.building];const u={owner:p.owner,plot:p,type:p.building,x:p.door.x,y:p.door.y,path:[],state:'idle',timer:Math.random()*2,carry:null,speed:2.6,
      ox:(Math.random()-.5)*.3,oy:(Math.random()-.5)*.3,face:0,mesh:makePerson(new THREE.Color(p.color).getHex(),d.hat)};scene.add(u.mesh);p.wk.push(u);units.push(u);}}

  function nearestTree(x,y){let best=null,bd=1e9;for(const t of trees){if(!t.alive||t.reserved)continue;const d=(t.x-x)**2+(t.y-y)**2;if(d<bd){bd=d;best=t;}}return best;}
  function pickFace(list,x,y){let best=null,bd=1e9;for(const r of list){const d=Math.abs(r.ax-x)+Math.abs(r.ay-y)+Math.random()*6;if(d<bd){bd=d;best=r;}}return best;}
  const nearPier=x=>PIERS.reduce((a,b)=>Math.abs(b-x)<Math.abs(a-x)?b:a);
  let time=0;
  function updateWorker(u,dt){
    const p=u.plot,d=BLD[u.type];u.working=false;u.fishing=false;if(!d)return;
    if(d.res==='boat'){ // судно: матрос стоит у причала, корабль ходит в море
      if(!u.boat){const px=nearPier(p.x)+.5;u.boat={mesh:makeShip(false,new THREE.Color(p.color).getHex()),x:px,y:147,home:{x:px,y:147},wp:null,wait:rand(2,6),kind:'boat'};scene.add(u.boat.mesh);ships.push(u.boat);}
      if(u.state==='idle'){u.path=pathTo(u,nearPier(p.x),140);u.state='go';}if(u.state==='go'&&stepMove(u,dt))u.state='stand';u.working=u.state==='stand'&&Math.sin(time+u.ox*9)>.5;return;}
    if(d.kind==='gather'&&d.res){
      switch(u.state){
      case 'idle':if((u.timer-=dt)>0)return;
        if(d.res==='tree'){const t=nearestTree(u.x,u.y);if(!t){u.timer=2;return;}t.reserved=u;u.target=t;u.path=bfs(u.x,u.y,(x,y)=>Math.abs(x-t.x)+Math.abs(y-t.y)===1);}
        else{const r=pickFace(d.res==='rock'?rockFaces:shoreFaces,u.x,u.y);u.target=r;u.path=pathTo(u,r.ax,r.ay);}
        u.state='toRes';break;
      case 'toRes':if(stepMove(u,dt)){if(d.res==='tree'&&!u.target.alive){u.target.reserved=null;u.state='idle';return;}u.state='work';u.timer=3;u.face=Math.atan2(u.target.x-u.x,u.target.y-u.y);}break;
      case 'work':u.working=true;u.fishing=d.res==='water';u.timer-=dt;
        if(d.res==='tree'){const t=u.target;t.shake=Math.sin(time*22)*.06;t._d=true;if(Math.random()<dt*4)puff(t.px,.4,t.pz,0xc89b62,1,1,.5);}
        else if(d.res==='rock'){if(Math.random()<dt*4)puff(u.target.x,.4,u.target.y,0xb0aaa0,1,1,.5);}else if(Math.random()<dt*1.5)puff(u.target.x,0,u.target.y,0xbfe3ff,2,.8,.2);
        if(u.timer<=0){if(d.res==='tree'){const t=u.target;t.alive=false;t.grow=0;t.reserved=null;t.shake=0;t._d=true;}u.carry=Object.keys(d.out)[0];u.path=pathTo(u,p.door.x,p.door.y);u.state='toHome';}break;
      case 'toHome':if(stepMove(u,dt)){u.carry=null;u.state='idle';u.timer=.5;}break;}
    }else if(d.kind==='gather'){ // ферма/огород/коровник — работа на участке
      switch(u.state){
      case 'idle':if((u.timer-=dt)>0)return;{let best=null;for(const c of p.crops)if(c.g>=1&&!c.res&&(!best||c.g>best.g))best=c;
        if(!best){if(!p.crops.length){const tx=p.x0+Math.floor(Math.random()*4),ty=p.y0+3;u.path=pathTo(u,tx,ty);u.state='toHome';u.carry=Object.keys(d.out)[0];return;}u.timer=1;return;}
        best.res=u;u.crop=best;u.path=pathTo(u,best.x,best.y);u.state='toRes';}break;
      case 'toRes':if(stepMove(u,dt)){u.state='work';u.timer=1.5;}break;
      case 'work':u.working=true;if((u.timer-=dt)<=0){u.crop.g=0;setCrop(u.crop);u.crop.res=null;u.crop=null;u.carry=Object.keys(d.out)[0];u.path=pathTo(u,p.door.x,p.door.y);u.state='toHome';}break;
      case 'toHome':if(stepMove(u,dt)){u.carry=null;u.state='idle';u.timer=.5;}break;}
    }else if(d.kind==='proc'){
      switch(u.state){
      case 'idle':if((u.timer-=dt)>0)return;u.carry=Object.keys(d.in)[0];u.path=pathTo(u,p.door.x,p.door.y);u.state='toWork';break;
      case 'toWork':if(stepMove(u,dt)){u.state='work';u.timer=3;u.carry=null;u.face=Math.PI;}break;
      case 'work':u.working=true;if((u.timer-=dt)<=0){u.path=pathTo(u,p.stock.x,p.stock.y);u.state='toStock';}break;
      case 'toStock':if(stepMove(u,dt)){u.state='idle';u.timer=.4;}break;}
    }else{if(u.state==='idle'){u.path=pathTo(u,p.door.x,p.door.y);u.state='toDuty';}if(u.state==='toDuty'&&stepMove(u,dt))u.state='duty';if(u.state==='duty'){u.face=0;u.working=Math.sin(time*.7+u.ox*9)>.3;}}
  }
  // жители — спавнятся рядом с камерой
  const RES_SHIRTS=[0x6c5ce7,0x00b894,0xe17055,0x636e72,0xfdcb6e,0x0984e3,0xd63031,0xb2bec3];
  const serviceOpen=p=>p.sp==='pvzCity'?p.parcels>0:(p.building&&BLD[p.building].kind==='service'&&p.workers>0&&p.builtAt<=Date.now());
  function spawnResident(){const near=resPlots.filter(p=>Math.abs(p.x-camT.x)+Math.abs(p.y-camT.z)<zoom*2.2);if(!near.length)return;const home=pick(near);
    const shops=plots.filter(p=>serviceOpen(p)&&Math.abs(p.x-home.x)+Math.abs(p.y-home.y)<25);
    const r={x:home.x0+1,y:home.y0+3,home:{x:home.x0+1,y:home.y0+3},path:[],speed:rand(1.8,2.4),ox:rand(-.25,.25),oy:rand(-.25,.25),face:0,carry:null,state:'go',target:null,
      mesh:makePerson(pick(RES_SHIRTS),Math.random()<.4?pick([0x222222,0x8b0000,0x2d3436]):null,pick([0x2d3436,0x34495e,0x1e3a5f])),wait:0};
    if(shops.length&&Math.random()<.8){r.target=pick(shops);r.path=pathTo(r,r.target.door.x,r.target.door.y);}
    else{const tx=home.x0+1+Math.round(rand(-8,8)),ty=home.y0+3+Math.round(rand(-8,8));r.path=bfs(r.x,r.y,(a,b)=>Math.abs(a-tx)+Math.abs(b-ty)<2,4000);}
    scene.add(r.mesh);residents.push(r);}
  function updateResident(r,dt){
    if(r.state==='go'){if(stepMove(r,dt)){r.state='wait';r.wait=rand(.8,1.6);const p=r.target;if(p&&serviceOpen(p)){if(p.sp==='pvzCity'||p.building==='pvz'){p.parcels=Math.max(0,p.parcels-1);r.carry='parcel';}else{const g=Object.keys(BLD[p.building].in)[0];r.carry=g;}}}}
    else if(r.state==='wait'){if((r.wait-=dt)<=0){r.state='back';r.path=pathTo(r,r.home.x,r.home.y);}}
    else if(r.state==='back'&&stepMove(r,dt))removeRes(r);}
  const removeRes=r=>{scene.remove(r.mesh);residents.splice(residents.indexOf(r),1);};
  function spawnTruck(plotId,good,color){const p=plots[plotId];if(!p)return;const mt=pick(marketTiles);
    const v={kind:'truck',x:p.door.x,y:p.door.y,speed:5,path:[],phase:'go',home:p.door,face:0,mesh:makeTruck(new THREE.Color(color||'#fff').getHex(),GOODS[good]?.col||0xffffff)};
    v.path=pathTo(v,mt[0],mt[1]);scene.add(v.mesh);vehicles.push(v);}
  function spawnVan(){const t=pick(plots.filter(p=>(p.sp==='pvzCity'||(p.building==='pvz'&&p.workers>0))&&p.parcels<12&&!vehicles.some(v=>v.target===p)));if(!t)return;
    const v={kind:'van',x:sortPlot.door.x,y:sortPlot.door.y,speed:5.5,path:[],phase:'go',target:t,face:0,mesh:makeVan()};v.path=pathTo(v,t.door.x,t.door.y);scene.add(v.mesh);vehicles.push(v);}
  function updateVehicle(v,dt){if(!stepMove(v,dt))return;
    if(v.phase==='go'){v.phase='back';if(v.kind==='van'){v.target.parcels+=12;v.path=pathTo(v,sortPlot.door.x,sortPlot.door.y);}else{v.mesh.userData.cargo.visible=false;v.path=pathTo(v,v.home.x,v.home.y);}}
    else{scene.remove(v.mesh);vehicles.splice(vehicles.indexOf(v),1);}}
  // корабли
  function spawnCargo(){const px=pick(PIERS);const s={kind:'cargo',mesh:makeShip(true),x:W+6,y:155+rand(-3,3),wp:[[px+3.5,150],[px+3.5,142]],wait:25,out:[[px+3.5,152],[W+8,160]],speed:2.2};scene.add(s.mesh);ships.push(s);}
  function spawnFishing(){const px=pick(PIERS);const s={kind:'fishing',mesh:makeShip(false),x:px+.5,y:147,wp:[[px+rand(-12,12),rand(152,166)],[px+rand(-15,15),rand(150,166)],[px+.5,147]],wait:0,speed:1.5};scene.add(s.mesh);ships.push(s);}
  function updateShip(s,dt){
    if(s.kind==='boat'){ // судно игрока
      if(!s.wp){if((s.wait-=dt)>0)return;s.wp=[[s.home.x+rand(-14,14),rand(152,166)],[s.home.x+rand(-14,14),rand(152,166)],[s.home.x,s.home.y]];}
      if(!s.wp.length){s.wp=null;s.wait=rand(4,8);return;}}
    const tgt=s.wp&&s.wp[0];
    if(!tgt){if(s.kind==='cargo'){if((s.wait-=dt)>0)return;s.wp=s.out;s.out=null;if(!s.wp){scene.remove(s.mesh);ships.splice(ships.indexOf(s),1);}return;}
      scene.remove(s.mesh);ships.splice(ships.indexOf(s),1);return;}
    const dx=tgt[0]-s.x,dy=tgt[1]-s.y,d=Math.hypot(dx,dy),sp=(s.speed||1.6)*dt;
    s.face=Math.atan2(dx,dy);if(d<=sp){s.x=tgt[0];s.y=tgt[1];s.wp.shift();}else{s.x+=dx/d*sp;s.y+=dy/d*sp;}}

  // ================= АВАТАРЫ =================
  const avatars=new Map(); // uid -> {x,y,tx,ty,mesh,label,nick}
  let me=null;
  function setMe(nick,color,x,y){if(me){scene.remove(me.mesh);me.label.el.remove();wlabels.splice(wlabels.indexOf(me.label),1);}
    me={x,y,path:[],speed:3,ox:0,oy:0,face:0,carry:null,working:false,mesh:makePerson(new THREE.Color(color).getHex(),0xffd166,0x222222)};scene.add(me.mesh);me.label=wlabel(nick,0,1.2,0,'me');}
  function goMe(x,y){if(me)me.path=pathTo(me,x,y);}
  function setOther(uid,{x,y,nick,color,working}){let a=avatars.get(uid);
    if(!a){a={x,y,tx:x,ty:y,path:[],ox:0,oy:0,face:0,carry:null,mesh:makePerson(new THREE.Color(color).getHex(),0xffd166,0x222222),label:wlabel(nick,0,1.2,0,'other',color)};scene.add(a.mesh);avatars.set(uid,a);}
    a.tx=x;a.ty=y;a.working=working;}
  function removeOther(uid){const a=avatars.get(uid);if(!a)return;scene.remove(a.mesh);a.label.el.remove();wlabels.splice(wlabels.indexOf(a.label),1);avatars.delete(uid);}

  // ================= DOM-метки =================
  const labelsEl=document.getElementById('labels'),floatsEl=document.getElementById('floats'),wlabels=[],floats=[];
  function wlabel(text,x,y,z,cls='',color=''){const el=document.createElement('div');el.className='wlab '+cls;el.textContent=text;if(color)el.style.color=color;labelsEl.appendChild(el);const L={el,p:new THREE.Vector3(x,y,z)};wlabels.push(L);return L;}
  function float(text,x,y,z,color='#ffd166'){const el=document.createElement('div');el.className='float';el.textContent=text;el.style.color=color;floatsEl.appendChild(el);floats.push({el,p:new THREE.Vector3(x,y,z),t:0});}
  for(const b of BLOCKS)wlabel(b.name,b.x+b.cols*STEP/2,0,b.y-3,'big');
  wlabel('КАРЬЕР',100,2,10,'big');wlabel('ОЗЕРО',34,0,142,'big');wlabel('МОРЕ',160,0,158,'big');
  for(const p of plots)if(p.sp&&EMP[p.sp]){const e=EMP[p.sp];wlabel(p.sp==='bc'?'Бизнес-центр':e.n,p.x,p.sp==='bc'?9.5:2.4,p.y,'emp','#ffe9a8');}

  // ================= КАМЕРА =================
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,800);
  const camT=new THREE.Vector3(100,0,66);let camA=Math.PI/4,camAT=camA,zoom=mobile?14:20,zoomT=zoom,camFly=null,PX=3;
  function updateCam(){const asp=innerWidth/innerHeight;cam.left=-zoom*asp;cam.right=zoom*asp;cam.top=zoom;cam.bottom=-zoom;cam.updateProjectionMatrix();
    const D=120;cam.position.set(camT.x+Math.sin(camA)*D,D*.95,camT.z+Math.cos(camA)*D);cam.lookAt(camT);
    const sx=Math.round(camT.x/2)*2,sz=Math.round(camT.z/2)*2;sun.position.set(sx-30,60,sz+20);sun.target.position.set(sx,0,sz);}
  function resize(){PX=Math.max(1,Math.min(4,Math.round(Math.min(innerWidth,innerHeight*1.6)/540)));renderer.setSize(Math.ceil(innerWidth/PX),Math.ceil(innerHeight/PX),false);updateCam();}
  addEventListener('resize',resize);resize();
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),gplane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  function groundAt(cx,cy){ndc.set(cx/innerWidth*2-1,-(cy/innerHeight)*2+1);ray.setFromCamera(ndc,cam);return ray.ray.intersectPlane(gplane,new THREE.Vector3());}
  const plotAtScreen=(cx,cy)=>{const g=groundAt(cx,cy);return g?plotAt(Math.round(g.x),Math.round(g.z)):null;};
  function frame(c){const g=new THREE.Group();const m=bmat(c);for(const[w,d,x,z]of[[4.1,.08,0,-2.02],[4.1,.08,0,2.02],[.08,4.1,-2.02,0],[.08,4.1,2.02,0]]){const b=new THREE.Mesh(BOX,m);b.scale.set(w,.05,d);b.position.set(x,.04,z);g.add(b);}scene.add(g);g.visible=false;return g;}
  const hoverF=frame(0xffffff),selF=frame(0xffd166);
  const arrow=new THREE.Group();{const am=bmat(0xffd166);const c=new THREE.Mesh(new THREE.ConeGeometry(.6,1,4),am);c.rotation.x=Math.PI;c.position.y=.5;arrow.add(c);
    const s=new THREE.Mesh(BOX,am);s.scale.set(.3,1,.3);s.position.y=1.5;arrow.add(s);arrow.visible=false;scene.add(arrow);}
  let arrowTarget=null;
  const flyTo=(x,z,zm)=>{camFly={x,z};if(zm)zoomT=zm;};

  // управление: мышь + тач (pan одним пальцем, pinch-zoom двумя)
  const ptrs=new Map();let drag=null,onTap=null,onHover=null;
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});camFly=null;
    if(ptrs.size===1)drag={x:e.clientX,y:e.clientY,g:groundAt(e.clientX,e.clientY),moved:false,t:performance.now()};
    else{drag=null;const[a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:zoomT,mid:groundAt((a.x+b.x)/2,(a.y+b.y)/2)};}});
  let pinch=null;
  canvas.addEventListener('pointermove',e=>{
    if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&ptrs.size===2){const[a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);zoom=zoomT=Math.max(5,Math.min(40,pinch.z*pinch.d/Math.max(d,10)));updateCam();
      const m=groundAt((a.x+b.x)/2,(a.y+b.y)/2);if(m&&pinch.mid){camT.x-=m.x-pinch.mid.x;camT.z-=m.z-pinch.mid.z;clampCam();updateCam();}return;}
    if(drag){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>(e.pointerType==='touch'?10:5))drag.moved=true;
      if(drag.moved&&drag.g){const g=groundAt(e.clientX,e.clientY);if(g){camT.x-=g.x-drag.g.x;camT.z-=g.z-drag.g.z;clampCam();updateCam();}}return;}
    if(e.pointerType==='mouse'){const p=plotAtScreen(e.clientX,e.clientY);if(p){hoverF.visible=true;hoverF.position.set(p.x,0,p.y);}else hoverF.visible=false;canvas.style.cursor=p?'pointer':'default';onHover&&onHover(p,e);}});
  const endPtr=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;
    if(drag&&!drag.moved&&ptrs.size===0){onTap&&onTap(plotAtScreen(e.clientX,e.clientY));}if(ptrs.size===0)drag=null;};
  canvas.addEventListener('pointerup',endPtr);canvas.addEventListener('pointercancel',endPtr);
  canvas.addEventListener('pointerleave',()=>{hoverF.visible=false;onHover&&onHover(null);});
  canvas.addEventListener('wheel',e=>{zoomT=Math.max(5,Math.min(40,zoomT*(e.deltaY>0?1.12:1/1.12)));e.preventDefault();},{passive:false});
  const keys={};addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;keys[e.code]=true;if(e.code==='KeyQ')camAT-=Math.PI/2;if(e.code==='KeyE')camAT+=Math.PI/2;});
  addEventListener('keyup',e=>keys[e.code]=false);
  const clampCam=()=>{camT.x=Math.max(0,Math.min(W,camT.x));camT.z=Math.max(0,Math.min(H,camT.z));};

  // ================= МИНИКАРТА =================
  const mmBase=new ImageData(W,H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){let c=tileColor(x,y);if(grid[I(x,y)]===T.FOREST)c=0x3f7a35;const k=(y*W+x)*4;mmBase.data[k]=c>>16&255;mmBase.data[k+1]=c>>8&255;mmBase.data[k+2]=c&255;mmBase.data[k+3]=255;}
  function drawMini(ctx,t){ctx.putImageData(mmBase,0,0);
    for(const p of plots){if(p.owner)ctx.fillStyle=p.color;else if(p.sp==='res')ctx.fillStyle='#e8e2d4';else if(p.sp==='bc')ctx.fillStyle='#5aa39b';else if(p.sp)ctx.fillStyle='#ffd166';else continue;ctx.fillRect(p.x0,p.y0,4,4);}
    for(const[,a]of avatars){ctx.fillStyle='#fff';ctx.fillRect(Math.round(a.x),Math.round(a.y),1,1);}
    if(me&&Math.floor(t*3)%2){ctx.fillStyle='#ffd166';ctx.fillRect(Math.round(me.x)-1,Math.round(me.y)-1,3,3);}
    const cs=[[0,0],[innerWidth,0],[innerWidth,innerHeight],[0,innerHeight]].map(([x,y])=>groundAt(x,y));
    if(cs.every(Boolean)){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=1;ctx.beginPath();cs.forEach((c,i)=>i?ctx.lineTo(c.x,c.z):ctx.moveTo(c.x,c.z));ctx.closePath();ctx.stroke();}}

  // ================= КАДР =================
  let vanT=2,resT=1,cargoT=3,fishT=1;const _v=new THREE.Vector3();
  function project(p,el){_v.copy(p).project(cam);if(_v.z>1||Math.abs(_v.x)>1.05||Math.abs(_v.y)>1.05){el.style.display='none';return;}el.style.display='';el.style.left=(_v.x+1)/2*innerWidth+'px';el.style.top=(1-_v.y)/2*innerHeight+'px';}
  const near=(x,y,r=zoom*2.5)=>Math.abs(x-camT.x)+Math.abs(y-camT.z)<r;
  function frameUpdate(dt){
    time+=dt;
    for(let i=0;i<trees.length;i++){const t=trees[i];if(!t.alive){t.grow+=dt/50;if(t.grow>=1){t.alive=true;t.grow=1;}t._d=true;}else if(t.shake&&!t.reserved){t.shake=0;t._d=true;}if(t._d){setTree(i);t._d=false;treesDirty=true;}}
    if(treesDirty){trunkIM.instanceMatrix.needsUpdate=pineIM.instanceMatrix.needsUpdate=leafIM.instanceMatrix.needsUpdate=true;treesDirty=false;}
    for(const p of plots){for(const c of p.crops)if(c.g<1&&near(p.x,p.y)){c.g=Math.min(1,c.g+dt/(p.sp?12:15));setCrop(c);}else if(p.sp&&c.g>=1&&Math.random()<dt*.05){c.g=0;setCrop(c);}
      if(p.group&&p.builtAt){const k=Math.min(1,1-(p.builtAt-Date.now())/20000);p.group.scale.y=Math.max(.02,k);if(k<1&&near(p.x,p.y)&&Math.random()<dt*6)puff(p.x0+rand(.5,2.5),.2,p.y0+rand(.5,2.5),0xc8b89a,1,.6,.5);
        if(k>=1&&p.wk.length!==p.workers)syncWorkers(p);}}
    for(const u of units){const vis=near(u.x,u.y);u.mesh.visible=vis;if(vis){updateWorker(u,dt);animPerson(u,time);}}
    for(const r of[...residents]){if(!near(r.x,r.y,zoom*3.5)){removeRes(r);continue;}updateResident(r,dt);animPerson(r,time);}
    for(const v of[...vehicles]){updateVehicle(v,dt);v.mesh.position.set(v.x,0,v.y);v.mesh.rotation.y=v.face;}
    for(const s of[...ships]){updateShip(s,dt);s.mesh.position.set(s.x,0,s.y);s.mesh.rotation.y=s.face||0;s.mesh.position.y=Math.sin(time*2+s.x)*.04;}
    cranes.forEach((c,k)=>c.rotation.y=Math.sin(time*.4+k*2)*1.2);
    if((vanT-=dt)<=0){vanT=rand(3,6);if(vehicles.filter(v=>v.kind==='van').length<8)spawnVan();}
    if((resT-=dt)<=0){resT=rand(.3,.7);if(residents.length<(mobile?35:60))spawnResident();}
    if((cargoT-=dt)<=0){cargoT=rand(35,60);if(ships.filter(s=>s.kind==='cargo').length<3)spawnCargo();}
    if((fishT-=dt)<=0){fishT=rand(6,12);if(ships.filter(s=>s.kind==='fishing').length<6)spawnFishing();}
    if(me){if(stepMove(me,dt)){}animPerson(me,time);me.label.p.set(me.x,1.2,me.y);}
    for(const[,a]of avatars){const dx=a.tx-a.x,dy=a.ty-a.y,d=Math.hypot(dx,dy);a.moving=d>.05;if(d>12){a.x=a.tx;a.y=a.ty;}else if(a.moving){const s=Math.min(d,3.2*dt);a.x+=dx/d*s;a.y+=dy/d*s;a.face=Math.atan2(dx,dy);}
      animPerson(a,time);a.label.p.set(a.x,1.2,a.y);}
    for(const p of plots){const a=p.anim;if(!a)continue;if(!near(p.x,p.y))continue;const busy=p.wk.some(w=>w.working)||p.sp;
      if(a.blades&&(p.workers||p.sp))a.blades.rotation.z+=dt*1.5;if(a.spin&&busy)a.spin.rotation.y+=dt*15;
      if(a.smoke&&(p.workers||p.sp)&&Math.random()<dt*3)puff(p.x0+1.5+a.smoke[0],a.smoke[1],p.y0+1.5+a.smoke[2],0xcfcfcf,1,.5,.08);
      if(a.boxes)a.boxes.forEach((b,k)=>b.visible=k<Math.ceil(p.parcels/2));}
    for(const p of plots)if(p.fence)p.fence.userData.flag.rotation.y=Math.sin(time*3+p.id)*.3;
    arrow.visible=!!arrowTarget;if(arrowTarget){arrow.position.set(arrowTarget.x,(arrowTarget.sp==='bc'?10:3)+Math.sin(time*4)*.3,arrowTarget.y);arrow.rotation.y+=dt*2;}
    for(let i=parts.length-1;i>=0;i--){const q=parts[i];q.life+=dt;q.m.position.x+=q.vx*dt;q.m.position.y+=q.vy*dt;q.m.position.z+=q.vz*dt;const s=q.s*(1-q.life/q.max);q.m.scale.set(s,s,s);if(q.life>=q.max){scene.remove(q.m);parts.splice(i,1);}}
    camA+=(camAT-camA)*Math.min(1,dt*8);zoom+=(zoomT-zoom)*Math.min(1,dt*6);
    if(camFly){const k=Math.min(1,dt*3.5);camT.x+=(camFly.x-camT.x)*k;camT.z+=(camFly.z-camT.z)*k;if(Math.hypot(camFly.x-camT.x,camFly.z-camT.z)<.05)camFly=null;}
    const fx=-Math.sin(camA),fz=-Math.cos(camA),sp=zoom*1.2*dt;
    if(keys.KeyW||keys.ArrowUp){camT.x+=fx*sp;camT.z+=fz*sp;}if(keys.KeyS||keys.ArrowDown){camT.x-=fx*sp;camT.z-=fz*sp;}
    if(keys.KeyA||keys.ArrowLeft){camT.x+=fz*sp;camT.z-=fx*sp;}if(keys.KeyD||keys.ArrowRight){camT.x-=fz*sp;camT.z+=fx*sp;}
    clampCam();updateCam();
    renderer.render(scene,cam);
    for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.t+=dt;f.p.y+=dt*.7;project(f.p,f.el);f.el.style.opacity=1-f.t/1.6;if(f.t>1.6){f.el.remove();floats.splice(i,1);}}
    for(const L of wlabels)project(L.p,L.el);
  }

  return {renderer,scene,cam,plots,layoutUnits,plotAt,frameUpdate,setPlotState,spawnTruck,flyTo,drawMini,float,
    get camT(){return camT;},get zoom(){return zoom;},set onTap(f){onTap=f;},set onHover(f){onHover=f;},
    select(p){if(p){selF.visible=true;selF.position.set(p.x,0,p.y);}else selF.visible=false;},
    set arrow(p){arrowTarget=p;},
    setMe,goMe,get me(){return me;},setOther,removeOther,avatars,
    jump(x,z){camFly=null;camT.set(x,0,z);clampCam();updateCam();},
    marketTile:()=>marketTiles[6],resize,W,H};
}
