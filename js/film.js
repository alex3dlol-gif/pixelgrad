// Съёмочный режим для рекламных роликов: ?offline&film=1|2|3
// Камера, персонажи и подписи идут по сценарию; время задаёт рендер-скрипт (window.__step), поэтому кадры ровные.
import {hash} from './layout.js';
export function run({world,room,CLUBS,setMode,$}){
  const N=+new URLSearchParams(location.search).get('film')||1;
  document.body.classList.add('film');
  const css=document.createElement('style');css.textContent=`
    body.film #top,body.film #fabs,body.film #sheet,body.film #coach,body.film #cchat,body.film #mmbox,body.film #ticker,body.film #auth,body.film #roomui,
    body.film #chat,body.film #toast,body.film #err,body.film #tip{display:none!important}
    body.film .wlab.big,body.film .wlab.emp,body.film .wlab.poi{display:none!important}
    #filmov{position:fixed;inset:0;z-index:50;pointer-events:none;font-family:'Arial Black','Segoe UI',sans-serif}
    #fhead{position:absolute;left:0;right:0;top:112px;text-align:center;font:20px 'Press Start 2P',monospace;color:#ffd166;line-height:1.6;
      text-shadow:3px 3px 0 #0e0b14,-2px -2px 0 #0e0b14,2px -2px 0 #0e0b14,-2px 2px 0 #0e0b14}
    #fcap{position:absolute;left:24px;right:24px;top:200px;text-align:center;font-size:38px;line-height:1.08;color:#fff;font-weight:900;letter-spacing:-.5px;
      text-shadow:0 4px 0 #0e0b14,3px 3px 0 #0e0b14,-3px -3px 0 #0e0b14,3px -3px 0 #0e0b14,-3px 3px 0 #0e0b14,0 0 24px rgba(0,0,0,.6)}
    #fcap b{color:#ffd166}
    #fflash{position:absolute;inset:0;background:#fff;opacity:0}
    #fend{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(46,34,70,.9),rgba(10,8,16,.97));opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
    #fend .lg{font:30px 'Press Start 2P',monospace;color:#ffd166;text-shadow:4px 4px 0 #c0392b,8px 8px 0 #0e0b14}
    #fend .t1{font-size:30px;color:#fff;font-weight:900;text-align:center;line-height:1.15}
    #fend .t2{font:13px 'Press Start 2P',monospace;color:#0e0b14;background:#ffd166;padding:12px 16px;border-radius:6px}
    #fhook{position:absolute;left:20px;right:20px;top:300px;text-align:center;font-size:50px;line-height:1.05;color:#fff;font-weight:900;opacity:0;
      text-shadow:0 5px 0 #0e0b14,4px 4px 0 #0e0b14,-4px -4px 0 #0e0b14,4px -4px 0 #0e0b14,-4px 4px 0 #0e0b14}
    #fhook b{color:#ffd166}`;
  document.head.appendChild(css);
  const ov=document.createElement('div');ov.id='filmov';ov.innerHTML=`<div id="fhead">В ЭТОЙ ИГРЕ<br>ТЫ МОЖЕШЬ</div><div id="fcap"></div><div id="fhook"></div><div id="fflash"></div>
    <div id="fend"><div class="lg">ПИКСЕЛЬГРАД</div><div class="t1">Онлайн-город,<br>где всё решают игроки</div><div class="t2">ИГРАЙ БЕСПЛАТНО</div><div class="t1" style="font-size:22px;opacity:.85">ссылка в профиле 👆</div></div>`;
  document.body.appendChild(ov);
  const head=ov.querySelector('#fhead'),cap=ov.querySelector('#fcap'),hook=ov.querySelector('#fhook'),flash=ov.querySelector('#fflash'),end=ov.querySelector('#fend');

  // ===== помощники =====
  const P=world.plots,ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2,lerp=(a,b,t)=>a+(b-a)*t;
  const look=(o={})=>({g:'m',skin:1,hair:'short',hc:'#3b2a1a',tk:'hoodie',top:'#ff8c1a',bk:'jeans',bottom:'#2c3e50',sk:'sneakers',shoes:'#ffffff',...o});
  const ME=look({tk:'hoodie',top:'#ffd166',hair:'curly',hc:'#1a1410',acc:'chain'});
  const LOOKS=[look({g:'f',hair:'long',hc:'#e6c27a',tk:'jacket',top:'#ff8fab',bk:'skirt',bottom:'#222222'}),look({hair:'mohawk',hc:'#c0392b',tk:'track',top:'#2e7d32',bk:'track',bottom:'#2e7d32'}),
    look({g:'f',hair:'bob',hc:'#1a1410',tk:'sweater',top:'#8e44ad',glasses:'round'}),look({hair:'bald',beard:'beard',tk:'shirt',top:'#ecf0f1',bottom:'#5d4037',build:'strong'}),
    look({g:'f',hair:'braids',hc:'#a0522d',tk:'tee',top:'#3d6ea6',bk:'shorts'}),look({hair:'side',tk:'jacket',top:'#222222',glasses:'sun',acc:'backpack'})];
  const NICKS=['Ксюша','Dimon','Лёха_47','Мариша','Бро','Санёк'];
  const plotBy=(fn)=>P.find(fn);
  const center=p=>({x:p.x0+1.5,y:p.y0+1.5});
  const near=(x,y,fn)=>P.filter(fn).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
  const pvz=near(60,72,p=>p.sp==='pvzCity'&&p.reg==='v'),alko=near(60,72,p=>p.sp==='alko'&&Math.floor(hash(p.id,77)*3)===0)||near(60,72,p=>p.sp==='alko'),dk=near(60,72,p=>p.sp==='dk');
  const farm=near(62,85,p=>p.reg==='v'&&!p.sp),farm2=near(70,85,p=>p.reg==='v'&&!p.sp&&p!==farm);
  const cityBiz=near(118,88,p=>p.reg==='c'&&!p.sp),cityBiz2=near(108,80,p=>p.reg==='c'&&!p.sp&&p!==cityBiz);
  const tower=P[71],bc=P[70],market=plotBy(p=>p.sp==='market');
  const S=world.STOPS,stopC=S.findIndex(s=>s.name==='Центр'),stopV=S.findIndex(s=>s.reg==='v');
  let others=[];
  function crowd(cx,cy,n,talk){others.forEach(id=>world.removeOther(id));others=[];
    for(let k=0;k<n;k++){const id='f'+k,a=k/n*6.28;world.setOther(id,{x:cx+Math.cos(a)*1.6,y:cy+Math.sin(a)*1.2,nick:NICKS[k%NICKS.length],color:['#ff8fab','#7bd389','#9fd3ff','#ffd166','#c3b1e1','#ff7f11'][k%6],look:LOOKS[k%LOOKS.length]});others.push(id);}}
  function clearCrowd(){others.forEach(id=>world.removeOther(id));others=[];}
  function own(p,b,lv=2,w=3){world.setPlotState(p.id,{owner:'film',nick:'Ты',color:'#ffd166',building:b,workers:w,builtAt:0,level:lv});}
  function meAt(x,y,working=false,face=0){world.setMe('Ты','#ffd166',Math.round(x),Math.round(y),null,ME);const m=world.me;m.working=working;m.face=face;m.hold=true;}
  function toCity(){if(room.state)room.close();setMode('city');}
  function inRoom(o,people){setMode('room');room.open({...o,editable:false,owned:{},elsewhere:{},makeAvatar:world.makeAvatar,meId:'me',onSave:()=>{},onMove:()=>{}});
    room.setPeople(people);}
  const ppl=n=>[{uid:'me',nick:'Ты',color:'#ffd166',look:ME},...Array.from({length:n},(_,k)=>({uid:'p'+k,nick:NICKS[k],color:['#ff8fab','#7bd389','#9fd3ff','#c3b1e1','#ff7f11'][k%5],look:LOOKS[k]}))];
  const APT={size:[7,6],tier:'novostroy',layout:[{i:'rug',x:2,y:2},{i:'sofa',x:2,y:1,r:0},{i:'table',x:3,y:3},{i:'bed',x:5,y:0},{i:'wardrobe',x:0,y:0},{i:'shelf',x:1,y:0},{i:'plant',x:6,y:5},{i:'lamp',x:0,y:5},{i:'aquarium',x:4,y:0},{i:'chair',x:2,y:4},{i:'chair',x:4,y:4}]};

  // кадр: {d:длительность, cap:подпись, hour, on(): подготовка, cam(t 0..1): камера}
  const cam=(x0,y0,z0,a0,x1,y1,z1,a1)=>t=>{const e=ease(t);world.setCam(lerp(x0,x1,e),lerp(y0,y1,e),lerp(z0,z1,e),lerp(a0,a1,e));};
  const Q=Math.PI/4;
  const SH={
    hook:(hour,txt)=>({d:1.7,hook:txt,hour,on(){toCity();clearCrowd();},cam:cam(tower.x-14,tower.y+10,26,Q-.5,tower.x+2,tower.y-2,13,Q+.25)}),
    pvz:()=>({d:1.7,cap:'работать<br>в <b>ПВЗ</b>',hour:11,on(){toCity();meAt(pvz.x0+1,pvz.y0+3,true,Math.PI);},cam:cam(pvz.x+1,pvz.y+2,5.5,Q+.3,pvz.x+.5,pvz.y+1.5,4.2,Q)}),
    fight:()=>({d:1.6,cap:'смотреть на разборки<br>у <b>«Градуса»</b>',hour:18,on(){toCity();},cam:cam(alko.x0+3.4,alko.y0+3.6,3.6,Q-.25,alko.x0+3,alko.y0+3.3,2.8,Q+.15)}),
    farm:()=>({d:1.9,cap:'купить землю<br>и построить <b>ферму</b>',hour:9,on(){toCity();own(farm,'farm',3,3);own(farm2,'orchard',2,2);meAt(farm.x0+1,farm.y0+4);},cam:cam(farm.x+6,farm.y+6,9,Q-.6,farm.x+1,farm.y+1,5.5,Q)}),
    truck:()=>({d:1.8,cap:'возить урожай<br><b>грузовиками</b>',hour:10,on(){toCity();own(farm,'farm',3,3);world.spawnTruck(farm.id,'wheat','#ffd166');for(let k=0;k<25;k++)world.frameUpdate(.04);},step:t=>{const v=world.vehicles[world.vehicles.length-1];if(v)world.setCam(v.x,v.y,lerp(4.5,6,t),Q+t*.4);},cam:null}),
    bus:()=>({d:2.2,cap:'гонять на <b>автобусе</b><br>по всему городу',hour:17,on(){toCity();meAt(S[stopC].x,S[stopC].y);world.busRide(stopC,S.findIndex(s=>s.name==='Деловой квартал'),()=>{});},cam:null}),
    cinema:()=>({d:2,cap:'ходить в <b>кино</b><br>с друзьями',on(){inRoom({...CLUBS.cinema,title:''},ppl(4));const st=room.state;let k=0;for(const[,p]of st.people){if(k++>3)break;}},cam:null}),
    dk:()=>({d:2,cap:'тусить в<br><b>Доме культуры</b>',on(){inRoom({...CLUBS.dk,title:''},ppl(5));room.say('p0','го танцевать 🕺');},cam:null}),
    apt:()=>({d:2,cap:'обставить <b>квартиру</b><br>своей мечты',on(){inRoom({...APT,title:''},ppl(2));room.say('p1','уютно у тебя 😍');},cam:null}),
    boss:()=>({d:1.8,cap:'стать <b>хозяином</b><br>всего города',hour:21,on(){toCity();},cam:cam(tower.x,tower.y,7,Q,tower.x-10,tower.y-6,40,Q+.6)}),
    biz:()=>({d:1.9,cap:'открыть <b>кафе</b><br>в центре',hour:13,on(){toCity();own(cityBiz,'cafe',3,3);own(cityBiz2,'shawarma',2,2);meAt(cityBiz.x0+1,cityBiz.y0+3);},cam:cam(cityBiz.x+5,cityBiz.y+5,8,Q+.5,cityBiz.x+1,cityBiz.y+1,5,Q)}),
    hire:()=>({d:1.7,cap:'<b>нанимать</b><br>работников',hour:10,on(){toCity();own(farm,'farm',3,1);},step:t=>{world.setPlotState(farm.id,{owner:'film',nick:'Ты',color:'#ffd166',building:'farm',workers:1+Math.min(2,Math.floor(t*3)),builtAt:0,level:3});},cam:cam(farm.x+2,farm.y+2,5,Q,farm.x+1,farm.y+1,4.4,Q+.2)}),
    upgrade:()=>({d:2,cap:'прокачать бизнес<br>до <b>5 уровня</b>',hour:12,on(){toCity();own(cityBiz,'cafe',1,3);},step:t=>{const lv=1+Math.min(4,Math.floor(t*5.5));if(lv!==this_lv){this_lv=lv;world.setPlotState(cityBiz.id,{owner:'film',nick:'Ты',color:'#ffd166',building:'cafe',workers:3,builtAt:0,level:lv});world.float('⬆ '+lv+' ур.',cityBiz.x,2.2,cityBiz.y,'#ffd166');}},cam:cam(cityBiz.x+3,cityBiz.y+3,6,Q-.3,cityBiz.x+1,cityBiz.y+1,5,Q+.3)}),
    market:()=>({d:1.7,cap:'торговать с<br><b>живыми игроками</b>',hour:15,on(){toCity();crowd(market.x+1,market.y+3,5);for(let k=0;k<3;k++)world.spawnTruck(farm.id,['milk','wheat','eggs'][k],'#7bd389');},cam:cam(market.x+4,market.y+5,7,Q+.4,market.x+1,market.y+2,5.5,Q)}),
    walk:()=>({d:1.8,cap:'гулять по <b>огромному</b><br>городу',hour:16,on(){toCity();clearCrowd();},cam:cam(95,60,22,Q-.8,140,95,16,Q+.3)}),
    crows:()=>({d:1.7,cap:'кормить <b>ворон</b><br>на крыше БЦ 🐦‍⬛',hour:8,on(){toCity();},cam:cam(bc.x+1,bc.y+1,3.6,Q-.3,bc.x+.5,bc.y+.6,2.8,Q+.2)}),
    night:()=>({d:1.8,cap:'жить в городе,<br>который <b>не спит</b>',hour:22,on(){toCity();},cam:cam(tower.x+6,tower.y+8,15,Q+.6,tower.x,tower.y+2,10,Q-.2)}),
    friends:()=>({d:1.8,cap:'знакомиться<br>и <b>общаться</b>',hour:18,on(){toCity();const c=P[103];crowd(c.x,c.y+2,6);meAt(c.x,c.y+2);},cam:cam(P[103].x+2,P[103].y+4,5.5,Q,P[103].x,P[103].y+2,4.2,Q+.25)}),
    end:()=>({d:2.4,endcard:true,hour:21,on(){toCity();clearCrowd();},cam:cam(tower.x,tower.y,14,Q,tower.x,tower.y,12,Q+.3)}),
  };
  let this_lv=0;
  const SCRIPTS={
    1:[SH.hook(21,'В ЭТОЙ ИГРЕ<br>ТЫ <b>МОЖЕШЬ…</b>'),SH.pvz(),SH.fight(),SH.farm(),SH.bus(),SH.cinema(),SH.boss(),SH.end()],
    2:[SH.hook(12,'С НУЛЯ<br>ДО <b>МАГНАТА</b>'),SH.pvz(),SH.farm(),SH.hire(),SH.truck(),SH.biz(),SH.upgrade(),SH.market(),SH.end()],
    3:[SH.hook(19,'ОНЛАЙН-ГОРОД<br>ИЗ <b>ПИКСЕЛЕЙ</b>'),SH.walk(),SH.bus(),SH.dk(),SH.apt(),SH.friends(),SH.crows(),SH.night(),SH.end()],
  };
  const shots=SCRIPTS[N]||SCRIPTS[1];let t0=null,cur=-1;
  window.FILM_LEN=shots.reduce((a,s)=>a+s.d,0);
  function tick(){requestAnimationFrame(tick);if(!window.FILM_GO)return;const now=performance.now()/1000;if(t0==null)t0=now;let t=now-t0,acc=0,i=0;
    for(;i<shots.length;i++){if(t<acc+shots[i].d)break;acc+=shots[i].d;}
    if(i>=shots.length){window.FILM_DONE=true;return;}
    const s=shots[i],lt=(t-acc)/s.d;
    if(i!==cur){cur=i;this_lv=0;if(s.hour!=null)world.setHour(s.hour);s.on&&s.on();}
    if(s.cam)s.cam(lt);if(s.step)s.step(lt);
    const pop=Math.min(1,(t-acc)/.16);
    head.style.opacity=s.hook||s.endcard?0:1;
    cap.innerHTML=s.cap||'';cap.style.transform=`scale(${1.35-.35*ease(pop)})`;cap.style.opacity=pop;
    hook.innerHTML=s.hook||'';hook.style.opacity=s.hook?Math.min(1,(t-acc)/.12):0;hook.style.transform=`scale(${s.hook?1+.06*lt:1})`;
    flash.style.opacity=i>0?Math.max(0,.55-(t-acc)/.12*.55):0;
    end.style.opacity=s.endcard?Math.min(1,(t-acc)/.25):0;}
  setTimeout(()=>{window.FILM_READY=true;},0);requestAnimationFrame(tick);
}
