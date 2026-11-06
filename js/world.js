// Рендер мира и косметическая симуляция (рабочие, жители, грузовики, корабли, аватары).
// Экономика считается на сервере — здесь только картинка.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GOODS,BLD,EMP,RES,BCT,SKINS,LOOK,DEFAULT_LOOK} from './config.js';
import {ADS,AD_SEC,drawAd} from './ads.js';
import {W,H,STEP,HY,BLOCKS,RING,OX,OY,LAKES,POIS,ISLAND,buildLayout,hash} from './layout.js';

const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,s=t=>t*t*(3-2*t);const a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1),u=s(xf),v=s(yf);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
let seed=1337;const srnd=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const I=(x,y)=>y*W+x,inb=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
export const T={GRASS:0,ROAD:1,WATER:2,FOREST:3,ROCK:4,PLOT:5,SAND:6,BRIDGE:7,ASPH:8,YARD:9,RING:10,FIELD:11,SEA:12};

export function createWorld(canvas,{mobile}){
  // ================= КАРТА =================
  const grid=new Uint8Array(W*H);
  const coast=x=>161+Math.round(Math.sin(x*.08)*2+vnoise(x*.2,7)*2);
  const inLake=(L,x,y,k=1)=>((x-L.x)/L.rx)**2+((y-L.y)/L.ry)**2<k;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let t=T.GRASS;const n=vnoise(x*.09,y*.09),n2=vnoise(x*.22+40,y*.22+9);
    if(n>.6)t=T.FOREST;
    if(x<48&&(n>.3||x<8))t=T.FOREST;                       // западный бор
    if(y<49){if(x>=83&&x<=187)t=(n2>.36||y<6)?T.ROCK:(n>.38?T.FOREST:T.GRASS);else if(n>.32)t=T.FOREST;} // горы
    if(x>213&&y<85&&n>.35)t=T.FOREST;
    if(y>103&&y<133&&x>47&&x<87&&n2>.45)t=T.FIELD;
    if(y>182&&x<131&&n>.36)t=T.FOREST;
    if(t===T.FOREST&&n2>.78)t=T.GRASS;                       // полянки
    if(y<160){const rx=44+Math.round(Math.sin(y*.11)*2.5);if(x===rx||x===rx+1)t=T.WATER;else if((x===rx-1||x===rx+2)&&t!==T.FOREST)t=T.SAND;}
    for(const L of LAKES){if(inLake(L,x,y))t=T.WATER;else if(inLake(L,x,y,1.3)&&t!==T.WATER)t=T.SAND;}
    const c=coast(x),bay=300+Math.round(Math.sin(y*.07)*6);if(x>=131&&x<bay){if(y>=c)t=T.SEA;else if(y>=c-2)t=T.SAND;}else if(x>=131&&x<bay+2&&y>=c)t=T.SAND;
    if(x>=262&&y<160&&n>.55)t=T.FOREST;if(x>=300&&y>=225&&y<238&&n2>.4)t=T.FIELD;
    grid[I(x,y)]=t;
  }
  const IC={x:(ISLAND.x0+ISLAND.x1)/2,y:(ISLAND.y0+ISLAND.y1)/2,rx:(ISLAND.x1-ISLAND.x0)/2,ry:(ISLAND.y1-ISLAND.y0)/2};
  const onIsland=(x,y,k=1)=>((x-IC.x)/IC.rx)**2+((y-IC.y)/IC.ry)**2<k;
  for(let y=ISLAND.y0-4;y<=ISLAND.y1+4;y++)for(let x=ISLAND.x0-4;x<=ISLAND.x1+4;x++){if(!inb(x,y))continue;const n=vnoise(x*.2+7,y*.2);
    if(onIsland(x,y,.82))grid[I(x,y)]=n>.62?T.FOREST:T.GRASS;else if(onIsland(x,y,1))grid[I(x,y)]=T.SAND;}
  const clearRect=(x0,y0,x1,y1,t=T.GRASS)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(inb(x,y)&&grid[I(x,y)]!==T.WATER&&grid[I(x,y)]!==T.SEA)grid[I(x,y)]=t;};
  for(const b of BLOCKS)clearRect(b.x-2,b.y-2,b.x+b.cols*STEP+2,b.y+b.rows*STEP+2);
  clearRect(RING.x0-2,RING.y0-2,RING.x1+2,RING.y1+2);
  clearRect(151,155,189,160,T.YARD); // портовая площадка
  for(const k in POIS){const P=POIS[k];clearRect(P.x-2,P.y-2,P.x+2,P.y+2);}
  const setRoad=(x,y,t)=>{if(!inb(x,y))return;const g=grid[I(x,y)];grid[I(x,y)]=(g===T.WATER||g===T.SEA||g===T.BRIDGE)?T.BRIDGE:(t??(x>=RING.x0-3?T.ASPH:T.ROAD));};
  const carve=(x0,y0,x1,y1,t=T.ROAD)=>{const sx=Math.sign(x1-x0)||1,sy=Math.sign(y1-y0)||1;for(let x=x0;x!==x1+sx;x+=sx)setRoad(x,y0,t);for(let y=y0;y!==y1+sy;y+=sy)setRoad(x1,y,t);};
  for(const b of BLOCKS){const rt=(b.reg==='v'||b.reg==='d')?T.ROAD:T.ASPH;
    for(let k=0;k<=b.cols;k++)for(let t=b.y;t<=b.y+b.rows*STEP;t++)setRoad(b.x+STEP*k,t,rt);
    for(let k=0;k<=b.rows;k++)for(let t=b.x;t<=b.x+b.cols*STEP;t++)setRoad(t,b.y+STEP*k,rt);}
  for(let x=0;x<W;x++)if(grid[I(x,HY)]!==T.SEA)setRoad(x,HY);
  for(let y=0;y<RING.y0;y++)setRoad(135,y);
  carve(63,100,63,137);carve(160,RING.y1,160,140,T.ASPH);carve(200,95,200,140,T.ASPH);carve(185,140,200,140,T.ASPH);
  // тропинки к местам заданий
  carve(POIS.mush.x,POIS.mush.y,53,POIS.mush.y);carve(POIS.forester.x,POIS.forester.y,53,POIS.forester.y);carve(POIS.pier.x+1,POIS.pier.y,53,POIS.pier.y);carve(53,POIS.pier.y,53,70);
  carve(POIS.camp.x,POIS.camp.y,63,POIS.camp.y);carve(63,POIS.camp.y,63,152);carve(POIS.spring.x,POIS.spring.y,POIS.spring.x,70);
  carve(POIS.lighthouse.x,POIS.lighthouse.y,200,POIS.lighthouse.y);carve(200,POIS.lighthouse.y,200,140);carve(POIS.fire.x,POIS.fire.y,POIS.fire.x,HY);
  {const I_=ISLAND;for(const k of['spawn','pvz','alko','lavka','mill'])clearRect(I_[k].x-2,I_[k].y-2,I_[k].x+2,I_[k].y+2);clearRect(I_.plot.x0-1,I_.plot.y0-1,I_.plot.x0+4,I_.plot.y0+4);
    carve(I_.spawn.x,I_.spawn.y+2,I_.lavka.x,I_.spawn.y+2);carve(I_.pvz.x,I_.pvz.y+2,I_.mill.x,I_.pvz.y+2);clearRect(I_.board.x-1,I_.board.y-1,I_.board.x+1,I_.board.y+1);carve(I_.pier.x,I_.pier.y,I_.pier.x,I_.spawn.y+2);
    for(let y=I_.pier.y-7;y<=I_.pier.y;y++)for(let x=I_.pier.x;x<=I_.pier.x+1;x++)grid[I(x,y)]=grid[I(x,y)]===T.SEA||grid[I(x,y)]===T.SAND?T.BRIDGE:grid[I(x,y)];}
  for(const b of BLOCKS)if(b.link){const cx=b.x+STEP*Math.floor(b.cols/2);if(b.link<b.y)carve(cx,b.y,cx,b.link);else carve(cx,b.y+b.rows*STEP,cx,b.link);}
  // съезд промпарка «Дальний» (y=150) упирался в пустоту — дотягиваем до нижней улицы СНТ «Сосновый Бор»; через него же подключено С. Луговое
  carve(322,150,345,150);
  for(let x=RING.x0;x<=RING.x1;x++){grid[I(x,RING.y0)]=T.RING;grid[I(x,RING.y1)]=T.RING;}
  for(let y=RING.y0;y<=RING.y1;y++){grid[I(RING.x0,y)]=T.RING;grid[I(RING.x1,y)]=T.RING;}
  const PIERS=[159,171,183];
  for(const px of PIERS)for(let y=155;y<=172;y++)for(let x=px;x<=px+1;x++)grid[I(x,y)]=grid[I(x,y)]===T.SEA?T.BRIDGE:T.YARD;
  // яхт-клуб (причал у дороги к маяку) и площадка телебашни
  const MARINA={x:208,y0:158,y1:174},TOWER={x:214.5,y:150.5};
  for(let y=MARINA.y0;y<=MARINA.y1;y++)for(let x=MARINA.x;x<=MARINA.x+1;x++)grid[I(x,y)]=grid[I(x,y)]===T.SEA||grid[I(x,y)]===T.SAND?T.BRIDGE:T.YARD;
  clearRect(212,147,217,154,T.YARD);carve(214,155,214,157);
  // немного высоток за кольцевой — только на юге, у промзоны
  const BG=[];for(let x=98;x<=150;x+=18)BG.push([x,131,9+(x%3)*3]);
  for(const[bx,by]of BG)for(let y=by;y<by+3;y++)for(let x=bx;x<bx+5;x++)if(inb(x,y)&&grid[I(x,y)]===T.GRASS)grid[I(x,y)]=T.YARD;

  const {plots,units:layoutUnits}=buildLayout();
  const plotIdx=new Int16Array(W*H).fill(-1);
  for(const p of plots){p.owner=null;p.color=null;p.building=null;p.workers=0;p.builtAt=0;p.door=p.sp==='bc'?{x:p.x0+3,y:p.y0+3}:{x:p.x0+1,y:p.y0+3};p.stock={x:p.x0+3,y:p.y0+3};p.crops=[];p.wk=[];p.parcels=p.sp==='pvzCity'?8:0;
    for(let y=p.y0;y<p.y0+4;y++)for(let x=p.x0;x<p.x0+4;x++){grid[I(x,y)]=(p.reg==='v'||p.reg==='d'||p.sp==='park'||p.sp==='yard')?T.PLOT:p.sp==='parking'?T.ASPH:T.YARD;plotIdx[I(x,y)]=p.id;}}
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
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.BasicShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x8fbfe0);
  const hemi=new THREE.HemisphereLight(0xd6e8ff,0x4a6b3a,1.0);scene.add(hemi);
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

  const statics=new THREE.Group(); // всё неподвижное — потом склеивается в крупные меши
  // --- земля ---
  const TC={[T.GRASS]:0x7bb661,[T.ROAD]:0xc2a878,[T.WATER]:0x3f86c6,[T.SEA]:0x2f6fae,[T.FOREST]:0x5a9645,[T.ROCK]:0x8d877f,[T.PLOT]:0x95c266,[T.SAND]:0xe3d29b,[T.BRIDGE]:0x9c6b3e,[T.ASPH]:0x5d6066,[T.YARD]:0xa3ab96,[T.RING]:0x45474d,[T.FIELD]:0xd8c45a};
  function tileColor(x,y){const t=grid[I(x,y)];let c=TC[t];const p=plotAt(x,y);
    if(p&&(p.sp==='park'||p.sp==='yard')){const dx=x-p.x0,dy=y-p.y0;c=0x86c46a;
      if(p.sp==='park'&&((dx===1||dx===2)||(dy===1||dy===2))&&!((dx===1||dx===2)&&(dy===1||dy===2)))c=0xd9c99a;
      if(p.sp==='yard'&&dy===3)c=0x8a8d92;if(p.sp==='yard'&&dx<2&&dy<2)c=0xe3d29b;return c;}
    if(p&&p.sp==='parking'){const dx=x-p.x0;return dx%2?0x55585e:0x5d6066;}
    if(p&&!p.sp&&p.reg==='c'){const dx=x-p.x0,dy=y-p.y0;return(dx===0||dy===0||dx===3||dy===3)?0x9cc779:0x8cc06a;}
    if(p&&p.sp==='market')c=0xb9b2a5;else if(p&&(p.reg==='p'||p.reg==='o'))c=0x9c9a92;else if(p&&p.reg==='c'&&p.demand>30)c=0xb4b4ac;
    if(t===T.RING&&((x+y)%3===0))c=0xd8d8d0;if(t===T.FIELD&&x%2)c=0x9fbf4a;return c;}
  {const cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d');const img=cx.createImageData(W,H),col=new THREE.Color();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=grid[I(x,y)];let j=.93+hash(x,y)*.12;if((t===T.PLOT||t===T.YARD)&&(x+y)%2)j*=.96;
      col.setHex(tileColor(x,y)).multiplyScalar(j).convertLinearToSRGB();const k=(y*W+x)*4;img.data[k]=Math.min(255,col.r*255);img.data[k+1]=Math.min(255,col.g*255);img.data[k+2]=Math.min(255,col.b*255);img.data[k+3]=255;}
    cx.putImageData(img,0,0);const tex=new THREE.CanvasTexture(cv);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.colorSpace=THREE.SRGBColorSpace;
    const gm=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshLambertMaterial({map:tex}));gm.rotation.x=-Math.PI/2;gm.position.set(W/2-.5,0,H/2-.5);gm.receiveShadow=true;scene.add(gm);
    // вода чуть ниже — тёмная подложка по краям для глубины
    const wm=new THREE.Mesh(new THREE.PlaneGeometry(W+400,H+400),new THREE.MeshLambertMaterial({color:0x2f6fae}));wm.rotation.x=-Math.PI/2;wm.position.set(W/2,-.2,H/2);scene.add(wm);}
  // --- деревья ---
  const trees=[],CH=40,chunks=new Map();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=grid[I(x,y)],inPlot=plotIdx[I(x,y)]>=0;
    if((t===T.FOREST&&srnd()<.55)||(t===T.GRASS&&!inPlot&&srnd()<.02)){
      const ck=Math.floor(x/CH)+','+Math.floor(y/CH);if(!chunks.has(ck))chunks.set(ck,{n:0,dirty:true});const c=chunks.get(ck);
      trees.push({x,y,px:x+(srnd()-.5)*.35,pz:y+(srnd()-.5)*.35,s:.8+srnd()*.45,rot:srnd()*6.28,pine:srnd()<(x<60?.65:.4),alive:true,grow:1,reserved:null,shake:0,c,ci:c.n++});}}
  const trunkGeo=new THREE.CylinderGeometry(.07,.1,.5,5);trunkGeo.translate(0,.25,0);
  const pineGeo=new THREE.ConeGeometry(.42,1.05,6);pineGeo.translate(0,.88,0);
  const leafGeo=new THREE.IcosahedronGeometry(.42,0);leafGeo.translate(0,.82,0);
  const treeMat=new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true});
  for(const c of chunks.values()){c.trunk=new THREE.InstancedMesh(trunkGeo,mat(0x6b4226),c.n);c.pine=new THREE.InstancedMesh(pineGeo,treeMat,c.n);c.leaf=new THREE.InstancedMesh(leafGeo,treeMat,c.n);
    for(const im of[c.trunk,c.pine,c.leaf]){im.castShadow=!mobile;im.receiveShadow=true;scene.add(im);}}
  const _m=new THREE.Matrix4(),_m0=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),ZERO=new THREE.Vector3();
  function setTree(i){const t=trees[i],c=t.c;_e.set(t.shake,t.rot,t.shake*.5);_q.setFromEuler(_e);_p.set(t.px,0,t.pz);const gr=t.alive?1:t.grow;
    _s.set(t.s,t.s*(t.alive?1:Math.max(.35,gr)),t.s);_m.compose(_p,_q,_s);c.trunk.setMatrixAt(t.ci,_m);
    const cs=t.alive?t.s:(gr>.15?t.s*gr:0);_s.set(cs,cs,cs);_m.compose(_p,_q,_s);_m0.compose(_p,_q,ZERO);
    if(t.pine){c.pine.setMatrixAt(t.ci,_m);c.leaf.setMatrixAt(t.ci,_m0);}else{c.leaf.setMatrixAt(t.ci,_m);c.pine.setMatrixAt(t.ci,_m0);}c.dirty=true;}
  {const col=new THREE.Color();trees.forEach((t,i)=>{setTree(i);col.setHex(t.pine?[0x2f6b3a,0x3a7d44,0x2d5e34][i%3]:[0x5fa548,0x4f9a3c,0x79b04a][i%3]);t.c.pine.setColorAt(t.ci,col);t.c.leaf.setColorAt(t.ci,col);});
    for(const c of chunks.values())for(const im of[c.trunk,c.pine,c.leaf]){im.computeBoundingSphere();im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;}}
  let treesDirty=false;

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
    const t=new THREE.CanvasTexture(c);t.magFilter=t.minFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;
    const e=document.createElement('canvas');e.width=c.width;e.height=c.height;const ex=e.getContext('2d'),src=x.getImageData(0,0,c.width,c.height),dst=ex.createImageData(c.width,c.height);
    const lr=parseInt(lit.slice(1,3),16),lg=parseInt(lit.slice(3,5),16),lb=parseInt(lit.slice(5,7),16);for(let i=0;i<src.data.length;i+=4){const on=Math.abs(src.data[i]-lr)<6&&Math.abs(src.data[i+1]-lg)<6&&Math.abs(src.data[i+2]-lb)<6;
      dst.data[i]=on?255:0;dst.data[i+1]=on?220:0;dst.data[i+2]=on?140:0;dst.data[i+3]=255;}ex.putImageData(dst,0,0);
    const et=new THREE.CanvasTexture(e);et.magFilter=et.minFilter=THREE.NearestFilter;et.colorSpace=THREE.SRGBColorSpace;t.userData.emi=et;return t;}
  const nightMats=[];
  const STYLES={
    khrush:[{base:'#b5654a',stripe:'#9a5038'},{base:'#d9c27a',stripe:'#c0a860'},{base:'#c97b5a',stripe:null}],
    panel9:[{base:'#d9d4c8',stripe:'#b8b2a4'},{base:'#cfd8dc',stripe:'#5b7fa6'},{base:'#e2d6c0',stripe:'#c49a6c'}],
    panel16:[{base:'#e6e1d6',stripe:'#8fa3b8',cols:6},{base:'#dcd6ca',stripe:'#b07a5a',cols:6}],
    novostroy:[{base:'#f1efe9',patches:['#ff8c42','#f6c85f','#6fb3b8'],cols:7},{base:'#ece8e0',patches:['#d65a5a','#5a8bd6','#f2e8cf'],cols:7}],
    tower:[{base:'#2c4a6b',win:'#4a7aa8',lit:'#bfe3ff',glass:true,cols:6},{base:'#203040',win:'#3f6d8c',lit:'#e8f6ff',glass:true,cols:6}],
    bc:[{base:'#2f5d5a',win:'#5aa39b',lit:'#d8fff8',glass:true,cols:8},{base:'#3a4a5a',win:'#6b8aa8',lit:'#f0f6ff',glass:true,cols:8}],
  };
  const FMAT={};
  function facadeMat(type,v,floors){const k=type+v;if(!FMAT[k]){const st=STYLES[type][v];const tx=facadeTex(floors,st);FMAT[k]=new THREE.MeshLambertMaterial({map:tx,emissiveMap:tx.userData.emi,emissive:0xffffff,emissiveIntensity:0});nightMats.push(FMAT[k]);FMAT[k].side_=mat(new THREE.Color(st.base).multiplyScalar(.85).getHex());}return FMAT[k];}
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
    else if(rt==='tower'){const m=tower('tower',v,30,.36,2.4,2.4);m.position.x=1.5;m.position.z=1.5;g.add(m);
      const h=30*.36;B(g,1.6,.8,1.6,0x2c3e50,1.5,h,1.5);B(g,.1,2,.1,0xdddddd,1.5,h+.8,1.5);B(g,.25,.25,.25,0xff4444,1.5,h+2.8,1.5,true);}
    if(rt!=='tower'){B(g,.4,.5,.15,0x5a4a3a,.7,0,2.05);const car=makeCar(pick(CAR_COLS));car.position.set(3,0,3);car.rotation.y=Math.PI/2;g.add(car);
      B(g,.6,.05,.25,0x8b5a2b,-.2,.25,3.1);decoTree(g,-.3,-.3,.9);decoTree(g,3.3,-.2,.8);bush(g,-.3,2.2);bush(g,3.3,1.6);}
    g.position.set(p.x0,0,p.y0);statics.add(g);
  }
  function makeBC(p){const g=new THREE.Group(),v=p.id%2;
    const m=tower('bc',v,20,.4,3.2,2.4);m.position.set(1.5,20*.4/2+.6,1.2);g.add(m);B(g,3.6,.6,2.8,0x9aa3ab,1.5,0,1.2);
    B(g,3.25,.12,2.45,0x6d6a66,1.5,8.6,1.2);for(const[w,d,x,z]of[[3.3,.1,1.5,0],[3.3,.1,1.5,2.4],[.1,2.5,-.13,1.2],[.1,2.5,3.13,1.2]])B(g,w,.22,d,0x8a8580,x,8.6,z);
    B(g,.7,.4,.5,0x9aa3ab,.6,8.72,.7);B(g,.5,.3,.5,0xb8c0c6,2.4,8.72,1.7);B(g,.05,1.2,.05,0xdddddd,2.6,8.72,.5);B(g,1.2,.05,.8,0x7f8c8d,1.5,0,3.1);
    g.position.set(p.x0,0,p.y0);statics.add(g);}

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
    case 'shop':{const h=hash(color?1:2,0),cols=[[0xe74c3c,0xffffff],[0x27ae60,0xffffff],[0x2980b9,0xf1c40f],[0x8e44ad,0xffffff],[0xf39c12,0x2c3e50]][Math.floor(Math.random()*5)];
      B(g,2,.85,1.5,0xe8e2d4);B(g,2.1,.1,1.6,0x555555,0,.85,0);B(g,1.6,.28,.05,cols[0],0,.6,.78,true);B(g,1.4,.4,.03,0x9fd3ff,0,.12,.76,true);
      const aw=B(g,1.8,.05,.45,cols[0],0,.55,.95);aw.rotation.x=.35;B(g,.5,.4,.4,0x8b5a2b,.9,0,1.2);for(let k=0;k<3;k++)B(g,.12,.12,.12,pick([0xe74c3c,0xf39c12,0x27ae60]),.75+k*.13,.4,1.2);}break;
    case 'dk':B(g,2.8,1.2,1.7,0xeee2c4);B(g,3,.14,1.9,0xd8c9a4,0,1.2,0);B(g,1.4,.5,1.2,0xeee2c4,0,1.34,-.1);GR(g,1.5,.4,1.3,0xb04a3a,0,1.84,-.1);
      B(g,1.6,.12,.5,0xd8c9a4,0,0,1.1);B(g,1.4,.1,.35,0xd8c9a4,0,.12,1.05);for(let k=0;k<4;k++)B(g,.14,1.1,.14,0xfaf3e0,-.6+k*.4,.2,1.15);B(g,1.6,.14,.45,0xeee2c4,0,1.3,1.1);
      {const pd=GR(g,1.6,.35,.45,0xeee2c4,0,1.44,1.1);pd.rotation.y=Math.PI/2;}B(g,.9,.2,.03,0xc0392b,0,1.52,1.34,true);B(g,.7,.09,.031,0xffd166,0,1.58,1.35,true);
      for(const x of[-1.1,1.1])for(const y of[.25,.75])B(g,.4,.3,.03,0x9fd3ff,x,y,.86,true);B(g,.4,.6,.03,0x6b4a2f,0,.22,.86);break;
    case 'cinema':B(g,2.8,1.6,2.2,0x3b2a4a);B(g,2.9,.12,2.3,0x2a1e36,0,1.6,0);B(g,2.6,.35,.12,0x14101c,0,1.15,1.15);
      B(g,2.2,.22,.03,0xff3b6b,0,1.2,1.22,true);B(g,1.4,.09,.031,0xffe9a8,0,1.27,1.23,true);B(g,2.9,.08,.5,0xffd166,0,.95,1.3,true);
      for(const x of[-1.05,1.05]){B(g,.55,.75,.04,0x111111,x,.12,1.12);B(g,.47,.67,.03,[0x2e86ab,0xe67e22][x>0?1:0],x,.16,1.15,true);}
      B(g,.9,.75,.03,0x9fd3ff,0,.1,1.11,true);for(let k=0;k<6;k++)B(g,.1,.1,.1,k%2?0xffd166:0xfff3c4,-1.25+k*.5,1.0,1.55,true);break;
    case 'cityhall':B(g,2.6,1.3,1.8,0xf2ead8);B(g,2.8,.15,2,0xd8cfb8,0,1.3,0);PY(g,2.8,.6,2,0x4f7a5a,0,1.45,0);B(g,1,1.1,.6,0xf2ead8,0,1.45,0);
      PY(g,1.1,.7,.7,0x4f7a5a,0,2.55,0);B(g,.06,1,.06,0xdddddd,0,3.2,0);B(g,.45,.28,.03,0xe63946,.24,3.85,0);B(g,.45,.1,.031,0x2a6fdb,.24,3.85,0);
      for(let k=0;k<6;k++)B(g,.14,1.1,.14,0xffffff,-1.1+k*.44,0,1);B(g,2.7,.12,.3,0xd8cfb8,0,1.1,1.05);B(g,1,.12,.6,0xbdb6a6,0,0,1.25);
      {const c=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.04,12),bmat(0xffffff));c.rotation.x=Math.PI/2;c.position.set(0,2.05,.31);g.add(c);}break;
    case 'apiary':B(g,1.2,.7,1,0xc8a26b);PY(g,1.4,.5,1.2,0x8b5a2b,0,.7,0);for(let k=0;k<6;k++){const x=-1.2+(k%3)*1.2,z=k<3?1.1:-1.2;B(g,.35,.35,.35,[0xf1c40f,0xe67e22,0xffffff][k%3],x,0,z);B(g,.4,.06,.4,0x8b5a2b,x,.35,z);}break;
    case 'henhouse':B(g,1.3,.6,1,0xd9c49a);GR(g,1.45,.5,1.15,0xa83a32,0,.6,0);B(g,1.8,.3,.04,0xdddddd,0,0,1.3);for(let k=0;k<5;k++){const c=new THREE.Group();B(c,.16,.14,.12,k%2?0xffffff:0xc9822b,0,.06,0);B(c,.06,.06,.04,0xe74c3c,.08,.2,0);c.position.set(-.8+k*.4,0,.9);g.add(c);}break;
    case 'orchard':B(g,1,.6,.8,0x9c6b3e);GR(g,1.1,.4,.9,0x3d6b35,0,.6,0);for(const[x,z]of[[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2],[0,1.3]]){B(g,.12,.5,.12,0x6b4226,x,0,z);const c=new THREE.Mesh(new THREE.IcosahedronGeometry(.42,0),mat(0x4f9a3c));c.position.set(x,.8,z);g.add(c);for(let a=0;a<3;a++)B(g,.08,.08,.08,0xd63031,x+Math.cos(a*2)*.3,.75,z+Math.sin(a*2)*.3);}break;
    case 'sheepfold':B(g,1.6,.7,1.1,0x8b5a2b);GR(g,1.75,.5,1.25,0x5b2d2a,0,.7,0);for(let k=0;k<4;k++){const c=new THREE.Group();B(c,.36,.24,.22,0xf4f1e8,0,.14,0);B(c,.12,.14,.12,0x333333,.22,.24,0);c.position.set(-.9+k*.6,0,1.1+(k%2)*.2);c.rotation.y=k;g.add(c);}break;
    case 'juicery':B(g,1.5,.9,1.3,0xf5e6c8);B(g,1.6,.12,1.4,0xe67e22,0,.9,0);CY(g,.3,.3,1.1,8,0xbdc3c7,.75,0,-.5);B(g,.6,.25,.05,0xf39c12,0,.55,.66,true);break;
    case 'confectionery':B(g,1.6,.9,1.3,0xffe4ec);PY(g,1.8,.7,1.5,0xff8fab,0,.9,0);B(g,1.2,.4,.03,0xfff1b0,0,.2,.66,true);B(g,.7,.22,.05,0xff6b9a,0,.68,.67,true);B(g,.25,.6,.25,0xeeeeee,.5,.95,-.3);a.smoke=[.5,1.6,-.3];break;
    case 'tailor':B(g,1.6,.95,1.3,0xd6e4f0);GR(g,1.75,.6,1.45,0x5e4b8b,0,.95,0);B(g,1,.4,.03,0x9fd3ff,0,.25,.66,true);B(g,.12,.6,.12,0x555555,-.9,0,.9);B(g,.3,.4,.2,0x3d6ea6,-.9,.35,.9);break;
    case 'store':{const c=new THREE.Color(color||0xffffff).getHex();B(g,1.8,.85,1.3,0xf2efe6);B(g,1.9,.1,1.4,0x555555,0,.85,0);B(g,1.6,.26,.05,c,0,.6,.67,true);B(g,1.4,.4,.03,0x9fd3ff,0,.12,.66,true);const aw=B(g,1.8,.05,.45,c,0,.55,.85);aw.rotation.x=.35;}break;
    case 'alko':B(g,1.9,.9,1.4,0x5a2a2a);B(g,2,.1,1.5,0x2c1a1a,0,.9,0);B(g,1.7,.28,.05,0x8e1b2e,0,.62,.72,true);B(g,1.2,.14,.051,0xf1c40f,0,.69,.73,true);
      B(g,1.3,.4,.03,0x9fd3ff,0,.12,.71,true);for(let k=0;k<3;k++){B(g,.35,.25,.3,0x8b5a2b,-.9+k*.4,0,1.05);for(let b=0;b<3;b++)B(g,.05,.14,.05,[0x2e7d32,0x6b3a1a,0xdddddd][b],-1+k*.4+b*.09,.25,1.05);}break;
    case 'lavka':B(g,1.4,.1,1,0x8b5a2b,0,.6,0);for(const[x,z]of[[-.6,-.4],[.6,-.4],[-.6,.4],[.6,.4]])B(g,.08,.6,.08,0x6b4a2f,x,0,z);{const aw=B(g,1.6,.06,1.2,0xc0392b,0,1.05,0);aw.rotation.x=.15;}
      for(let k=0;k<5;k++)B(g,.18,.14,.18,[0xe8c547,0xe67e22,0xd63031,0x7fb3d5,0xf5f5f5][k],-.5+k*.25,.7,0);break;
    case 'guesthouse':B(g,1.5,.8,1.2,0xe8dcc0);GR(g,1.7,.6,1.4,0x2e5e8c,0,.8,0);B(g,.3,.5,.04,0x6b4a2f,0,0,.62);B(g,.3,.25,.04,0xffd27a,-.45,.35,.62,true);break;
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
  const landPlots=plots.filter(p=>!p.sp);landPlots.forEach((p,i)=>p.si=i);
  const SIGNP=[[.06,.6,.06,0x6b4a2f,.3],[.6,.34,.05,0xf4ecd8,.62],[.6,.07,.06,0xc0392b,.655]];
  const signIM=SIGNP.map(([w,h,d,c])=>{const im=new THREE.InstancedMesh(BOX,mat(c),landPlots.length);im.castShadow=true;scene.add(im);return im;});
  function setSign(p,on){SIGNP.forEach(([w,h,d,,y],k)=>{_m.makeScale(on?w:0,on?h:0,on?d:0).setPosition(p.x0+1.5,y,p.y0+2.2);signIM[k].setMatrixAt(p.si,_m);signIM[k].instanceMatrix.needsUpdate=true;});}
  const CROPC={wheat:[0x5c8f2e,0x6fae3a,0x8fbf3f,0xb9c84a,0xe3c04a],veg:[0x3e7b27,0x4f9a3c,0x5fa548,0x6ab04c,0xe67e22]};
  function makeCrops(p,kind){for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){if(dx>=1&&dx<=2&&dy>=1&&dy<=2)continue;if(dy===3&&(dx===1||dx===2))continue;
    const x=p.x0+dx,y=p.y0+dy,g=new THREE.Group();g.position.set(x,0,y);B(g,.9,.04,.9,0x6b4a2b);const rows=[];for(let r=0;r<3;r++)rows.push(B(g,.18,1,.8,0x6fae3a,-.28+r*.28,.04,0));
    scene.add(shadow(g));const c={x,y,g:Math.random(),res:null,grp:g,rows,kind};p.crops.push(c);setCrop(c);}}
  function setCrop(c){const h=.05+.42*Math.min(1,c.g),pal=CROPC[c.kind]||CROPC.wheat,m=mat(pal[Math.min(4,Math.floor(c.g*4))]);for(const r of c.rows){r.scale.y=h;r.position.y=.04+h/2;r.material=m;}}


  // --- благоустройство: деревья, кусты, скамейки, детские площадки ---
  function decoTree(g,x,z,s=1){if(hash(x*31+z*7|0,s*100|0)<.5){B(g,.1*s,.5*s,.1*s,0x6b4226,x,0,z);const c=new THREE.Mesh(new THREE.IcosahedronGeometry(.45*s,0),mat(pick([0x5fa548,0x4f9a3c,0x79b04a])));c.position.set(x,.85*s,z);g.add(c);}
    else{B(g,.1*s,.35*s,.1*s,0x6b4226,x,0,z);const c=new THREE.Mesh(new THREE.ConeGeometry(.42*s,1.1*s,6),mat(pick([0x2f6b3a,0x3a7d44])));c.position.set(x,.35*s+.55*s,z);g.add(c);}}
  function bush(g,x,z){const c=new THREE.Mesh(new THREE.IcosahedronGeometry(.25,0),mat(pick([0x4f9a3c,0x5fa548,0x3e7b27])));c.position.set(x,.18,z);c.scale.y=.75;g.add(c);}
  function bench(g,x,z,r=0){const b=new THREE.Group();B(b,.7,.06,.22,0x8b5a2b,0,.22,0);B(b,.7,.18,.05,0x8b5a2b,0,.28,-.1);B(b,.05,.22,.2,0x333333,-.3,0,0);B(b,.05,.22,.2,0x333333,.3,0,0);b.position.set(x,0,z);b.rotation.y=r;g.add(b);}
  function lamp(g,x,z){B(g,.06,1.1,.06,0x2d3436,x,0,z);B(g,.16,.12,.16,0xfff1b0,x,1.1,z,true);}
  function makePark(p){const g=new THREE.Group(),h=hash(p.i*5,p.j*3);
    for(const[x,z]of[[-.2,-.2],[3.2,-.2],[-.2,3.2],[3.2,3.2],[.3,1],[2.7,2.2]])decoTree(g,x,z,.9+hash(x*9|0,p.id)*.4);
    for(const[x,z]of[[.4,.3],[2.6,.4],[.3,2.7],[2.8,2.8]])bush(g,x,z);
    if(h<.4){const f=new THREE.Group();f.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(.75,.8,.25,10),mat(0xb0aaa0)),{}));const w=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.05,10),mat(0x4aa3df));w.position.y=.13;f.add(w);
      B(f,.15,.6,.15,0xb0aaa0,0,0,0);B(f,.3,.08,.3,0xb0aaa0,0,.6,0);f.position.set(1.5,.12,1.5);g.add(f);a_parkFx.push([p.x0+1.5,p.y0+1.5]);}
    else if(h<.7){for(let k=0;k<8;k++){const a=k/8*Math.PI*2;B(g,.18,.12,.18,pick([0xff8fab,0xffe066,0xb388eb,0xffffff,0xe74c3c]),1.5+Math.cos(a)*.55,0,1.5+Math.sin(a)*.55);}B(g,.5,.15,.5,0x6ab04c,1.5,0,1.5);}
    else{B(g,.6,.35,.6,0x9a9a92,1.5,0,1.5);B(g,.22,.7,.22,0x7f8c8d,1.5,.35,1.5);B(g,.3,.25,.3,0x7f8c8d,1.5,1.05,1.5);}
    bench(g,1.5,.6,0);bench(g,1.5,2.4,Math.PI);bench(g,.6,1.5,Math.PI/2);lamp(g,.9,.9);lamp(g,2.1,2.1);
    g.position.set(p.x0,0,p.y0);statics.add(g);}
  function makeYard(p){const g=new THREE.Group();
    B(g,1.2,.1,1.2,0xc8a26b,.5,0,.5);B(g,.9,.04,.9,0xe8d8a8,.5,.08,.5); // песочница
    {const s=new THREE.Group();B(s,.08,.7,.08,0xe74c3c,-.4,0,0);B(s,.08,.7,.08,0xe74c3c,.4,0,0);B(s,.9,.08,.08,0xe74c3c,0,.7,0);B(s,.25,.04,.15,0x3498db,-.18,.3,0);B(s,.25,.04,.15,0xf1c40f,.18,.3,0);s.position.set(2.4,0,.6);g.add(s);} // качели
    {const sl=new THREE.Group();B(sl,.35,.6,.35,0x27ae60,0,0,0);const r=B(sl,.3,.04,1,0xf39c12,0,.3,.55);r.rotation.x=.55;sl.position.set(.6,0,2);g.add(sl);} // горка
    bench(g,2.2,1.9,Math.PI);bench(g,2.9,1.2,-Math.PI/2);decoTree(g,3.2,-.2,1);decoTree(g,-.2,3,.9);bush(g,1.6,.1);bush(g,3.2,2.4);
    B(g,.05,1,.05,0x777777,1.4,0,1.2);B(g,.05,1,.05,0x777777,3.1,0,.1);
    for(let k=0;k<2;k++){const c=makeCar(pick(CAR_COLS));c.position.set(1+k*1.3,0,3);c.rotation.y=Math.PI/2;g.add(c);}
    g.position.set(p.x0,0,p.y0);statics.add(g);}
  function makeParking(p){const g=new THREE.Group();
    for(let row=0;row<2;row++)for(let k=0;k<5;k++){B(g,.04,.01,.9,0xf4f4f4,-.3+k*.8,0,row?2.6:.5);if(k<4&&hash(p.id*13+k,row)<.75){const c=makeCar(pick(CAR_COLS));c.position.set(.1+k*.8,0,row?2.6:.5);g.add(c);}}
    B(g,.08,.9,.08,0x333333,3.3,0,1.5);B(g,.25,.25,.05,0x2e86ab,3.3,.9,1.5,true);B(g,1.4,.05,.05,0xe74c3c,3.3,.5,2.2).rotation.y=Math.PI/2;
    g.position.set(p.x0,0,p.y0);statics.add(g);}
  const a_parkFx=[];
  for(const p of plots){
    if(p.sp==='park')makePark(p);else if(p.sp==='yard')makeYard(p);else if(p.sp==='parking')makeParking(p);
    else if(p.sp==='res'){makeResidential(p);blockFoot(p,true);}
    else if(p.sp==='bc'){makeBC(p);blockFoot(p,true);}
    else if(p.sp){const b=makeBuilding(p.sp,0);b.g.position.set(p.x0+1.5,0,p.y0+1.5);(p.sp==='pvzCity'?scene:statics).add(b.g);p.anim=b.a;blockFoot(p);if(p.sp==='kolkhoz')makeCrops(p,'wheat');}
    else setSign(p,true);
  }
  for(const[bx,by,fl]of BG){const m=tower(fl>12?'panel16':'panel9',bx%2,fl,.42,4.6,1.8);m.position.x=bx+2.5;m.position.z=by+.5;statics.add(m);}
  // фонари
  for(const b of BLOCKS){if(b.reg==='v'||b.reg==='d')continue;for(let a=0;a<=b.cols;a+=2)for(let c=0;c<=b.rows;c+=2){const g=new THREE.Group();B(g,.06,1,.06,0x333333);B(g,.14,.12,.14,0xfff1b0,0,1,0,true);g.position.set(b.x+STEP*a+.4,0,b.y+STEP*c+.4);statics.add(g);}}
  // порт: краны, контейнеры
  const cranes=[];
  for(const px of PIERS){const g=new THREE.Group();B(g,.15,3,.15,0xf39c12,0,0,0);const arm=new THREE.Group();arm.position.y=3;B(arm,2.4,.12,.12,0xf39c12,.8,0,0);B(arm,.04,.8,.04,0x333333,1.8,-.8,0);g.add(arm);
    g.position.set(px+.5,0,170);scene.add(shadow(g));cranes.push(arm);}
  for(let k=0;k<26;k++){const x=153+Math.floor(srnd()*34),y=156+Math.floor(srnd()*3);if(grid[I(x,y)]!==T.YARD)continue;const g=new THREE.Group();
    const h=1+Math.floor(srnd()*3);for(let s=0;s<h;s++)B(g,.9,.45,.4,pick([0xc0392b,0x2980b9,0x27ae60,0xf39c12,0x8e44ad]),0,s*.45,0);g.position.set(x,0,y+.3);statics.add(g);walk[I(x,y)]=0;}
  // деревенские домики и дачные домики-декор
  for(let k=0;k<30;k++){const x=Math.floor(srnd()*40)+47,y=Math.floor(srnd()*30)+103;if(grid[I(x,y)]!==T.GRASS||plotAt(x,y))continue;
    const g=new THREE.Group();B(g,.9,.55,.8,pick([0x8b5a2b,0x7a4a24,0x9c6b3e]));GR(g,1.05,.45,.95,pick([0x3d6b35,0x8a3a2a,0x5a6a7a]),0,.55,0);B(g,.2,.18,.03,0x2e86ab,0,.25,.41);
    g.position.set(x,0,y);statics.add(g);walk[I(x,y)]=0;}


  // склейка статики: по материалу и куску карты 40×40 → сотни мешей вместо тысяч
  function bake(root){root.updateMatrixWorld(true);const buckets=new Map(),keep=[];
    root.traverse(o=>{if(!o.isMesh)return;if(Array.isArray(o.material)||o.material.transparent){keep.push(o);return;}
      _p.setFromMatrixPosition(o.matrixWorld);const key=o.material.uuid+'|'+Math.floor(_p.x/40)+','+Math.floor(_p.z/40);
      const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone());for(const k of Object.keys(g.attributes))if(k!=='position'&&k!=='normal')g.deleteAttribute(k);
      g.applyMatrix4(o.matrixWorld);if(!buckets.has(key))buckets.set(key,{m:o.material,gs:[]});buckets.get(key).gs.push(g);});
    for(const{m,gs}of buckets.values()){const mesh=new THREE.Mesh(mergeGeometries(gs),m);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);gs.forEach(g=>g.dispose());}
    for(const o of keep){const c=new THREE.Mesh(o.geometry,o.material);o.matrixWorld.decompose(c.position,c.quaternion,c.scale);c.castShadow=c.receiveShadow=true;scene.add(c);}
  }

  // ---------- места для локальных заданий ----------
  const fires=[];
  function makePOI(k,P){const g=new THREE.Group();
    switch(k){
    case 'mush':for(let i=0;i<9;i++){const x=hash(i,7)*3-1.5,z=hash(i,9)*3-1.5;B(g,.08,.18,.08,0xf4ecd8,x,0,z);B(g,.24,.1,.24,i%3?0xc0392b:0x8b5a2b,x,.18,z);}decoTree(g,-2,-1.5,1.1);decoTree(g,2,1.8,1);break;
    case 'pier':for(let i=0;i<4;i++)B(g,.9,.08,.9,0x9c6b3e,-i*.9,0,0);B(g,.06,.5,.06,0x6b4a2f,-3.2,-.3,.4);B(g,.06,.5,.06,0x6b4a2f,-3.2,-.3,-.4);{const bt=B(g,.4,.14,1,0x8b5a2b,-2.5,-.15,1);bt.rotation.y=.3;}bench(g,.6,0,Math.PI/2);break;
    case 'forester':B(g,1.6,.9,1.3,0x7a4a24);GR(g,1.8,.7,1.5,0x3d6b35,0,.9,0);B(g,.3,.5,.05,0x4a2f1a,0,0,.66);B(g,.3,.5,.3,0x6b4a2f,1.3,0,.9);
      for(let i=0;i<6;i++){const l=CY(g,.1,.1,.7,6,0x7a4a24);l.rotation.z=Math.PI/2;l.position.set(-1.4,.1+Math.floor(i/3)*.2,.6+(i%3)*.22);}B(g,.25,.6,.25,0x555555,-.4,.9,-.3);fires.push([P.x-.4,1.6,P.y-.3,1]);break;
    case 'camp':for(const[x,z]of[[-1.6,-1],[1.6,-1],[-1.6,1.2]]){B(g,1.1,.6,.8,0xc0d6c8,x,0,z);GR(g,1.2,.4,.9,0x8e3b46,x,.6,z);}
      B(g,.1,1.6,.1,0xdddddd,1.2,0,1.2);B(g,.5,.3,.03,0xe63946,1.47,1.3,1.2);B(g,.1,1.3,.1,0x9c6b3e,-.9,0,2.1);B(g,.1,1.3,.1,0x9c6b3e,.9,0,2.1);B(g,2,.35,.08,0xf1c40f,0,1.2,2.1);break;
    case 'spring':CY(g,.6,.65,.45,8,0x9a958c);{const w=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.04,8),mat(0x5dade2));w.position.y=.43;g.add(w);}B(g,.08,1.1,.08,0x6b4a2f,-.55,0,0);B(g,.08,1.1,.08,0x6b4a2f,.55,0,0);PY(g,1.4,.4,.9,0x6b4a2f,0,1.1,0);B(g,.2,.2,.2,0x888888,.2,.5,.65);break;
    case 'lighthouse':for(let i=0;i<6;i++)CY(g,.55-i*.04,.6-i*.04,.6,8,i%2?0xe63946:0xf4f4f4,0,i*.6,0);CY(g,.42,.42,.4,8,0x333333,0,3.6,0);{const l=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.35,8),bmat(0xfff1b0));l.position.y=3.8;g.add(l);}PY(g,1,.5,1,0xe63946,0,4,0);B(g,1.2,.6,1,0xf4f4f4,1.3,0,0);break;
    case 'lookout':for(const[x,z]of[[-.6,-.6],[.6,-.6],[-.6,.6],[.6,.6]])B(g,.12,3,.12,0x8b5a2b,x,0,z);B(g,1.6,.1,1.6,0x9c6b3e,0,3,0);PY(g,1.9,.7,1.9,0x6b4226,0,3.7,0);B(g,1.6,.4,.06,0x9c6b3e,0,3.1,.8);break;
    case 'fire':for(const[x,z,c]of[[-1.4,-.6,0xf39c12],[1.4,-.4,0x27ae60]]){const t=new THREE.Mesh(new THREE.ConeGeometry(.6,.9,4),mat(c));t.position.set(x,.45,z);t.rotation.y=Math.PI/4;g.add(t);}
      for(let i=0;i<5;i++)B(g,.18,.1,.18,0x666666,Math.cos(i*1.25)*.35,0,Math.sin(i*1.25)*.35+.6);bench(g,0,1.5,0);bench(g,-1,.7,Math.PI/2);fires.push([P.x,.25,P.y+.6,3]);break;
    case 'cat':{const c=new THREE.Group();B(c,.3,.15,.15,0xf39c12,0,.12,0);B(c,.14,.14,.14,0xf39c12,.18,.22,0);B(c,.04,.06,.04,0xf39c12,.15,.32,-.04);B(c,.04,.06,.04,0xf39c12,.21,.32,.04);B(c,.04,.2,.04,0xf39c12,-.16,.18,0);c.position.set(.6,0,-.6);g.add(c);}break;
    }
    g.position.set(P.x,0,P.y);return shadow(g);}
  for(const b of BLOCKS){if(!b.link)continue;for(let k=0;k<b.cols*2;k++){const side=k%2,x=b.x+Math.floor(k/2)*STEP+2,y=side?b.y-2:b.y+b.rows*STEP+2;
      if(!inb(x,y)||grid[I(x,y)]!==T.GRASS||plotAt(x,y)||hash(x,y)<.35)continue;const g=new THREE.Group();
      B(g,.9,.55,.8,[0x8b5a2b,0x7a4a24,0x9c6b3e,0xc9a26b][k%4]);GR(g,1.05,.45,.95,[0x3d6b35,0x8a3a2a,0x5a6a7a,0x2e5e8c][(k+1)%4],0,.55,0);B(g,.2,.18,.03,0x2e86ab,0,.25,.41);
      decoTree(g,1,.3,.8);g.position.set(x,0,y);statics.add(g);walk[I(x,y)]=0;}}
  for(const k in POIS)if(k!=='harvest')(k==='cat'?scene:statics).add(makePOI(k,POIS[k]));
  const STOPS=[];{const CB=BLOCKS[0],ccx=CB.x+CB.cols*STEP/2,ccy=CB.y+CB.rows*STEP/2;
    const roadNear=(x,y)=>{x=Math.round(x);y=Math.round(y);for(let r=0;r<14;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const X=x+dx,Y=y+dy;
      if(inb(X,Y)&&(grid[I(X,Y)]===T.ROAD||grid[I(X,Y)]===T.ASPH)&&walk[I(X,Y)])return{x:X,y:Y};}return null;};
    const cap=n=>n.split(' ').map(w=>w==='СНТ'?w:w[0]==='«'?'«'+w[1]+w.slice(2).toLowerCase():w[0]+w.slice(1).toLowerCase()).join(' ');
    for(const b of BLOCKS.slice(1)){let px,py;const bx0=b.x,by0=b.y,bx1=b.x+b.cols*STEP,by1=b.y+b.rows*STEP;
      if(b.link){px=b.x+STEP*Math.floor(b.cols/2)+1;py=b.link<b.y?by0-1:by1+1;}
      else{px=Math.max(bx0,Math.min(bx1,ccx));py=Math.max(by0,Math.min(by1,ccy));}
      const r=roadNear(px,py);if(r)STOPS.push({name:cap(b.name),x:r.x,y:r.y,reg:b.reg});}
    for(const[n,i,j]of[['Центр',8,6],['Рынок',0,6],['Кинотеатр «Мир»',4,9],['Северная',8,0],['Южная',8,13],['Деловой квартал',13,4]]){
      const r=roadNear(CB.x+i*STEP,CB.y+j*STEP);if(r)STOPS.push({name:n,x:r.x,y:r.y,reg:'c'});}
    for(const s of STOPS){const g=new THREE.Group();B(g,.06,.9,.06,0x555555,-.45,0,.3);B(g,.06,.9,.06,0x555555,.45,0,.3);B(g,1.1,.05,.6,0x2e86ab,0,.9,.1);B(g,1,.6,.04,0x9fd3ff,0,.25,-.18,true);
      B(g,.8,.06,.25,0x8b5a2b,0,.25,0);B(g,.04,1.2,.04,0x333333,.7,0,.35);B(g,.3,.3,.04,0xf1c40f,.7,1.1,.35,true);B(g,.14,.14,.041,0x2c3e50,.7,1.18,.36,true);
      g.position.set(s.x+.5,0,s.y-.5);statics.add(g);}}
  {const I_=ISLAND;for(const[k,type]of[['spawn','guesthouse'],['pvz','pvzCity'],['alko','alko'],['lavka','lavka'],['mill','mill']]){const b=makeBuilding(type,0);b.g.position.set(I_[k].x,0,I_[k].y);statics.add(b.g);
      for(let y=I_[k].y-1;y<=I_[k].y;y++)for(let x=I_[k].x-1;x<=I_[k].x;x++)walk[I(x,y)]=0;}
    {const bg=new THREE.Group();B(bg,.08,1,.08,0x6b4a2f,-.5,0,0);B(bg,.08,1,.08,0x6b4a2f,.5,0,0);B(bg,1.2,.7,.06,0x8b5a2b,0,.6,0);
      for(const[x,y,c]of[[-.3,.75,0xffffff],[.05,.85,0xffe9a8],[.32,.7,0xffffff],[-.1,.65,0xff8fab]])B(bg,.22,.26,.02,c,x,y,.04);B(bg,.9,.1,.02,0xc0392b,0,1.15,.04,true);
      bg.position.set(I_.board.x,0,I_.board.y);bg.rotation.y=-Math.PI/4;statics.add(bg);walk[I(I_.board.x,I_.board.y)]=0;walk[I(I_.board.x+1,I_.board.y)]=0;}
    const pg=new THREE.Group();for(let k=0;k<4;k++){B(pg,.08,.5,.08,0x6b4a2f,I_.pier.x-.4,-.3,I_.pier.y-2-k*1.6);B(pg,.08,.5,.08,0x6b4a2f,I_.pier.x+1.4,-.3,I_.pier.y-2-k*1.6);}statics.add(pg);
    for(let k=0;k<8;k++){const x=I_.x0+6+Math.floor(hash(k,3)*(I_.x1-I_.x0-12)),y=I_.y0+5+Math.floor(hash(k,5)*(I_.y1-I_.y0-10));if(grid[I(x,y)]===T.GRASS&&walk[I(x,y)]){const g=new THREE.Group();decoTree(g,0,0,1);bush(g,.6,.4);g.position.set(x,0,y);statics.add(g);}}}
  // утки и лебеди на озёрах
  const birds=[];for(const L of LAKES)for(let i=0;i<5;i++){const b=new THREE.Group();const c=L.name.startsWith('ЛЕБ')?0xffffff:0x8d6e4b;B(b,.3,.16,.18,c,0,0,0);B(b,.08,.2,.08,c,.14,.1,0);B(b,.08,.05,.06,0xf39c12,.2,.2,0);scene.add(b);birds.push({b,L,a:Math.random()*6,r:.3+Math.random()*.4,s:.05+Math.random()*.08});}
  for(const im of signIM)im.computeBoundingSphere();
  bake(statics);

  // ================= ЛЮДИ И ТРАНСПОРТ =================
  function drawHat(g,skin){if(skin&&SKINS[skin]){const c=SKINS[skin].col;
      if(skin==='cap'){B(g,.23,.08,.23,c,0,.74,0);B(g,.14,.03,.12,c,0,.74,.15);}
      else if(skin==='ushanka'){B(g,.27,.12,.27,c,0,.72,0);B(g,.05,.14,.16,c,-.14,.6,0);B(g,.05,.14,.16,c,.14,.6,0);}
      else if(skin==='helmet'){B(g,.25,.1,.25,c,0,.74,0);B(g,.3,.03,.3,c,0,.73,0);}
      else if(skin==='cowboy'){B(g,.42,.03,.42,c,0,.74,0);B(g,.2,.12,.2,c,0,.76,0);}
      else if(skin==='tophat'){B(g,.32,.03,.32,c,0,.74,0);B(g,.2,.24,.2,c,0,.76,0);}
      else if(skin==='beret'){B(g,.27,.06,.27,c,-.02,.74,0);B(g,.06,.05,.06,c,-.02,.8,0);B(g,.05,.04,.1,0xf1c40f,.11,.75,.08,true);}
      else if(skin==='goldhelm'){B(g,.25,.1,.25,c,0,.74,0,true);B(g,.3,.03,.3,c,0,.73,0,true);B(g,.05,.05,.05,0xffffff,0,.79,.13,true);}
      else if(skin==='halo'){for(let i=0;i<18;i++){const a=i/18*Math.PI*2;B(g,.05,.035,.05,c,Math.cos(a)*.16,.88,Math.sin(a)*.16,true);}}
      else if(skin==='crown'){B(g,.24,.08,.24,c,0,.74,0);for(const[x,z]of[[-.09,-.09],[.09,-.09],[-.09,.09],[.09,.09]])B(g,.05,.08,.05,c,x,.82,z);}}}
  function makePerson(shirt,hat,pants=0x34495e,skin=null){const g=new THREE.Group();if(skin&&SKINS[skin])hat=null;
    const limb=(x,y,w,h,c)=>{const p=new THREE.Group();p.position.set(x,y,0);const m=new THREE.Mesh(BOX,mat(c));m.scale.set(w,h,w);m.position.y=-h/2;p.add(m);g.add(p);return p;};
    const legL=limb(-.07,.26,.09,.26,pants),legR=limb(.07,.26,.09,.26,pants);B(g,.26,.28,.16,shirt,0,.26,0);
    const armL=limb(-.17,.52,.07,.24,shirt),armR=limb(.17,.52,.07,.24,shirt);B(g,.2,.2,.2,0xf1c27d,0,.54,0);if(hat!=null)B(g,.23,.07,.23,hat,0,.74,0);
    drawHat(g,skin);
    const carry=B(g,.22,.2,.22,0xffffff,0,.84,0);carry.visible=false;g.userData={legL,legR,armL,armR,carry};return shadow(g);}

  // аватар игрока: детальная модель (тело, лицо, причёска, одежда, обувь, аксессуары)
  function makeAvatar(look,skin){look={...DEFAULT_LOOK,...(look||{})};const g=new THREE.Group(),C=c=>new THREE.Color(c).getHex();
    const f=look.g==='f',sk=C(LOOK.skin[look.skin]??LOOK.skin[1]),skD=new THREE.Color(sk).multiplyScalar(.85).getHex();
    const top=C(look.top),acc=C(look.top2||'#ffffff'),bot=C(look.bottom),hc=C(look.hc),shoe=C(look.shoes||'#ffffff'),eye=C(look.eyes||'#3b2a1a');
    const Wd={slim:.88,m:1,strong:1.14}[look.build]||1,tw=(f?.24:.27)*Wd,td=.16*Wd;
    // ноги: штанины/кожа + обувь, внутри поворотной группы (анимация ходьбы)
    const leg=(x)=>{const p=new THREE.Group();p.position.set(x,.26,0);g.add(p);
      const lw=.09*Wd,bare=look.bk==='shorts'||look.bk==='skirt';
      if(bare){B(p,lw,.12,lw,sk,0,-.26+.06,0);B(p,lw+.01,.14,lw+.01,look.bk==='shorts'?bot:sk,0,-.14,0);}
      else{B(p,lw,.2,lw,bot,0,-.26+.06,0);if(look.bk==='jeans')B(p,.012,.2,lw+.002,new THREE.Color(bot).multiplyScalar(1.25).getHex(),lw/2-.006,-.2,0);
        if(look.bk==='track')B(p,.012,.2,lw+.004,acc,lw/2,-.2,0);}
      const sh=look.sk||'sneakers';B(p,lw+.02,sh==='boots'?.09:.06,.15,shoe,0,-.26,.025);
      if(sh==='sneakers')B(p,lw+.022,.015,.152,0xffffff,0,-.26,.025);if(sh==='runners')B(p,lw+.024,.02,.06,acc,0,-.24,.03);
      return p;};
    const legL=leg(-.07*Wd),legR=leg(.07*Wd);
    if(look.bk==='skirt')B(g,tw+.08,.15,td+.08,bot,0,.14,0);
    if(look.bk==='shorts')B(g,tw-.01,.06,td,bot,0,.22,0);
    if(look.bk==='pants'||look.bk==='jeans')B(g,tw+.005,.03,td+.005,0x3b2a1a,0,.26,0); // ремень
    // торс
    B(g,tw,.28,td,top,0,.26,0);
    if(look.tk==='hoodie'){B(g,tw*.9,.12,.08,top,0,.46,-td/2-.03);B(g,.012,.07,.01,0xffffff,-.03,.42,td/2+.005);B(g,.012,.07,.01,0xffffff,.03,.42,td/2+.005);B(g,tw*.6,.07,.01,new THREE.Color(top).multiplyScalar(.85).getHex(),0,.3,td/2+.005);}
    if(look.tk==='shirt'){B(g,.1,.04,.01,0xffffff,0,.5,td/2+.004);for(let k=0;k<3;k++)B(g,.012,.012,.01,0xdddddd,0,.33+k*.06,td/2+.006);}
    if(look.tk==='jacket'){B(g,tw*.36,.24,.01,acc,0,.28,td/2+.004);B(g,.008,.26,.012,0xbbbbbb,0,.27,td/2+.008);B(g,tw+.01,.05,td+.01,top,0,.51,0);}
    if(look.tk==='track'){B(g,.008,.24,.012,0xcccccc,0,.28,td/2+.006);B(g,tw+.005,.04,td+.005,acc,0,.5,0);}
    if(look.tk==='sweater'){B(g,tw+.01,.035,td+.01,new THREE.Color(top).multiplyScalar(.8).getHex(),0,.26,0);B(g,.1,.03,.02,new THREE.Color(top).multiplyScalar(.8).getHex(),0,.52,0);}
    if(look.tk==='tee')B(g,.09,.02,.01,new THREE.Color(top).multiplyScalar(.8).getHex(),0,.52,td/2+.004);
    // руки: рукав + кисть
    const arm=(x)=>{const p=new THREE.Group();p.position.set(x,.52,0);g.add(p);const short=look.tk==='tee';
      if(short){B(p,.08,.1,.08,top,0,-.1,0);B(p,.065,.13,.065,sk,0,-.22,0);}else{B(p,.075,.21,.075,top,0,-.21,0);if(look.tk==='track')B(p,.012,.21,.077,acc,x>0?.035:-.035,-.21,0);}
      B(p,.065,.05,.065,sk,0,-.26,0);return p;};
    const armL=arm(-(tw/2+.04)),armR=arm(tw/2+.04);
    // шея и голова
    B(g,.08,.04,.08,sk,0,.53,0);B(g,.2,.2,.2,sk,0,.54,0);
    for(const x of[-.05,.05]){B(g,.045,.035,.01,0xffffff,x,.625,.1);B(g,.022,.03,.012,eye,x,.627,.101);}
    const bw={thin:.012,m:.018,thick:.026}[look.brows]||.018;for(const x of[-.05,.05])B(g,.05,bw,.01,new THREE.Color(hc).multiplyScalar(.9).getHex(),x,.665,.101);
    B(g,.03,.045,.02,skD,0,.59,.105);
    const mc=0x8e3b46;if(look.mouth==='smile'){B(g,.06,.014,.01,mc,0,.565,.101);B(g,.012,.012,.01,mc,-.035,.572,.101);B(g,.012,.012,.01,mc,.035,.572,.101);}
    else if(look.mouth==='smirk'){B(g,.05,.012,.01,mc,.008,.567,.101);B(g,.012,.012,.01,mc,.038,.575,.101);}else B(g,.05,.012,.01,mc,0,.567,.101);
    if(!f){if(look.beard==='stubble')B(g,.2,.07,.01,new THREE.Color(hc).lerp(new THREE.Color(sk),.55).getHex(),0,.54,.1);
      if(look.beard==='mustache')B(g,.08,.02,.012,hc,0,.582,.104);
      if(look.beard==='beard'){B(g,.21,.08,.06,hc,0,.53,.08);B(g,.08,.02,.012,hc,0,.582,.104);}}
    if(look.glasses&&look.glasses!=='none'){const fr=0x1a1a1a,lens=look.glasses==='sun'?0x111111:0xbfe3ff;
      for(const x of[-.05,.05]){B(g,.06,look.glasses==='round'?.05:.045,.008,fr,x,.605,.104);B(g,.045,.032,.008,lens,x,.612,.108,true);}B(g,.03,.008,.008,fr,0,.625,.106);}
    // причёска
    const hat=skin&&SKINS[skin]&&skin!=='halo';   // нимб парит над причёской
    if(!hat)switch(look.hair){
      case 'short':B(g,.22,.06,.22,hc,0,.73,0);B(g,.22,.1,.04,hc,0,.65,-.09);B(g,.03,.07,.2,hc,-.105,.68,-.01);B(g,.03,.07,.2,hc,.105,.68,-.01);break;
      case 'buzz':B(g,.21,.03,.21,hc,0,.735,0);B(g,.21,.08,.02,hc,0,.68,-.1);break;
      case 'side':B(g,.22,.07,.22,hc,0,.73,0);B(g,.14,.04,.12,hc,-.04,.78,.03);B(g,.22,.12,.04,hc,0,.65,-.09);break;
      case 'curly':B(g,.25,.09,.25,hc,0,.72,0);for(const[x,z]of[[-.1,.06],[.09,-.05],[.0,.1],[-.08,-.08],[.1,.07]])B(g,.07,.07,.07,hc,x,.78,z);break;
      case 'mohawk':B(g,.06,.13,.2,hc,0,.74,0);B(g,.2,.02,.2,new THREE.Color(hc).multiplyScalar(.7).getHex(),0,.735,0);break;
      case 'longm':B(g,.22,.06,.22,hc,0,.73,0);B(g,.22,.2,.06,hc,0,.52,-.1);B(g,.04,.14,.18,hc,-.11,.6,0);B(g,.04,.14,.18,hc,.11,.6,0);break;
      case 'long':B(g,.22,.06,.22,hc,0,.73,0);B(g,.22,.32,.06,hc,0,.42,-.1);B(g,.04,.24,.18,hc,-.11,.5,0);B(g,.04,.24,.18,hc,.11,.5,0);B(g,.18,.04,.02,hc,0,.71,.1);break;
      case 'bob':B(g,.24,.07,.24,hc,0,.72,0);B(g,.24,.16,.05,hc,0,.58,-.1);B(g,.04,.16,.2,hc,-.12,.58,0);B(g,.04,.16,.2,hc,.12,.58,0);B(g,.2,.04,.02,hc,0,.7,.11);break;
      case 'tail':B(g,.22,.06,.22,hc,0,.73,0);B(g,.22,.1,.04,hc,0,.65,-.09);B(g,.06,.04,.06,0xc0392b,0,.7,-.13);B(g,.07,.22,.07,hc,0,.48,-.14);break;
      case 'buns':B(g,.22,.05,.22,hc,0,.73,0);B(g,.22,.1,.04,hc,0,.65,-.09);B(g,.09,.09,.09,hc,-.09,.79,0);B(g,.09,.09,.09,hc,.09,.79,0);break;
      case 'braids':B(g,.22,.06,.22,hc,0,.73,0);B(g,.22,.1,.04,hc,0,.65,-.09);for(const x of[-.09,.09]){B(g,.05,.24,.05,hc,x,.38,-.08);B(g,.055,.03,.055,0xf1c40f,x,.38,-.08);}break;
      case 'curlyf':B(g,.27,.1,.27,hc,0,.71,0);B(g,.27,.22,.08,hc,0,.48,-.1);for(const[x,z]of[[-.12,.05],[.12,.04],[-.1,-.08],[.11,-.07]])B(g,.08,.08,.08,hc,x,.62,z);break;
      case 'pixie':B(g,.22,.05,.22,hc,0,.735,0);B(g,.12,.04,.08,hc,.04,.71,.08);B(g,.22,.08,.03,hc,0,.67,-.1);break;
    }
    drawHat(g,skin);
    if(look.acc==='chain'){B(g,.12,.012,.01,0xf1c40f,0,.5,td/2+.006);B(g,.025,.025,.01,0xf1c40f,0,.47,td/2+.007);}
    if(look.acc==='backpack'){B(g,tw*.8,.2,.09,acc,0,.3,-td/2-.045);B(g,tw*.6,.06,.02,new THREE.Color(acc).multiplyScalar(.8).getHex(),0,.34,-td/2-.09);}
    if(look.acc==='bag'){const b=B(g,.012,.3,.012,0x3b2a1a,0,.27,td/2+.01);b.rotation.z=.6;B(g,.12,.1,.05,acc,tw/2+.02,.26,.04);}
    const H={s:.9,m:1,t:1.1}[look.height]||1;g.scale.setScalar(H);
    const carry=B(g,.22,.2,.22,0xffffff,0,.84,0);carry.visible=false;g.userData={legL,legR,armL,armR,carry};return shadow(g);}
  function makeTruck(cab,cargo){const g=new THREE.Group();B(g,.42,.07,.8,0x444444,0,.1,0);B(g,.4,.3,.28,cab,0,.15,.25);B(g,.34,.1,.02,0x9fd3ff,0,.3,.391);
    B(g,.42,.16,.48,0x8b5a2b,0,.17,-.14);const cg=B(g,.3,.16,.32,cargo,0,.33,-.14);wheel(g,-.21,.25);wheel(g,.21,.25);wheel(g,-.21,-.25);wheel(g,.21,-.25);g.userData.cargo=cg;return shadow(g);}
  function makeVan(){const g=new THREE.Group();B(g,.42,.42,.82,0xf2f2f2,0,.08,0);B(g,.43,.06,.6,0xff8c1a,0,.3,-.06);wheel(g,-.21,.26);wheel(g,.21,.26);wheel(g,-.21,-.26);wheel(g,.21,-.26);return shadow(g);}
  function makeShip(big,color){const g=new THREE.Group();
    if(big){B(g,1.6,.5,6,0x2c3e50,0,-.2,0);B(g,1.62,.12,6.02,0xc0392b,0,-.25,0);B(g,1.2,1,1.1,0xecf0f1,0,.3,-2.3);
      for(let k=0;k<8;k++)B(g,.65,.4,.9,pick([0xc0392b,0x2980b9,0x27ae60,0xf39c12,0x8e44ad]),(k%2)*.7-.35,.3+Math.floor(k/8)*.4,-1.2+Math.floor(k/2)*.95);}
    else{B(g,.5,.25,1.2,0xf2f2f2,0,-.1,0);B(g,.52,.06,1.22,color||0x2e86ab,0,.1,0);B(g,.35,.35,.4,0xdddddd,0,.15,-.2);B(g,.03,.8,.03,0x333333,0,.15,.3);}
    return shadow(g);}

  function makeFerry(){const g=new THREE.Group();
    B(g,1.7,.55,4.4,0xf4f4f4,0,-.3,0);B(g,1.72,.12,4.42,0x1f5f9e,0,-.05,0);B(g,1.74,.08,4.44,0xc0392b,0,-.3,0);
    B(g,1.5,.05,4.1,0x9c6b3e,0,.25,0);B(g,1.3,.55,1.8,0xffffff,0,.3,.5);B(g,1.4,.08,1.95,0xf1c40f,0,.85,.5);
    for(let k=0;k<3;k++)B(g,.25,.18,.03,0x9fd3ff,-.4+k*.4,.55,1.41,true);B(g,.03,.18,1.4,0x9fd3ff,.66,.55,.5,true);
    B(g,.3,.55,.3,0xc0392b,0,.93,-.1);B(g,.32,.08,.32,0x222222,0,1.48,-.1);
    for(const z of[-1.2,1.6]){B(g,.06,.26,.26,0xff7a1a,.87,.35,z);B(g,.07,.1,.1,0xffffff,.88,.43,z);}
    B(g,.03,.9,.03,0x333333,0,.9,1.7);B(g,.35,.22,.02,0xffd166,.18,1.55,1.7);
    for(let k=0;k<4;k++)B(g,1.5,.03,.03,0xdddddd,0,.55,-2+k*.25);
    B(g,.9,.04,.7,0x7a7a7a,0,.27,-2.45);g.scale.setScalar(1.35);return shadow(g);}
  const bq=new Int32Array(W*H),prev=new Int32Array(W*H);
  function bfs(sx,sy,goal,maxN=W*H,pass=null){sx=Math.round(sx);sy=Math.round(sy);if(!inb(sx,sy))return[];prev.fill(-2);let h=0,t=0;const s=I(sx,sy);bq[t++]=s;prev[s]=-1;
    while(h<t&&h<maxN){const c=bq[h++],cx=c%W,cy=(c/W)|0;
      if(goal(cx,cy)){const path=[];let k=c;while(k!==s){path.push([k%W,(k/W)|0]);k=prev[k];}return path.reverse();}
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy;if(!inb(nx,ny))continue;const n=I(nx,ny);if(prev[n]!==-2||!(pass?pass(n):walk[n]))continue;prev[n]=c;bq[t++]=n;}}
    return[];}
  const pathTo=(u,x,y)=>bfs(u.x,u.y,(a,b)=>a===x&&b===y);
  // транспорт: со двора выезжает на ближайшую дорогу, дальше — только по дорогам, в конце заезжает во двор
  const drivable=i=>{const t=grid[i];return(t===T.ROAD||t===T.ASPH||t===T.RING||t===T.BRIDGE)&&plotIdx[i]<0;};
  function roadNear(x,y){x=Math.round(x);y=Math.round(y);for(let r=0;r<12;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
    const X=x+dx,Y=y+dy;if(inb(X,Y)&&drivable(I(X,Y)))return[X,Y];}return null;}
  function drivePath(u,tx,ty){const a=roadNear(u.x,u.y),b=roadNear(tx,ty);if(!a||!b)return pathTo(u,tx,ty);
    const mid=a[0]===b[0]&&a[1]===b[1]?[]:bfs(a[0],a[1],(x,y)=>x===b[0]&&y===b[1],W*H,drivable);if(!mid.length&&(a[0]!==b[0]||a[1]!==b[1]))return pathTo(u,tx,ty);
    const p1=bfs(u.x,u.y,(x,y)=>x===a[0]&&y===a[1]),p3=bfs(b[0],b[1],(x,y)=>x===tx&&y===ty);return[...p1,...mid,...p3];}
  function stepMove(u,dt){if(!u.path.length){u.moving=false;return true;}const[tx,ty]=u.path[0],dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy),s=u.speed*dt;
    if(d>1e-4)u.face=Math.atan2(dx,dy);if(d<=s){u.x=tx;u.y=ty;u.path.shift();}else{u.x+=dx/d*s;u.y+=dy/d*s;}u.moving=u.path.length>0;return!u.moving;}
  function animPerson(u,time){const ud=u.mesh.userData,ph=time*12+u.ox*20;
    u.mesh.position.set(u.x+u.ox,u.moving?Math.abs(Math.sin(ph))*.04:0,u.y+u.oy);u.mesh.rotation.y=u.face||0;
    ud.legL.rotation.x=u.moving?Math.sin(ph)*.7:0;ud.legR.rotation.x=u.moving?-Math.sin(ph)*.7:0;
    if(u.working){ud.armR.rotation.x=u.fishing?-2.2+Math.sin(time*2)*.15:-1.6+Math.sin(time*14)*1.1;ud.armL.rotation.x=-.4;}
    else if(u.carry){ud.armR.rotation.x=ud.armL.rotation.x=-2.9;}else{ud.armR.rotation.x=u.moving?-Math.sin(ph)*.5:0;ud.armL.rotation.x=u.moving?Math.sin(ph)*.5:0;}
    ud.armR.rotation.z=ud.armL.rotation.z=0;
    if(u.idle&&!u.moving&&!u.working&&!u.carry)idlePose(u,ud,time);
    ud.carry.visible=!!u.carry;if(u.carry)ud.carry.material=mat(u.carry==='parcel'?0xc8a26b:(GOODS[u.carry]?.col||0xffffff));}
  // стоящий игрок не замирает: раз в ~5 сек выбирает новую позу
  function idlePose(u,ud,time){const sd=u.seed||(u.seed=Math.random()*100),slot=Math.floor((time+sd)/5);
    if(slot!==u.islot){u.islot=slot;u.ik=Math.floor(hash(slot,Math.floor(sd*97))*8);}
    const t=time+sd;let aR=0,aL=0,zR=0,zL=0,y=0,ry=0;
    switch(u.ik){
      case 1:ry=Math.sin(t*1.3)*.7;break;                                  // оглядывается
      case 2:aR=aL=-2.9;y=Math.max(0,Math.sin(t*2))*.03;break;              // потягивается
      case 3:aR=-1.35;aL=-1.15;zR=.35;zL=-.35;ry=Math.sin(t*.7)*.08;break; // залип в телефон
      case 4:aR=-2.7;zR=-.3+Math.sin(t*10)*.45;break;                      // машет
      case 5:aR=-2.6;zR=.7+Math.sin(t*12)*.15;break;                       // чешет затылок
      case 6:y=-Math.abs(Math.sin(t*2.4))*.07;aR=aL=-.5;break;             // пружинит на месте
      case 7:aR=aL=-.25;zR=-.5;zL=.5;ry=Math.sin(t*2.5)*.15;break;         // руки в боки, переминается
    }
    ud.armR.rotation.x=aR;ud.armL.rotation.x=aL;ud.armR.rotation.z=zR;ud.armL.rotation.z=zL;
    u.mesh.position.y+=y+Math.sin(t*2)*.008;u.mesh.rotation.y=(u.face||0)+ry;}

  // ===== Сценки у мест работы: у каждого здания свой вариант (по хешу участка), создаются только рядом с камерой =====
  const VIG_N={alko:3,pvzCity:3,shop:3,kolkhoz:2,lesxoz:1,market:1,sortCenter:2,zbi:2,furnFactory:2,bc:2,cityhall:1,port:1};
  function makeStroller(){const g=new THREE.Group();B(g,.3,.2,.45,0x8e44ad,0,.12,0);B(g,.3,.16,.18,0x6c3483,0,.32,-.14);B(g,.03,.25,.03,0x333333,0,.25,-.28);
    for(const[x,z]of[[-.15,-.15],[.15,-.15],[-.15,.15],[.15,.15]])B(g,.04,.09,.09,0x222222,x,0,z);return g;}
  function makeCow(){const g=new THREE.Group();B(g,.42,.32,.8,0xf4f4f4,0,.3,0);B(g,.2,.15,.25,0x222222,.11,.45,.1);B(g,.15,.1,.2,0x222222,-.11,.35,-.2);
    for(const[x,z]of[[-.14,-.3],[.14,-.3],[-.14,.3],[.14,.3]])B(g,.08,.3,.08,0xeeeeee,x,0,z);const h=new THREE.Group();h.position.set(0,.5,.42);B(h,.22,.22,.28,0xf4f4f4,0,-.11,.1);B(h,.2,.1,.08,0xf2b8c6,0,-.12,.26);B(h,.04,.08,.04,0xe8e2d4,-.09,.1,0);B(h,.04,.08,.04,0xe8e2d4,.09,.1,0);g.add(h);g.userData.head=h;return shadow(g);}
  function makeForklift(){const g=new THREE.Group();B(g,.4,.3,.55,0xf1c40f,0,.08,0);B(g,.36,.03,.36,0x333333,0,.62,-.05);for(const x of[-.15,.15])B(g,.03,.6,.03,0x333333,x,.08,-.05);
    B(g,.06,.45,.06,0x333333,-.12,.38,.3);B(g,.06,.45,.06,0x333333,.12,.38,.3);const f=new THREE.Group();f.position.set(0,.1,.38);B(f,.36,.06,.3,0x9c6b3e,0,0,.15);B(f,.3,.25,.25,0xc8a26b,0,.06,.15);g.add(f);g.userData.fork=f;
    for(const[x,z]of[[-.2,-.18],[.2,-.18],[-.2,.18],[.2,.18]])B(g,.06,.12,.12,0x222222,x,0,z);return shadow(g);}
  const SH=[0xc0392b,0x2980b9,0x27ae60,0x8e44ad,0xe67e22,0x7f8c8d,0x34495e,0xd35400,0x16a085,0xf39c12];
  function person(g,x,z,face,k,pants=0x34495e,sc=1){const m=makePerson(SH[k%SH.length],null,pants);m.position.set(x,0,z);m.rotation.y=face;m.scale.setScalar(sc);g.add(m);return m;}
  const legs=(m,t,on)=>{const u=m.userData;u.legL.rotation.x=on?Math.sin(t*10)*.6:0;u.legR.rotation.x=on?-Math.sin(t*10)*.6:0;};
  const arms=(m,r,l,zr=0,zl=0)=>{const u=m.userData;u.armR.rotation.x=r;u.armL.rotation.x=l;u.armR.rotation.z=zr;u.armL.rotation.z=zl;};
  // ходит туда-обратно по x от a до b на глубине z; возвращает направление
  function pace(m,t,a,b,z,sp=.5){const L=b-a,ph=(t*sp)%(2*L),fw=ph<L,x=fw?a+ph:b-(ph-L);m.position.set(x,0,z);m.rotation.y=fw?Math.PI/2:-Math.PI/2;legs(m,t*sp*2,true);return fw?1:-1;}
  function makeVignette(p){const v=Math.floor(hash(p.id,77)*VIG_N[p.sp]),g=new THREE.Group();g.position.set(p.x0,0,p.y0);let tick=null;const X=p.x0,Z=p.y0;
    switch(p.sp+v){
      case 'alko0':{const a=person(g,2.6,3.3,Math.PI/2,0),b=person(g,3.4,3.3,-Math.PI/2,1,0x2c2c2c),c=person(g,3.7,2.6,-2.4,5);   // драка, рядом болельщик
        tick=t=>{const s=Math.sin(t*3);a.position.x=2.55+Math.max(0,s)*.18;b.position.x=3.45-Math.max(0,-s)*.18;a.rotation.z=b.rotation.z=0;
          arms(a,s>0?-1.6:-1,s>0?-.6:-1.2);arms(b,s<0?-1.6:-1,s<0?-.6:-1.2);if(s>.9)b.rotation.z=.15;if(s<-.9)a.rotation.z=-.15;arms(c,-2.8+Math.sin(t*8)*.3,-2.8-Math.sin(t*8)*.3);c.position.y=Math.abs(Math.sin(t*8))*.05;};break;}
      case 'alko1':{const ms=[0,1,2].map(k=>{const an=k*2.1,m=person(g,3+Math.sin(an)*.35,3.2+Math.cos(an)*.35,an+Math.PI,k+3,0x2c2c2c);B(m.userData.armR,.05,.14,.05,0x2e7d32,0,-.4,0);return m;});
        tick=t=>ms.forEach((m,k)=>{const sip=Math.floor(t/2.5)%3===k;arms(m,sip?-2.5:-.5,-.2);m.rotation.z=Math.sin(t*1.5+k)*.08;});break;}
      case 'alko2':{const a=person(g,3,3.3,0,6,0x2c2c2c);a.rotation.x=-Math.PI/2;a.position.y=.1;const b=person(g,3.5,3.0,-1.2,2);B(g,.05,.14,.05,0x2e7d32,2.6,0,3.5);
        tick=t=>{b.position.y=-.12;b.userData.legL.rotation.x=b.userData.legR.rotation.x=-1.2;arms(b,-1.2+Math.sin(t*4)*.4,-.3);a.rotation.z=Math.sin(t*.8)*.1;};break;}
      case 'pvzCity0':case 'pvzCity2':{const mom=person(g,1,3.6,Math.PI/2,v?8:3,0x5d4037),st=makeStroller();g.add(st);let kid=null;
        if(v===2)kid=person(g,3,3,0,4,0x2980b9,.55);
        tick=t=>{const d=pace(mom,t,.4,3.4,3.6,.35);arms(mom,-1,-1);st.position.set(mom.position.x+d*.45,0,3.6);st.rotation.y=Math.PI/2;
          if(kid){const a=t*1.6;kid.position.set(2.6+Math.cos(a)*.6,Math.abs(Math.sin(t*10))*.04,3.0+Math.sin(a)*.3);kid.rotation.y=-a;legs(kid,t*1.5,true);arms(kid,Math.sin(t*10)*.6,-Math.sin(t*10)*.6);}};break;}
      case 'pvzCity1':{const q=[0,1,2,3].map(k=>person(g,1.8+k*.45,3.2,-Math.PI/2,k+1,k%2?0x34495e:0x5d4037));q.forEach((m,k)=>{if(k%2)m.userData.carry.visible=true;});
        tick=t=>q.forEach((m,k)=>{const f=(Math.floor(t/3)+k)%4,c=m.userData.carry.visible;if(f===0)arms(m,-1.35,-1.15,.35,-.35);else if(f===1){m.rotation.y=-Math.PI/2+Math.sin(t*2)*.5;arms(m,c?-2.9:0,c?-2.9:0);}else{m.rotation.y=-Math.PI/2;arms(m,c?-2.9:0,c?-2.9:0);}});break;}
      case 'shop0':{const b=person(g,1,3.6,0,9,0x6d4c41);b.scale.set(.9,.85,.9);B(b,.18,.2,.1,0x8e3b46,.2,.12,0);
        tick=t=>{pace(b,t,.6,3.4,3.65,.2);arms(b,0,-.3);};break;}
      case 'shop1':{const m=person(g,3.2,3.2,-.6,6);tick=(t,dt)=>{const sm=Math.floor(t/3)%2===0;arms(m,sm?-2.3:-.2,-.1);m.rotation.z=.06;
        if(sm&&Math.random()<dt*2)puff(X+3.2-.12,.75,Z+3.35,0xdddddd,1,.3,.05);};break;}
      case 'kolkhoz0':{const cow=makeCow();cow.position.set(3,0,3.2);cow.rotation.y=-.6;g.add(cow);const f=person(g,2.2,3.5,.8,2,0x2c3e50);
        tick=t=>{cow.userData.head.rotation.x=.5+Math.sin(t*1.5)*.3;cow.rotation.y=-.6+Math.sin(t*.3)*.3;arms(f,-.8+Math.sin(t*.9)*.2,-.3);};break;}
      case 'kolkhoz1':{B(g,.6,.45,.6,0xe8c547,3.3,0,3.2);const f=person(g,2.5,3.2,Math.PI/2,7,0x2c3e50);B(f.userData.armR,.03,.6,.03,0x8b5a2b,0,-.6,.1);
        tick=(t,dt)=>{const s=Math.sin(t*2.5);arms(f,-1.2-s*1.1,-.8-s*.6);if(s>.95&&Math.random()<dt*20)puff(X+3.2,.6,Z+3.2,0xe8c547,2,.6,.2);};break;}
      case 'lesxoz0':{B(g,.35,.25,.35,0x8b5a2b,3,0,3.3);B(g,.12,.35,.12,0xc8a26b,3,.25,3.3);const m=person(g,2.55,3.3,Math.PI/2,0,0x2c3e50);B(m.userData.armR,.04,.5,.04,0x6b4a2f,0,-.55,0);B(m.userData.armR,.15,.1,.04,0x95a5a6,0,-.8,.05);
        tick=(t,dt)=>{const c=(t*1.2)%1,a=c<.6?-2.9+c/.6*.4:-2.5+(c-.6)/.4*2.2;arms(m,a,a*.7);if(c>.95&&Math.random()<dt*30)puff(X+3,.45,Z+3.3,0xd9b38c,2,.5,.25);};break;}
      case 'market0':case 'port0':{const m=person(g,.5,3.5,Math.PI/2,4,0x2c3e50);m.userData.carry.material=mat(0xc8a26b);
        tick=t=>{const d=pace(m,t,.5,3.5,3.55,.6);m.userData.carry.visible=d>0;arms(m,d>0?-2.9:Math.sin(t*6)*.4,d>0?-2.9:-Math.sin(t*6)*.4);};break;}
      case 'sortCenter0':case 'zbi0':case 'furnFactory0':{const f=makeForklift();g.add(f);tick=t=>{const ph=(t*.25)%2,fw=ph<1,x=fw?.5+ph*3:3.5-(ph-1)*3;f.position.set(x,0,3.45);f.rotation.y=fw?Math.PI/2:-Math.PI/2;f.userData.fork.visible=fw;};break;}
      case 'sortCenter1':case 'zbi1':case 'furnFactory1':{const a=person(g,2.8,3.3,.5,7,0x2c3e50),b=person(g,3.4,3.4,-2.2,1,0x2c3e50);for(const m of[a,b])B(m,.27,.1,.17,0xf1c40f,0,.72,0);
        tick=(t,dt)=>{arms(a,-2.2+Math.sin(t*.9)*.1,-.2);arms(b,-1+Math.sin(t*3)*.6,-.6+Math.cos(t*3)*.4);if(Math.random()<dt*1.2)puff(X+2.9,.78,Z+3.4,0xdddddd,1,.3,.05);};break;}
      case 'bc0':{const m=person(g,1,3.6,0,6,0x2c3e50);tick=t=>{pace(m,t,.6,3.4,3.65,.4);arms(m,-2.6,Math.sin(t*4)*.3,.6,0);};break;}
      case 'bc1':{const a=person(g,2.9,3.3,1,1,0x2c3e50),b=person(g,3.5,3.3,-1.3,5,0x2c3e50);tick=t=>{arms(a,-1+Math.sin(t*3)*.6,-.3,0,Math.sin(t*2)*.3);arms(b,-2.3+Math.sin(t*.7)*.1,0);};break;}
      case 'cityhall0':{const m=person(g,1,3.7,0,0,0x5d4037);const sg=new THREE.Group();B(sg,.04,.7,.04,0x8b5a2b,0,0,0);B(sg,.6,.35,.03,0xffffff,0,.6,0);B(sg,.45,.06,.031,0xc0392b,0,.75,0,true);B(sg,.35,.06,.031,0x222222,0,.65,0,true);
        sg.position.set(.18,.35,.12);sg.rotation.y=-Math.PI/2;m.add(sg);tick=t=>{pace(m,t,.6,3.4,3.75,.35);arms(m,-1.4,-1.4);};break;}
    }
    scene.add(g);return{g,tick};}
  // вороны: бродят по крыше, клюют, иногда подпрыгивают и хлопают крыльями
  function makeCrow(){const g=new THREE.Group();B(g,.12,.1,.2,0x15151a,0,.06,0);const h=new THREE.Group();h.position.set(0,.13,.09);B(h,.08,.08,.08,0x15151a,0,0,0);B(h,.03,.03,.07,0x555555,0,.02,.07);g.add(h);
    const wl=B(g,.03,.07,.15,0x22222a,-.07,.07,0),wr=B(g,.03,.07,.15,0x22222a,.07,.07,0);B(g,.08,.03,.1,0x15151a,0,.08,-.13);B(g,.02,.06,.02,0x777777,-.03,0,0);B(g,.02,.06,.02,0x777777,.03,0,0);
    g.userData={h,wl,wr};g.scale.setScalar(1.6);return g;}
  const crowRoofs=[];for(const p of plots){if(p.sp==='bc')crowRoofs.push({p,y:8.72,x0:.2,x1:2.8,z0:.3,z1:2.1});else if(p.sp==='res'&&p.rt==='tower')crowRoofs.push({p,y:30*.36,x0:.5,x1:2.5,z0:.35,z1:.6});}
  function updateCrows(time,dt){for(const r of crowRoofs){const p=r.p,on=near(p.x,p.y,zoom*2);
    if(on&&!r.g){r.g=new THREE.Group();r.g.position.set(p.x0,r.y,p.y0);const n=2+Math.floor(hash(p.id,5)*3);
      r.crows=Array.from({length:n},(_,k)=>{const c=makeCrow();const b={c,x:r.x0+hash(p.id,k)*(r.x1-r.x0),z:r.z0+hash(k,p.id)*(r.z1-r.z0),tx:0,tz:0,st:'wait',t:Math.random()*2,hop:0};b.tx=b.x;b.tz=b.z;r.g.add(c);return b;});scene.add(r.g);}
    else if(!on&&r.g){scene.remove(r.g);r.g=null;r.crows=null;}
    if(!r.g)continue;
    for(const b of r.crows){const u=b.c.userData;b.t-=dt;
      if(b.st==='walk'){const dx=b.tx-b.x,dz=b.tz-b.z,d=Math.hypot(dx,dz);if(d<.03){b.st='wait';b.t=rand(.6,2.5);}else{const sp=Math.min(d,dt*.35);b.x+=dx/d*sp;b.z+=dz/d*sp;b.c.rotation.y=Math.atan2(dx,dz);}
        b.c.position.y=Math.abs(Math.sin(time*16+b.tx*9))*.02;u.h.rotation.x=Math.sin(time*16)*.25;}
      else if(b.st==='peck'){u.h.rotation.x=.9+Math.sin(time*14)*.3;if(b.t<=0){b.st='wait';b.t=rand(.5,1.5);}}
      else if(b.st==='hop'){b.hop+=dt*3;b.c.position.y=Math.sin(Math.min(1,b.hop)*Math.PI)*.18;const f=Math.sin(time*40)*.9;u.wl.rotation.z=f;u.wr.rotation.z=-f;if(b.hop>=1){b.st='wait';b.t=rand(.5,2);u.wl.rotation.z=u.wr.rotation.z=0;b.c.position.y=0;}}
      else{u.h.rotation.x=0;b.c.position.y=0;if(b.t<=0){const q=Math.random();
        if(q<.5){b.st='walk';b.tx=r.x0+Math.random()*(r.x1-r.x0);b.tz=r.z0+Math.random()*(r.z1-r.z0);}else if(q<.8){b.st='peck';b.t=rand(.6,1.6);}else{b.st='hop';b.hop=0;b.c.rotation.y+=rand(-2,2);}}}
      b.c.position.x=b.x;b.c.position.z=b.z;}}}
  const vigPlots=[];
  function updateVignettes(time,dt){for(const p of vigPlots){const on=near(p.x,p.y,zoom*2);
    if(on&&!p.vig)p.vig=makeVignette(p);else if(!on&&p.vig){scene.remove(p.vig.g);p.vig=null;}
    if(p.vig&&p.vig.tick)p.vig.tick(time,dt);}}

  const parts=[];
  function puff(x,y,z,c,n=1,up=.6,spread=.3){for(let k=0;k<n&&parts.length<250;k++){const m=new THREE.Mesh(BOX,mat(c));const s=rand(.06,.13);m.scale.set(s,s,s);m.position.set(x,y,z);scene.add(m);
    parts.push({m,vx:rand(-spread,spread),vy:rand(up*.6,up),vz:rand(-spread,spread),life:0,max:rand(.8,1.6),s});}}

  // ================= СОСТОЯНИЕ УЧАСТКОВ =================
  const units=[],vehicles=[],residents=[],ships=[];
  // паром у пристани острова: виден всё обучение, по тапу открывается пристань
  const FERRY={x:ISLAND.pier.x+3.2,y:ISLAND.pier.y-4.5};
  const dock={kind:'boat',mesh:makeFerry(),x:FERRY.x,y:FERRY.y,wp:[],face:Math.PI,ferry:true,docked:true};
  const beacon=new THREE.Mesh(new THREE.OctahedronGeometry(.32),new THREE.MeshBasicMaterial({color:0xffd166}));beacon.position.set(FERRY.x,3,FERRY.y);
  scene.add(dock.mesh,beacon);ships.push(dock);
  // ===== Яхт-клуб: суда игроков у причала (катер / яхта / мегаяхта) =====
  const YLEN={boat:1.7,yacht:3.1,mega:5};let yachts=[];
  function makeYacht(kind,col){const g=new THREE.Group(),c=new THREE.Color(col||'#2e86ab').getHex();
    if(kind==='boat'){B(g,.6,.3,1.7,0xf4f4f4,0,-.15,0);B(g,.62,.07,1.72,c,0,.05,0);B(g,.45,.22,.5,0xffffff,0,.15,-.1);B(g,.42,.12,.04,0x9fd3ff,0,.3,.16,true);}
    else if(kind==='yacht'){B(g,1,.4,3.1,0xffffff,0,-.2,0);B(g,1.02,.08,3.12,c,0,.08,0);B(g,.95,.05,2.9,0x9c6b3e,0,.16,0);
      B(g,.8,.4,1.5,0xffffff,0,.2,-.2);B(g,.82,.12,1.3,0x1b2a3a,0,.38,-.2,true);B(g,.6,.3,.8,0xffffff,0,.6,-.4);B(g,.62,.1,.6,0x1b2a3a,0,.72,-.4,true);B(g,.03,.9,.03,0xcccccc,0,.9,-.6);}
    else{B(g,1.5,.6,5,0xffffff,0,-.3,0);B(g,1.52,.1,5.02,0xd4af37,0,.1,0);B(g,1.45,.05,4.8,0x9c6b3e,0,.2,0);
      for(let k=0;k<3;k++){const w=1.25-k*.25,l=3-k*.7,y=.25+k*.42;B(g,w,.38,l,0xffffff,0,y,-.3-k*.15);B(g,w+.02,.12,l-.2,0x14202c,0,y+.16,-.3-k*.15,true);}
      CY(g,.4,.4,.04,12,0x333333,0,1.5,-1.1);B(g,.3,.02,.06,0xffffff,0,1.55,-1.1,true);B(g,.06,.02,.3,0xffffff,0,1.55,-1.1,true);
      B(g,.5,.12,.5,0x2fa3c7,0,.24,1.6,true);B(g,.04,.6,.04,0xcccccc,0,1.55,-.2);}
    return shadow(g);}
  function setYachts(list){for(const y of yachts){scene.remove(y.mesh);y.lab.el.remove();wlabels.splice(wlabels.indexOf(y.lab),1);}yachts=[];
    const R={mega:3,yacht:2,boat:1},sides=[[MARINA.x-.9,MARINA.y0+3],[MARINA.x+2.9,MARINA.y0+3]];
    for(const v of [...list].sort((a,b)=>(R[b.kind]||0)-(R[a.kind]||0))){const L=YLEN[v.kind];if(!L)continue;
      const s=sides.reduce((a,b)=>a[1]<=b[1]?a:b);if(s[1]+L>MARINA.y1+3)continue;
      const w=v.kind==='mega'?.6:v.kind==='yacht'?.3:0,x=s[0]+(s===sides[0]?-w:w),y=s[1]+L/2;s[1]+=L+.5;
      const m=makeYacht(v.kind,v.color);m.position.set(x,0,y);scene.add(m);
      yachts.push({mesh:m,x,y,ph:Math.random()*6,lab:wlabel((v.kind==='mega'?'🛳 ':v.kind==='yacht'?'🛥 ':'🚤 ')+v.nick,x,v.kind==='mega'?2.2:1.4,y,'other',v.color||'')});}}
  // ===== Телебашня: растёт по мере сбора денег =====
  let tvTower=null,tvLight=null;
  function setTower(frac,done,label){if(tvTower){scene.remove(tvTower.g);tvTower.lab.el.remove();wlabels.splice(wlabels.indexOf(tvTower.lab),1);}
    const g=new THREE.Group(),TH=14,h=done?TH:Math.max(.4,TH*.85*Math.min(1,frac));tvLight=null;
    B(g,3.4,.25,3.4,0x8d939a,0,0,0);
    const segs=Math.ceil(h/.7);for(let i=0;i<segs;i++){const y=.25+i*.7,hh=Math.min(.7,h-i*.7);if(hh<=0)break;const r=.75-.42*(y/TH);CY(g,r-.02,r,hh,10,i%4===3?0xb9bec4:0xd5d9de,0,y,0);}
    if(done){CY(g,1.15,.7,.7,12,0xc9ced4,0,TH*.62,0);CY(g,1.2,1.2,.25,12,0x2c3e50,0,TH*.62+.7,0);for(let k=0;k<12;k++){const a=k/12*Math.PI*2;B(g,.12,.18,.06,0x9fd3ff,Math.cos(a)*1.17,TH*.62+.28,Math.sin(a)*1.17,true);}
      for(let i=0;i<6;i++)B(g,.12-i*.012,.5,.12-i*.012,i%2?0xe63946:0xf4f4f4,0,TH+.25+i*.5,0);
      tvLight=B(g,.18,.18,.18,0xff2020,0,TH+3.3,0,true);}
    else{const top=.25+h;for(const[x,z]of[[-.95,-.95],[.95,-.95],[-.95,.95],[.95,.95]])B(g,.06,top,.06,0xf39c12,x,0,z);
      for(let y=1;y<top;y+=1.2){B(g,1.96,.05,.05,0xf39c12,0,y,-.95);B(g,1.96,.05,.05,0xf39c12,0,y,.95);B(g,.05,.05,1.96,0xf39c12,-.95,y,0);B(g,.05,.05,1.96,0xf39c12,.95,y,0);}
      const cr=new THREE.Group();cr.position.set(1.4,0,1.4);B(cr,.14,top+2.5,.14,0xf1c40f,0,0,0);const arm=new THREE.Group();arm.position.y=top+2.5;B(arm,4,.12,.12,0xf1c40f,-1.4,0,0);B(arm,.04,1.2,.04,0x333333,-2.8,-1.2,0);cr.add(arm);g.add(cr);g.userData.arm=arm;}
    g.position.set(TOWER.x,0,TOWER.y);scene.add(shadow(g));
    tvTower={g,lab:wlabel(label,TOWER.x,done?TH+4:h+3,TOWER.y,'emp','#ffd166')};}
  // ===== Экспорт: контейнеровоз в Новоморск у причала, грузится до отплытия =====
  const EXP={x:190.5,y:168};let exShip=null;
  function makeContainerShip(){const g=new THREE.Group();B(g,2.2,.7,8,0x1f3a5f,0,-.3,0);B(g,2.22,.14,8.02,0xc0392b,0,-.35,0);B(g,1.8,1.3,1.3,0xf4f4f4,0,.4,-3.1);B(g,1.82,.14,1.1,0x14202c,0,1.45,-3.1,true);B(g,.3,.6,.3,0x222222,0,1.7,-3.3);
    const box=new THREE.Group();g.add(box);g.userData.box=box;g.userData.n=-1;return shadow(g);}
  function fillShip(n){const box=exShip.mesh.userData.box;if(exShip.mesh.userData.n===n)return;exShip.mesh.userData.n=n;while(box.children.length)box.remove(box.children[0]);
    const C=[0xc0392b,0x2980b9,0x27ae60,0xf39c12,0x8e44ad,0xe67e22];for(let k=0;k<Math.min(n,36);k++){const col=k%3,row=Math.floor(k/3)%6,lay=Math.floor(k/18);B(box,.6,.45,.95,C[(k*7)%6],-.65+col*.65,.1+lay*.46,-1.9+row*1.05);}}
  function setExport(info){const now=Date.now();
    if(info&&info.n>0&&!exShip){exShip={mesh:makeContainerShip(),x:EXP.x,y:EXP.y,face:Math.PI,state:'dock',ship:info.ship,lab:null};scene.add(exShip.mesh);}
    if(!exShip)return;if(info&&info.ship&&info.n>0)exShip.ship=info.ship;if(info&&info.n>0)fillShip(info.n);
    if(!exShip.lab)exShip.lab=wlabel('',EXP.x,2.6,EXP.y,'emp','#9fd3ff');
    if(exShip.ship)exShip.lab.el.textContent=`🚢 → НОВОМОРСК · отплытие ${new Date(exShip.ship).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;}
  function animExtras(dt,time){for(const y of yachts){y.mesh.position.y=Math.sin(time*1.6+y.ph)*.05;y.mesh.rotation.z=Math.sin(time*1.1+y.ph)*.02;}
    if(tvLight)tvLight.visible=Math.sin(time*3)>0;if(tvTower&&tvTower.g.userData.arm)tvTower.g.userData.arm.rotation.y=Math.sin(time*.3)*1.4;
    if(exShip){const s=exShip,sp=2*dt;if(s.ship&&Date.now()>=s.ship&&s.state!=='out')s.state='out';
      if(s.state==='in'){s.y=Math.max(EXP.y,s.y-sp);s.face=Math.PI;if(s.y<=EXP.y)s.state='dock';}
      else if(s.state==='out'){s.y+=sp;s.face=0;if(s.y>H+8){scene.remove(s.mesh);if(s.lab){s.lab.el.remove();wlabels.splice(wlabels.indexOf(s.lab),1);}exShip=null;}}
      if(exShip){s.mesh.position.set(s.x,Math.sin(time*1.4)*.04,s.y);s.mesh.rotation.y=s.face;if(s.lab)s.lab.p.set(s.x,2.6,s.y);}}}
  // учебный участок на острове (живёт только у клиента)
  const tutPlot={id:-1,sp:null,reg:'v',x0:ISLAND.plot.x0,y0:ISLAND.plot.y0,x:ISLAND.plot.x0+1.5,y:ISLAND.plot.y0+1.5,door:{x:ISLAND.plot.x0+1,y:ISLAND.plot.y0+3},stock:{x:ISLAND.plot.x0+3,y:ISLAND.plot.y0+3},
    crops:[],wk:[],owner:null,color:'#ffd166',building:null,workers:0,builtAt:0,level:1,mat:false,fast:true};
  const plotsX=[...plots,tutPlot];
  // деревянный забор и табличка «Продаётся» вокруг учебного участка (до покупки)
  const tutFence=new THREE.Group();{const x0=tutPlot.x0-.45,x1=tutPlot.x0+3.45,z0=tutPlot.y0-.45,z1=tutPlot.y0+3.45,c=0x9c6b3e;
    for(const y of[.15,.35]){B(tutFence,x1-x0,.06,.06,c,(x0+x1)/2,y,z0);B(tutFence,.06,.06,z1-z0,c,x0,y,(z0+z1)/2);B(tutFence,.06,.06,z1-z0,c,x1,y,(z0+z1)/2);
      B(tutFence,1.4,.06,.06,c,x0+.7,y,z1);B(tutFence,1.4,.06,.06,c,x1-.7,y,z1);}
    for(let k=0;k<=4;k++){B(tutFence,.1,.5,.1,0x7a4a24,x0+k*(x1-x0)/4,0,z0);B(tutFence,.1,.5,.1,0x7a4a24,x0+k*(x1-x0)/4,0,z1);B(tutFence,.1,.5,.1,0x7a4a24,x0,0,z0+k*(z1-z0)/4);B(tutFence,.1,.5,.1,0x7a4a24,x1,0,z0+k*(z1-z0)/4);}
    const cx=tutPlot.x0+1.5,cz=tutPlot.y0+1.5;B(tutFence,.08,.9,.08,0x6b4a2f,cx,0,cz+1);B(tutFence,.9,.5,.06,0xf4ecd8,cx,.75,cz+1);B(tutFence,.9,.1,.07,0xc0392b,cx,1.15,cz+1);B(tutFence,.5,.12,.07,0x2e7d32,cx,.85,cz+1.01,true);
    scene.add(shadow(tutFence));}
  function setPlotState(id,st){
    const p=plots[id];if(!p||p.sp)return;
    const changed=p.owner!==st.owner||p.color!==st.color||p.building!==st.building||p.builtAt!==(st.builtAt||0)||(p.level||1)!==(st.level||1)||String(p.mods||[])!==String(st.mods||[]);
    if(p.building&&!st.building)for(let y=p.y0+1;y<=p.y0+2;y++)for(let x=p.x0+1;x<=p.x0+2;x++)walk[I(x,y)]=1;
    Object.assign(p,{owner:st.owner,color:st.color,building:st.building,workers:st.building?st.workers:0,builtAt:st.builtAt||0,level:st.level||1,mods:st.mods||[],nick:st.nick||p.nick});
    setSign(p,!p.owner);if(p.building)blockFoot(p);
    if(changed&&p.mat){dematerialize(p);materialize(p);}else if(p.mat)syncWorkers(p);
  }
  // украшения по уровню здания: 1–5 растёт и обрастает пристройками, 6+ «Фабрика» (асфальт, труба), 7 склад с солнечными панелями,
  // 8 стеклянная надстройка, 9 неоновая вывеска, 10 «Флагман» (золото); табличка со звёздами. Модули — отдельные объекты.
  function levelDecor(g,lv,col,mods=[]){const add=m=>{m.userData.ld=1;return m;};
    if(lv>1){const k=1+.07*(Math.min(lv,5)-1);for(const c of g.children)if(!c.userData.ld){c.scale.multiplyScalar(k);c.position.x*=k;c.position.z*=k;}}
    if(lv>=2){for(const[x,z]of[[-1.5,1.6],[-1.1,1.6],[-.7,1.6]]){add(B(g,.22,.12,.22,0x8b5a2b,x,0,z));add(B(g,.16,.08,.16,[0xff8fab,0xffe066,0xb388eb][Math.abs(x*10|0)%3],x,.12,z));}}
    if(lv>=3){add(B(g,.9,.6,.8,0xd9cbb0,-1.25,0,-1.1));add(GR(g,1,.35,.9,col,-1.25,.6,-1.1));}
    if(lv>=4){add(B(g,.08,1.4,.08,0x555555,1.3,0,-1.2));add(B(g,.18,.18,.18,0xfff1b0,1.3,1.4,-1.2,true));add(B(g,.5,.04,.4,0x2c3e50,1.2,.62,-1.15));}
    if(lv>=5){add(B(g,.06,1.8,.06,0xdddddd,-1.6,0,-1.6));add(B(g,.5,.3,.03,lv>=10?0xffd700:0xf1c40f,-1.33,1.5,-1.6));}
    if(lv>=6){add(B(g,3.3,.03,3.3,lv>=10?0x8a7a5a:0x5d6166,0,0,0));add(CY(g,.16,.22,2.4,8,0x8e3b2f,.55,0,-1.55));add(B(g,.36,.1,.36,0x333333,.55,2.4,-1.55));
      for(let i=0;i<3;i++){const sm=add(B(g,.22+i*.08,.22+i*.08,.22+i*.08,0xdddddd,.55+i*.12,2.6+i*.3,-1.55-i*.05));sm.material=new THREE.MeshLambertMaterial({color:0xeeeeee,transparent:true,opacity:.55-i*.12});}}
    if(lv>=7){add(B(g,.55,.85,1.1,0xb0b7bd,1.35,0,-.15));add(B(g,.6,.06,1.15,0x7f8c8d,1.35,.85,-.15));
      for(const z of[-.45,-.15,.15])add(B(g,.42,.04,.24,0x1f3a68,1.35,.92,z,true));}
    if(lv>=8){const gl=add(B(g,.9,.7,.8,0x9fd3ff,-1.25,.95,-1.1));gl.material=new THREE.MeshLambertMaterial({color:0x9fd3ff,transparent:true,opacity:.75,emissive:0x16324f});
      add(B(g,.95,.05,.85,0xdddddd,-1.25,1.65,-1.1));}
    if(lv>=9){add(B(g,.05,.6,.05,0x333333,-.45,1.75,.2));add(B(g,.05,.6,.05,0x333333,.45,1.75,.2));add(B(g,1.15,.3,.06,col,0,2.3,.2,true));
      add(B(g,1.25,.04,.08,0xffffff,0,2.62,.2,true));}
    if(lv>=10){add(B(g,.08,3.2,.08,0xffd700,-1.6,0,-1.6));const st=new THREE.Mesh(new THREE.OctahedronGeometry(.2),bmat(0xffd700));st.position.set(-1.6,3.4,-1.6);add(st);g.add(st);
      for(const[w,d,x,z]of[[3.3,.08,0,1.65],[3.3,.08,0,-1.65],[.08,3.3,1.65,0],[.08,3.3,-1.65,0]])add(B(g,w,.06,d,0xffd700,x,0,z));
      add(B(g,.5,.02,1.2,0xc0392b,-.5,.03,1.1));}
    // табличка: звёзды (6+ — оранжевые)
    add(B(g,.05,.7,.05,0x6b4a2f,-1.65,0,1.25));add(B(g,.12+.11*Math.max(0,lv-1),.16,.04,0x2b2438,-1.65+.05*(lv-1),.62,1.25));
    for(let i=0;i<lv-1;i++)add(B(g,.08,.08,.05,i>=5?0xff9f43:0xf1c40f,-1.65+i*.11,.66,1.28,true));
    // модули
    if(mods.includes('store')){add(B(g,.6,.06,.5,0x9c6b3e,1.25,0,1.3));add(B(g,.26,.26,.26,0xb5835a,1.13,.06,1.2));add(B(g,.26,.26,.26,0xa47148,1.4,.06,1.38));add(B(g,.24,.24,.24,0xc49464,1.2,.32,1.3));}
    if(mods.includes('brig')){add(B(g,.38,.5,.38,0xe67e22,-1.55,0,.35));add(B(g,.44,.06,.44,0x333333,-1.55,.5,.35));const hh=add(B(g,.2,.1,.2,0xf1c40f,-1.55,.56,.35));hh.scale.y=.1;}
    if(mods.includes('tech')){add(B(g,.5,.25,.3,0x2e8b57,.65,.12,1.5));add(B(g,.2,.22,.26,0x226b43,.5,.37,1.5));
      for(const[x,z,r]of[[.45,1.35,.13],[.45,1.65,.13],[.85,1.35,.09],[.85,1.65,.09]])add(CY(g,r,r,.06,8,0x222222,x,r,z)).rotation.x=Math.PI/2;}
    if(mods.includes('ads')){add(B(g,.05,1.1,.05,0x555555,1.25,0,.75));add(B(g,.05,1.1,.05,0x555555,1.7,0,.75));add(B(g,.6,.4,.05,col,1.48,.95,.78,true));add(B(g,.4,.08,.06,0xffffff,1.48,1.1,.8,true));}
    if(mods.includes('auto')){add(B(g,.06,.9,.06,0x888888,-1.55,0,-.45));const d=add(CY(g,.25,.05,.08,10,0xdddddd,-1.5,.9,-.45));d.rotation.z=.6;
      add(B(g,.06,.06,.06,0xff4444,-1.5,1.05,-.45,true));}
  }
  function materialize(p){if(p.mat||!p.owner)return;p.mat=true;
    if(p.nick){p.lab=wlabel(p.nick,p.x0+3.2,1.6,p.y0-.2,'owner',p.color);p.lab.zMax=mobile?16:24;}
    p.fence=makeFence(p,p.color);scene.add(p.fence);
    if(p.building){const b=makeBuilding(p.building,new THREE.Color(p.color||'#fff').getHex());b.g.position.set(p.x0+1.5,0,p.y0+1.5);levelDecor(b.g,p.level||1,new THREE.Color(p.color||'#fff').getHex(),p.mods||[]);scene.add(b.g);p.group=b.g;p.anim=b.a;
      if(p.building==='farm')makeCrops(p,'wheat');if(p.building==='garden')makeCrops(p,'veg');}
    syncWorkers(p);}
  function dematerialize(p){if(!p.mat)return;p.mat=false;
    if(p.lab){p.lab.el.remove();wlabels.splice(wlabels.indexOf(p.lab),1);p.lab=null;}
    if(p.fence){scene.remove(p.fence);p.fence=null;}if(p.group){scene.remove(p.group);p.group=null;p.anim=null;}
    for(const c of p.crops)scene.remove(c.grp);p.crops=[];syncWorkers(p);}
  function cullPlots(){const R=zoom*3+12;for(const p of landPlots){if(!p.owner){if(p.mat)dematerialize(p);continue;}
    const want=Math.abs(p.x-camT.x)+Math.abs(p.y-camT.z)<R;if(want&&!p.mat)materialize(p);else if(!want&&p.mat)dematerialize(p);}}
  function syncWorkers(p){const want=p.mat&&p.building&&p.builtAt<=Date.now()?p.workers:0;
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
      if(!u.boat){const px=nearPier(p.x)+.5;u.boat={mesh:makeShip(false,new THREE.Color(p.color).getHex()),x:px,y:172,home:{x:px,y:172},wp:null,wait:rand(2,6),kind:'boat'};scene.add(u.boat.mesh);ships.push(u.boat);}
      if(u.state==='idle'){u.path=pathTo(u,nearPier(p.x),165);u.state='go';}if(u.state==='go'&&stepMove(u,dt))u.state='stand';u.working=u.state==='stand'&&Math.sin(time+u.ox*9)>.5;return;}
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
  const serviceOpen=p=>p.sp==='shop'||p.sp==='park'?true:p.sp==='pvzCity'?p.parcels>0:(p.building&&BLD[p.building].kind==='service'&&p.workers>0&&p.builtAt<=Date.now());
  function spawnResident(){const near=resPlots.filter(p=>Math.abs(p.x-camT.x)+Math.abs(p.y-camT.z)<zoom*2.2);if(!near.length)return;const home=pick(near);
    const shops=plots.filter(p=>serviceOpen(p)&&Math.abs(p.x-home.x)+Math.abs(p.y-home.y)<25);
    const r={x:home.x0+1,y:home.y0+3,home:{x:home.x0+1,y:home.y0+3},path:[],speed:rand(1.8,2.4),ox:rand(-.25,.25),oy:rand(-.25,.25),face:0,carry:null,state:'go',target:null,
      mesh:makePerson(pick(RES_SHIRTS),Math.random()<.4?pick([0x222222,0x8b0000,0x2d3436]):null,pick([0x2d3436,0x34495e,0x1e3a5f])),wait:0};
    if(shops.length&&Math.random()<.8){r.target=pick(shops);r.path=pathTo(r,r.target.door.x,r.target.door.y);}
    else{const tx=home.x0+1+Math.round(rand(-8,8)),ty=home.y0+3+Math.round(rand(-8,8));r.path=bfs(r.x,r.y,(a,b)=>Math.abs(a-tx)+Math.abs(b-ty)<2,4000);}
    scene.add(r.mesh);residents.push(r);}
  function updateResident(r,dt){
    if(r.state==='go'){if(stepMove(r,dt)){r.state='wait';r.wait=rand(.8,1.6);const p=r.target;if(p&&serviceOpen(p)){if(p.sp==='park'){r.wait=rand(3,6);}else if(p.sp==='shop'){r.carry=pick(['bread','veg','milk','fish']);}else if(p.sp==='pvzCity'||p.building==='pvz'){p.parcels=Math.max(0,p.parcels-1);r.carry='parcel';}else{const g=Object.keys(BLD[p.building].in)[0];r.carry=g;}}}}
    else if(r.state==='wait'){if((r.wait-=dt)<=0){r.state='back';r.path=pathTo(r,r.home.x,r.home.y);}}
    else if(r.state==='back'&&stepMove(r,dt))removeRes(r);}
  const removeRes=r=>{scene.remove(r.mesh);residents.splice(residents.indexOf(r),1);};
  function spawnTruck(plotId,good,color){const p=plots[plotId];if(!p)return;const mt=pick(marketTiles);
    const v={kind:'truck',x:p.door.x,y:p.door.y,speed:2.4,path:[],phase:'go',home:p.door,face:0,mesh:makeTruck(new THREE.Color(color||'#fff').getHex(),GOODS[good]?.col||0xffffff)};
    v.path=drivePath(v,mt[0],mt[1]);scene.add(v.mesh);vehicles.push(v);}
  function spawnVan(){const t=pick(plots.filter(p=>(p.sp==='pvzCity'||(p.building==='pvz'&&p.workers>0))&&p.parcels<12&&!vehicles.some(v=>v.target===p)));if(!t)return;
    const v={kind:'van',x:sortPlot.door.x,y:sortPlot.door.y,speed:5.5,path:[],phase:'go',target:t,face:0,mesh:makeVan()};v.path=drivePath(v,t.door.x,t.door.y);scene.add(v.mesh);vehicles.push(v);}
  // впереди в моей полосе кто-то есть? (позиции мешей — уже со смещением в правую полосу)
  function blockedAhead(self,px,pz,dx,dz){for(const o of cars.concat(vehicles)){if(o===self||!o.mesh)continue;const rx=o.mesh.position.x-px,rz=o.mesh.position.z-pz,f=rx*dx+rz*dz;
      if(f>.05&&f<.95&&Math.abs(rx*dz-rz*dx)<.32)return true;}return false;}
  function updateVehicle(v,dt){const n=v.path[0];if(n){const d=Math.hypot(n[0]-v.x,n[1]-v.y);if(d>.45&&d<.8&&!greenFor(Math.round(v.x-(n[0]-v.x)/d*.9),Math.round(v.y-(n[1]-v.y)/d*.9),n[0],n[1])){v.moving=false;return;}
      if(d>1e-4&&blockedAhead(v,v.mesh.position.x,v.mesh.position.z,(n[0]-v.x)/d,(n[1]-v.y)/d)&&(v.wait=(v.wait||0)+dt)<4){v.moving=false;return;}v.wait=0;}
    if(!stepMove(v,dt))return;
    if(v.phase==='go'){v.phase='back';if(v.kind==='van'){v.target.parcels+=12;v.path=drivePath(v,sortPlot.door.x,sortPlot.door.y);}else{v.mesh.userData.cargo.visible=false;v.path=drivePath(v,v.home.x,v.home.y);}}
    else{scene.remove(v.mesh);vehicles.splice(vehicles.indexOf(v),1);}}
  // корабли
  function spawnCargo(){const px=pick(PIERS);const s={kind:'cargo',mesh:makeShip(true),x:px+3.5,y:H+6,wp:[[px+3.5,190],[px+3.5,177],[px+3.5,168]],wait:25,out:[[px+3.5,179],[px+3.5,200],[px+3.5,H+8]],speed:2.2};scene.add(s.mesh);ships.push(s);}
  function spawnFishing(){const px=pick(PIERS);const s={kind:'fishing',mesh:makeShip(false),x:px+.5,y:172,wp:[[px+rand(-12,12),rand(178,200)],[px+rand(-15,15),rand(176,200)],[px+.5,172]],wait:0,speed:1.5};scene.add(s.mesh);ships.push(s);}
  function updateShip(s,dt){
    if(s.ferry){const t=s.wp[0];if(!t)return;const dx=t[0]-s.x,dy=t[1]-s.y,d=Math.hypot(dx,dy),sp=s.speed*dt;s.face=Math.atan2(dx,dy);if(d<=sp){s.x=t[0];s.y=t[1];s.wp.shift();}else{s.x+=dx/d*sp;s.y+=dy/d*sp;}return;}
    if(s.kind==='boat'){ // судно игрока
      if(!s.wp){if((s.wait-=dt)>0)return;s.wp=[[s.home.x+rand(-14,14),rand(178,200)],[s.home.x+rand(-14,14),rand(178,200)],[s.home.x,s.home.y]];}
      if(!s.wp.length){s.wp=null;s.wait=rand(4,8);return;}}
    const tgt=s.wp&&s.wp[0];
    if(!tgt){if(s.kind==='cargo'){if((s.wait-=dt)>0)return;s.wp=s.out;s.out=null;if(!s.wp){scene.remove(s.mesh);ships.splice(ships.indexOf(s),1);}return;}
      scene.remove(s.mesh);ships.splice(ships.indexOf(s),1);return;}
    const dx=tgt[0]-s.x,dy=tgt[1]-s.y,d=Math.hypot(dx,dy),sp=(s.speed||1.6)*dt;
    s.face=Math.atan2(dx,dy);if(d<=sp){s.x=tgt[0];s.y=tgt[1];s.wp.shift();}else{s.x+=dx/d*sp;s.y+=dy/d*sp;}}

  // ================= АВАТАРЫ =================
  const avatars=new Map(); // uid -> {x,y,tx,ty,mesh,label,nick}
  let me=null;
  function setMe(nick,color,x,y,skin,look){if(me){scene.remove(me.mesh);me.label.el.remove();wlabels.splice(wlabels.indexOf(me.label),1);}
    me={x,y,path:[],speed:3,ox:0,oy:0,face:0,carry:null,working:false,idle:true,mesh:makeAvatar(look,skin)};scene.add(me.mesh);me.label=wlabel(nick,0,1.2,0,'me');}
  // далеко идти — персонаж сам дойдёт до остановки и поедет на автобусе, если так быстрее
  let busPlan=null,worldApi=null;
  function goMe(x,y){if(!me||me.riding)return;if(busPlan&&busPlan.tx===x&&busPlan.ty===y)return;busPlan=null;
    const direct=pathTo(me,x,y);me.path=direct;if(direct.length<45||!STOPS.length)return;
    const ns=(px,py)=>{let b=-1,bd=1e9;STOPS.forEach((st,i)=>{const d=Math.abs(st.x-px)+Math.abs(st.y-py);if(d<bd){bd=d;b=i;}});return b;};
    const a=ns(me.x,me.y),b=ns(x,y);if(a<0||b<0||a===b)return;const A=STOPS[a],Bs=STOPS[b];
    const pa=(Math.round(me.x)===A.x&&Math.round(me.y)===A.y)?[]:pathTo(me,A.x,A.y),pb=pathTo({x:Bs.x,y:Bs.y},x,y);
    if((pa.length||Math.round(me.x)===A.x)&&(pb.length||(Bs.x===x&&Bs.y===y))&&pa.length+pb.length+24<direct.length*.75){me.path=pa;busPlan={a,b,tx:x,ty:y};}}
  function setOther(uid,{x,y,nick,color,working,skin,look}){let a=avatars.get(uid);const lk=JSON.stringify(look||null);if(a&&(a.skin!==skin||a.lk!==lk)){removeOther(uid);a=null;}
    if(!a){a={x,y,tx:x,ty:y,path:[],ox:0,oy:0,face:0,carry:null,idle:true,mesh:makeAvatar(look,skin),skin,lk,label:wlabel(nick,0,1.2,0,'other',color)};scene.add(a.mesh);avatars.set(uid,a);}
    a.tx=x;a.ty=y;a.working=working;}
  function removeOther(uid){const a=avatars.get(uid);if(!a)return;scene.remove(a.mesh);a.label.el.remove();wlabels.splice(wlabels.indexOf(a.label),1);avatars.delete(uid);}

  // ================= DOM-метки =================
  const labelsEl=document.getElementById('labels'),floatsEl=document.getElementById('floats'),wlabels=[],floats=[];
  function wlabel(text,x,y,z,cls='',color=''){const el=document.createElement('div');el.className='wlab '+cls;el.textContent=text;if(color)el.style.color=color;labelsEl.appendChild(el);const L={el,p:new THREE.Vector3(x,y,z)};wlabels.push(L);return L;}
  // реплика из чата над персонажем (6 с, потом тает)
  const bubbles=[];
  function say(uid,text){const a=uid==='me'?me:avatars.get(uid);if(!a||!text)return;let b=bubbles.find(b=>b.a===a);
    if(!b){const el=document.createElement('div');el.className='bubble wbub';labelsEl.appendChild(el);b={a,el,t:0,p:new THREE.Vector3()};bubbles.push(b);}
    b.el.textContent=text.length>70?text.slice(0,68)+'…':text;b.t=6;}
  function float(text,x,y,z,color='#ffd166'){const el=document.createElement('div');el.className='float';el.textContent=text;el.style.color=color;floatsEl.appendChild(el);floats.push({el,p:new THREE.Vector3(x,y,z),t:0});}
  for(const b of BLOCKS)wlabel(b.name,b.x+b.cols*STEP/2,0,b.y-3,'big');
  wlabel('ОСТРОВ «УЧЕБНЫЙ»',(ISLAND.x0+ISLAND.x1)/2,0,ISLAND.y1+3,'big');wlabel('ГОРЫ · КАРЬЕР',135,2,16,'big');
  for(const[k,n]of[['pvz','ПВЗ «Коробас»'],['alko','Алкомаркет «Градус»'],['lavka','Лавка скупщика'],['spawn','Гостевой домик'],['pier','Пристань'],['mill','Мельница'],['board','Доска аукционов']]){wlabel(n,ISLAND[k].x,2.2,ISLAND[k].y,'emp','#ffe9a8');}
  wlabel("⛴ ПАРОМ В ПИКСЕЛЬГРАД",FERRY.x,3.6,FERRY.y,'emp','#ffd166');
  wlabel('⚓ ЯХТ-КЛУБ',MARINA.x+1,1.2,MARINA.y0-1,'poi','#9fd3ff');
  wlabel('Учебный участок',ISLAND.plot.x0+1.5,1.2,ISLAND.plot.y0+1.5,'emp','#ffe9a8');wlabel('МОРЕ',200,0,192,'big');wlabel('СОСНОВЫЙ БОР',20,2,120,'big');for(const L of LAKES)wlabel(L.name,L.x,0,L.y,'big');
  for(const k in POIS){const P=POIS[k];wlabel(P.ic+' '+P.n,P.x,2.2,P.y,'poi','#c8ffb0');}
  // ===== Светофоры: цикл 12 с — 5 с зелёный по X, 1 с жёлтый, 5 с зелёный по Y, 1 с жёлтый =====
  const lightSet=new Set(),lights=[];
  {const CB=BLOCKS[0];for(let k=0;k<=CB.cols;k++)for(let m=0;m<=CB.rows;m++){const x=CB.x+STEP*k,y=CB.y+STEP*m;if(inb(x,y)){lightSet.add(I(x,y));lights.push([x,y]);}}}
  const matLX=new THREE.MeshBasicMaterial({color:0xe74c3c}),matLY=new THREE.MeshBasicMaterial({color:0x2ecc71});
  {const n=lights.length,pole=new THREE.InstancedMesh(BOX,mat(0x333333),n),hx=new THREE.InstancedMesh(BOX,matLX,n),hy=new THREE.InstancedMesh(BOX,matLY,n),o=new THREE.Object3D();
    lights.forEach(([x,y],i)=>{o.position.set(x+.48,.45,y+.48);o.scale.set(.06,.9,.06);o.updateMatrix();pole.setMatrixAt(i,o.matrix);
      o.position.set(x+.48,.93,y+.48);o.scale.set(.03,.12,.14);o.updateMatrix();hx.setMatrixAt(i,o.matrix);
      o.position.set(x+.48,1.07,y+.48);o.scale.set(.14,.12,.03);o.updateMatrix();hy.setMatrixAt(i,o.matrix);});
    for(const m of[pole,hx,hy]){m.computeBoundingSphere();scene.add(m);}}
  let lightX='g',lightY='r';
  function updateLights(time){const ph=time%12;lightX=ph<5?'g':ph<6?'y':'r';lightY=ph>=6&&ph<11?'g':ph>=11?'y':'r';
    const C={g:0x2ecc71,y:0xf1c40f,r:0xe74c3c};matLX.color.setHex(C[lightX]);matLY.color.setHex(C[lightY]);}
  // можно ли въехать с клетки (cx,cy) на перекрёсток (nx,ny)
  function greenFor(cx,cy,nx,ny){if(!lightSet.has(I(nx,ny))||lightSet.has(I(cx,cy)))return true;return(nx!==cx?lightX:lightY)==='g';}
  // ===== Городские машины: едут по асфальту, на перекрёстках поворачивают, стоят на красный и за впереди стоящей =====
  const cars=[],DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
  const isRoad=(x,y)=>{if(!inb(x,y))return false;const t=grid[I(x,y)];return(t===T.ASPH||t===T.RING||t===T.BRIDGE)&&plotIdx[I(x,y)]<0;};
  const CARC=[0xc0392b,0x2980b9,0xf1c40f,0xecf0f1,0x2c3e50,0x27ae60,0x7f8c8d,0x8e44ad,0xe67e22];
  function spawnCar(){const c=lights.filter(([x,y])=>Math.abs(x-camT.x)+Math.abs(y-camT.z)<zoom*2);if(!c.length)return;const[x,y]=pick(c);
    const ds=DIRS.filter(([dx,dy])=>isRoad(x+dx,y+dy));if(!ds.length)return;const[dx,dy]=pick(ds);
    if(cars.concat(vehicles).some(o=>o.mesh&&Math.hypot(o.mesh.position.x-x,o.mesh.position.z-y)<1.3))return;
    const car={x,y,dx,dy,t:Math.random()*.5,speed:rand(2.2,3.4),mesh:makeCar(pick(CARC))};scene.add(car.mesh);cars.push(car);}
  function updateCar(c,dt){const nx=c.x+c.dx,ny=c.y+c.dy;
    if(c.t<.05&&!greenFor(c.x,c.y,nx,ny))return;
    if(blockedAhead(c,c.mesh.position.x,c.mesh.position.z,c.dx,c.dy)&&(c.wait=(c.wait||0)+dt)<4)return;c.wait=0;
    c.t+=dt*c.speed;
    if(c.t>=1){c.t=0;c.x=nx;c.y=ny;const back=[-c.dx,-c.dy];let opts=DIRS.filter(([dx,dy])=>!(dx===back[0]&&dy===back[1])&&isRoad(c.x+dx,c.y+dy));
      if(!opts.length)opts=[back];const st=opts.find(([dx,dy])=>dx===c.dx&&dy===c.dy);const d=st&&Math.random()<.65?st:pick(opts);c.dx=d[0];c.dy=d[1];}}
  function placeCar(c){const fx=c.x+c.dx*c.t,fy=c.y+c.dy*c.t;c.mesh.position.set(fx-c.dy*.22,0,fy+c.dx*.22);c.mesh.rotation.y=Math.atan2(c.dx,c.dy);}
  let carT=0;
  function updateCars(dt){for(const c of[...cars]){if(Math.abs(c.x-camT.x)+Math.abs(c.y-camT.z)>zoom*3){scene.remove(c.mesh);cars.splice(cars.indexOf(c),1);continue;}updateCar(c,dt);placeCar(c);}
    if((carT-=dt)<=0){carT=.4;if(cars.length<(mobile?14:24))spawnCar();}}
  // значки над остановками: крутятся и подпрыгивают, светятся ночью
  const stopMarks=STOPS.map(st=>{const g=new THREE.Group();B(g,.7,.36,.34,0xf1c40f,0,0,0,true);B(g,.72,.12,.36,0x2e86ab,0,.17,0,true);B(g,.12,.1,.37,0x1a1a1a,-.22,-.05,0,true);B(g,.12,.1,.37,0x1a1a1a,.22,-.05,0,true);
    g.position.set(st.x+.5,2.6,st.y-.5);scene.add(g);return{g,x:st.x,y:st.y,ph:Math.random()*6};});
  function updateStopMarks(time){for(const m of stopMarks){if(Math.abs(m.x-camT.x)+Math.abs(m.y-camT.z)>zoom*3)continue;m.g.rotation.y=time*1.5+m.ph;m.g.position.y=2.6+Math.abs(Math.sin(time*2.5+m.ph))*.35;}}
  // ===== Реклама: 3 билборда и экран на небоскрёбе =====
  const adScreens=[];
  function adScreen(cw,ch,slot,x,y){const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;const tx=new THREE.CanvasTexture(cv);
    tx.magFilter=tx.minFilter=THREE.NearestFilter;tx.colorSpace=THREE.SRGBColorSpace;const s={cv,c:cv.getContext('2d'),tx,mat:new THREE.MeshBasicMaterial({map:tx}),slot,x,y,next:0};adScreens.push(s);return s;}
  for(const[id,slot]of[[7,0],[216,2],[103,4]]){const p=plots[id];if(!p||p.sp!=='park')continue;const g=new THREE.Group();g.position.set(p.x0+.9,0,p.y0+.9);g.rotation.y=Math.PI/4;g.scale.setScalar(1.6);
    B(g,.1,1.5,.1,0x555555,-.6,0,0);B(g,.1,1.5,.1,0x555555,.6,0,0);B(g,2,1.1,.1,0x222222,0,1.4,-.06);
    const sc=adScreen(64,32,slot,p.x0+.7,p.y0+.7),m=new THREE.Mesh(new THREE.PlaneGeometry(1.84,.92),sc.mat);m.position.set(0,1.95,0);g.add(m);scene.add(g);
    for(let y=p.y0;y<=p.y0+1;y++)for(let x=p.x0;x<=p.x0+1;x++)walk[I(x,y)]=0;}
  {const p=plots[71];if(p&&p.rt==='tower'){const sc=adScreen(40,64,1,p.x+.0,p.y+.0),y=30*.36*.62;
    const a=new THREE.Mesh(new THREE.PlaneGeometry(2.1,3.4),sc.mat);a.position.set(p.x0+1.5,y,p.y0+2.72);scene.add(a);
    const b=new THREE.Mesh(new THREE.PlaneGeometry(2.1,3.4),sc.mat);b.position.set(p.x0+2.72,y,p.y0+1.5);b.rotation.y=Math.PI/2;scene.add(b);}}
  function updateAds(time){for(const s of adScreens){if(time<s.next||!near(s.x,s.y,zoom*3))continue;s.next=time+.1;
    drawAd(s.c,s.cv.width,s.cv.height,ADS[(Math.floor(time/AD_SEC)+s.slot)%ADS.length],time);s.tx.needsUpdate=true;}}
  for(const s of STOPS){const L=wlabel('🚌 '+s.name,s.x+.5,1.7,s.y-.5,'emp','#9fd3ff');L.zMax=mobile?9:13;}
  for(const p of plots)if(p.sp==='dk'||p.sp==='cinema'){const L=wlabel(p.sp==='dk'?'🎭 Дом культуры':'🎬 Кинотеатр «Мир»',p.x,2.6,p.y,'emp','#ffd166');L.zMax=mobile?11:15;}
  for(const p of plots)if(p.sp&&EMP[p.sp]){const e=EMP[p.sp];const L=wlabel(p.sp==='bc'?'Бизнес-центр':p.name||e.n,p.x,p.sp==='bc'?9.5:2.4,p.y,'emp','#ffe9a8');L.zMax=mobile?11:15;}

  // ================= КАМЕРА =================
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,800);
  const camT=new THREE.Vector3(135,0,91);let camA=Math.PI/4,camAT=camA,zoom=mobile?14:20,zoomT=zoom,camFly=null,PX=3;
  function updateCam(){const asp=innerWidth/innerHeight;cam.left=-zoom*asp;cam.right=zoom*asp;cam.top=zoom;cam.bottom=-zoom;cam.updateProjectionMatrix();
    const D=120;cam.position.set(camT.x+Math.sin(camA)*D,D*.95,camT.z+Math.cos(camA)*D);cam.lookAt(camT);
    const sx=Math.round(camT.x/2)*2,sz=Math.round(camT.z/2)*2;sun.position.set(sx-30,60,sz+20);sun.target.position.set(sx,0,sz);}
  // холст — ровно видимая область (на телефоне 100vh больше экрана → клики и подписи съезжали)
  function resize(){const w=innerWidth,h=innerHeight;canvas.style.width=w+'px';canvas.style.height=h+'px';
    const dpr=devicePixelRatio||1;PX=Math.max(1,Math.ceil(dpr/2),Math.round(Math.min(w,h*1.6)*dpr/810))/dpr;/* пиксель рендера = целое число пикселей экрана (без мыла), ~1.5× мельче прежнего */renderer.setSize(Math.ceil(w/PX),Math.ceil(h/PX),false);updateCam();}
  addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,200));if(window.visualViewport)visualViewport.addEventListener('resize',resize);resize();
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
    if(drag&&!drag.moved&&ptrs.size===0){onTap&&onTap(plotAtScreen(e.clientX,e.clientY),groundAt(e.clientX,e.clientY));}if(ptrs.size===0)drag=null;};
  canvas.addEventListener('pointerup',endPtr);canvas.addEventListener('pointercancel',endPtr);
  canvas.addEventListener('pointerleave',()=>{hoverF.visible=false;onHover&&onHover(null);});
  canvas.addEventListener('wheel',e=>{zoomT=Math.max(5,Math.min(40,zoomT*(e.deltaY>0?1.12:1/1.12)));e.preventDefault();},{passive:false});
  const keys={};addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;keys[e.code]=true;if(e.code==='KeyQ')camAT-=Math.PI/2;if(e.code==='KeyE')camAT+=Math.PI/2;});
  addEventListener('keyup',e=>keys[e.code]=false);
  let camBounds=null;
  const clampCam=()=>{const b=camBounds||{x0:0,y0:0,x1:W,y1:H};camT.x=Math.max(b.x0,Math.min(b.x1,camT.x));camT.z=Math.max(b.y0,Math.min(b.y1,camT.z));if(camBounds)zoomT=Math.min(zoomT,mobile?13:16);};
  // туман вокруг учебного острова: плоскость с дырой-эллипсом, рисуется поверх всего
  const fog=new THREE.Group();{const cx=(ISLAND.x0+ISLAND.x1)/2,cy=(ISLAND.y0+ISLAND.y1)/2,rx=(ISLAND.x1-ISLAND.x0)/2,ry=(ISLAND.y1-ISLAND.y0)/2;
    for(const[k,op]of[[1.25,.55],[1.5,.97]]){const sh=new THREE.Shape();sh.moveTo(-600,-600);sh.lineTo(600,-600);sh.lineTo(600,600);sh.lineTo(-600,600);sh.lineTo(-600,-600);
      const hole=new THREE.Path();hole.absellipse(0,0,rx*k,ry*k,0,Math.PI*2,true);sh.holes.push(hole);
      const m=new THREE.Mesh(new THREE.ShapeGeometry(sh,48),new THREE.MeshBasicMaterial({color:0xc9d3df,transparent:true,opacity:op,depthTest:false,depthWrite:false}));
      m.rotation.x=-Math.PI/2;m.position.set(cx,6,cy);m.renderOrder=999;fog.add(m);}
    fog.visible=false;scene.add(fog);}

  // ================= МИНИКАРТА =================
  const mmBase=new ImageData(W,H);let mmTmp=null;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){let c=tileColor(x,y);if(grid[I(x,y)]===T.FOREST)c=0x3f7a35;const k=(y*W+x)*4;mmBase.data[k]=c>>16&255;mmBase.data[k+1]=c>>8&255;mmBase.data[k+2]=c&255;mmBase.data[k+3]=255;}
  function drawMini(ctx,t){ctx.putImageData(mmBase,0,0);
    for(const p of plots){if(p.owner)ctx.fillStyle=p.color;else if(p.sp==='res')ctx.fillStyle='#e8e2d4';else if(p.sp==='bc')ctx.fillStyle='#5aa39b';else if(p.sp)ctx.fillStyle='#ffd166';else continue;ctx.fillRect(p.x0,p.y0,4,4);}
    for(const[,a]of avatars){ctx.fillStyle='#fff';ctx.fillRect(Math.round(a.x),Math.round(a.y),1,1);}
    if(me&&Math.floor(t*3)%2){ctx.fillStyle='#ffd166';ctx.fillRect(Math.round(me.x)-1,Math.round(me.y)-1,3,3);}
    const cs=[[0,0],[innerWidth,0],[innerWidth,innerHeight],[0,innerHeight]].map(([x,y])=>groundAt(x,y));
    if(cs.every(Boolean)){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=1;ctx.beginPath();cs.forEach((c,i)=>i?ctx.lineTo(c.x,c.z):ctx.moveTo(c.x,c.z));ctx.closePath();ctx.stroke();}}


  // игровое время: полные сутки за один реальный час, одинаково у всех
  let HOV=new URLSearchParams(location.search).get('hour');const gameHour=()=>HOV!=null?+HOV:((Date.now()/1000)%3600)/3600*24;
  const SKY_DAY=new THREE.Color(0x8fbfe0),SKY_NIGHT=new THREE.Color(0x0b1530),SKY_DUSK=new THREE.Color(0xf0a070),SUN_DAY=new THREE.Color(0xfff0d0),SUN_DUSK=new THREE.Color(0xff9a5a),SUN_NIGHT=new THREE.Color(0x6a7cc0),_c=new THREE.Color();
  function applyDayNight(){const h=gameHour(),d=Math.max(0,Math.sin((h-6)/12*Math.PI)),dusk=Math.max(0,1-Math.abs(h-6.5)/1.5)+Math.max(0,1-Math.abs(h-18.5)/1.5);
    const night=1-Math.min(1,d*2.5);
    _c.copy(SKY_NIGHT).lerp(SKY_DAY,Math.min(1,d*1.6)).lerp(SKY_DUSK,Math.min(.6,dusk*.6));scene.background.copy(_c);
    sun.intensity=.25+1.65*d;sun.color.copy(SUN_NIGHT).lerp(SUN_DAY,Math.min(1,d*2)).lerp(SUN_DUSK,Math.min(.7,dusk*.7));
    hemi.intensity=.42+.58*Math.min(1,d*1.5);
    const a=(h-6)/12*Math.PI,sx=Math.round(camT.x/2)*2,sz=Math.round(camT.z/2)*2;sun.position.set(sx-Math.cos(a)*45,15+Math.max(.2,Math.sin(a))*45,sz+20);
    for(const m of nightMats)m.emissiveIntensity=night*1.8;
    return{h,d,night};}
  // ================= КАДР =================
  let dayState={h:12,d:1,night:0};let vanT=2,resT=1,cargoT=3,fishT=1,cullT=0;const _v=new THREE.Vector3();
  function project(p,el){_v.copy(p).project(cam);if(_v.z>1||Math.abs(_v.x)>1.05||Math.abs(_v.y)>1.05){el.style.display='none';return;}el.style.display='';el.style.left=(_v.x+1)/2*innerWidth+'px';el.style.top=(1-_v.y)/2*innerHeight+'px';}
  const near=(x,y,r=zoom*2.5)=>Math.abs(x-camT.x)+Math.abs(y-camT.z)<r;
  for(const p of plots)if(VIG_N[p.sp]&&!(p.sp==='shop'&&hash(p.id,77)>.66))vigPlots.push(p);
  function frameUpdate(dt){
    time+=dt;
    if((cullT-=dt)<=0){cullT=.5;cullPlots();}
    for(let i=0;i<trees.length;i++){const t=trees[i];if(!t.alive){t.grow+=dt/50;if(t.grow>=1){t.alive=true;t.grow=1;}t._d=true;}else if(t.shake&&!t.reserved){t.shake=0;t._d=true;}if(t._d){setTree(i);t._d=false;}}
    for(const c of chunks.values())if(c.dirty){c.trunk.instanceMatrix.needsUpdate=c.pine.instanceMatrix.needsUpdate=c.leaf.instanceMatrix.needsUpdate=true;c.dirty=false;}
    for(const p of plotsX){for(const c of p.crops)if(c.g<1&&near(p.x,p.y)){c.g=Math.min(1,c.g+dt/(p.fast?4:p.sp?12:15));setCrop(c);}else if(p.sp&&c.g>=1&&Math.random()<dt*.05){c.g=0;setCrop(c);}
      if(p.group&&p.builtAt){const dur=({gather:3,retail:10,proc:15,service:30}[BLD[p.building]?.kind]||3)*60000,k=Math.min(1,1-(p.builtAt-Date.now())/dur);p.group.scale.y=Math.max(.02,k);if(k<1&&near(p.x,p.y)&&Math.random()<dt*6)puff(p.x0+rand(.5,2.5),.2,p.y0+rand(.5,2.5),0xc8b89a,1,.6,.5);
        if(k>=1&&p.wk.length!==p.workers)syncWorkers(p);}}
    for(const u of units){const vis=near(u.x,u.y);u.mesh.visible=vis;if(vis){updateWorker(u,dt);animPerson(u,time);}}
    for(const r of[...residents]){if(!near(r.x,r.y,zoom*3.5)){removeRes(r);continue;}updateResident(r,dt);animPerson(r,time);}
    for(const v of[...vehicles]){updateVehicle(v,dt);const onRoad=inb(Math.round(v.x),Math.round(v.y))&&drivable(I(Math.round(v.x),Math.round(v.y)));const sx=Math.sin(v.face),sz=Math.cos(v.face),k=onRoad?.22:0;v.mesh.position.set(v.x-sz*k,0,v.y+sx*k);v.mesh.rotation.y=v.face;}
    beacon.visible=dock.docked&&!!fog.visible;if(beacon.visible){beacon.rotation.y=time*2;beacon.position.y=3+Math.sin(time*3)*.25;}
    for(const s of[...ships]){updateShip(s,dt);s.mesh.position.set(s.x,0,s.y);s.mesh.rotation.y=s.face||0;s.mesh.position.y=Math.sin(time*2+s.x)*.04;}
    cranes.forEach((c,k)=>c.rotation.y=Math.sin(time*.4+k*2)*1.2);animExtras(dt,time);
    for(const q of birds){q.a+=q.s*dt;q.b.position.set(q.L.x+Math.cos(q.a)*q.L.rx*q.r,-.08,q.L.y+Math.sin(q.a)*q.L.ry*q.r);q.b.rotation.y=-q.a;}
    for(const f of fires)if(near(f[0],f[2])&&Math.random()<dt*f[3]*2)puff(f[0],f[1],f[2],f[3]>1?0xff8c1a:0xcfcfcf,1,.6,.08);
    if((vanT-=dt)<=0){vanT=rand(3,6);if(vehicles.filter(v=>v.kind==='van').length<8)spawnVan();}
    if((resT-=dt)<=0){resT=rand(.3,.7);if(residents.length<(mobile?35:60)*(dayState.night>.5?.3:1))spawnResident();}
    if((cargoT-=dt)<=0){cargoT=rand(35,60);if(ships.filter(s=>s.kind==='cargo').length<3)spawnCargo();}
    if((fishT-=dt)<=0){fishT=rand(6,12);if(ships.filter(s=>s.kind==='fishing').length<6)spawnFishing();}
    if(me){if(stepMove(me,dt)&&busPlan&&!me.riding){const bp=busPlan;me.riding=true;float('🚌',me.x,1.6,me.y,'#ffd166');
        worldApi.busRide(bp.a,bp.b,()=>{me.riding=false;busPlan=null;me.path=pathTo(me,bp.tx,bp.ty);});}
      animPerson(me,time);me.label.p.set(me.x,1.2,me.y);}
    for(const[,a]of avatars){const dx=a.tx-a.x,dy=a.ty-a.y,d=Math.hypot(dx,dy);a.moving=d>.05;if(d>12){a.x=a.tx;a.y=a.ty;}else if(a.moving){const s=Math.min(d,3.2*dt);a.x+=dx/d*s;a.y+=dy/d*s;a.face=Math.atan2(dx,dy);}
      animPerson(a,time);a.label.p.set(a.x,1.2,a.y);}
    updateVignettes(time,dt);updateAds(time);updateLights(time);updateCars(dt);updateStopMarks(time);updateCrows(time,dt);
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
    clampCam();updateCam();dayState=applyDayNight();
    renderer.render(scene,cam);
    for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.t+=dt;f.p.y+=dt*.7;project(f.p,f.el);f.el.style.opacity=1-f.t/1.6;if(f.t>1.6){f.el.remove();floats.splice(i,1);}}
    for(const L of wlabels){if(L.zMax&&zoom>L.zMax){L.el.style.display='none';continue;}project(L.p,L.el);}
    for(let i=bubbles.length-1;i>=0;i--){const b=bubbles[i],a=b.a;b.t-=dt;
      if(b.t<=0||!a.mesh.parent||(a!==me&&![...avatars.values()].includes(a))){b.el.remove();bubbles.splice(i,1);continue;}
      if(zoom>20||!a.mesh.visible){b.el.style.display='none';continue;}b.p.set(a.x,1.2,a.y);project(b.p,b.el);b.el.style.opacity=Math.min(1,b.t/.6);}
  }

  return worldApi={setYachts,setTower,setExport,renderer,scene,cam,plots,layoutUnits,plotAt,frameUpdate,setPlotState,spawnTruck,flyTo,drawMini,float,say,
    get camT(){return camT;},get zoom(){return zoom;},set onTap(f){onTap=f;},set onHover(f){onHover=f;},
    select(p){if(p){selF.visible=true;selF.position.set(p.x,0,p.y);}else selF.visible=false;},
    set arrow(p){arrowTarget=p;},
    setMe,goMe,get me(){return me;},setOther,removeOther,avatars,
    jump(x,z){camFly=null;camT.set(x,0,z);clampCam();updateCam();},STOPS,
    // автобус по дорогам от остановки до остановки; игрок внутри, камера следует
    busPath(a,b){const A=STOPS[a],Bs=STOPS[b];if(!A||!Bs)return null;
      const road=(x,y)=>{const t=grid[I(x,y)];return t===T.ROAD||t===T.ASPH||t===T.RING||t===T.BRIDGE;};
      const prv=new Int32Array(W*H).fill(-2),q=[I(A.x,A.y)];prv[q[0]]=-1;let h=0,found=false;const goal=I(Bs.x,Bs.y);
      while(h<q.length){const c=q[h++];if(c===goal){found=true;break;}const cx=c%W,cy=(c/W)|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy;if(!inb(nx,ny))continue;const n=I(nx,ny);if(prv[n]!==-2||!road(nx,ny))continue;prv[n]=c;q.push(n);}}
      if(!found)return null;const path=[];let k=goal;while(k!==-1){path.push([k%W,(k/W)|0]);k=prv[k];}return path.reverse();},
    busRide(a,b,onDone){const A=STOPS[a],Bs=STOPS[b];if(!A||!Bs||!me)return onDone&&onDone();
      // нет дороги — по суше пешеходным маршрутом, но никогда не по воде
      let path=worldApi.busPath(a,b)||(()=>{const w=bfs(A.x,A.y,(x,y)=>x===Bs.x&&y===Bs.y);return w.length?[[A.x,A.y],...w]:null;})();
      if(!path){me.x=Bs.x;me.y=Bs.y;return onDone&&onDone();}
      const bus=new THREE.Group();B(bus,.5,.45,1.5,0xf1c40f,0,.1,0);B(bus,.52,.16,1.3,0x9fd3ff,0,.36,0,true);B(bus,.52,.04,1.52,0xffffff,0,.55,0);B(bus,.4,.08,.02,0xffd166,0,.2,.76,true);
      wheel(bus,-.24,.5);wheel(bus,.24,.5);wheel(bus,-.24,-.5);wheel(bus,.24,-.5);shadow(bus);scene.add(bus);
      me.mesh.visible=false;if(me.label)me.label.el.style.display='none';me.path=[];
      const sp=Math.max(18,path.length/7);let i=0,x=path[0][0],y=path[0][1],last=performance.now();
      const step=()=>{const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;let mv=sp*dt;
        while(mv>0&&i<path.length-1){const[tx,ty]=path[i+1],dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);if(d<=mv){x=tx;y=ty;i++;mv-=d;}else{x+=dx/d*mv;y+=dy/d*mv;mv=0;bus.rotation.y=Math.atan2(dx,dy);}}
        bus.position.set(x,0,y);camFly=null;camT.x+=(x-camT.x)*.15;camT.z+=(y-camT.z)*.15;updateCam();
        if(i<path.length-1)requestAnimationFrame(step);
        else{scene.remove(bus);me.x=Bs.x;me.y=Bs.y;me.path=[];me.moving=false;me.mesh.visible=true;if(me.label)me.label.el.style.display='';onDone&&onDone();}};
      requestAnimationFrame(step);},
    teleport(x,y){if(!me)return;me.x=x;me.y=y;me.path=[];me.moving=false;camFly=null;camT.set(x,0,y);clampCam();updateCam();},
    // карта автобусов: v={s:масштаб,cx,cy:центр в клетках,px:пикселей канваса на CSS-пиксель}
    busMap(cv,hi,v={s:1,cx:W/2,cy:H/2,px:1}){const c=cv.getContext('2d'),k=cv.width/W*v.s,ox=v.cx-cv.width/2/k,oy=v.cy-cv.height/2/k,X=x=>(x-ox)*k,Y=y=>(y-oy)*k,u=v.px;
      if(!mmTmp){mmTmp=document.createElement('canvas');mmTmp.width=W;mmTmp.height=H;mmTmp.getContext('2d').putImageData(mmBase,0,0);}
      c.imageSmoothingEnabled=false;c.fillStyle='#14101c';c.fillRect(0,0,cv.width,cv.height);c.drawImage(mmTmp,ox,oy,cv.width/k,cv.height/k,0,0,cv.width,cv.height);
      c.fillStyle='rgba(10,8,16,.2)';c.fillRect(0,0,cv.width,cv.height);
      if(me){c.fillStyle='#ffd166';c.strokeStyle='#0e0b14';c.lineWidth=2*u;c.beginPath();c.arc(X(me.x),Y(me.y),5*u,0,7);c.fill();c.stroke();}
      c.font=`bold ${Math.round(12*u)}px sans-serif`;c.textAlign='center';c.lineJoin='round';
      STOPS.forEach((s,i)=>{const x=X(s.x),y=Y(s.y);if(x<-40||y<-40||x>cv.width+40||y>cv.height+40)return;
        c.fillStyle=i===hi?'#ffd166':'#2e86ab';c.strokeStyle='#fff';c.lineWidth=2*u;c.beginPath();c.arc(x,y,(i===hi?8:6)*u,0,7);c.fill();c.stroke();
        if(v.s<1.7&&s.reg==='c'&&s.name!=='Центр'&&i!==hi)return;   // издалека городские подписи слипаются
        c.lineWidth=3*u;c.strokeStyle='#0e0b14';c.strokeText(s.name,x,y-10*u);c.fillStyle='#fff';c.fillText(s.name,x,y-10*u);});},
    marketTile:()=>marketTiles[6],resize,W,H,POIS,makeAvatar,gameHour,ISLAND,
    // съёмочный режим: камера и время суток задаются сценарием
    setCam(x,z,zm,a){camFly=null;camBounds=null;camT.set(x,0,z);if(zm){zoom=zoomT=zm;}if(a!=null)camA=camAT=a;updateCam();},setHour(h){HOV=h;},get vehicles(){return vehicles;},
    tutPlotState(st){if(tutPlot.mat)dematerialize(tutPlot);Object.assign(tutPlot,st);tutFence.visible=!tutPlot.owner;if(tutPlot.building)blockFoot(tutPlot);if(tutPlot.owner)materialize(tutPlot);},
    setFog(on){fog.visible=!!on;camBounds=on?{x0:ISLAND.x0-2,y0:ISLAND.y0-2,x1:ISLAND.x1+2,y1:ISLAND.y1+2}:null;clampCam();},
    tutReset(){if(tutPlot.mat)dematerialize(tutPlot);tutFence.visible=true;tutPlot.owner=null;tutPlot.building=null;tutPlot.workers=0;},
    FERRY,ferry(to,onDone){fog.visible=false;camBounds=null;const boat=dock;dock.docked=false;boat.speed=6;boat.wp=[[FERRY.x,FERRY.y-10],[to.x,to.y+10],[to.x,to.y+2]];if(me)me.mesh.visible=false;const f=()=>{camFly=null;camT.x+=(boat.x-camT.x)*.1;camT.z+=(boat.y-camT.z)*.1;
        if(boat.wp&&boat.wp.length)requestAnimationFrame(f);else{scene.remove(boat.mesh);ships.splice(ships.indexOf(boat),1);if(me)me.mesh.visible=true;onDone&&onDone();}};f();},walkable:(x,y)=>inb(x,y)&&walk[I(x,y)]===1};
}
