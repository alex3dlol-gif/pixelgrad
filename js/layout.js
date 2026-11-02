// Детерминированная раскладка мира: районы, участки, дома, квартиры, офисы, природа и места для заданий.
// Используется и клиентом, и генератором SQL — id участков совпадают.
import {RES,BCT,EMP} from './config.js';

export function hash(x,y){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}

// карта стала больше: вокруг города — бор, озёра, горы, побережье
export const OX=35,OY=25;
export const W=400,H=320,STEP=5,HY=65+OY;
export const BLOCKS=[
  {reg:'c',name:'ГОРОД',x:60+OX,y:30+OY,cols:16,rows:14},
  {reg:'v',name:'Д. СОСНОВКА',x:18+OX,y:45+OY,cols:5,rows:6},
  {reg:'d',name:'СНТ «РОМАШКА»',x:14+OX,y:112+OY,cols:6,rows:3},
  {reg:'p',name:'ПРОМЗОНА',x:155+OX,y:40+OY,cols:4,rows:6},
  {reg:'o',name:'ПОРТ',x:120+OX,y:115+OY,cols:6,rows:3},
  // загородные посёлки (добавлены под 1000 игроков; id старых участков не меняются)
  {reg:'v',name:'Д. ЗАРЕЧЬЕ',x:52,y:12,cols:5,rows:6,link:HY},
  {reg:'v',name:'Д. ЛЕСНОЕ',x:2,y:105,cols:7,rows:6,link:HY},
  {reg:'d',name:'СНТ «ЮЖНОЕ»',x:5,y:200,cols:18,rows:5,link:HY},
  {reg:'v',name:'С. КЛЮЧИ',x:20,y:245,cols:14,rows:6,link:225},
  {reg:'d',name:'СНТ «ГРИБНОЕ»',x:5,y:282,cols:22,rows:6,link:275},
  {reg:'p',name:'ПРОМЗОНА «СЕВЕРНАЯ»',x:200,y:5,cols:10,rows:5,link:HY},
  {reg:'d',name:'СНТ «ОЗЁРКИ»',x:320,y:10,cols:12,rows:8,link:HY},
  {reg:'p',name:'ПРОМЗОНА «ВОСТОЧНАЯ»',x:262,y:55,cols:12,rows:6,link:HY},
  {reg:'d',name:'СНТ «СОСНОВЫЙ БОР»',x:262,y:110,cols:12,rows:8,link:HY},
  {reg:'p',name:'ПРОМПАРК «ДАЛЬНИЙ»',x:310,y:170,cols:14,rows:10,link:150},
  {reg:'v',name:'С. ЛУГОВОЕ',x:330,y:240,cols:12,rows:12,link:220},
];
export const RING={x0:57+OX,y0:27+OY,x1:143+OX,y1:103+OY};
const SPECIAL={'c,9,7':'cityhall','c,0,7':'market','c,5,8':'pvzCity','v,4,5':'kolkhoz','v,0,0':'lesxoz','p,0,0':'zbi','p,1,1':'furnFactory','p,2,5':'sortCenter','o,0,0':'port'};
const CBD_FIXED={'6,4':'bc','9,4':'bc','6,8':'bc','9,9':'bc','8,5':'bc','6,9':'bc','7,4':'tower','9,5':'tower','6,6':'tower','8,9':'tower','7,8':'park','8,8':'park'};
const FLOORS={khrush:5,panel9:9,panel16:16,novostroy:25,tower:30,bc:30};
export const SHOP_NAMES=['Продукты 24','Аптека','Цветы','Хозтовары','Гастроном «Ромашка»','Минимаркет','Овощи-фрукты','Шаверма-бар','Ремонт обуви','Зоомагазин'];

// районы города (i — колонка 0..15, j — ряд 0..13)
export const DISTRICTS={cbd:'Деловой центр',novo:'ЖК «Горизонт»',sleep:'Спальный район',old:'Старый город',trade:'Торговый квартал',mid:'Бульвары'};
export function zoneOf(i,j){
  if(i>=6&&i<=9&&j>=4&&j<=9)return'cbd';
  if(i>=10&&j<=5)return'novo';
  if(i>=10)return'sleep';
  if(i<=5&&j>=9)return'old';
  if(i<=5)return'trade';
  return'mid';
}
const ZONE_MIX={
  cbd:[['park',.35],['parking',.1]],
  novo:[['novostroy',.28],['yard',.24],['park',.16],['parking',.05]],
  sleep:[['panel16',.13],['panel9',.17],['yard',.24],['park',.13],['shop',.03],['parking',.06]],
  old:[['khrush',.26],['park',.2],['yard',.12],['shop',.04]],
  trade:[['shop',.07],['parking',.1],['park',.12]],
  mid:[['park',.32],['parking',.08]],
};

// озёра и природа (используются миром)
export const LAKES=[{x:22,y:58,rx:11,ry:7,name:'БЕЛОЕ ОЗЕРО'},{x:69,y:167,rx:21,ry:7,name:'ОЗЕРО'},{x:240,y:42,rx:14,ry:8,name:'ЛЕБЕДИНОЕ ОЗЕРО'},
  {x:385,y:150,rx:10,ry:14,name:'ТИХОЕ ОЗЕРО'},{x:115,y:225,rx:9,ry:6,name:'КРУГЛОЕ ОЗЕРО'}];

// места для локальных заданий
export const POIS={
  mush:{n:'Грибная поляна',ic:'🍄',x:20,y:96},
  pier:{n:'Мостки на Белом озере',ic:'🎣',x:34,y:58},
  forester:{n:'Дом лесника',ic:'🪓',x:12,y:78},
  camp:{n:'Лагерь «Солнышко»',ic:'🏕',x:110,y:205},
  spring:{n:'Родник',ic:'⛲',x:40,y:30},
  lighthouse:{n:'Маяк',ic:'🗼',x:226,y:157},
  lookout:{n:'Смотровая вышка',ic:'🔭',x:135,y:6},
  fire:{n:'Костёр у Лебединого',ic:'🔥',x:224,y:42},
};

export function buildLayout(){
  const plots=[];
  for(const b of BLOCKS)for(let j=0;j<b.rows;j++)for(let i=0;i<b.cols;i++){
    const x0=b.x+1+STEP*i,y0=b.y+1+STEP*j,reg=b.reg;
    let sp=SPECIAL[`${reg},${i},${j}`]||null,rt=null,price=0,zone=null;
    if(reg==='c'){
      const d=Math.hypot(i-7.5,j-6.5),h=hash(i*7+3,j*13+5);zone=zoneOf(i,j);
      if(!sp&&(i===7||i===8)&&(j===6||j===7))sp='park'; // центральный парк
      const fix=CBD_FIXED[i+','+j];if(!sp&&fix){if(fix==='tower'){rt='tower';sp='res';}else sp=fix;}
      if(!sp&&(i===7||i===8)&&(j===0||j===13))sp='park'; // бульвар на въездах
      if(!sp){let a=0,k=null;for(const[t,w]of ZONE_MIX[zone]){a+=w;if(h<a){k=t;break;}}
        if(k&&RES[k]){rt=k;sp='res';}else sp=k;}
      price=Math.max(400,Math.round((1150-d*85)/10)*10);
    }else if(reg==='v')price=b.link?140:(i===0?150:170);
    else if(reg==='d')price=b.link?100:110+(j===2?20:0);
    else if(reg==='p')price=b.link?260:380;
    else price=450;
    plots.push({id:plots.length,reg,i,j,x0,y0,x:x0+1.5,y:y0+1.5,sp,rt,price,demand:0,zone,name:sp==='shop'?SHOP_NAMES[Math.floor(hash(i,j+99)*SHOP_NAMES.length)]:null});
  }
  const dens=plots.filter(p=>p.sp==='res'||p.sp==='bc');
  for(const p of plots){if(p.reg!=='c')continue;let s=0;
    for(const q of dens){const d=Math.hypot(p.x-q.x,p.y-q.y);s+=(FLOORS[q.rt||'bc'])/(1+(d/9)**2);}
    p.demand=Math.min(40,Math.round(s/4*10)/10);}
  const units=[];let uid=10000;
  for(const p of plots){
    if(p.sp==='res'){const r=RES[p.rt];for(let k=0;k<r.units;k++){const floor=Math.max(1,Math.round((k+1)/r.units*r.floors));units.push({id:uid++,plot:p.id,kind:'apt',tier:p.rt,floor,price:r.price+r.step*floor});}}
    if(p.sp==='bc'){for(let k=0;k<BCT.units;k++){const floor=Math.max(1,Math.round((k+1)/BCT.units*BCT.floors));units.push({id:uid++,plot:p.id,kind:'office',tier:'bc',floor,price:BCT.price+BCT.step*floor,demand:Math.min(40,p.demand*1.3+8)});}}
  }
  // двор для задания «найти кота» — первый двор старого города
  const cat=plots.find(p=>p.zone==='old'&&p.sp==='yard')||plots.find(p=>p.sp==='yard');
  POIS.cat={n:'Двор у хрущёвок',ic:'🐱',x:cat.x0+1,y:cat.y0+3};
  const kol=plots.find(p=>p.sp==='kolkhoz');POIS.harvest={n:'Колхозное поле',ic:'🌾',x:kol.x0+1,y:kol.y0+3};
  return {plots,units};
}
export const isEmployer=sp=>!!(sp&&EMP[sp]);
