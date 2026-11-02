import {GOODS,GK,BLD,EMP,RES,FURN,REGN,HIRE_FEE,MAX_WORKERS,SHIFT_SEC,OWNER_JOB_PAY,careerOf,DORM_ROOM,BCT,lvlOf,xpFor,NEED,UNLOCKS,needFor,DAILY,SKINS,POSITIONS} from './config.js';
import {createWorld} from './world.js';
import {createRoom} from './room.js';
import {sb,rpc,selectAll} from './net.js';

const $=id=>document.getElementById(id);
const fmt=n=>Math.floor(n).toLocaleString('ru-RU');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<820;
const world=createWorld($('c'),{mobile});
const room=createRoom(world.renderer);
const plots=world.plots;

// ================= СОСТОЯНИЕ =================
let me=null,mode='city',sel=null,tab='obj',sheetOpen=!mobile,dirty=true;
const props=new Map(),profiles=new Map(),goods=new Map(),events=[],unitsByPlot=new Map();
let city=null;const gov=new Map(),elections=new Map(),cands=[],voteN=new Map();
const LV=()=>me?lvlOf(me.xp||0):1;const lock=n=>`<span class="mut">🔒 откроется на ${n} уровне</span>`;
const DECOR={park:'🌳 Сквер — тут гуляют жители',yard:'🛝 Двор с детской площадкой',parking:'🚗 Парковка'};
const inv=(p,g)=>Number(p?.inv?.[g]||0);
const nm=uid=>{const p=profiles.get(uid);return p?`<b style="color:${p.color}">${esc(p.nick)}</b>`:'<b>игрок</b>';};
const marketPlot=plots.find(p=>p.sp==='market'),pvzPlot=plots.find(p=>p.sp==='pvzCity');
const dormPlot=plots.filter(p=>p.sp==='res').sort((a,b)=>Math.hypot(a.x-marketPlot.x,a.y-marketPlot.y)-Math.hypot(b.x-marketPlot.x,b.y-marketPlot.y))[0];

function toast(msg,ms=2800){const t=$('toast');t.innerHTML=msg;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',ms);}
async function act(name,args,quiet){try{const r=await rpc(name,args);if(r&&me&&r.id===me.id)setMe(r);dirty=true;return r??true;}catch(e){if(!quiet)toast('⚠️ '+esc(e.message));return null;}}
function price(g,extra=0){const G=goods.get(g),C=GOODS[g];const st=G?Number(G.stock):C.target*.3;return C.base*Math.max(.3,Math.min(2.5,1.8-.8*Math.max(st+extra,0)/C.target));}
const stock=g=>Number(goods.get(g)?.stock||0);
function missCost(need){let c=0,ok=true;for(const[g,q]of Object.entries(need)){const m=Math.max(0,q-inv(me,g));if(m>0){if(stock(g)<m)ok=false;c+=Math.ceil(m*price(g,-m/2)*1.15);}}return{c,ok};}
const costText=need=>Object.entries(need).map(([g,q])=>q+GOODS[g].ic).join(' ');

function setMe(p){const old=me;me={...me,...p};profiles.set(p.id,{...profiles.get(p.id),...p});
  if(old&&old.xp!=null&&lvlOf(me.xp)>lvlOf(old.xp)){const l=lvlOf(me.xp);toast(`⭐ Уровень ${l}! Открыто: ${UNLOCKS[l]||'новые возможности'}`,6000);lastTabs='';}
  if(old&&old.skin!==me.skin&&world.me){const m=world.me;world.setMe(me.nick,me.color,m.x,m.y,me.skin);}
  if(old&&old.inv)for(const g of GK){const d=Math.floor(inv(me,g))-Math.floor(inv(old,g));if(d>0){const pl=myPlots().find(x=>x.building&&BLD[x.building].out&&BLD[x.building].out[g]);if(pl)world.float(`+${d}${GOODS[g].ic}`,pl.x,2.2,pl.y,'#fff');}}
  dirty=true;}
const myProps=()=>me?[...props.values()].filter(p=>p.owner===me.id):[];
const myPlots=()=>myProps().filter(p=>p.kind==='land').map(p=>({...plots[p.plot],...p,x:plots[p.plot].x,y:plots[p.plot].y}));

function applyProp(r){const old=props.get(r.id);const n={...old,...r};props.set(r.id,n);
  if(!old&&(n.kind==='apt'||n.kind==='office')){if(!unitsByPlot.has(n.plot))unitsByPlot.set(n.plot,[]);unitsByPlot.get(n.plot).push(n.id);}
  if(n.kind==='land'){const pr=n.owner?profiles.get(n.owner):null;
    world.setPlotState(n.plot,{owner:n.owner,color:pr?.color||'#ffffff',building:n.building,workers:n.workers,builtAt:n.built_at?Date.parse(n.built_at):0});
    if(n.owner&&!pr)fetchProfile(n.owner).then(()=>applyProp(props.get(n.id)));}
  dirty=true;}
async function fetchProfile(id){const {data}=await sb.from('profiles').select('id,nick,color,money,shifts').eq('id',id).maybeSingle();if(data)profiles.set(id,data);}
function onEvent(e){events.push(e);if(events.length>60)events.shift();
  if(e.kind==='sell'&&e.data&&e.data.plot!=null)world.spawnTruck(e.data.plot,e.data.good,profiles.get(e.uid)?.color);
  if(e.kind==='join'&&e.uid)fetchProfile(e.uid);renderTicker();dirty=true;}
function renderTicker(){$('ticker').innerHTML=events.slice(-6).reverse().map((e,i)=>`<div style="opacity:${1-i*.14}">${esc(e.txt)}</div>`).join('');}

// ================= ЗАГРУЗКА И REALTIME =================
async function loadWorld(){
  const [g,pr,ps,ev]=await Promise.all([selectAll('goods'),selectAll('profiles','id,nick,color,money,shifts'),
    selectAll('props','id,kind,plot,reg,sp,tier,floor,price,demand,owner,building,workers,built_at'),
    sb.from('events').select('*').order('id',{ascending:false}).limit(40)]);
  g.forEach(x=>goods.set(x.good,x));pr.forEach(p=>profiles.set(p.id,p));ps.forEach(applyProp);
  (ev.data||[]).reverse().forEach(e=>events.push(e));renderTicker();
  await loadGov();
  sb.channel('db')
    .on('postgres_changes',{event:'*',schema:'public',table:'props'},p=>p.new&&p.new.id!=null&&applyProp(p.new))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'goods'},p=>{goods.set(p.new.good,p.new);dirty=true;})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'events'},p=>onEvent(p.new))
    .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},p=>{const r=p.new;if(!r||!r.id)return;profiles.set(r.id,{...profiles.get(r.id),...r});if(me&&r.id===me.id)setMe(r);dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'city'},p=>{city=p.new;dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'government'},p=>{gov.set(p.new.position,p.new);dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'elections'},()=>loadGov())
    .on('postgres_changes',{event:'*',schema:'public',table:'candidates'},()=>loadGov())
    .subscribe();
}
async function loadGov(){const [c,g,e,k]=await Promise.all([sb.from('city').select('*').eq('id',1).maybeSingle(),sb.from('government').select('*'),sb.from('elections').select('*').eq('status','open'),sb.from('candidates').select('*')]);
  city=c.data;gov.clear();(g.data||[]).forEach(r=>gov.set(r.position,r));elections.clear();(e.data||[]).forEach(r=>elections.set(r.position,r));
  cands.length=0;cands.push(...(k.data||[]).filter(x=>[...elections.values()].some(el=>el.id===x.election_id)));
  for(const x of cands)if(!profiles.has(x.uid))await fetchProfile(x.uid);
  const {data}=await sb.rpc('vote_counts');voteN.clear();(data||[]).forEach(r=>voteN.set(r.election_id+'|'+r.cand,r.n));dirty=true;}
let cityCh=null,lastTrack=0,lastPos='';
function joinPresence(){
  cityCh=sb.channel('city',{config:{presence:{key:me.id}}});
  cityCh.on('presence',{event:'sync'},()=>{const st=cityCh.presenceState();const seen=new Set();
    for(const k in st){if(k===me.id)continue;const s=st[k][st[k].length-1];seen.add(k);world.setOther(k,s);}
    for(const[k]of world.avatars)if(!seen.has(k))world.removeOther(k);$('online').textContent='👥'+Object.keys(st).length;});
  cityCh.subscribe(s=>{if(s==='SUBSCRIBED')trackPos(true);});
  sb.channel('inv-'+me.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'invites',filter:'to_uid=eq.'+me.id},p=>onInvite(p.new)).subscribe();
}
function trackPos(force){const m=world.me;if(!m||!cityCh)return;const pos=`${m.x.toFixed(1)},${m.y.toFixed(1)},${m.working?1:0}`,now=performance.now();
  if(!force&&((pos===lastPos&&now-lastTrack<15000)||now-lastTrack<800))return;lastTrack=now;lastPos=pos;
  cityCh.track({nick:me.nick,color:me.color,skin:me.skin||null,x:+m.x.toFixed(2),y:+m.y.toFixed(2),working:!!m.working});}

// ================= АВТОРИЗАЦИЯ =================
const COLORS=['#ffd166','#06d6a0','#118ab2','#ef476f','#ffffff','#ff7f11','#9b5de5','#8ac926'];let myColor=COLORS[0],authMode='login';
function showAuth(m,msg=''){authMode=m;$('auth').style.display='flex';const b=$('authbox');
  if(m==='noserver'){b.innerHTML=`<h3 style="font-size:16px">ПИКСЕЛЬГРАД</h3><div>Сервер ещё не подключён (нет ключа Supabase). Город можно посмотреть, но играть пока нельзя.</div>`;return;}
  const tabs=`<div class="atabs"><div class="tab ${m==='login'?'on':''}" data-auth="login">Вход</div><div class="tab ${m==='register'?'on':''}" data-auth="register">Регистрация</div></div>`;
  const sw=`<div>${COLORS.map(c=>`<span class="sw ${c===myColor?'on':''}" style="background:${c}" data-color="${c}"></span>`).join('')}</div>`;
  b.innerHTML=`<h3 style="font-size:16px">ПИКСЕЛЬГРАД</h3><div class="mut" style="margin-bottom:8px">Онлайн-город: работай, копи, покупай землю, строй бизнес, обставляй квартиру и зови друзей в гости.</div>`+
    (m==='nick'?`<div>Почти готово! Как тебя звать в городе?</div><input id="a_nick" maxlength="16" placeholder="Ник (2–16 символов)">${sw}<span class="btn gold" data-auth="mknick" style="font-size:17px">Въехать в город →</span>`:
    tabs+`<input id="a_email" type="email" placeholder="Почта" autocomplete="email"><input id="a_pass" type="password" placeholder="Пароль (от 6 символов)" autocomplete="${m==='login'?'current-password':'new-password'}">`+
    (m==='register'?`<input id="a_nick" maxlength="16" placeholder="Ник в игре">${sw}`:'')+
    `<span class="btn gold" data-auth="${m==='login'?'dologin':'doreg'}" style="font-size:17px">${m==='login'?'Войти':'Зарегистрироваться'}</span>`)+
    `<div id="a_msg" class="mut" style="margin-top:8px;color:#ff9b9b">${esc(msg)}</div>`;}
async function authAction(a){
  const v=id=>($(id)?.value||'').trim(),msg=t=>{$('a_msg').textContent=t;};
  if(a==='login'||a==='register'){showAuth(a);return;}
  if(a==='dologin'){const {error}=await sb.auth.signInWithPassword({email:v('a_email'),password:v('a_pass')});if(error)return msg(error.message==='Invalid login credentials'?'Неверная почта или пароль':error.message);await afterLogin();}
  if(a==='doreg'){const nick=v('a_nick');if(nick.length<2)return msg('Ник от 2 символов');
    const {data,error}=await sb.auth.signUp({email:v('a_email'),password:v('a_pass')});if(error)return msg(error.message);
    if(!data.session){const s=await sb.auth.signInWithPassword({email:v('a_email'),password:v('a_pass')});if(s.error)return msg('Не получилось войти после регистрации: '+s.error.message);}
    const r=await act('create_profile',{p_nick:nick,p_color:myColor});if(!r)return msg('Ник занят — попробуй другой');await afterLogin();}
  if(a==='mknick'){const r=await act('create_profile',{p_nick:v('a_nick'),p_color:myColor});if(r)await afterLogin();}
}
async function afterLogin(){
  const {data:{user}}=await sb.auth.getUser();if(!user)return showAuth('login');
  const {data}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();if(!data)return showAuth('nick');
  $('auth').style.display='none';setMe(data);
  const h=homePlot();world.setMe(me.nick,me.color,h.x0+1,h.y0+3,me.skin);world.jump(h.x,h.y);
  joinPresence();act('settle',{},true);
  if(me.tut<TUT.length)tutGo(me.tut);else $('coach').style.display='none';
  if(me.last_daily!==new Date().toISOString().slice(0,10))showDaily();
  dirty=true;
}
function homePlot(){const u=me?.home_unit&&props.get(me.home_unit);return u?plots[u.plot]:dormPlot;}

// ================= РАБОТА / СМЕНЫ =================
let shiftT=0,shiftBusy=false;
function jobTarget(){const p=me&&me.job_prop!=null&&props.get(me.job_prop);if(!p)return null;const pl=plots[p.plot];
  if(pl.sp==='market'){const t=world.marketTile();return{x:t[0],y:t[1]};}return pl.door;}
function updateJob(dt){const m=world.me;if(!m||!me)return;const t=jobTarget();
  if(t){const key=t.x+','+t.y;if(m.goal!==key){m.goal=key;world.goMe(t.x,t.y);shiftT=0;}
    const at=!m.path.length&&Math.round(m.x)===t.x&&Math.round(m.y)===t.y;m.working=at;
    if(at&&!document.hidden){shiftT+=dt;if(shiftT>=SHIFT_SEC&&!shiftBusy){shiftBusy=true;const before=me.money;
      act('work_shift',{},true).then(r=>{shiftBusy=false;shiftT=0;if(r){const d=Math.round(me.money-before);if(d>0)world.float(`+${d}💰 смена`,m.x,1.6,m.y);}else{act('settle',{},true);}});}}
    const sb_=$('shiftbar');if(sb_)sb_.style.width=Math.min(100,shiftT/SHIFT_SEC*100)+'%';}
  else{m.working=false;const h=homePlot();if(m.goal!=='home'){m.goal='home';world.goMe(h.x0+1,h.y0+3);}}}
function jobInfo(p){if(!p)return null;if(p.kind==='npc'){const e=EMP[p.sp];let pay=e.pay;if(p.sp==='bc'&&me)pay=me.shifts>=300?30:me.shifts>=100?20:12;return{n:p.sp==='bc'?'Бизнес-центр':e.n,pay,req:e.req,job:e.job};}
  if(p.building&&p.owner&&(!me||p.owner!==me.id))return{n:`${BLD[p.building].n} (${profiles.get(p.owner)?.nick||'игрок'})`,pay:OWNER_JOB_PAY,req:0,job:BLD[p.building].w.toLowerCase()};return null;}

// ================= КВАРТИРА =================
let roomCh=null,roomCtx=null,saveT=null;
async function enterRoom({unit,hostUid,hostNick,editable}){
  let layout,tier,size;
  if(unit){const {data,error}=await sb.from('props').select('room,tier').eq('id',unit).single();if(error)return toast('Не удалось открыть квартиру');layout=data.room||[];tier=data.tier;size=RES[tier].room;}
  else{const {data}=await sb.from('profiles').select('dorm').eq('id',hostUid).single();layout=data?.dorm||[];tier='dorm';size=DORM_ROOM;}
  const elsewhere={};
  if(editable){const {data:mine}=await sb.from('props').select('id,room').eq('owner',me.id).eq('kind','apt');
    for(const r of mine||[])if(r.id!==unit)for(const o of r.room||[])elsewhere[o.i]=(elsewhere[o.i]||0)+1;
    if(unit){const {data:d}=await sb.from('profiles').select('dorm').eq('id',me.id).single();for(const o of d?.dorm||[])elsewhere[o.i]=(elsewhere[o.i]||0)+1;}}
  const title=(editable?'Мой дом':'В гостях у '+hostNick)+' · '+(tier==='dorm'?'койка в общаге':RES[tier].n);
  roomCtx={unit,hostUid,editable};
  room.open({size,tier,layout,editable,owned:me.furn||{},elsewhere,title,onSave:l=>{clearTimeout(saveT);saveT=setTimeout(()=>act('save_room',{p_unit:unit||0,p_layout:l}),500);dirty=true;}});
  mode='room';document.body.classList.add('inroom');$('roomui').style.display='flex';$('chat').style.display='block';
  tab='furn';sheetOpen=!mobile;dirty=true;tutFlags.room=true;
  roomCh=sb.channel('room:'+(unit||'d'+hostUid),{config:{presence:{key:me.id}}});
  roomCh.on('presence',{event:'sync'},()=>{const st=roomCh.presenceState();room.setPeople(Object.entries(st).map(([uid,a])=>({uid,...a[a.length-1]})));dirty=true;})
    .on('broadcast',{event:'chat'},({payload})=>room.say(payload.uid,payload.text))
    .subscribe(s=>{if(s==='SUBSCRIBED')roomCh.track({nick:me.nick,color:me.color});});
}
function leaveRoom(){room.close();if(roomCh){roomCh.unsubscribe();roomCh=null;}mode='city';roomCtx=null;document.body.classList.remove('inroom');
  $('roomui').style.display='none';$('chat').style.display='none';tab='home';dirty=true;}
function onInvite(inv){toast(`🔔 <b>${esc(inv.from_nick)}</b> зовёт в гости! <span class="btn gold" data-visit="${inv.unit}" data-host="${inv.from_uid}" data-hn="${esc(inv.from_nick)}">Пойти</span>`,12000);}
$('chatin').addEventListener('keydown',e=>{if(e.key!=='Enter'||!roomCh)return;const t=e.target.value.trim().slice(0,120);if(!t)return;
  roomCh.send({type:'broadcast',event:'chat',payload:{uid:me.id,text:t}});room.say(me.id,t);e.target.value='';});
{let rd=null;const cv=$('c');
  cv.addEventListener('pointerdown',e=>{if(mode==='room')rd={x:e.clientX,y:e.clientY};});
  cv.addEventListener('pointermove',e=>{if(mode==='room'&&e.pointerType==='mouse')room.pointer(e.clientX,e.clientY,false);});
  cv.addEventListener('pointerup',e=>{if(mode!=='room'||!rd)return;if(Math.hypot(e.clientX-rd.x,e.clientY-rd.y)<10){room.pointer(e.clientX,e.clientY,false);room.pointer(e.clientX,e.clientY,true);}rd=null;dirty=true;});
  addEventListener('keydown',e=>{if(mode==='room'&&e.code==='KeyR'&&e.target.tagName!=='INPUT')room.rotateHand();});}

// ================= ВЫБОР НА КАРТЕ =================
world.onTap=p=>{if(mode!=='city')return;sel=p;world.select(p);if(p){tab='obj';sheetOpen=true;}dirty=true;};
world.onHover=(p,e)=>{const t=$('tip');if(!p||!e){t.style.display='none';return;}t.style.display='block';t.style.left=e.clientX+16+'px';t.style.top=e.clientY+12+'px';t.innerHTML=tipHTML(p);};
function tipHTML(p){if(DECOR[p.sp])return DECOR[p.sp];if(p.sp==='shop')return`<b>${p.name}</b><br>работа: кассир, ${EMP.shop.pay}💰/смена`;if(p.sp==='res')return`🏢 ${RES[p.rt].n} · квартиры`;if(p.sp==='bc')return'🏙 Бизнес-центр · офисы и работа';if(p.sp)return`<b>${EMP[p.sp].n}</b><br>работа: ${EMP[p.sp].pay}💰/смена`;
  const pr=props.get(p.id);if(!pr)return'';if(!pr.owner)return`Участок · ${REGN[p.reg]}<br>Продаётся: <b>${pr.price}💰</b>`;return`${nm(pr.owner)}<br>${pr.building?BLD[pr.building].ic+' '+BLD[pr.building].n:'пустой участок'}`;}

// ================= ВКЛАДКИ =================
const CITY_TABS=[['obj','📍','Объект'],['work','💼','Работа'],['market','🏭','Рынок'],['home','🏠','Жильё',2],['gov','🏛','Мэрия'],['more','☰','Ещё']];
const ROOM_TABS=[['furn','🛋','Мебель'],['guests','👥','Гости']];
function ioText(b){if(b.kind==='gather')return`→ ${b.rate}${Object.keys(b.out).map(g=>GOODS[g].ic).join('')}/мин`;
  if(b.kind==='proc')return`${costText(b.in)} → ${Object.entries(b.out).map(([g,q])=>q+GOODS[g].ic).join('')} · ${b.rate}/мин`;
  return`${Object.keys(b.in).length?costText(b.in):'📦'} → ${b.pay}💰/клиент`;}
function bizHTML(pr){const b=BLD[pr.building],building=pr.built_at&&Date.parse(pr.built_at)>Date.now();
  let h=`<h3>${b.ic} ${b.n}</h3><div class="mut">${b.desc}</div><div style="margin:6px 0">${ioText(b)} на работника · зарплата ${b.wage}💰/мин каждому</div>`;
  if(b.kind==='service')h+=`<div class="mut">Спрос района: ~${pr.demand} клиентов/мин (делится с конкурентами рядом)</div>`;
  if(building)h+=`<div>🏗 Строится… ${Math.max(0,Math.ceil((Date.parse(pr.built_at)-Date.now())/1000))} сек</div>`;
  h+=`<div style="margin:6px 0">Работники: <b>${pr.workers}/${MAX_WORKERS}</b></div>`;
  if(LV()<NEED.hire)h+=lock(NEED.hire)+' (найм)<br>';else h+=`<span class="btn ${pr.workers<MAX_WORKERS?'':'dis'}" data-act="hire" data-id="${pr.id}">Нанять (+${HIRE_FEE}💰)</span><span class="btn red ${pr.workers?'':'dis'}" data-act="fire" data-id="${pr.id}">Уволить</span>`;
  h+=`<div class="mut" style="margin-top:6px">Живые игроки тоже могут устроиться к тебе: ты платишь им ${OWNER_JOB_PAY}💰 за смену, а их смена даёт продукцию.</div>`;
  h+=`<div style="margin-top:8px"><span class="btn red sm" data-act="sellprop" data-id="${pr.id}">Продать (вернёшь ~70%)</span></div>`;return h;}
function buildListHTML(pr){let h=`<div class="mut">Выбери, что построить. Недостающие материалы докупятся на базе — если они там есть.</div>`;
  for(const[k,b]of Object.entries(BLD)){if(!b.reg.includes(pr.reg))continue;const m=missCost(b.mat),c=b.cost+m.c,can=me&&me.money>=c&&m.ok;
    h+=`<div class="row"><b>${b.ic} ${b.n}</b> <span class="mut">${ioText(b)}</span><br><span class="mut">${b.desc}<br>Стройка ${b.cost}💰${Object.keys(b.mat).length?' + '+costText(b.mat):''} · зарплата ${b.wage}💰/мин</span><br>
    ${LV()<needFor(b)?lock(needFor(b)):`<span class="btn ${can?'':'dis'}" data-act="build" data-id="${pr.id}" data-t="${k}">Построить · ${c}💰</span>`}${m.ok?'':'<span class="mut"> нет материалов на базе</span>'}</div>`;}return h;}
function jobBtn(pr){const j=jobInfo(pr);if(!j||!me)return'';if(pr.kind!=='npc'&&LV()<NEED.playerJob&&me.job_prop!==pr.id)return'<div>'+lock(NEED.playerJob)+' (работа у игроков)</div>';if(me.job_prop===pr.id)return`<div style="margin-top:6px">✅ Ты работаешь здесь<div class="bar"><i id="shiftbar" style="width:0"></i></div></div><span class="btn red" data-act="quit">Уволиться</span>`;
  const ok=me.shifts>=j.req;return`<div style="margin-top:6px"><span class="btn ${ok?'':'dis'}" data-act="job" data-id="${pr.id}">Устроиться · ${j.pay}💰/смена</span>${ok?'':`<div class="mut">Нужен опыт: ${j.req} смен (у тебя ${me.shifts})</div>`}</div>`;}
function unitsHTML(p){const ids=unitsByPlot.get(p.id)||[];let h='';
  for(const id of ids){const u=props.get(id);const mine=me&&u.owner===me.id;
    h+=`<div class="row">${u.kind==='apt'?'🚪 Квартира':'🏢 Офис'}, ${u.floor} этаж · <b>${fmt(u.price)}💰</b> `;
    if(!u.owner){const n=u.kind==='apt'?NEED.apt:NEED.office;h+=LV()<n?lock(n):`<span class="btn sm gold" data-act="buyunit" data-id="${id}">Купить</span>`;}
    else if(mine){if(u.kind==='apt')h+=`<span class="btn sm" data-act="enter" data-id="${id}">Войти</span>${me.home_unit===id?'<span class="mut"> 🏠 дом</span>':`<span class="btn sm blue" data-act="sethome" data-id="${id}">Сделать домом</span>`}`;
      else h+=u.building?`<div>${bizHTML(u)}</div>`:`<div>${buildListHTML(u)}</div>`;h+=`<span class="btn sm red" data-act="sellprop" data-id="${id}">Продать</span>`;}
    else h+=`<span class="mut">владелец: </span>${nm(u.owner)}${u.building?` · ${BLD[u.building].ic} ${BLD[u.building].n}`+jobBtn(u):''}`;
    h+='</div>';}return h;}
function objHTML(){const p=sel;if(!p)return`<h3>📍 Объект</h3><div>Нажми на участок, дом или предприятие на карте.</div><div class="mut" style="margin-top:6px">${mobile?'Двигай карту пальцем, щипок — зум.':'Тяни мышью, колесо — зум, Q/E — поворот.'}</div>`;
  if(p.sp==='res'){const r=RES[p.rt];return`<h3>🏢 ${r.n}</h3><div class="mut">${r.floors} этажей · комната ${r.room[0]}×${r.room[1]}. Купи квартиру, обставь мебелью и зови друзей.</div>${unitsHTML(p)}`;}
  if(DECOR[p.sp])return`<h3>${DECOR[p.sp]}</h3><div class="mut">Благоустройство: делает район живым, тут гуляют жители.</div>`;
  const pr=props.get(p.id);if(!pr)return'<div class="mut">Загрузка…</div>';
  if(p.sp==='bc')return`<h3>🏙 Бизнес-центр</h3><div class="mut">Офисная карьера и офисы для кофеен и ресторанов. Клерк: 12💰 · с 100 смен менеджер 20💰 · с 300 директор 30💰.</div>${jobBtn(pr)}<h3 style="margin-top:10px">Офисы</h3>${unitsHTML(p)}`;
  if(DECOR[p.sp])return`<h3>${DECOR[p.sp]}</h3><div class="mut">Благоустройство города: делает район живым, тут гуляют жители.</div>`;
  if(p.sp){const e=EMP[p.sp];return`<h3>${p.name||e.n}</h3><div>Городской работодатель. Должность: ${e.job}. Оплата <b>${e.pay}💰</b> за смену (${SHIFT_SEC} сек), смены идут, пока ты онлайн.</div>`+
    (Object.keys(e.out).length?`<div class="mut">Производит на базу: ${Object.entries(e.out).map(([g,q])=>q+GOODS[g].ic).join(' ')} в минуту</div>`:'')+
    (p.sp==='market'?'<div class="mut">Сюда приезжают грузовики всех игроков. Цены — во вкладке «Рынок».</div>':'')+jobBtn(pr);}
  if(!pr.owner){const can=me&&me.money>=pr.price;
    const d={v:'🌲 Деревня — дёшево, лес и река рядом',d:'🏡 Дачи — самые дешёвые, рядом озеро',c:'🏙 Город — дорого, но рядом покупатели',p:'🏭 Промзона — заводы',o:'⚓ Порт — рыболовные суда и коптильни'}[pr.reg];
    return`<h3>Участок #${p.id+1}</h3><div>${d}</div>${pr.reg==='c'?`<div class="mut">Спрос района: ~${pr.demand} клиентов/мин</div>`:''}<div style="margin:6px 0">Цена: <b>${fmt(pr.price)}💰</b></div>
    <div class="mut">Можно: ${Object.values(BLD).filter(b=>b.reg.includes(pr.reg)).map(b=>b.ic+' '+b.n).join(', ')}</div>
    ${LV()<NEED.land?lock(NEED.land):`<span class="btn gold ${can?'':'dis'}" data-act="buyland" data-id="${pr.id}">Купить участок</span>`}${me&&!can?`<div class="mut">Не хватает ${fmt(pr.price-me.money)}💰</div>`:''}`;}
  if(me&&pr.owner===me.id)return pr.building?bizHTML(pr):`<h3>Твой участок #${p.id+1}</h3>`+buildListHTML(pr);
  return`<h3>Участок #${p.id+1}</h3><div>Владелец: ${nm(pr.owner)}</div><div>${pr.building?BLD[pr.building].ic+' '+BLD[pr.building].n+' · работников: '+pr.workers:'пока пусто'}</div>${jobBtn(pr)}`;}
function marketHTML(){let h=`<h3>🏭 Оптовая база</h3><div class="mut">Цена зависит от склада: везут много — дешевеет. Купить можно только то, что реально лежит на складе.</div><table>`;
  for(const g of GK){const pr=price(g),q=me?Math.floor(inv(me,g)):0;
    h+=`<tr><td>${GOODS[g].ic} ${GOODS[g].n}</td><td><b>${pr.toFixed(1)}</b></td><td class="mut">склад ${fmt(stock(g))}</td>${me?`<td>${q}</td><td><span class="btn sm ${q?'':'dis'}" data-act="sell" data-g="${g}">Продать</span><span class="btn sm blue ${stock(g)>=5&&LV()>=NEED.buyMarket?'':'dis'}" data-act="buy" data-g="${g}" title="закупка с ${NEED.buyMarket} ур.">+5</span></td>`:''}</tr>`;}
  return h+'</table>';}
function workHTML(){if(!me)return'';let h=`<h3>💼 Карьера</h3><div>${careerOf(me.shifts)} · смен: <b>${me.shifts}</b></div>`;
  const cur=me.job_prop!=null&&props.get(me.job_prop);
  if(cur){const j=jobInfo(cur);h+=`<div class="row">Сейчас: <b>${j?.n}</b> · ${j?.pay}💰/смена<div class="bar"><i id="shiftbar" style="width:0"></i></div><span class="mut">Смена ${SHIFT_SEC} сек, идёт пока ты в игре</span><br><span class="btn sm blue" data-act="goto" data-plot="${cur.plot}">Показать</span><span class="btn sm red" data-act="quit">Уволиться</span></div>`;}
  else h+=`<div class="row">Ты без работы.</div>`;
  h+='<h3 style="margin-top:8px">Вакансии</h3>';
  const seen=new Set();for(const pr of props.values()){if(pr.kind!=='npc')continue;if(pr.sp==='bc'&&seen.has('bc'))continue;seen.add(pr.sp);const j=jobInfo(pr),ok=me.shifts>=j.req;
    h+=`<div class="row"><b>${j.n}</b> · ${j.job} · <b>${j.pay}💰</b>${j.req?` <span class="mut">(от ${j.req} смен)</span>`:''}<br><span class="btn sm blue" data-act="goto" data-plot="${pr.plot}">На карте</span>${me.job_prop===pr.id?'':`<span class="btn sm ${ok?'':'dis'}" data-act="job" data-id="${pr.id}">Устроиться</span>`}</div>`;}
  return h+`<div class="mut">Также можно устроиться в бизнес любого игрока — кликни его участок.</div>`;}
function homeHTML(){if(!me)return'';const apts=myProps().filter(p=>p.kind==='apt'),off=myProps().filter(p=>p.kind==='office');
  let h=`<h3>🏠 Жильё</h3><div class="row">🛏 Койка в общаге <span class="btn sm" data-act="enter" data-id="0">Войти</span>${me.home_unit?`<span class="btn sm blue" data-act="sethome" data-id="0">Сделать домом</span>`:'<span class="mut"> 🏠 дом</span>'}</div>`;
  for(const a of apts)h+=`<div class="row">🚪 ${RES[a.tier].n}, ${a.floor} эт. <span class="btn sm" data-act="enter" data-id="${a.id}">Войти</span>${me.home_unit===a.id?'<span class="mut"> 🏠 дом</span>':`<span class="btn sm blue" data-act="sethome" data-id="${a.id}">Сделать домом</span>`}<span class="btn sm blue" data-act="goto" data-plot="${a.plot}">На карте</span></div>`;
  for(const o of off)h+=`<div class="row">🏢 Офис, ${o.floor} эт. ${o.building?BLD[o.building].ic+' '+BLD[o.building].n:'пустой'} <span class="btn sm blue" data-act="goto" data-plot="${o.plot}">Открыть</span></div>`;
  h+=`<h3 style="margin-top:10px">Купить квартиру</h3><div class="mut">От однушки в хрущёвке до пентхауса в небоскрёбе. Чем дороже — тем больше комната.</div>`;
  for(const t of Object.keys(RES)){const free=[...props.values()].filter(u=>u.kind==='apt'&&u.tier===t&&!u.owner).sort((a,b)=>a.price-b.price)[0];
    h+=`<div class="row">${RES[t].n} · комната ${RES[t].room.join('×')} · ${free?`от <b>${fmt(free.price)}💰</b> <span class="btn sm blue" data-act="goto" data-plot="${free.plot}">Смотреть</span>`:'<span class="mut">всё раскуплено</span>'}</div>`;}
  return h;}
const GOALS=[['Устроиться на работу',()=>me.shifts>0||me.job_prop!=null],['Накопить 200💰',()=>me.money>=200],['Купить участок',()=>myPlots().length>0],['Построить первый бизнес',()=>myPlots().some(p=>p.building)],
  ['Продать товар на базе',()=>me.sold>0],['Купить мебель',()=>Object.values(me.furn||{}).some(v=>v>0)],['Купить квартиру',()=>myProps().some(p=>p.kind==='apt')],['Переработка: мельница/пилорама/коптильня',()=>myPlots().some(p=>['mill','sawmill','smokehouse','dairy'].includes(p.building))],
  ['Точка в городе',()=>myPlots().some(p=>p.reg==='c'&&p.building)],['30 смен — путь в бизнес-центр',()=>me.shifts>=30],['Офис в бизнес-центре',()=>myProps().some(p=>p.kind==='office')],['Ресторан в БЦ',()=>myProps().some(p=>p.building==='restaurant')],['Пентхаус в небоскрёбе',()=>myProps().some(p=>p.tier==='tower')]];
function goalsHTML(){if(!me)return'';return`<h3>📋 Цели</h3><div class="mut">Два пути: карьера (смены → бизнес-центр → директор) или своё дело (ферма/карьер → переработка → город → БЦ).</div>`+
  GOALS.map(([t,f])=>{const ok=f();return`<div class="row" style="${ok?'color:#7bd389':''}">${ok?'✔':'▫'} ${t}</div>`;}).join('');}
function topHTML(){const list=[...profiles.values()].sort((a,b)=>b.money-a.money).slice(0,20);
  return`<h3>🏆 Самые богатые</h3>`+list.map((p,i)=>`<div class="row" style="${me&&p.id===me.id?'background:#3a3148':''}">${i+1}. <span style="color:${p.color}">■</span> ${esc(p.nick)} — <b>${fmt(p.money)}💰</b> <span class="mut">${careerOf(p.shifts||0)}</span></div>`).join('')+
  (me?`<div style="margin-top:10px"><span class="btn sm red" data-act="logout">Выйти из аккаунта</span></div>`:'');}
function feedHTML(){return`<h3>📰 Что происходит</h3>`+events.slice().reverse().map(e=>`<div class="row">${esc(e.txt)}</div>`).join('');}
function furnHTML(){const st=room.state;if(!st)return'';let h=`<h3>🛋 Мебель</h3>`;
  if(!st.editable)return h+'<div>Ты в гостях — расставлять нельзя, но можно болтать в чате.</div>';
  h+=`<div class="mut">${mobile?'Нажми «Поставить», затем на пол. Нажми на вещь, чтобы переставить.':'«Поставить» → клик по полу. R — повернуть. Клик по вещи — переставить.'} Мебель делают игроки в мебельных цехах — цена зависит от склада базы.</div>`;
  for(const[k,f]of Object.entries(FURN)){const owned=Math.floor(me.furn?.[k]||0),free=room.free(k),m=missCost(f.cost),c=f.money+m.c;
    h+=`<div class="row">${f.ic} <b>${f.n}</b> <span class="mut">${f.w}×${f.d}</span> · есть ${owned}, свободно ${Math.max(0,free)}<br>
    <span class="btn sm ${free>0?'':'dis'}" data-act="place" data-it="${k}">Поставить</span><span class="btn sm gold ${me.money>=c&&m.ok&&LV()>=NEED.furn?'':'dis'}" data-act="buyfurn" data-it="${k}">Купить · ${costText(f.cost)} + ${f.money}💰 (≈${c}💰)</span></div>`;}
  return h;}
function guestsHTML(){const st=room.state;if(!st)return'';let h=`<h3>👥 Гости</h3>`;
  if(st.editable)h+=`<div>Позови друга по нику:</div><input id="invnick" maxlength="16" placeholder="Ник игрока"><span class="btn gold" data-act="invite">Пригласить</span>`;
  h+=`<div class="row">В комнате: ${[...st.people.keys()].map(nm).join(', ')||'—'}</div><div class="mut">Пиши в чат сверху — сообщения увидят все в комнате.</div>`;return h;}
let moreSec='goals';
function moreHTML(){const sec=[['goals','📋 Цели'],['skins','💎 Скины'],['top','🏆 Топ'],['feed','📰 Лента'],['levels','⭐ Уровни']];
  return`<div style="margin-bottom:8px">${sec.map(([k,n])=>`<span class="btn sm ${moreSec===k?'on':'blue'}" data-act="moresec" data-s="${k}">${n}</span>`).join('')}</div>`+
    ({goals:goalsHTML,skins:skinsHTML,top:topHTML,feed:feedHTML,levels:levelsHTML}[moreSec]());}
function levelsHTML(){if(!me)return'<div class="mut">Войди в игру</div>';const l=LV();return`<h3>⭐ Уровни</h3><div class="mut">Опыт: ${me.xp||0}. Даётся за смены, стройку, продажи, покупки и ежедневный вход.</div>`+
  Object.entries(UNLOCKS).map(([k,t])=>`<div class="row" style="${+k<=l?'color:#7bd389':''}">${+k<=l?'✔':'🔒'} <b>Ур. ${k}</b> (${xpFor(+k)} XP) — ${t}</div>`).join('');}
function skinsHTML(){if(!me)return'';const own=me.skins||[];let h=`<h3>💎 Скины</h3><div class="mut">Кристаллы дают за ежедневный вход (серия до 7 дней — до 40💎 в день). Скины видят все игроки.</div>`;
  for(const[k,s]of Object.entries(SKINS)){const has=own.includes(k);h+=`<div class="row">${s.n} · <b>${s.price}💎</b> ${has?(me.skin===k?'<span class="mut">надето</span>':`<span class="btn sm" data-act="equip" data-it="${k}">Надеть</span>`):`<span class="btn sm gold ${(me.gems||0)>=s.price?'':'dis'}" data-act="buyskin" data-it="${k}">Купить</span>`}</div>`;}
  return h+(me.skin?`<span class="btn sm red" data-act="equip" data-it="">Снять головной убор</span>`:'');}
function govControls(pos){const inp=(k,v,pct)=>`<input id="gv_${k}" value="${v}" style="width:80px;display:inline-block"><span class="btn sm" data-act="govset" data-k="${k}" ${pct?'data-pct="1"':''}>OK</span>`;
  if(pos==='mayor')return`<div style="margin-top:4px">Налог с продаж, %: ${inp('sales_tax',Math.round(city.sales_tax*100),1)}<br>Налог на имущество 💰: ${inp('prop_tax',city.prop_tax)}<br>`+
    ['tax','housing','trade'].map(k=>`Зарплата «${POSITIONS[k].n}»: ${inp('salary_'+k,city.salaries?.[k]??100)}`).join('<br>')+'</div>';
  if(pos==='tax')return`<div><span class="btn sm" data-act="govset" data-k="newbie_exempt" data-v="${city.newbie_exempt?0:1}">${city.newbie_exempt?'Отменить льготу новичкам':'Включить льготу новичкам'}</span></div>`;
  if(pos==='housing')return`<div><span class="btn sm gold" data-act="govset" data-k="subbotnik" data-v="1">Провести субботник (500💰 из казны)</span></div>`;
  if(pos==='trade')return`<div>Сбор с закупок, %: ${inp('trade_fee',Math.round(city.trade_fee*100),1)}</div>`;return'';}
function govHTML(){if(!city)return'<div class="mut">Загрузка…</div>';const l=LV();
  let h=`<h3>🏛 Мэрия Пиксельграда</h3><div class="row">Казна: <b>${fmt(city.treasury)}💰</b><br>Налог с продаж: <b>${Math.round(city.sales_tax*100)}%</b> · на имущество: <b>${city.prop_tax}💰</b>/день за объект${city.newbie_exempt?' (новички до 4 ур. освобождены)':''}<br>Сбор с закупок: <b>${Math.round(city.trade_fee*100)}%</b>${city.boost_until&&Date.parse(city.boost_until)>Date.now()?'<br>🧹 Идёт субботник: спрос +30%':''}</div>`;
  for(const[pos,P]of Object.entries(POSITIONS)){const g=gov.get(pos),e=elections.get(pos),mine=me&&g&&g.uid===me.id;
    h+=`<div class="row"><b>${P.ic} ${P.n}</b>: ${g&&g.uid?nm(g.uid):'<span class="mut">вакантно</span>'}<br><span class="mut">${P.power}</span>`;
    if(mine)h+=govControls(pos);
    if(e){const cs=cands.filter(c=>c.election_id===e.id),left=Math.max(0,Date.parse(e.ends_at)-Date.now());
      h+=`<div style="margin-top:4px">🗳 Выборы: до итогов ${Math.floor(left/3600000)} ч ${Math.floor(left%3600000/60000)} мин</div>`;
      if(!cs.length)h+='<div class="mut">Кандидатов пока нет</div>';
      for(const c of cs){const n=voteN.get(e.id+'|'+c.uid)||0;h+=`<div>• ${nm(c.uid)} — ${n} гол. ${c.slogan?`<span class="mut">«${esc(c.slogan)}»</span>`:''} ${me&&l>=NEED.vote?`<span class="btn sm" data-act="vote" data-e="${e.id}" data-c="${c.uid}">Голосовать</span>`:''}</div>`;}
      if(me&&l<NEED.vote)h+=`<div>${lock(NEED.vote)} (голосование)</div>`;
      if(me&&!cs.some(c=>c.uid===me.id))h+=l>=NEED.run?`<span class="btn sm gold" data-act="run" data-pos="${pos}">Выдвинуться (100💰)</span>`:`<div>${lock(NEED.run)} (выдвижение)</div>`;}
    h+='</div>';}
  if(me&&l>=NEED.run)h+=`<input id="slogan" maxlength="120" placeholder="Твой лозунг для выборов">`;
  return h+`<div class="mut">Налоги идут в казну, из неё — зарплаты мэру и начальникам. Налог на имущество списывается раз в сутки.</div>`;}
function showDaily(){const y=new Date(Date.now()-864e5).toISOString().slice(0,10),s=me.last_daily===y?(me.streak||0)+1:1;
  $('auth').style.display='flex';$('authbox').innerHTML=`<h3 style="font-size:15px">🎁 Ежедневная награда</h3><div>День ${s} подряд: <b>+${DAILY[Math.min(s,7)-1]}💎</b> и +20 XP</div>
  <div style="display:flex;gap:4px;margin:10px 0;flex-wrap:wrap">${DAILY.map((g,i)=>`<div class="chip" style="${i+1===Math.min(s,7)?'outline:2px solid #ffd166;':''}opacity:${i+1<Math.min(s,7)?.5:1}">д${i+1}<br>${g}💎</div>`).join('')}</div>
  <div class="mut">Заходи каждый день — серия растёт. Кристаллы 💎 тратятся на скины (Ещё → Скины).</div><span class="btn gold" data-act="daily" style="font-size:17px">Забрать</span><span class="btn blue" data-act="closedaily">Позже</span>`;}
let lastBody='',lastTabs='';
function renderUI(){
  if(me){const l=LV(),x0=xpFor(l),x1=xpFor(l+1);$('money').innerHTML='💰 '+fmt(me.money)+` <span style="color:#9be7ff;font-size:15px">💎${me.gems||0}</span>`;$('rank').innerHTML=`Ур. ${l} · ${careerOf(me.shifts)}<div class="bar" style="height:6px"><i style="width:${Math.min(100,((me.xp||0)-x0)/(x1-x0)*100)}%"></i></div>`;
    $('inv').innerHTML=GK.filter(g=>inv(me,g)>=1).map(g=>`<span class="chip">${GOODS[g].ic} ${Math.floor(inv(me,g))}</span>`).join('')||'<span class="mut">склад пуст</span>';}
  const T=mode==='room'?ROOM_TABS:CITY_TABS;if(!T.some(t=>t[0]===tab))tab=T[0][0];
  const th=T.map(([k,ic,n,l])=>{const lk=l&&LV()<l;return`<div class="tab ${k===tab&&sheetOpen?'on':''}" data-tab="${k}" ${lk?`data-lock="${l}" style="opacity:.45"`:''}><span class="ic">${lk?'🔒':ic}</span>${n}</div>`;}).join('');
  if(th!==lastTabs){$('tabs').innerHTML=th;lastTabs=th;}
  $('sheet').classList.toggle('collapsed',!sheetOpen);
  const body={obj:objHTML,market:marketHTML,work:workHTML,home:homeHTML,gov:govHTML,more:moreHTML,furn:furnHTML,guests:guestsHTML}[tab]();
  if(body!==lastBody){const s=$('tabbody').scrollTop;$('tabbody').innerHTML=body;$('tabbody').scrollTop=s;lastBody=body;}
  $('hand').style.display=room.state&&room.state.hand?'inline':'none';
  dirty=false;tutCheck();
}

// ================= КНОПКИ =================
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-tab],[data-act],[data-auth],[data-color],[data-tut],[data-visit]');if(!t)return;
  if(t.dataset.color){myColor=t.dataset.color;document.querySelectorAll('.sw').forEach(s=>s.classList.toggle('on',s.dataset.color===myColor));return;}
  if(t.dataset.auth)return authAction(t.dataset.auth);
  if(t.dataset.tut)return t.dataset.tut==='next'?tutGo(tutI+1):tutEnd();
  if(t.dataset.visit!=null){$('toast').style.display='none';if(mode==='room')leaveRoom();return enterRoom({unit:+t.dataset.visit,hostUid:t.dataset.host,hostNick:t.dataset.hn,editable:false});}
  if(t.dataset.lock&&t.dataset.tab){toast(`🔒 Откроется на ${t.dataset.lock} уровне`);return;}
  if(t.dataset.tab){if(mobile&&t.dataset.tab===tab&&sheetOpen)sheetOpen=false;else{tab=t.dataset.tab;sheetOpen=true;}lastBody='';return renderUI();}
  const a=t.dataset.act,id=t.dataset.id!=null?+t.dataset.id:null;
  switch(a){
    case 'daily':{const r=await act('claim_daily');if(r){$('auth').style.display='none';toast(`🎁 +${DAILY[Math.min(me.streak,7)-1]}💎 · серия ${me.streak} дн.`);}break;}
    case 'closedaily':$('auth').style.display='none';break;
    case 'buyskin':await act('buy_skin',{p_item:t.dataset.it});break;
    case 'equip':await act('equip_skin',{p_item:t.dataset.it||null});break;
    case 'vote':if(await act('vote',{p_election:+t.dataset.e,p_cand:t.dataset.c}))toast('🗳 Голос принят');loadGov();break;
    case 'run':{const sl=($('slogan')?.value||'').trim();if(await act('run_for',{p_pos:t.dataset.pos,p_slogan:sl}))toast('Ты в списке кандидатов!');loadGov();break;}
    case 'govset':{const raw=$('gv_'+t.dataset.k)?.value??t.dataset.v??'0';const v=parseFloat(String(raw).replace(',','.'))||0;if(await act('gov_set',{p_key:t.dataset.k,p_val:t.dataset.pct?v/100:v}))toast('Сохранено');break;}
    case 'moresec':moreSec=t.dataset.s;break;
    case 'buyland':await act('buy_land',{p_id:id});break;
    case 'build':await act('build',{p_id:id,p_type:t.dataset.t});break;
    case 'hire':await act('hire',{p_id:id,p_delta:1});break;
    case 'fire':await act('hire',{p_id:id,p_delta:-1});break;
    case 'sell':await act('sell',{p_good:t.dataset.g,p_q:Math.floor(inv(me,t.dataset.g))});break;
    case 'buy':await act('buy',{p_good:t.dataset.g,p_q:5});break;
    case 'job':if(await act('take_job',{p_id:id}))toast('Иди на работу — смены пойдут автоматически');break;
    case 'quit':await act('quit_job');break;
    case 'buyunit':if(await act('buy_unit',{p_id:id}))toast('🎉 Поздравляем с покупкой!');break;
    case 'sellprop':if(confirm('Точно продать?'))await act('sell_prop',{p_id:id});break;
    case 'sethome':await act('set_home',{p_id:id});{const h=homePlot();world.me&&(world.me.goal=null);}break;
    case 'enter':if(mode==='room')leaveRoom();await enterRoom({unit:id,hostUid:me.id,hostNick:me.nick,editable:true});break;
    case 'home':if(!me)break;if(mode==='room')leaveRoom();else await enterRoom({unit:me.home_unit||0,hostUid:me.id,hostNick:me.nick,editable:true});break;
    case 'leave':leaveRoom();break;
    case 'findme':if(mode==='city'&&world.me)world.flyTo(world.me.x,world.me.y);break;
    case 'map':$('mmbox').classList.toggle('show');break;
    case 'goto':{const p=plots[+t.dataset.plot];world.flyTo(p.x,p.y,mobile?12:16);sel=p;world.select(p);tab='obj';if(mobile)sheetOpen=false;break;}
    case 'place':if(room.takeToHand(t.dataset.it)&&mobile)sheetOpen=false;break;
    case 'rot':room.rotateHand();break;
    case 'drop':room.dropHand();break;
    case 'buyfurn':if(await act('buy_furn',{p_item:t.dataset.it})&&room.state)room.state.owned=me.furn;break;
    case 'invite':{const n=$('invnick').value.trim();if(n&&await act('invite',{p_nick:n}))toast('Приглашение отправлено');break;}
    case 'logout':await sb.auth.signOut();location.reload();break;
  }
  lastBody='';renderUI();
});
$('auth').addEventListener('keydown',e=>{if(e.key==='Enter'){const b=$('authbox').querySelector('[data-auth^="do"],[data-auth="mknick"]');b&&authAction(b.dataset.auth);}});
// миникарта
{const mm=$('mm'),ctx=mm.getContext('2d');let down=false;const jump=e=>{const r=mm.getBoundingClientRect();world.jump((e.clientX-r.left)/r.width*world.W,(e.clientY-r.top)/r.height*world.H);};
  mm.addEventListener('pointerdown',e=>{down=true;jump(e);});addEventListener('pointermove',e=>{if(down)jump(e);});addEventListener('pointerup',()=>{if(down&&mobile)$('mmbox').classList.remove('show');down=false;});
  setInterval(()=>{if(mode==='city')world.drawMini(ctx,performance.now()/1000);},300);}

// ================= ОБУЧЕНИЕ (Петрович) =================
const tutFlags={room:false};let tutI=-1;
const cheapLand=()=>[...props.values()].filter(p=>p.kind==='land'&&!p.owner&&(p.reg==='v'||p.reg==='d')).sort((a,b)=>a.price-b.price||a.plot-b.plot)[0];
let recLand=null;
const TUT=[
  {t:'Здорово! Я Петрович, местный завхоз. Человечек с твоим ником — это ты. Приехал(а) налегке: 150💰 и койка в общаге.',btn:'Дальше',enter(){const m=world.me;m&&world.flyTo(m.x,m.y,mobile?9:11);}},
  {t:`Город огромный: центр с небоскрёбами и бизнес-центрами, панельки, деревня, дачи у озера, промзона, морской порт и карьер. ${mobile?'Двигай карту пальцем, щипок — зум, 🗺 — миникарта.':'Тяни карту мышкой, колесо — зум, миникарта слева внизу.'} Все люди с никами — живые игроки.`,btn:'Понял',enter(){world.flyTo(100,66,mobile?26:30);}},
  {t:'Без денег никуда. Иди в ПВЗ «Коробас» — над ним стрелка. Нажми на него и «Устроиться».',arrow:()=>pvzPlot,enter(){world.flyTo(pvzPlot.x,pvzPlot.y,mobile?10:12);},done:()=>me.job_prop!=null},
  {t:`Ты на работе! Каждая смена (${SHIFT_SEC} сек) — деньги, пока ты в игре. Копим 200💰 на первый участок.`,hl:['money'],enter(){const m=world.me;m&&world.flyTo(m.x,m.y);},done:()=>me.money>=200},
  {t:'Пора своё дело! В деревне и на дачах земля дешёвая. Отметил тебе участок — нажми и купи.',arrow:()=>recLand&&plots[recLand.plot],enter(){recLand=cheapLand();if(recLand)world.flyTo(plots[recLand.plot].x,plots[recLand.plot].y,mobile?11:13);},
    tick(){if(recLand&&props.get(recLand.id)?.owner&&props.get(recLand.id).owner!==me.id){recLand=cheapLand();}},done:()=>myPlots().length>0},
  {t:'Твоя земля! Построй 🌾 Ферму — самый дешёвый старт. Или огород, делянку, рыбацкую будку. Работник выйдет сам.',enter(){const p=myPlots()[0];if(p){sel=plots[p.plot];world.select(sel);tab='obj';sheetOpen=true;}},done:()=>myPlots().some(p=>p.building)},
  {t:'Стройка 20 секунд, потом работник начнёт добывать. Продукция копится на складе (сверху) — даже когда ты не в игре.',hl:['inv'],done:()=>GK.some(g=>inv(me,g)>=5)},
  {t:'Продай урожай: вкладка «Рынок» → «Продать». Твой грузовик повезёт товар на базу — это увидят все.',hl:['tabs'],enter(){tab='market';sheetOpen=true;},done:()=>me.sold>0},
  {t:'А теперь домой! Жми 🏠 сверху. Купи мебель и обставь комнату. Накопишь — купи квартиру получше и зови друзей в гости.',hl:['topbtns'],done:()=>tutFlags.room},
  {t:'Дальше выбирай путь: карьера (30 смен → бизнес-центр → менеджер → директор) или бизнес (переработка → точки в городе → офис в БЦ → ресторан). Удачи, сосед!',btn:'Погнали!'},
];
function tutGo(i){document.querySelectorAll('.hl').forEach(e=>e.classList.remove('hl'));
  if(i>=TUT.length){tutEnd();return;}tutI=i;if(me&&me.tut!==i){me.tut=i;act('set_tut',{p_n:i},true);}
  const s=TUT[i];s.enter&&s.enter();(s.hl||[]).forEach(id=>$(id)?.classList.add('hl'));
  $('coach').style.display='flex';$('cwho').textContent=`ПЕТРОВИЧ · ${i+1}/${TUT.length}`;$('ctxt').innerHTML=s.t;
  $('cbtn').innerHTML=(s.btn?`<span class="btn gold" data-tut="next">${s.btn}</span>`:'<span class="mut">▶ выполни — и продолжим</span>')+(i<TUT.length-1?'<span class="skip" data-tut="skip">пропустить обучение</span>':'');}
function tutEnd(){tutI=TUT.length;$('coach').style.display='none';world.arrow=null;document.querySelectorAll('.hl').forEach(e=>e.classList.remove('hl'));if(me)act('set_tut',{p_n:TUT.length},true);}
function tutCheck(){if(!me||tutI<0||tutI>=TUT.length)return;const s=TUT[tutI];s.tick&&s.tick();world.arrow=s.arrow?s.arrow():null;if(s.done&&s.done())tutGo(tutI+1);}

// ================= ЦИКЛ =================
let last=performance.now(),uiT=0,settleT=10;
function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;
  if(mode==='city')world.frameUpdate(dt);else room.render(dt);
  if(me){updateJob(dt);trackPos(false);if((settleT-=dt)<=0){settleT=15;act('settle',{},true);}}
  if((uiT-=dt)<=0||dirty){uiT=.5;renderUI();}}
requestAnimationFrame(loop);
renderUI();

if(!sb)showAuth('noserver');
else{loadWorld().then(async()=>{const {data:{session}}=await sb.auth.getSession();if(session)afterLogin();else showAuth('login');}).catch(e=>{toast('Ошибка загрузки: '+esc(e.message),8000);showAuth('login');});}
