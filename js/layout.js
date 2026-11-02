// Детерминированная раскладка мира: районы, участки, дома, квартиры, офисы.
// Используется и клиентом, и генератором SQL — id участков совпадают.
import {RES,BCT,EMP} from './config.js';

export function hash(x,y){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}

export const W=210,H=170,STEP=5,HY=65;
export const BLOCKS=[
  {reg:'c',name:'ГОРОД',x:60,y:30,cols:16,rows:14},
  {reg:'v',name:'Д. СОСНОВКА',x:18,y:45,cols:5,rows:6},
  {reg:'d',name:'СНТ «РОМАШКА»',x:14,y:112,cols:6,rows:3},
  {reg:'p',name:'ПРОМЗОНА',x:155,y:40,cols:4,rows:6},
  {reg:'o',name:'ПОРТ',x:120,y:115,cols:6,rows:3},
];
export const RING={x0:57,y0:27,x1:143,y1:103};
const SPECIAL={'c,0,7':'market','c,5,8':'pvzCity','v,4,5':'kolkhoz','v,0,0':'lesxoz','p,0,0':'zbi','p,1,1':'furnFactory','p,2,5':'sortCenter','o,0,0':'port'};
const FLOORS={khrush:5,panel9:9,panel16:16,novostroy:25,tower:42,bc:30};

export function buildLayout(){
  const plots=[];
  for(const b of BLOCKS)for(let j=0;j<b.rows;j++)for(let i=0;i<b.cols;i++){
    const x0=b.x+1+STEP*i,y0=b.y+1+STEP*j,reg=b.reg;
    let sp=SPECIAL[`${reg},${i},${j}`]||null,rt=null,price=0;
    if(reg==='c'){
      const d=Math.hypot(i-7.5,j-6.5),h=hash(i*7+3,j*13+5);
      if(!sp){
        if(d<2.3){if(h<.42)rt='tower';else if(h<.72)sp='bc';}
        else if(d<4.6){if(h<.38)rt='novostroy';else if(h<.48)sp='bc';else if(h<.6)rt='panel16';}
        else if(d<7){if(h<.25)rt='panel16';else if(h<.5)rt='panel9';}
        else{if(h<.3)rt='khrush';else if(h<.48)rt='panel9';}
        if(rt)sp='res';
      }
      price=Math.max(400,Math.round((1150-d*85)/10)*10);
    }else if(reg==='v')price=i===0?150:170;
    else if(reg==='d')price=110+(j===2?20:0);
    else if(reg==='p')price=380;
    else price=450;
    plots.push({id:plots.length,reg,i,j,x0,y0,x:x0+1.5,y:y0+1.5,sp,rt,price,demand:0});
  }
  // спрос на услуги: жители окрестных домов (этажность / расстояние)
  const dens=plots.filter(p=>p.sp==='res'||p.sp==='bc');
  for(const p of plots){if(p.reg!=='c')continue;let s=0;
    for(const q of dens){const d=Math.hypot(p.x-q.x,p.y-q.y);s+=(FLOORS[q.rt||'bc'])/(1+(d/9)**2);}
    p.demand=Math.min(40,Math.round(s/6*10)/10);}
  // квартиры и офисы
  const units=[];let uid=10000;
  for(const p of plots){
    if(p.sp==='res'){const r=RES[p.rt];for(let k=0;k<r.units;k++){const floor=Math.max(1,Math.round((k+1)/r.units*r.floors));units.push({id:uid++,plot:p.id,kind:'apt',tier:p.rt,floor,price:r.price+r.step*floor});}}
    if(p.sp==='bc'){for(let k=0;k<BCT.units;k++){const floor=Math.max(1,Math.round((k+1)/BCT.units*BCT.floors));units.push({id:uid++,plot:p.id,kind:'office',tier:'bc',floor,price:BCT.price+BCT.step*floor,demand:Math.min(40,p.demand*1.3+8)});}}
  }
  return {plots,units};
}
export const isEmployer=sp=>!!(sp&&EMP[sp]);
