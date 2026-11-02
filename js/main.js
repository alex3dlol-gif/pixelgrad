import * as THREE from 'three';
import {GOODS,GK,BLD,EMP,RES,FURN,REGN,HIRE_FEE,MAX_WORKERS,SHIFT_SEC,OWNER_JOB_PAY,careerOf,DORM_ROOM,BCT,lvlOf,xpFor,NEED,UNLOCKS,needFor,DAILY,SKINS,POSITIONS,QUESTS,GEAR,SLOTS,LOOK,DEFAULT_LOOK,OFFLINE_RATE,ENERGY,BUILD_MIN} from './config.js';
import {createWorld} from './world.js';
import {createRoom,WALL_COLORS,FLOOR_COLORS} from './room.js';
import {sb,rpc,selectAll} from './net.js';
import {clean} from './filter.js';

const $=id=>document.getElementById(id);
const fmt=n=>Math.floor(n).toLocaleString('ru-RU');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<820;
// встроенный браузер Instagram/TikTok/Facebook: уводим в обычный браузер (там не теряется вход и всё быстрее)
// iPhone (iOS 17+): ссылка x-safari-https:// открывает Safari; Android: intent:// открывает Chrome. Не сработало — инструкция со стрелкой к меню.
{const ua=navigator.userAgent,inApp=/Instagram|FBAN|FBAV|musical_ly|BytedanceWebview|TikTok/i.test(ua),android=/Android/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua);
  if(inApp&&!sessionStorage.getItem('pg_inapp')){
    const url=location.host+location.pathname+location.search;
    const go=android?`intent://${url}#Intent;scheme=https;package=com.android.chrome;end`:ios?`x-safari-https://${url}`:null;
    const d=document.createElement('div');d.id='inapp';
    d.innerHTML=`<div class="ia-arrow" style="display:none">⬈</div><div class="ia-box"><b style="font-size:20px">Пиксельград</b>
      ${go?`<a class="btn gold ia-go" href="${go}" style="font-size:20px;padding:12px">▶ Играть</a>`:''}
      <div class="ia-help" style="${go?'display:none':''}"><div class="ia-step">Нажми <span class="ia-dots">${android?'⋮':'⋯'}</span> вверху справа → <b>«Открыть в браузере»</b></div></div>
      <span class="ia-stay">остаться здесь</span></div>`;
    document.body.appendChild(d);
    const help=()=>{d.querySelector('.ia-help').style.display='';d.querySelector('.ia-arrow').style.display='';};
    if(!go)help();
    const btn=d.querySelector('.ia-go');if(btn)btn.addEventListener('click',()=>{setTimeout(()=>{if(!document.hidden)help();},1500);});
    d.querySelector('.ia-stay').onclick=()=>{sessionStorage.setItem('pg_inapp','1');d.remove();};}}
const world=createWorld($('c'),{mobile});
const room=createRoom(world.renderer);
const plots=world.plots;

// ================= СОСТОЯНИЕ =================
let me=null,mode='city',sel=null,tab='work',sheetOpen=!mobile,dirty=true;
const props=new Map(),profiles=new Map(),goods=new Map(),events=[],unitsByPlot=new Map();
let city=null;const qlog=new Map();let quest=null;const listings=new Map(),auctions=new Map();let mkSec='base',aucDraft=null;const gov=new Map(),elections=new Map(),cands=[],voteN=new Map();
const LV=()=>me?lvlOf(me.xp||0):1;
const EMAX=()=>Math.min(ENERGY.cap,ENERGY.base+ENERGY.perLvl*(LV()-1));
const EN=()=>me?Math.min(EMAX(),Number(me.energy??EMAX())+(Date.now()-Date.parse(me.energy_at||Date.now()))/60000/ENERGY.regenMin*(roomCtx&&roomCtx.club?3:1)):0;
const CAP=()=>100+50*myProps().filter(p=>p.building).length;const lock=n=>`<span class="mut">🔒 откроется на ${n} уровне</span>`;
const DECOR={park:'🌳 Сквер — тут гуляют жители',yard:'🛝 Двор с детской площадкой',parking:'🚗 Парковка'};
const inv=(p,g)=>Number(p?.inv?.[g]||0);
const nm=uid=>{const p=profiles.get(uid);return p?`<b style="color:${/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#fff'}">${esc(p.nick)}</b>`:'<b>игрок</b>';};
const marketPlot=plots.find(p=>p.sp==='market'),pvzPlot=plots.find(p=>p.sp==='pvzCity');
const villagePvz=plots.filter(p=>p.sp==='pvzCity'&&p.reg==='v');
const dormPlot=villagePvz[0]||plots.filter(p=>p.sp==='res').sort((a,b)=>Math.hypot(a.x-marketPlot.x,a.y-marketPlot.y)-Math.hypot(b.x-marketPlot.x,b.y-marketPlot.y))[0];

function toast(msg,ms=2800){const t=$('toast');t.innerHTML=msg;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',ms);}
async function act(name,args,quiet){try{const r=await rpc(name,args);if(r&&me&&r.id===me.id)setMe(r);dirty=true;return r??true;}catch(e){if(!quiet)toast('⚠️ '+esc(e.message));return null;}}
function price(g,extra=0){const G=goods.get(g),C=GOODS[g];const st=G?Number(G.stock):C.target*.3;return C.base*Math.max(.3,Math.min(2.5,1.8-.8*Math.max(st+extra,0)/C.target));}
const stock=g=>Number(goods.get(g)?.stock||0);
function missCost(need){let c=0,ok=true;for(const[g,q]of Object.entries(need)){const m=Math.max(0,q-inv(me,g));if(m>0){if(stock(g)<m)ok=false;c+=Math.ceil(m*price(g,-m/2)*1.15);}}return{c,ok};}
const costText=need=>Object.entries(need).map(([g,q])=>q+GOODS[g].ic).join(' ');

function setMe(p){const old=me;me={...me,...p};profiles.set(p.id,{...profiles.get(p.id),...p});
  if(old&&old.xp!=null&&lvlOf(me.xp)>lvlOf(old.xp)){const l=lvlOf(me.xp);toast(`⭐ Уровень ${l}! Открыто: ${UNLOCKS[l]||'новые возможности'}`,7000);for(const t of CITY_TABS)if(t[3]===l)newTabs.add(t[0]);if(l===2||l===3)newTabs.add('market');if(l>=2)newTabs.add('obj');lastTabs='';}
  if(old&&(old.skin!==me.skin||JSON.stringify(old.look)!==JSON.stringify(me.look))&&world.me){const m=world.me;world.setMe(me.nick,me.color,m.x,m.y,me.skin,me.look);trackPos(true);}
  if(old&&old.inv)for(const g of GK){const d=Math.floor(inv(me,g))-Math.floor(inv(old,g));if(d>0){const pl=myPlots().find(x=>x.building&&BLD[x.building].out&&BLD[x.building].out[g]);if(pl)world.float(`+${d}${GOODS[g].ic}`,pl.x,2.2,pl.y,'#fff');}}
  dirty=true;}
const myProps=()=>me?[...props.values()].filter(p=>p.owner===me.id):[];
const myPlots=()=>myProps().filter(p=>p.kind==='land').map(p=>({...plots[p.plot],...p,x:plots[p.plot].x,y:plots[p.plot].y}));

function applyProp(r){const old=props.get(r.id);const n={...old,...r};props.set(r.id,n);
  if(!old&&(n.kind==='apt'||n.kind==='office')){if(!unitsByPlot.has(n.plot))unitsByPlot.set(n.plot,[]);unitsByPlot.get(n.plot).push(n.id);}
  if(n.kind==='land'){const pr=n.owner?profiles.get(n.owner):null;
    world.setPlotState(n.plot,{nick:pr?.nick,owner:n.owner,color:pr?.color||'#ffffff',building:n.building,workers:n.workers,builtAt:n.built_at?Date.parse(n.built_at):0,level:n.level||1});
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
    selectAll('props','id,kind,plot,reg,sp,tier,floor,price,demand,owner,building,workers,built_at,premium,level'),
    sb.from('events').select('*').order('id',{ascending:false}).limit(40)]);
  g.forEach(x=>goods.set(x.good,x));pr.forEach(p=>profiles.set(p.id,p));ps.forEach(applyProp);
  (ev.data||[]).reverse().forEach(e=>events.push(e));renderTicker();
  await loadGov();
  const A=await sb.from('auctions').select('*').eq('status','open');(A.data||[]).forEach(a=>auctions.set(a.id,a));
  const L=await sb.from('listings').select('*').gt('qty',0).order('price');(L.data||[]).forEach(l=>listings.set(l.id,l));for(const l of listings.values())if(!profiles.has(l.seller))await fetchProfile(l.seller);
  sb.channel('db')
    .on('postgres_changes',{event:'*',schema:'public',table:'shipments'},p=>onShip(p.new))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat'},p=>onChat(p.new))
    .on('postgres_changes',{event:'*',schema:'public',table:'props'},p=>p.new&&p.new.id!=null&&applyProp(p.new))
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'goods'},p=>{goods.set(p.new.good,p.new);dirty=true;})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'events'},p=>onEvent(p.new))
    .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},p=>{const r=p.new;if(!r||!r.id)return;profiles.set(r.id,{...profiles.get(r.id),...r});if(me&&r.id===me.id)setMe(r);dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'city'},p=>{city=p.new;dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'auctions'},p=>{const a=p.new;if(!a||!a.id)return;if(a.status==='open')auctions.set(a.id,a);else auctions.delete(a.id);for(const u of[a.seller,a.bidder])if(u&&!profiles.has(u))fetchProfile(u);dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'listings'},p=>{const l=p.new;if(!l||!l.id)return;if(l.qty>0){listings.set(l.id,l);if(!profiles.has(l.seller))fetchProfile(l.seller);}else listings.delete(l.id);dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'government'},p=>{gov.set(p.new.position,p.new);dirty=true;})
    .on('postgres_changes',{event:'*',schema:'public',table:'elections'},()=>loadGov())
    .on('postgres_changes',{event:'*',schema:'public',table:'candidates'},()=>loadGov())
    .subscribe();
}
async function loadQuestLog(){if(!me)return;const {data}=await sb.from('quest_log').select('*').eq('uid',me.id);qlog.clear();(data||[]).forEach(r=>qlog.set(r.quest,r));dirty=true;}
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
  cityCh.track({nick:me.nick,color:me.color,skin:me.skin||null,look:me.look||null,x:+m.x.toFixed(2),y:+m.y.toFixed(2),working:!!m.working});}

// ================= АВТОРИЗАЦИЯ =================
const COLORS=['#ffd166','#06d6a0','#118ab2','#ef476f','#ffffff','#ff7f11','#9b5de5','#8ac926'];let myColor=COLORS[Math.floor(Math.random()*COLORS.length)],authMode='login'; // цвет ника выбирается сам
function showAuth(m,msg=''){authMode=m;$('auth').style.display='flex';const b=$('authbox');
  if(m==='noserver'){b.innerHTML=`<h3 style="font-size:16px">ПИКСЕЛЬГРАД</h3><div>Сервер ещё не подключён (нет ключа Supabase). Город можно посмотреть, но играть пока нельзя.</div>`;return;}
  const tabs=`<div class="atabs"><div class="tab ${m==='login'?'on':''}" data-auth="login">Вход</div><div class="tab ${m==='register'?'on':''}" data-auth="register">Регистрация</div></div>`;
  const sw='';
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
  $('auth').style.display='none';setMe(data);$('coach').style.display='none';
  if(!me.look)showCreator(true);
  if(!me.onboarded){startOnboarding();return;}
  enterWorld();
}
function enterWorld(){world.setFog(false);
  const h=homePlot(),ok=me.last_x!=null&&world.walkable(Math.round(me.last_x),Math.round(me.last_y));const sx=ok?me.last_x:h.x0+1,sy=ok?me.last_y:h.y0+3;
  world.setMe(me.nick,me.color,Math.round(sx),Math.round(sy),me.skin,me.look);world.jump(sx,sy);
  joinPresence();act('settle',{},true);loadQuestLog();loadChat();loadShips();if(me.club)act('club_leave',{},true);
  if(longOn()&&longLeft()<=0)toast('🕒 Долгая смена закончилась! Забери награду во вкладке «💼 Дела»',9000);tab='work';
  if(me.look&&me.last_daily!==new Date().toISOString().slice(0,10))showDaily();
  dirty=true;
}
// ================= ЧАТ ГОРОДА =================
const chatMsgs=[];let chatOpen=false;
const okColor=c=>/^#[0-9a-f]{3,6}$/i.test(c||'')?c:'#ffd166';
const chatLine=m=>`<div class="cl"><b style="color:${okColor(m.color)}">${esc(clean(m.nick))}:</b> ${esc(clean(m.text))}</div>`;
function drawChat(){$('cclist').innerHTML=(chatOpen?chatMsgs.slice(-40):chatMsgs.slice(-3)).map(chatLine).join('')||'<div class="cl mut">Пока тихо — напиши первым 💬</div>';
  $('cchat').classList.toggle('open',chatOpen);if(chatOpen){const l=$('cclist');l.scrollTop=l.scrollHeight;}}
function onChat(m){if(!m||chatMsgs.some(x=>x.id===m.id))return;chatMsgs.push(m);if(chatMsgs.length>60)chatMsgs.shift();drawChat();}
async function loadChat(){if(!sb)return;const{data}=await sb.from('chat').select('*').order('id',{ascending:false}).limit(40);if(data){chatMsgs.length=0;chatMsgs.push(...data.reverse());}drawChat();}
async function sendChat(){const i=$('ccin'),t=i.value.trim();if(!t||!sb)return;i.value='';if(!await act('say',{p_text:t}))i.value=t;}
$('cclist').onclick=()=>{if(chatOpen)return;chatOpen=true;if(mobile&&sheetOpen){sheetOpen=false;dirty=true;}drawChat();setTimeout(()=>$('ccin').focus(),50);};
$('ccx').onclick=()=>{chatOpen=false;$('ccin').blur();drawChat();};
$('ccsend').onclick=sendChat;$('ccin').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();if(e.key==='Escape')$('ccx').onclick();});
drawChat();
function homePlot(){const u=me?.home_unit&&props.get(me.home_unit);return u?plots[u.plot]:dormPlot;}
const villageSpawn=()=>{const p=villagePvz[Math.floor(Math.random()*villagePvz.length)]||dormPlot;return{x:p.x0+1,y:p.y0+3,id:p.id};};
// «дом» до покупки квартиры — родная деревня (ПВЗ, у которого высадился игрок)
function homeVillage(){let id=+localStorage.getItem('pg_vil');if(plots[id]&&plots[id].sp==='pvzCity')return plots[id];
  const m=world.me||{x:me?.last_x||0,y:me?.last_y||0};const p=villagePvz.slice().sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y))[0];if(p)localStorage.setItem('pg_vil',p.id);return p;}
function homeSpot(){const u=me?.home_unit&&props.get(me.home_unit);if(u&&plots[u.plot])return plots[u.plot];return homeVillage();}
const nearPlot=(v,sp)=>plots.filter(p=>p.sp===sp).sort((a,b)=>Math.hypot(a.x-v.x,a.y-v.y)-Math.hypot(b.x-v.x,b.y-v.y))[0];
const nearStopV=v=>world.STOPS.slice().sort((a,b)=>Math.hypot(a.x-v.x,a.y-v.y)-Math.hypot(b.x-v.x,b.y-v.y))[0];

// ================= РАБОТА / СМЕНЫ =================
let shiftT=0,shiftBusy=false;
function jobTarget(){const p=me&&(longOn()?props.get(me.long_prop):me.job_prop!=null&&props.get(me.job_prop));if(!p)return null;const pl=plots[p.plot];
  if(pl.sp==='market'){const t=world.marketTile();return{x:t[0],y:t[1]};}return pl.door;}
function updateQuest(dt){const m=world.me;if(!quest||!m)return false;const Q=QUESTS[quest.id],P=world.POIS[Q.poi];
  if(quest.phase==='go'){if(!m.path.length&&Math.hypot(m.x-P.x,m.y-P.y)<2.5){quest.phase='start';act('start_quest',{p_id:quest.id}).then(r=>{if(r){quest.phase='do';quest.t=0;}else quest=null;dirty=true;});}
    else if(!m.path.length&&!quest.retry){quest.retry=1;world.goMe(P.x,P.y);}}
  if(quest&&quest.phase==='do'){m.working=true;quest.t+=dt;const b=$('questbar');if(b)b.style.width=Math.min(100,quest.t/Q.dur*100)+'%';
    if(quest.t>=Q.dur&&!quest.busy){quest.busy=true;const id=quest.id;act('finish_quest',{p_id:id}).then(r=>{if(r){const rw=[Q.money&&`+${Q.money}💰`,Q.gems&&`+${Q.gems}💎`,Q.good&&`+${Q.qty}${GOODS[Q.good].ic}`,`+${Q.xp} XP`].filter(Boolean).join(' ');world.float(rw,m.x,1.7,m.y,'#c8ffb0');toast(`✅ ${Q.n}: ${rw}`);}quest=null;m.goal=null;loadQuestLog();});}}
  return true;}
function updateJob(dt){const m=world.me;if(!m||!me)return;if(m.hold){m.working=false;return;}if(updateQuest(dt))return;const t=jobTarget();
  if(t){const key=t.x+','+t.y;if(m.goal!==key){m.goal=key;world.goMe(t.x,t.y);shiftT=0;}
    const at=!m.path.length&&Math.round(m.x)===t.x&&Math.round(m.y)===t.y;m.working=at;
    if(longOn())return;
    if(at&&EN()<ENERGY.shift){m.working=false;const sb=$('shiftbar');if(sb)sb.style.width='0%';return;}
    if(at&&!document.hidden){shiftT+=dt;if(shiftT>=SHIFT_SEC&&!shiftBusy){shiftBusy=true;const before=me.money;
      act('work_shift',{},true).then(r=>{shiftBusy=false;shiftT=0;if(r){const d=Math.round(me.money-before);if(d>0)world.float(`+${d}💰 смена`,m.x,1.6,m.y);}else{act('settle',{},true);}});}}
    const sb_=$('shiftbar');if(sb_)sb_.style.width=Math.min(100,shiftT/SHIFT_SEC*100)+'%';}
  else{m.working=false;m.goal=null;}}
function jobInfo(p){if(!p)return null;if(p.kind==='npc'){const e=EMP[p.sp];let pay=e.pay;if(p.sp==='bc'&&me)pay=me.shifts>=300?30:me.shifts>=100?20:12;return{n:p.sp==='bc'?'Бизнес-центр':e.n,pay,req:e.req,job:e.job};}
  if(p.building&&p.owner&&(!me||p.owner!==me.id))return{n:`${BLD[p.building].n} (${esc(profiles.get(p.owner)?.nick||'игрок')})`,pay:OWNER_JOB_PAY,req:0,job:BLD[p.building].w.toLowerCase()};return null;}

// ================= КВАРТИРА =================
let roomCh=null,roomCtx=null,saveT=null,clubT=null;
setInterval(()=>{if(roomCtx&&roomCtx.club)dirty=true;},2000);
// Клубы: ДК в деревнях и кинотеатр в городе. Мебель общая, двигать нельзя; пока ты внутри — ⚡ копится втрое быстрее
const CLUBS={
  dk:{n:'Дом культуры',ic:'🎭',size:[9,7],tier:'club',layout:[
    {i:'plant',x:0,y:0},{i:'shelf',x:1,y:0},{i:'aquarium',x:7,y:0},{i:'plant',x:8,y:0},
    {i:'sofa',x:0,y:2,r:2},{i:'chair',x:3,y:2,r:2},{i:'chair',x:4,y:2,r:2},{i:'chair',x:5,y:2,r:2},{i:'sofa',x:7,y:2,r:2},
    {i:'chair',x:1,y:5},{i:'table',x:2,y:5},{i:'chair',x:3,y:5},{i:'chair',x:5,y:5},{i:'table',x:6,y:5},{i:'chair',x:7,y:5},
    {i:'lamp',x:0,y:6},{i:'lamp',x:8,y:6}]},
  cinema:{n:'Кинотеатр «Мир»',ic:'🎬',size:[10,8],tier:'cinema',layout:[
    {i:'plant',x:0,y:0},{i:'plant',x:9,y:0},
    {i:'sofa',x:1,y:3,r:2},{i:'sofa',x:3,y:3,r:2},{i:'sofa',x:5,y:3,r:2},{i:'sofa',x:7,y:3,r:2},
    ...[1,2,3,4,5,6,7,8].map(x=>({i:'chair',x,y:5,r:2})),
    {i:'lamp',x:0,y:7},{i:'table',x:4,y:7},{i:'table',x:5,y:7},{i:'lamp',x:9,y:7}]},
};
// в клуб заходят ногами: сначала персонаж доходит до здания, потом вход
let pendingClub=null;
function goClub(id){const pr=props.get(id);if(!pr)return;const pl=plots[pr.plot],m=world.me;if(!m)return;
  if(Math.hypot(m.x-pl.door.x,m.y-pl.door.y)<=3)return enterClub(id);
  pendingClub=id;m.hold=true;m.goal=null;world.goMe(pl.door.x,pl.door.y);if(mobile)sheetOpen=false;dirty=true;}
function checkPendingClub(){if(pendingClub==null)return;const m=world.me,pr=props.get(pendingClub);if(!m||!pr){pendingClub=null;return;}const pl=plots[pr.plot];
  if(Math.hypot(m.x-pl.door.x,m.y-pl.door.y)<=1.5&&!m.path.length&&!m.riding){const id=pendingClub;pendingClub=null;enterClub(id);}}
async function enterClub(id){const pr=props.get(id),C=pr&&CLUBS[pr.sp];if(!C)return;const m=world.me;
  if(m)await rpc('set_pos',{p_x:m.x,p_y:m.y}).catch(()=>{});
  if(!await act('club_enter',{p_id:id}))return;
  await enterRoom({unit:id,club:C,editable:false});
  clubT=setInterval(()=>act('club_ping',{},true),30000);toast(`${C.ic} ${C.n} · ⚡×3`);}
function clubHTML(){const C=roomCtx&&roomCtx.club;if(!C)return'';const n=room.state?Math.max(1,room.state.people.size):1;
  return`<h3>${C.ic} ${C.n}</h3><div>⚡ Энергия здесь копится <b>×3</b></div>
  <div style="font-size:22px;margin:6px 0">⚡ ${Math.floor(EN())}/${EMAX()}</div>
  <div>👥 Сейчас здесь: <b>${n}</b></div>
  <span class="btn red" data-act="leave">← Выйти в город</span>`;}
async function enterRoom({unit,hostUid,hostNick,editable,club}){
  if(club){roomCtx={unit:'club'+unit,club,editable:false};
    room.open({size:club.size,tier:club.tier,layout:club.layout,editable:false,owned:{},elsewhere:{},title:club.ic+' '+club.n,makeAvatar:world.makeAvatar,meId:me.id,
      onSave:()=>{},onMove:m=>roomCh&&roomCh.send({type:'broadcast',event:'move',payload:{uid:me.id,...m}})});
    unit='club'+unit;tab='club';}
  else{
  if(!unit){toast('Своего жилья пока нет. Квартиры продаются во вкладке «🏠 Жильё» (с 4 уровня).');return;}
  const {data,error}=await sb.from('props').select('room,tier').eq('id',unit).single();if(error||!data)return toast('Не удалось открыть квартиру');
  const layout=data.room||[],tier=data.tier,size=RES[tier].room;const elsewhere={};
  if(editable){const {data:mine}=await sb.from('props').select('id,room').eq('owner',me.id).eq('kind','apt');
    for(const r of mine||[])if(r.id!==unit)for(const o of r.room||[])if(o.i[0]!=='_')elsewhere[o.i]=(elsewhere[o.i]||0)+1;}
  const title=(editable?'Мой дом':'В гостях у '+hostNick)+' · '+RES[tier].n;
  roomCtx={unit,hostUid,editable};
  room.open({size,tier,layout,editable,owned:me.furn||{},elsewhere,title,makeAvatar:world.makeAvatar,meId:me.id,
    onSave:l=>{clearTimeout(saveT);saveT=setTimeout(()=>act('save_room',{p_unit:unit,p_layout:l}),500);dirty=true;},
    onMove:m=>roomCh&&roomCh.send({type:'broadcast',event:'move',payload:{uid:me.id,...m}})});
  tab='furn';}
  mode='room';document.body.classList.add('inroom');$('roomui').style.display='flex';$('chat').style.display='block';
  $('reditbtn').style.display=editable?'':'none';$('chatin').placeholder=club?'Сообщение…':'Сообщение…';
  sheetOpen=!club&&!mobile;document.body.classList.toggle('inclub',!!club);dirty=true;
  roomCh=sb.channel('room:'+unit,{config:{presence:{key:me.id}}});
  roomCh.on('presence',{event:'sync'},()=>{const st=roomCh.presenceState();room.setPeople(Object.entries(st).map(([uid,a])=>({uid,...a[a.length-1]})));dirty=true;})
    .on('broadcast',{event:'chat'},({payload})=>room.say(payload.uid,clean(payload.text)))
    .on('broadcast',{event:'move'},({payload})=>room.moveOther(payload.uid,payload))
    .subscribe(s2=>{if(s2==='SUBSCRIBED')roomCh.track({nick:me.nick,color:me.color,look:me.look||null,skin:me.skin||null});});
}
function leaveRoom(){document.body.classList.remove('inclub');if(clubT){clearInterval(clubT);clubT=null;act('club_leave',{},true);}room.close();if(roomCh){roomCh.unsubscribe();roomCh=null;}mode='city';roomCtx=null;document.body.classList.remove('inroom');
  $('roomui').style.display='none';$('chat').style.display='none';tab='home';dirty=true;}
function onInvite(inv){if(!inv.unit)return;toast(`🔔 <b>${esc(inv.from_nick)}</b> зовёт в гости! <span class="btn gold" data-visit="${inv.unit}" data-host="${inv.from_uid}" data-hn="${esc(inv.from_nick)}">Пойти</span>`,12000);}
$('chatin').addEventListener('keydown',e=>{if(e.key!=='Enter'||!roomCh)return;const t=e.target.value.trim().slice(0,120);if(!t)return;
  roomCh.send({type:'broadcast',event:'chat',payload:{uid:me.id,text:t}});room.say(me.id,clean(t));e.target.value='';});
{let rd=null;const cv=$('c');
  cv.addEventListener('pointerdown',e=>{if(mode==='room')rd={x:e.clientX,y:e.clientY};});
  cv.addEventListener('pointermove',e=>{if(mode==='room'&&e.pointerType==='mouse')room.pointer(e.clientX,e.clientY,false);});
  cv.addEventListener('pointerup',e=>{if(mode!=='room'||!rd)return;if(Math.hypot(e.clientX-rd.x,e.clientY-rd.y)<10){room.pointer(e.clientX,e.clientY,false);room.pointer(e.clientX,e.clientY,true);}rd=null;dirty=true;});
  addEventListener('keydown',e=>{if(mode==='room'&&e.code==='KeyR'&&e.target.tagName!=='INPUT')room.rotateHand();});}

// ================= ВЫБОР НА КАРТЕ =================
// ================= АВТОБУСЫ (бесплатно) =================
const nearStop=(x,y,r)=>{let b=null,bd=r;world.STOPS.forEach((s,i)=>{const d=Math.hypot(s.x+.5-x,s.y-.5-y);if(d<bd){bd=d;b=i;}});return b;};
let stopSel=null;
function stopHTML(){const s=world.STOPS[stopSel];if(!s)return'';const m=world.me,d=m?Math.hypot(m.x-s.x,m.y-s.y):99;
  return`<h3>🚌 Остановка «${esc(s.name)}»</h3><div>Проезд бесплатный</div>`+
  (d<=3?`<span class="btn gold" data-act="busmap">🗺 Куда едем?</span>`:`<div class="mut" style="margin-top:6px">Подойди ближе к остановке.</div><span class="btn blue" data-act="gostop">Идти к остановке</span>`);}
function showBusMap(){const S=world.STOPS,from=stopSel;$('auth').style.display='flex';
  $('authbox').innerHTML=`<h3 style="font-size:14px">🚌 Куда едем?</h3>
  <div style="position:relative"><canvas id="buscv" width="800" height="640" style="width:100%;display:block;image-rendering:pixelated;border:3px solid #0e0b14;cursor:grab;touch-action:none"></canvas>
  <div style="position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px"><span class="btn sm" id="busin">＋</span><span class="btn sm" id="busout">－</span></div></div>
  <div style="max-height:22vh;overflow:auto;margin-top:6px">${S.map((s,i)=>i===from?'':`<span class="btn sm ${s.reg==='c'?'blue':''}" data-act="busgo" data-i="${i}">${s.reg==='c'?'🏙':'🏡'} ${esc(s.name)}</span>`).join('')}</div>
  <span class="btn" data-act="closemodal">Отмена</span>`;
  // своя камера карты: палец — двигать, два пальца — приблизить, тап по остановке — ехать; страница не зумится
  const cv=$('buscv'),W=world.W,H=world.H,v={s:1,cx:W/2,cy:H/2,px:1};
  const fit=()=>{v.px=cv.width/Math.max(1,cv.clientWidth);const half=W/2/v.s,halfH=H/2/v.s;v.cx=Math.max(half,Math.min(W-half,v.cx));v.cy=Math.max(halfH,Math.min(H-halfH,v.cy));world.busMap(cv,from,v);};
  const toMap=(cx,cy)=>{const r=cv.getBoundingClientRect(),k=r.width/W*v.s;return{x:v.cx+(cx-r.left-r.width/2)/k,y:v.cy+(cy-r.top-r.height/2)/k};};
  const zoomAt=(f,cx,cy)=>{const a=toMap(cx,cy);v.s=Math.max(1,Math.min(6,v.s*f));const b=toMap(cx,cy);v.cx+=a.x-b.x;v.cy+=a.y-b.y;fit();};
  const ptr=new Map();let moved=0,pd=0;
  cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=ptr.size>1?99:0;
    if(ptr.size===2){const[a,b]=[...ptr.values()];pd=Math.hypot(a.x-b.x,a.y-b.y);}};
  cv.onpointermove=e=>{const p=ptr.get(e.pointerId);if(!p)return;const r=cv.getBoundingClientRect(),k=r.width/W*v.s;
    if(ptr.size===1){const dx=e.clientX-p.x,dy=e.clientY-p.y;moved+=Math.abs(dx)+Math.abs(dy);v.cx-=dx/k;v.cy-=dy/k;p.x=e.clientX;p.y=e.clientY;fit();}
    else{p.x=e.clientX;p.y=e.clientY;const[a,b]=[...ptr.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pd>0)zoomAt(d/pd,(a.x+b.x)/2,(a.y+b.y)/2);pd=d;}};
  cv.onpointerup=cv.onpointercancel=e=>{const had=ptr.has(e.pointerId);ptr.delete(e.pointerId);if(ptr.size<2)pd=0;
    if(had&&ptr.size===0&&moved<8){const m=toMap(e.clientX,e.clientY),i=nearStop(m.x,m.y,14/v.s);if(i!=null&&i!==from)busGo(i);}};
  cv.onwheel=e=>{e.preventDefault();zoomAt(e.deltaY>0?1/1.2:1.2,e.clientX,e.clientY);};
  $('busin').onclick=()=>{const r=cv.getBoundingClientRect();zoomAt(1.5,r.left+r.width/2,r.top+r.height/2);};
  $('busout').onclick=()=>{const r=cv.getBoundingClientRect();zoomAt(1/1.5,r.left+r.width/2,r.top+r.height/2);};
  const s0=S[from];if(s0){v.s=2;v.cx=s0.x;v.cy=s0.y;}requestAnimationFrame(fit);}
// браузер на телефоне не должен масштабировать страницу целиком (iOS игнорирует user-scalable=no)
for(const ev of['gesturestart','gesturechange','gestureend'])document.addEventListener(ev,e=>e.preventDefault(),{passive:false});
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
function busGo(i){const s=world.STOPS[i],f=world.STOPS[stopSel];if(!s)return;
  $('authbox').innerHTML=`<div style="text-align:center;padding:20px"><div style="font-size:48px" id="busic">🚌</div><div>${esc(f?f.name:'')} → <b>${esc(s.name)}</b></div></div>`;
  setTimeout(()=>{$('auth').style.display='none';sheetOpen=false;dirty=true;const m=world.me;if(m){m.goal=null;m.hold=true;}
    world.busRide(stopSel,i,()=>{stopSel=i;const m=world.me;if(m){m.goal=null;m.hold=true;}trackPos(true);rpc('set_pos',{p_x:s.x,p_y:s.y}).catch(()=>{});toast(`🚌 ${esc(s.name)}`);dirty=true;});},400);}
world.onTap=(p,g)=>{if(mode!=='city')return;if(world.me)world.me.hold=false;pendingClub=null;if(!ob&&g){const si=nearStop(g.x,g.z,1.6);if(si!=null){stopSel=si;tab='stop';sheetOpen=true;sel=null;world.select(null);dirty=true;return;}}if(ob){const k=obHotspot(g);if(k){ob.sel=k;tab='ob';sheetOpen=true;}else if(mobile&&sheetOpen)sheetOpen=false;dirty=true;return;}if(mobile&&sheetOpen){sheetOpen=false;sel=null;world.select(null);dirty=true;return;}sel=p;world.select(p);if(p){tab='obj';sheetOpen=true;}dirty=true;};
world.onHover=(p,e)=>{const t=$('tip');if(!p||!e){t.style.display='none';return;}t.style.display='block';t.style.left=e.clientX+16+'px';t.style.top=e.clientY+12+'px';t.innerHTML=tipHTML(p);};
function tipHTML(p){if(DECOR[p.sp])return DECOR[p.sp];if(CLUBS[p.sp])return`${CLUBS[p.sp].ic} ${CLUBS[p.sp].n} · ⚡×3, пока ты внутри`;if(p.sp==='shop')return`<b>${p.name}</b><br>работа: кассир, ${EMP.shop.pay}💰/смена`;if(p.sp==='res')return`🏢 ${RES[p.rt].n} · квартиры`;if(p.sp==='bc')return'🏙 Бизнес-центр · офисы и работа';if(p.sp)return`<b>${EMP[p.sp].n}</b><br>работа: ${EMP[p.sp].pay}💰/смена`;
  const pr=props.get(p.id);if(!pr)return'';if(!pr.owner)return`Участок · ${REGN[p.reg]}<br>Продаётся: <b>${pr.price}💰</b>`;return`${nm(pr.owner)}<br>${pr.building?BLD[pr.building].ic+' '+BLD[pr.building].n:'пустой участок'}`;}

// ================= ВКЛАДКИ =================
const CITY_TABS=[['work','💼','Дела'],['market','🏪','Рынок'],['home','🏠','Жильё',2],['more','☰','Ещё']];
let coachMin=false,lastInvOpen=false;
const newTabs=new Set();
const ROOM_TABS=[['furn','🛋','Мебель'],['guests','👥','Гости']],CLUB_TABS=[['club','⚡','Клуб']];
function ioText(b){if(b.kind==='retail')return'твой товар со склада → розница ×1.6';if(b.kind==='gather')return`→ ${b.rate}${Object.keys(b.out).map(g=>GOODS[g].ic).join('')}/мин`;
  if(b.kind==='proc')return`${costText(b.in)} → ${Object.entries(b.out).map(([g,q])=>q+GOODS[g].ic).join('')} · ${b.rate}/мин`;
  return`${Object.keys(b.in).length?costText(b.in):'📦'} → ${b.pay}💰/клиент`;}
function nextStep(){if(!me)return null;const l=LV(),mp=myPlots(),cl=cheapLand(),xpBar=(n)=>`<div class="bar"><i style="width:${Math.min(100,(me.xp||0)/xpFor(n)*100)}%"></i></div>`;
  if(me.job_prop==null&&me.shifts===0)return{t:'Устройся на работу',d:'ПВЗ «Коробас» платит за каждую смену — это первые деньги и опыт.',a:'goto',v:pvzPlot.id,b:'Показать ПВЗ'};
  if(!mp.length){if(l<2)return{t:'Дорасти до 2 уровня',d:`Опыт ${me.xp||0}/${xpFor(2)} — даётся за смены и задания. На 2 уровне можно купить землю.`+xpBar(2),a:'tab',v:'work',b:'Задания рядом'};
    if(cl&&me.money<cl.price)return{t:'Накопи на участок',d:`Самый дешёвый участок — ${cl.price}💰, у тебя ${fmt(me.money)}💰. Смены и задания помогут.`,a:'tab',v:'work',b:'Работа и задания'};
    return{t:'Купи участок',d:'В деревнях и на дачах земля дешёвая. Своя земля — свой бизнес.',a:'land',b:'Показать участок'};}
  const nob=mp.find(p=>!p.building);if(!mp.some(p=>p.building))return{t:'Построй первый бизнес',d:'🌾 Ферма — самый дешёвый старт. Ещё есть сад, огород, пасека, делянка.',a:'goto',v:nob.plot,b:'К участку'};
  if(!me.sold&&!listings.size)return{t:'Продай урожай',d:'Рынок → «Продать». Грузовик отвезёт товар на оптовую базу.',a:'tab',v:'market',b:'Открыть рынок'};
  if(l<3)return{t:'Дорасти до 3 уровня',d:'Откроются найм работников (больше продукции) и свой магазин.'+xpBar(3),a:'tab',v:'work',b:'Задания'};
  if(!mp.some(p=>p.workers>=2))return{t:'Найми второго работника',d:'Два работника — вдвое больше продукции.',a:'goto',v:mp.find(p=>p.building).plot,b:'К бизнесу'};
  if(l<4)return{t:'Дорасти до 4 уровня',d:'Откроются переработка (дороже сырья) и покупка квартиры.'+xpBar(4),a:'tab',v:'work',b:'Задания'};
  if(!mp.some(p=>BLD[p.building]?.kind==='proc'))return{t:'Построй переработку',d:'Мельница, пилорама, соковый цех… Переработанный товар стоит в разы дороже. Можно купить новый участок или сырьё на бирже у других.',a:'land',b:'Найти участок'};
  if(!myProps().some(p=>p.kind==='apt'))return{t:'Купи квартиру',d:'Хрущёвка — от ~525💰. Обставь мебелью и зови друзей в гости.',a:'tab',v:'home',b:'Квартиры'};
  if(l<5)return{t:'Дорасти до 5 уровня',d:'Откроются точки в городе: ПВЗ, шаурмичные, ларьки.'+xpBar(5),a:'tab',v:'work',b:'Задания'};
  if(!mp.some(p=>p.reg==='c'&&p.building))return{t:'Открой точку в городе',d:'Город — главный рынок сбыта: жители платят за готовое.',a:'tab',v:'market',b:'Рынок'};
  return{t:'Ты освоился!',d:'Торгуй на бирже, собирай экипировку, иди на выборы мэра. Следующая цель — офис в бизнес-центре и ресторан.',a:'tab',v:'more',b:'Ещё'};}
function profileHTML(){if(!me)return'';const l=LV(),x0=xpFor(l),x1=xpFor(l+1),biz=myPlots().filter(p=>p.building).length,apt=myProps().filter(p=>p.kind==='apt').length;
  return`<h3>👤 Профиль</h3><div class="row"><span style="color:${me.color};font-size:20px;font-weight:700">${esc(me.nick)}</span><br>
    <span class="mut">${careerOf(me.shifts)} · уровень ${l} (${me.xp||0}/${x1} XP)</span><div class="bar"><i style="width:${Math.min(100,((me.xp||0)-x0)/(x1-x0)*100)}%"></i></div></div>
  <div class="row">💰 ${fmt(me.money)} · 💎 ${me.gems||0} · ⚡ ${Math.floor(EN())}/${EMAX()}<br><span class="mut">Смен: ${me.shifts} · бизнесов: ${biz} · квартир: ${apt} · серия входов: ${me.streak||0} дн.</span></div>
  <div class="row"><span class="btn blue" data-act="plook">👤 Внешность</span>${l>=3?'<span class="btn blue" data-act="psec" data-s="gear">🦺 Экипировка</span>':''}</div>
  <div class="row"><span class="btn red" data-act="logout2">🚪 Выйти из аккаунта</span></div>`;}
// ===== Грузы в пути: товар едет на базу несколько минут, деньги — по прибытии =====
const shipm=new Map();
async function loadShips(){if(!sb||!me)return;const{data}=await sb.from('shipments').select('*').eq('uid',me.id).eq('done',false);shipm.clear();for(const r of data||[])shipm.set(r.id,r);dirty=true;}
function onShip(r){if(!me||!r||r.uid!==me.id)return;if(r.done){if(shipm.delete(r.id)){const d=Math.round(r.rev-r.tax);toast(`🚚 Груз на базе: +${fmt(d)}💰`);world.me&&world.float(`+${fmt(d)}💰`,world.me.x,1.7,world.me.y,'#c8ffb0');}}else shipm.set(r.id,r);dirty=true;}
function shipsHTML(){if(!shipm.size)return'';return`<h3 style="margin-top:4px">🚚 В пути</h3>`+[...shipm.values()].map(r=>{const left=new Date(r.arrive_at)-Date.now();
  return`<div class="row">${r.q}${GOODS[r.good]?.ic||''} → <b>${fmt(r.rev-r.tax)}💰</b> <span class="mut">${left>0?'через '+hm(left):'разгрузка…'}</span></div>`;}).join('');}
setInterval(()=>{if(shipm.size)dirty=true;},15000);
function invHTML(){if(!me)return'';const c=CAP(),gs=GK.filter(g=>inv(me,g)>=1);let h=shipsHTML()+`<h3>📦 Склад</h3><div class="mut">Вместимость: ${c} на товар</div>`;
  if(!gs.length)return h+'<div class="row mut">Пока пусто. Купи участок и построй ферму — урожай появится здесь.</div>';
  for(const g of gs){const q=Math.floor(inv(me,g)),pc=Math.min(100,q/c*100);h+=`<div class="row">${GOODS[g].ic} <b>${GOODS[g].n}</b> — ${q}/${c} <span class="mut">≈${Math.round(q*price(g,q/2))}💰 на базе</span><div class="bar"><i style="width:${pc}%;background:${pc>=100?'#c0392b':pc>80?'#e67e22':'#ffd166'}"></i></div>
    <span class="btn sm" data-act="sell" data-g="${g}">Продать на базу</span>${LV()>=2?`<span class="btn sm blue" data-act="toex">На биржу</span>`:''}</div>`;}
  return h;}
function nextHTML(){const n=nextStep();if(!n)return'';return`<div class="box" style="border-color:#7bd389;padding:8px"><div class="mut" style="color:#7bd389">🎯 ЧТО ДЕЛАТЬ ДАЛЬШЕ</div><b>${n.t}</b><div style="font-size:14px;margin:4px 0">${n.d}</div><span class="btn gold sm" data-act="next" data-a="${n.a}" data-v="${n.v??''}">${n.b} →</span></div>`;}
function bizHTML(pr){const b=BLD[pr.building],building=pr.built_at&&Date.parse(pr.built_at)>Date.now();
  const lv=pr.level||1,mx=MAX_WORKERS+(lv>=3?1:0)+(lv>=5?1:0);
  let h=`<h3>${b.ic} ${b.n} <span style="color:#f1c40f">${'★'.repeat(lv)}${'☆'.repeat(5-lv)}</span></h3><div class="mut">${b.desc}</div><div style="margin:6px 0">${ioText(b)} на работника · зарплата ${b.wage}💰/мин каждому</div><div class="mut">🟢 Пока ты в игре — 100% выработки, офлайн — ${Math.round(OFFLINE_RATE*100)}% (до 8 ч).</div>`;
  if(b.kind==='service'||b.kind==='retail')h+=`<div class="mut">Спрос района: ~${pr.demand} клиентов/мин (делится с конкурентами рядом)</div>`;
  if(building){const left=Math.max(0,Math.ceil((Date.parse(pr.built_at)-Date.now())/1000)),gc=Math.max(1,Math.ceil(left/120));h+=`<div>🏗 Строится… <b>${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}</b> <span class="btn sm gold" data-act="speedup" data-id="${pr.id}">⚡ Ускорить за ${gc}💎</span></div>`;}
  h+=`<div style="margin:6px 0">Работники: <b>${pr.workers}/${mx}</b> · уровень здания <b>${lv}</b> (выпуск ×${(1+.4*(lv-1)).toFixed(1)})</div>`;
  if(!building&&lv<5){const nl=lv+1,cost=b.cost*[1,2,4,8][nl-2],mins=({gather:3,retail:10,proc:15,service:30}[b.kind]||3)*(pr.kind==='office'?4:1)*[3,8,20,60][nl-2],mat={planks:6*nl,...(nl>=3?{bricks:5*(nl-2)}:{})},m=missCost(mat);
    h+=`<div class="row">⬆ <b>Улучшить до ${nl} уровня</b>: выпуск ×${(1+.4*(nl-1)).toFixed(1)}${nl===3||nl===5?', +1 место для работника':''}, склад +50<br><span class="mut">${fmt(cost)}💰 + ${costText(mat)} · ⏱ ${mins>=60?Math.round(mins/60*10)/10+' ч':mins+' мин'} · нужен ${nl} ур. игрока</span><br>`+
      (LV()>=nl?`<span class="btn gold ${me.money>=cost+m.c&&m.ok?'':'dis'}" data-act="upgrade" data-id="${pr.id}">Улучшить · ${fmt(cost+m.c)}💰</span>`:lock(nl))+'</div>';}
  if(LV()>=NEED.hire)h+=`<span class="btn ${pr.workers<mx?'':'dis'}" data-act="hire" data-id="${pr.id}">Нанять (+${HIRE_FEE}💰)</span><span class="btn red ${pr.workers?'':'dis'}" data-act="fire" data-id="${pr.id}">Уволить</span>`;
  h+=`<div class="mut" style="margin-top:6px">Живые игроки тоже могут устроиться к тебе: ты платишь им ${OWNER_JOB_PAY}💰 за смену, а их смена даёт продукцию.</div>`;
  h+=`<div style="margin-top:8px">${LV()>=2?aucBtn(pr):''}<span class="btn red sm" data-act="sellprop" data-id="${pr.id}">Продать городу (~50%)</span></div>`;return h;}
function buildListHTML(pr){let h=`<div class="mut">Выбери, что построить.</div>`;
  const here=Object.entries(BLD).filter(([k,b])=>b.reg.includes(pr.reg)),locked=here.filter(([k,b])=>LV()<needFor(b));
  for(const[k,b]of here){if(LV()<needFor(b))continue;const m=missCost(b.mat),c=b.cost+m.c,can=me&&me.money>=c&&m.ok;
    h+=`<div class="row"><b>${b.ic} ${b.n}</b> <span class="mut">${ioText(b)}</span><br><span class="mut">${b.desc}<br>Стройка ${b.cost}💰${Object.keys(b.mat).length?' + '+costText(b.mat):''} · ⏱ ${BUILD_MIN[pr.kind==='office'?'office':b.kind]||3} мин · зарплата ${b.wage}💰/мин</span><br>
    <span class="btn ${can?'':'dis'}" data-act="build" data-id="${pr.id}" data-t="${k}">Построить · ${c}💰</span>${m.ok?'':'<span class="mut"> нет материалов на базе</span>'}</div>`;}
  if(locked.length){const nx=Math.min(...locked.map(([k,b])=>needFor(b)));h+=`<div class="row mut">✨ Ещё ${locked.length} видов зданий откроются позже. На ${nx} уровне: ${locked.filter(([k,b])=>needFor(b)===nx).map(([k,b])=>b.ic+' '+b.n).join(', ')}</div>`;}return h;}
// ===== Долгая смена: 2–4 часа реального времени, награда в конце (для тех, кто заходит редко) =====
const LONG={2:{n:15,en:15},3:{n:21,en:20},4:{n:28,en:25}};
const longOn=()=>me&&me.long_until;const longLeft=()=>longOn()?new Date(me.long_until)-Date.now():0;
const hm=ms=>{const m=Math.ceil(ms/60000);return m>=60?`${Math.floor(m/60)} ч ${m%60} мин`:`${m} мин`;};
let longDone=false;setInterval(()=>{if(!longOn()){longDone=false;return;}if(longLeft()<=0&&!longDone){longDone=true;toast('🕒 Долгая смена закончилась! Забери награду во вкладке «💼 Дела»',9000);}dirty=true;},20000);
function longStatusHTML(){if(!longOn())return'';const pr=props.get(me.long_prop),j=pr&&jobInfo(pr),left=longLeft(),tot=3600e3*(me.long_n>=28?4:me.long_n>=21?3:2);
  return`<div class="row" style="border-color:#ffd166">🕒 <b>Долгая смена</b> · ${j?j.n:'работа'} · за смену: <b>${fmt((j?j.pay:0)*me.long_n)}💰</b> и ${me.long_n} смен в карьеру
  <div class="bar"><i style="width:${Math.min(100,(1-left/tot)*100).toFixed(0)}%"></i></div>`+
  (left>0?`<span class="mut">Осталось ${hm(left)}</span><br><span class="btn sm red" data-act="longcancel">Уйти раньше (без оплаты)</span>`
         :`<span class="btn gold" data-act="longclaim">Забрать награду</span>`)+`</div>`;}
function longBtns(pr){const j=jobInfo(pr);if(!j||!me||pr.kind!=='npc')return'';if(longOn())return me.long_prop===pr.id?longStatusHTML():'';const ok=me.shifts>=j.req;
  return`<div style="margin-top:8px"><b>🕒 Долгая смена</b><br>`+
  Object.entries(LONG).map(([h,L])=>`<span class="btn sm ${ok?'gold':'dis'}" data-act="longstart" data-id="${pr.id}" data-h="${h}">${h} ч · ${fmt(j.pay*L.n)}💰</span>`).join('')+`</div>`;}
function jobBtn(pr){const j=jobInfo(pr);if(!j||!me)return'';if(pr.kind!=='npc'&&LV()<NEED.playerJob&&me.job_prop!==pr.id)return'';if(me.job_prop===pr.id)return`<div style="margin-top:6px">✅ Ты работаешь здесь<div class="bar"><i id="shiftbar" style="width:0"></i></div></div><span class="btn red" data-act="quit">Уволиться</span>`;
  const ok=me.shifts>=j.req;return`<div style="margin-top:6px"><span class="btn ${ok?'':'dis'}" data-act="job" data-id="${pr.id}">Устроиться · ${j.pay}💰/смена</span>${ok?'':`<div class="mut">Нужен опыт: ${j.req} смен (у тебя ${me.shifts})</div>`}</div>`;}
function unitsHTML(p){const ids=unitsByPlot.get(p.id)||[];let h='';
  for(const id of ids){const u=props.get(id);const mine=me&&u.owner===me.id;
    h+=`<div class="row">${u.kind==='apt'?'🚪 Квартира':'🏢 Офис'}, ${u.floor} этаж · <b>${fmt(u.price)}💰</b> `;
    if(!u.owner){const n=u.kind==='apt'?NEED.apt:NEED.office;h+=u.premium?(aucOf(id)?'👑 <span class="btn sm gold" data-act="openauc">На аукционе</span>':'<span class="mut">👑 только через аукцион</span>'):LV()<n?lock(n):`<span class="btn sm gold" data-act="buyunit" data-id="${id}">Купить</span>`;}
    else if(mine){h+=aucBtn(u);if(u.kind==='apt')h+=`<span class="btn sm" data-act="enter" data-id="${id}">Войти</span>${me.home_unit===id?'<span class="mut"> 🏠 дом</span>':`<span class="btn sm blue" data-act="sethome" data-id="${id}">Сделать домом</span>`}`;
      else h+=u.building?`<div>${bizHTML(u)}</div>`:`<div>${buildListHTML(u)}</div>`;h+=`<span class="btn sm red" data-act="sellprop" data-id="${id}">Продать</span>`;}
    else h+=`<span class="mut">владелец: </span>${nm(u.owner)}${u.building?` · ${BLD[u.building].ic} ${BLD[u.building].n}`+jobBtn(u):''}`;
    h+='</div>';}return h;}
function objHTML(){const p=sel;if(!p)return`<h3>📍 Объект</h3><div>Нажми на участок, дом или предприятие на карте.</div><div class="mut" style="margin-top:6px">${mobile?'Двигай карту пальцем, щипок — зум.':'Тяни мышью, колесо — зум, Q/E — поворот.'}</div>`;
  if(p.sp==='res'){const r=RES[p.rt];return`<h3>🏢 ${r.n}</h3><div class="mut">${r.floors} этажей · комната ${r.room[0]}×${r.room[1]}. Купи квартиру, обставь мебелью и зови друзей.</div>${unitsHTML(p)}`;}
  if(DECOR[p.sp])return`<h3>${DECOR[p.sp]}</h3>`;
  if(p.sp==='cityhall'){const c=city||{};return`<h3>🏛 Мэрия</h3><div style="font-size:20px;margin:6px 0">💰 В казне: <b>${fmt(c.treasury||0)}</b></div>
    <div class="mut">Сюда идут налоги: ${Math.round((c.sales_tax||0)*100)}% с продаж и ${c.prop_tax||0}💰 в сутки с недвижимости${c.newbie_exempt?' (новички освобождены)':''}.</div>`;}
  if(CLUBS[p.sp]){const C=CLUBS[p.sp];return`<h3>${C.ic} ${C.n}</h3><div>⚡ Внутри энергия копится <b>×3</b></div><span class="btn gold" data-act="club" data-id="${p.id}">Войти</span>`;}
  const pr=props.get(p.id);if(!pr)return'<div class="mut">Загрузка…</div>';
  if(p.sp==='bc')return`<h3>🏙 Бизнес-центр</h3><div class="mut">Офисная карьера и офисы для кофеен и ресторанов. Клерк: 12💰 · с 100 смен менеджер 20💰 · с 300 директор 30💰.</div>${jobBtn(pr)}<h3 style="margin-top:10px">Офисы</h3>${unitsHTML(p)}`;
  if(DECOR[p.sp])return`<h3>${DECOR[p.sp]}</h3>`;
  if(p.sp){const e=EMP[p.sp];return`<h3>${p.name||e.n}</h3><div>Городской работодатель. Должность: ${e.job}. Оплата <b>${e.pay}💰</b> за смену (${SHIFT_SEC} сек), смены идут, пока ты онлайн.</div>`+
    (Object.keys(e.out).length?`<div class="mut">Производит на базу: ${Object.entries(e.out).map(([g,q])=>q+GOODS[g].ic).join(' ')} в минуту</div>`:'')+
    (longOn()&&me.long_prop!==pr.id?'<div class="mut" style="margin-top:6px">🕒 Ты на долгой смене</div>':longOn()?'':jobBtn(pr))+longBtns(pr);}
  if(!pr.owner){const can=me&&me.money>=pr.price;
    const d={v:'🌲 Деревня — дёшево, лес и река рядом',d:'🏡 Дачи — самые дешёвые, рядом озеро',c:'🏙 Город — дорого, но рядом покупатели',p:'🏭 Промзона — заводы',o:'⚓ Порт — рыболовные суда и коптильни'}[pr.reg];
    return`<h3>Участок #${p.id+1}</h3><div>${d}</div>${pr.reg==='c'?`<div class="mut">Спрос района: ~${pr.demand} клиентов/мин</div>`:''}<div style="margin:6px 0">Цена: <b>${fmt(pr.price)}💰</b></div>
    <div class="mut">Можно: ${Object.values(BLD).filter(b=>b.reg.includes(pr.reg)).map(b=>b.ic+' '+b.n).join(', ')}</div>
    ${pr.premium?`<div>👑 <b>Элитный участок</b> — продаётся только на аукционе.</div>${aucOf(pr.id)?'<span class="btn gold" data-act="openauc">Перейти к торгам</span>':'<div class="mut">Город выставляет такие лоты по очереди — загляни в «Рынок → Аукцион».</div>'}`:LV()<NEED.land?lock(NEED.land):`<span class="btn gold ${can?'':'dis'}" data-act="buyland" data-id="${pr.id}">Купить участок</span>`}${me&&!can?`<div class="mut">Не хватает ${fmt(pr.price-me.money)}💰</div>`:''}`;}
  if(me&&pr.owner===me.id)return pr.building?bizHTML(pr):`<h3>Твой участок #${p.id+1}</h3>`+(LV()>=2?aucBtn(pr):'')+buildListHTML(pr);
  return`<h3>Участок #${p.id+1}</h3><div>Владелец: ${nm(pr.owner)}</div><div>${pr.building?BLD[pr.building].ic+' '+BLD[pr.building].n+' · работников: '+pr.workers:'пока пусто'}</div>${jobBtn(pr)}`;}
function marketHTML(){const tabs=shipsHTML()+`<div style="margin-bottom:6px"><span class="btn sm ${mkSec==='base'?'on':'blue'}" data-act="mksec" data-s="base">🏭 Оптовая база</span>${LV()>=2?`<span class="btn sm ${mkSec==='ex'?'on':'blue'}" data-act="mksec" data-s="ex">🤝 Биржа игроков</span><span class="btn sm ${mkSec==='auc'?'on':'blue'}" data-act="mksec" data-s="auc">🔨 Аукцион${auctions.size?' ('+auctions.size+')':''}</span>`:''}</div>`;if(LV()<2)mkSec='base';
  return tabs+(mkSec==='ex'?exchangeHTML():mkSec==='auc'?auctionHTML():baseHTML());}
const propName=pr=>{if(!pr)return'?';if(pr.kind==='apt')return`🚪 Квартира · ${RES[pr.tier]?.n||''}, ${pr.floor} эт.`;if(pr.kind==='office')return`🏢 Офис в БЦ, ${pr.floor} эт.`;
  return`🌱 Участок #${pr.plot+1} · ${REGN[pr.reg]}${pr.building?' · '+BLD[pr.building].ic+' '+BLD[pr.building].n+(pr.workers?` (${pr.workers} раб.)`:''):''}`;};
const leftTxt=t=>{const s2=Math.max(0,Math.floor((Date.parse(t)-Date.now())/1000));return s2>=3600?`${Math.floor(s2/3600)} ч ${Math.floor(s2%3600/60)} мин`:`${Math.floor(s2/60)}:${String(s2%60).padStart(2,'0')}`;};
function auctionHTML(){let h=`<h3>🔨 Аукцион недвижимости</h3><div class="mut">Участки с бизнесом, квартиры и офисы. 👑 Элитные лоты в центре и пентхаусы продаёт город — только здесь. Ставка блокирует деньги; если перебьют — вернутся. Ставка в последние 2 минуты продлевает торги.</div>`;
  const list=[...auctions.values()].sort((a,b)=>Date.parse(a.ends_at)-Date.parse(b.ends_at));if(!list.length)return h+'<div class="row mut">Сейчас торгов нет.</div>';
  for(const a of list){const pr=props.get(a.prop),cur=a.cur_bid?+a.cur_bid:null,minb=cur?Math.ceil(cur*1.05):+a.start_price,mine=me&&a.seller===me.id,lead=me&&a.bidder===me.id;
    h+=`<div class="row">${a.seller?'':'👑 '}<b>${propName(pr)}</b><br><span class="mut">Продавец: ${a.seller?nm(a.seller):'<b>Город</b>'} · осталось ${leftTxt(a.ends_at)}</span><br>`+
      `${cur?`Ставка: <b>${fmt(cur)}💰</b> — ${nm(a.bidder)}${lead?' (ты лидируешь)':''}`:`Старт: <b>${fmt(a.start_price)}💰</b>, ставок нет`}${a.buyout?` · выкуп ${fmt(a.buyout)}💰`:''}<br>`+
      (mine?(cur?'<span class="mut">Есть ставки — ждём окончания</span>':`<span class="btn sm red" data-act="auccancel" data-id="${a.id}">Снять</span>`):me&&!lead?`<span class="btn sm gold" data-act="bid" data-id="${a.id}" data-v="${minb}">Ставка ${fmt(minb)}💰</span><span class="btn sm" data-act="bidx" data-id="${a.id}" data-v="${minb}">Своя…</span>${a.buyout?`<span class="btn sm blue" data-act="bid" data-id="${a.id}" data-v="${a.buyout}">Выкупить</span>`:''}`:'')+
      ` <span class="btn sm blue" data-act="goto" data-plot="${pr?.plot}">На карте</span></div>`;}
  return h;}
function showAucCreate(pr){$('auth').style.display='flex';$('authbox').innerHTML=`<h3 style="font-size:14px">🔨 Выставить на аукцион</h3><div>${propName(pr)}</div>
  <div class="mut">Комиссия 5%.</div>
  <div class="crow">Стартовая цена 💰<input id="ac_s" type="number" value="${Math.round(pr.price*.8)}"></div><div class="crow">Цена выкупа 💰 (необязательно)<input id="ac_b" type="number" placeholder="пусто — без выкупа"></div>
  <div class="crow">Длительность: <select id="ac_h" style="font-family:inherit;font-size:15px;background:#120f18;color:#fff;border:2px solid #4a3f5c;padding:5px"><option value="1">1 час</option><option value="6" selected>6 часов</option><option value="24">24 часа</option><option value="48">48 часов</option></select></div>
  <span class="btn gold" data-act="aucgo" data-id="${pr.id}">Выставить</span><span class="btn blue" data-act="closedaily">Отмена</span>`;}
const aucOf=propId=>[...auctions.values()].find(a=>a.prop===propId);
const aucBtn=pr=>{const a=aucOf(pr.id);return a?`<div class="row">🔨 На аукционе · ${a.cur_bid?'ставка '+fmt(a.cur_bid)+'💰':'без ставок'} · ${leftTxt(a.ends_at)} <span class="btn sm blue" data-act="openauc">Открыть</span></div>`:`<span class="btn sm" data-act="aucnew" data-id="${pr.id}">🔨 На аукцион</span>`;};
function exchangeHTML(){let h=`<h3>🤝 Биржа игроков</h3><div class="mut">Продавай другим игрокам по своей цене.</div>`;
  if(me){const mine=GK.filter(g=>inv(me,g)>=1);
    h+=LV()<2?`<div>${lock(2)}</div>`:mine.length?`<div class="row">Выставить: <select id="ex_g" style="font-family:inherit;font-size:15px;background:#120f18;color:#fff;border:2px solid #4a3f5c;padding:5px">${mine.map(g=>`<option value="${g}">${GOODS[g].ic} ${GOODS[g].n} (${Math.floor(inv(me,g))})</option>`).join('')}</select>
      <input id="ex_q" type="number" min="1" placeholder="кол-во" style="width:80px;display:inline-block"><input id="ex_p" type="number" min="1" placeholder="цена за шт" style="width:100px;display:inline-block"><span class="btn gold" data-act="exlist">Выставить</span></div>`:'<div class="mut">На складе пусто — нечего выставить.</div>';}
  const byG={};for(const l of listings.values())(byG[l.good]=byG[l.good]||[]).push(l);
  const gs=Object.keys(byG);if(!gs.length)return h+'<div class="row mut">Пока никто ничего не выставил. Будь первым!</div>';
  for(const g of gs){h+=`<div class="row"><b>${GOODS[g].ic} ${GOODS[g].n}</b> <span class="mut">база ~${price(g).toFixed(1)}</span>`;
    for(const l of byG[g].sort((a,b)=>a.price-b.price).slice(0,6)){const mine=me&&l.seller===me.id;
      h+=`<div>• ${nm(l.seller)} — <b>${(+l.price).toFixed(1)}💰</b> × ${l.qty} ${mine?`<span class="btn sm red" data-act="excancel" data-id="${l.id}">Снять</span>`:me?`<span class="btn sm" data-act="exbuy" data-id="${l.id}" data-q="1">Купить 1</span><span class="btn sm gold" data-act="exbuy" data-id="${l.id}" data-q="${l.qty}">Все</span>`:''}</div>`;}
    h+='</div>';}
  return h;}
function baseHTML(){let h=`<h3>🏭 Оптовая база</h3><table>`;
  for(const g of GK){const pr=price(g),q=me?Math.floor(inv(me,g)):0;
    h+=`<tr><td>${GOODS[g].ic} ${GOODS[g].n}</td><td><b>${pr.toFixed(1)}</b></td><td class="mut">склад ${fmt(stock(g))}</td>${me?`<td>${q}</td><td><span class="btn sm ${q?'':'dis'}" data-act="sell" data-g="${g}">Продать</span>${LV()>=NEED.buyMarket?`<span class="btn sm blue ${stock(g)>=5?'':'dis'}" data-act="buy" data-g="${g}">+5</span>`:''}</td>`:''}</tr>`;}
  return h+'</table>';}
function questsHTML(){const l=LV();let h=`<h3>🗺 Задания в округе</h3><div class="mut">Прогуляйся по живописным местам — за помощь местным дают деньги, опыт и кристаллы. Пока ты на задании, смены на работе не идут.</div>`;
  if(quest){const Q=QUESTS[quest.id];h+=`<div class="row">▶ <b>${Q.n}</b> — ${quest.phase==='go'?'идёшь к месту…':Q.act+'…'}<div class="bar"><i id="questbar" style="width:0"></i></div><span class="btn sm red" data-act="qcancel">Отменить</span></div>`;}
  const qLocked=Object.values(QUESTS).filter(Q=>Q.lvl>LV()).length;
  for(const[id,Q]of Object.entries(QUESTS)){if(Q.lvl>LV())continue;const P=world.POIS[Q.poi],lg=qlog.get(id),next=lg&&lg.done_at?Date.parse(lg.done_at)+Q.cd*60000:0,wait=Math.max(0,next-Date.now());
    const rw=[Q.money&&`${Q.money}💰`,Q.gems&&`${Q.gems}💎`,Q.good&&`${Q.qty}${GOODS[Q.good].ic}`,`${Q.xp} XP`].filter(Boolean).join(' · ');
    h+=`<div class="row">${P.ic} <b>${Q.n}</b> <span class="mut">${P.n}</span><br><span class="mut">Награда: ${rw} · стоит ⚡${ENERGY.quest}</span><br>`+
      (l<Q.lvl?lock(Q.lvl):wait?`<span class="mut">⏳ снова через ${wait>=3600000?Math.ceil(wait/3600000)+' ч':Math.ceil(wait/60000)+' мин'}</span>`:`<span class="btn sm gold ${quest||EN()<ENERGY.quest?'dis':''}" data-act="quest" data-q="${id}">Отправиться</span>`)+
      ` <span class="btn sm blue" data-act="gopoi" data-q="${id}">На карте</span></div>`;}
  if(qLocked)h+=`<div class="row mut">✨ Ещё ${qLocked} заданий откроются на следующих уровнях</div>`;
  return h;}
function workHTML(){if(!me)return'';let h=questsHTML()+`<h3 style="margin-top:10px">💼 Карьера</h3><div>${careerOf(me.shifts)} · смен: <b>${me.shifts}</b></div>`;
  h+=longStatusHTML();const cur=me.job_prop!=null&&props.get(me.job_prop);
  if(cur){const j=jobInfo(cur);h+=`<div class="row">Сейчас: <b>${j?.n}</b> · ${j?.pay}💰/смена<div class="bar"><i id="shiftbar" style="width:0"></i></div><span class="mut">Смена ${SHIFT_SEC} сек, идёт пока ты в игре</span><br><span class="btn sm blue" data-act="goto" data-plot="${cur.plot}">Показать</span><span class="btn sm red" data-act="quit">Уволиться</span></div>`;}
  else if(!longOn())h+=`<div class="row">Ты без работы.</div>`;
  h+='<h3 style="margin-top:8px">Вакансии</h3>';
  const seen=new Set();for(const pr of props.values()){if(pr.kind!=='npc'||pr.sp==='cityhall')continue;if(pr.sp==='bc'&&seen.has('bc'))continue;seen.add(pr.sp);const j=jobInfo(pr),ok=me.shifts>=j.req;
    h+=`<div class="row"><b>${j.n}</b> · ${j.job} · <b>${j.pay}💰</b>${j.req?` <span class="mut">(от ${j.req} смен)</span>`:''}<br><span class="btn sm blue" data-act="goto" data-plot="${pr.plot}">На карте</span>${me.job_prop===pr.id?'':`<span class="btn sm ${ok?'':'dis'}" data-act="job" data-id="${pr.id}">Устроиться</span>`}</div>`;}
  return h+`<div class="mut">Также можно устроиться в бизнес любого игрока — кликни его участок.</div>`;}
function homeHTML(){if(!me)return'';const apts=myProps().filter(p=>p.kind==='apt'),off=myProps().filter(p=>p.kind==='office');
  let h=`<h3>🏠 Жильё</h3>${apts.length?'':'<div class="row">Своего жилья пока нет — копи на квартиру. Дом можно обставить, приглашать гостей и отдыхать.</div>'}`;
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
  return`<h3>🏆 Самые богатые</h3>`+list.map((p,i)=>`<div class="row" style="${me&&p.id===me.id?'background:#3a3148':''}">${i+1}. <span style="color:${p.color}">■</span> ${esc(p.nick)} — <b>${fmt(p.money)}💰</b> <span class="mut">${careerOf(p.shifts||0)}</span></div>`).join('');}
function feedHTML(){return`<h3>📰 Что происходит</h3>`+events.slice().reverse().map(e=>`<div class="row">${esc(e.txt)}</div>`).join('');}
function furnHTML(){const st=room.state;if(!st)return'';
  if(!st.editable)return`<h3>🛋 В гостях</h3><div>Нажми на пол — пойдёшь туда, на стул, диван или кровать — сядешь. Пиши в чат сверху.</div>`;
  let h=`<h3>${st.edit?'🛠 Ремонт':'🛋 Дом'}</h3><span class="btn ${st.edit?'on':'gold'}" data-act="redit">${st.edit?'✔ Готово':'🛠 Режим ремонта'}</span>`;
  if(!st.edit)h+=`<div class="mut" style="margin:6px 0">Нажми на пол — персонаж пойдёт туда. На стул, диван или кровать — сядет или ляжет. Чтобы двигать мебель и красить стены — включи ремонт.</div>`;
  else{h+=`<div class="mut" style="margin:6px 0">${mobile?'«Поставить» → нажми на пол. Нажми на вещь — переставить.':'«Поставить» → клик по полу, R — повернуть, клик по вещи — переставить.'}</div>
    <div class="crow"><div class="mut">Цвет стен</div><div class="swrow">${WALL_COLORS.map(c=>`<span class="sw ${st.decor.wall===c?'on':''}" style="background:${c}" data-act="rwall" data-v="${c}"></span>`).join('')}</div></div>
    <div class="crow"><div class="mut">Пол</div><div class="swrow">${FLOOR_COLORS.map(c=>`<span class="sw ${st.decor.floor===c?'on':''}" style="background:${c}" data-act="rfloor" data-v="${c}"></span>`).join('')}</div></div>`;}
  h+=`<h3 style="margin-top:8px">Мебель</h3>`;
  for(const[k,f]of Object.entries(FURN)){const owned=Math.floor(me.furn?.[k]||0),free=room.free(k),m=missCost(f.cost),c=f.money+m.c;
    h+=`<div class="row">${f.ic} <b>${f.n}</b> <span class="mut">${f.w}×${f.d}</span> · есть ${owned}, свободно ${Math.max(0,free)}<br>
    <span class="btn sm ${free>0?'':'dis'}" data-act="place" data-it="${k}">Поставить</span><span class="btn sm gold ${me.money>=c&&m.ok&&LV()>=NEED.furn?'':'dis'}" data-act="buyfurn" data-it="${k}">Купить · ${costText(f.cost)} + ${f.money}💰 (≈${c}💰)</span></div>`;}
  return h;}
function guestsHTML(){const st=room.state;if(!st)return'';let h=`<h3>👥 Гости</h3>`;
  if(st.editable)h+=`<div>Позови друга по нику:</div><input id="invnick" maxlength="16" placeholder="Ник игрока"><span class="btn gold" data-act="invite">Пригласить</span>`;
  h+=`<div class="row">В комнате: ${[...st.people.keys()].map(nm).join(', ')||'—'}</div><div class="mut">Пиши в чат сверху — сообщения увидят все в комнате.</div>`;return h;}
let moreSec='goals';
let moreOpen=false;
function moreHTML(){const items=[['goals','📋','Цели','Чего добиться в игре'],...(LV()>=3?[['gear','🦺','Экипировка','Бонусы к производству']]:[]),['levels','⭐','Уровни','Что открывается дальше'],
    ['top','🏆','Рейтинг','Самые богатые игроки'],['feed','📰','Лента','Что происходит в городе'],['gov','🏛','Мэрия','В разработке']];
  if(!moreOpen)return'<h3>☰ Меню</h3>'+items.map(([k,ic,n,d])=>`<div class="mitem" data-act="moresec" data-s="${k}"><span class="mic">${ic}</span><span><b>${n}</b><br><span class="mut">${d}</span></span><span class="mgo">›</span></div>`).join('');
  const body={gov:()=>'<h3>🏛 Мэрия</h3><div class="row">🚧 Мэрия, налоги и выборы мэра сейчас <b>в разработке</b>. Скоро тут можно будет баллотироваться и управлять городом.</div>',goals:goalsHTML,gear:gearHTML,top:topHTML,feed:feedHTML,levels:levelsHTML}[moreSec]||goalsHTML;
  return'<span class="btn sm blue" data-act="moreback">← Меню</span>'+body();}
function gearHTML(){if(!me)return'';const own=me.gear||[],eq=me.equip||{};let h=`<h3>🦺 Рабочая экипировка</h3><div class="mut">Даёт бонусы к производству. Получить трудно: за многократные задания, стаж или дорого. Один предмет на слот.</div>`;
  for(const[slot,sn]of Object.entries(SLOTS)){h+=`<div class="row"><b>${sn}:</b> ${eq[slot]&&GEAR[eq[slot]]?GEAR[eq[slot]].ic+' '+GEAR[eq[slot]].n+` <span class="btn sm red" data-act="unequip" data-slot="${slot}">Снять</span>`:'<span class="mut">пусто</span>'}</div>`;}
  for(const[id,G]of Object.entries(GEAR)){const has=own.includes(id),on=eq[G.slot]===id;let how='',can=true;
    if(G.money){how=`${fmt(G.money)}💰`;can=me.money>=G.money;}
    if(G.gems){how=`${G.gems}💎`;can=(me.gems||0)>=G.gems;}
    if(G.req?.quest){const c=qlog.get(G.req.quest)?.cnt||0;how=`задание «${QUESTS[G.req.quest].n}» ×${G.req.count} (${c}/${G.req.count})`;can=c>=G.req.count;}
    if(G.req?.shifts){how=`${G.req.shifts} смен (${me.shifts}/${G.req.shifts})`;can=me.shifts>=G.req.shifts;}
    h+=`<div class="row">${G.ic} <b>${G.n}</b> <span class="mut">[${SLOTS[G.slot]}]</span><br>${G.eff}<br><span class="mut">Как получить: ${how}</span><br>`+
      (has?(on?'<span class="mut">✔ надето</span>':`<span class="btn sm" data-act="equipgear" data-slot="${G.slot}" data-id="${id}">Надеть</span>`):`<span class="btn sm gold ${can?'':'dis'}" data-act="getgear" data-id="${id}">Получить</span>`)+'</div>';}
  return h;}
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
let draft=null,cCat='body',pv=null,creatorFirst=false;
const CATS=[['body','🧍','Тело'],['face','🙂','Лицо'],['hair','💇','Волосы'],['top','👕','Верх'],['bottom','👖','Низ'],['shoes','👟','Обувь'],['acc','🎒','Аксессуары']];
function showCreator(first){draft={...DEFAULT_LOOK,...(me.look||{})};creatorFirst=first;cCat='body';
  $('auth').style.display='flex';$('authbox').style.width='min(780px,100%)';
  $('authbox').innerHTML=`<h3 style="font-size:14px">${first?'Создай своего персонажа':'Внешность персонажа'}</h3>
  <div class="creator"><div class="cprev"><canvas id="lookcv"></canvas>
    <div style="text-align:center"><span class="btn sm blue" data-act="crot" data-d="-1">⟲</span><span class="btn sm blue" data-act="czoom">🔍 Лицо</span><span class="btn sm blue" data-act="crot" data-d="1">⟳</span><span class="btn sm gold" data-act="crand">🎲</span></div>
    <div class="mut" style="text-align:center">Крути пальцем или мышкой</div></div>
    <div class="copts"><div class="ctabs">${CATS.map(([k,ic,n])=>`<span class="btn sm" data-act="ccat" data-c="${k}" id="cc_${k}">${ic} ${n}</span>`).join('')}</div><div id="copt"></div></div></div>
  <div style="margin-top:10px"><span class="btn gold" data-act="savelook" style="font-size:17px">${first?'Готово, в город →':'Сохранить'}</span>${first?'':'<span class="btn blue" data-act="closecreator">Отмена</span>'}</div>`;
  pvInit();updateCreator();}
function updateCreator(){const l=draft,f=l.g==='f';
  const sw=(k,arr)=>`<div class="swrow">${arr.map(c=>`<span class="sw ${l[k]===c?'on':''}" style="background:${c}" data-lk="${k}" data-v="${c}"></span>`).join('')}</div>`;
  const opt=(k,arr)=>`<div>${arr.map(([v,n])=>`<span class="btn sm ${l[k]===v?'on':'blue'}" data-lk="${k}" data-v="${v}">${n}</span>`).join('')}</div>`;
  const row=(t,h)=>`<div class="crow"><div class="mut">${t}</div>${h}</div>`;
  const body={
    body:()=>row('Пол',opt('g',[['m','Мужской'],['f','Женский']]))+row('Рост',opt('height',LOOK.height))+row('Телосложение',opt('build',LOOK.build))+
      row('Кожа',`<div class="swrow">${LOOK.skin.map((c,i)=>`<span class="sw ${l.skin===i?'on':''}" style="background:${c}" data-lk="skin" data-v="${i}"></span>`).join('')}</div>`),
    face:()=>row('Глаза',sw('eyes',LOOK.eyes))+row('Брови',opt('brows',LOOK.brows))+row('Рот',opt('mouth',LOOK.mouth))+(f?'':row('Борода и усы',opt('beard',LOOK.beard)))+row('Очки',opt('glasses',LOOK.glasses)),
    hair:()=>row('Причёска',opt('hair',f?LOOK.hairF:LOOK.hairM))+row('Цвет волос',sw('hc',LOOK.hairCol)),
    top:()=>row('Фасон',opt('tk',LOOK.topKind))+row('Цвет',sw('top',LOOK.top))+row('Акцент (полоски, вставки, воротник)',sw('top2',LOOK.accent)),
    bottom:()=>row('Фасон',opt('bk',f?LOOK.bottomKindF:LOOK.bottomKindM))+row('Цвет',sw('bottom',LOOK.bottom)),
    shoes:()=>row('Обувь',opt('sk',LOOK.shoeKind))+row('Цвет',sw('shoes',LOOK.shoes)),
    acc:()=>row('Аксессуар',opt('acc',LOOK.acc)),
  }[cCat]();
  $('copt').innerHTML=body;CATS.forEach(([k])=>$('cc_'+k)?.classList.toggle('on',k===cCat));
  if(pv){if(pv.obj)pv.sc.remove(pv.obj);pv.obj=world.makeAvatar(draft,me?.skin);pv.sc.add(pv.obj);}}
function pvInit(){if(pv)pvClose();const cv=$('lookcv');const r=new THREE.WebGLRenderer({canvas:cv,antialias:false,alpha:true});r.setPixelRatio(1);r.setSize(120,150,false);
  const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight(0xffffff,0x6a5a80,1.3));const d=new THREE.DirectionalLight(0xfff4e0,1.8);d.position.set(2,3,4);sc.add(d);
  const ped=new THREE.Mesh(new THREE.CylinderGeometry(.42,.46,.06,16),new THREE.MeshLambertMaterial({color:0x4a3f5c}));ped.position.y=-.03;sc.add(ped);
  const cam=new THREE.OrthographicCamera(-.4,.4,.5,-.5,.1,20);cam.position.set(0,1.2,5);
  pv={r,sc,cam,rot:-.4,auto:true,face:false,obj:null,drag:null,t:0};
  cv.addEventListener('pointerdown',e=>{pv.drag=e.clientX;pv.auto=false;cv.setPointerCapture(e.pointerId);});
  cv.addEventListener('pointermove',e=>{if(pv&&pv.drag!=null){pv.rot+=(e.clientX-pv.drag)*.02;pv.drag=e.clientX;}});
  cv.addEventListener('pointerup',()=>{if(pv)pv.drag=null;});
  const loop=()=>{if(!pv)return;requestAnimationFrame(loop);pv.t+=.016;if(pv.auto)pv.rot+=.012;if(pv.obj){pv.obj.rotation.y=pv.rot;const ud=pv.obj.userData;ud.armL.rotation.x=Math.sin(pv.t*1.5)*.08;ud.armR.rotation.x=-Math.sin(pv.t*1.5)*.08;}
    const H={s:.9,m:1,t:1.1}[draft.height]||1,cy=pv.face?.64*H:.47*H,hs=pv.face?.2:.52*Math.max(1,H);
    cam.left=-hs*.8;cam.right=hs*.8;cam.top=hs;cam.bottom=-hs;cam.position.set(0,cy+.9,5);cam.lookAt(0,cy,0);cam.updateProjectionMatrix();r.render(sc,cam);};
  loop();}
function pvClose(){if(!pv)return;pv.r.dispose();pv=null;}
function randomLook(){const pk=a=>a[Math.floor(Math.random()*a.length)],f=draft.g==='f';
  draft={...draft,skin:Math.floor(Math.random()*LOOK.skin.length),height:pk(LOOK.height)[0],build:pk(LOOK.build)[0],eyes:pk(LOOK.eyes),brows:pk(LOOK.brows)[0],mouth:pk(LOOK.mouth)[0],
    beard:f?'none':pk(LOOK.beard)[0],glasses:Math.random()<.7?'none':pk(LOOK.glasses)[0],hair:pk(f?LOOK.hairF:LOOK.hairM)[0],hc:pk(LOOK.hairCol),tk:pk(LOOK.topKind)[0],top:pk(LOOK.top),top2:pk(LOOK.accent),
    bk:pk(f?LOOK.bottomKindF:LOOK.bottomKindM)[0],bottom:pk(LOOK.bottom),sk:pk(LOOK.shoeKind)[0],shoes:pk(LOOK.shoes),acc:Math.random()<.6?'none':pk(LOOK.acc)[0]};}
function showEnergy(){const e=EN(),full=Math.ceil((EMAX()-e)*ENERGY.regenMin);
  $('auth').style.display='flex';$('authbox').innerHTML=`<h3 style="font-size:14px">⚡ Энергия</h3><div style="font-size:28px">${Math.floor(e)}/${EMAX()}</div>
  <div class="mut">Смена стоит ⚡${ENERGY.shift}, задание — ⚡${ENERGY.quest}. Восстанавливается +1 каждые ${ENERGY.regenMin} мин, максимум растёт с уровнем (+10). Новый уровень и ежедневная награда — полная зарядка${e<EMAX()?` · полная через ~${Math.floor(full/60)} ч ${full%60} мин`:''}.<br>Пока энергия копится — бизнесы работают сами.<br>🎭 В Доме культуры и 🎬 кинотеатре — ×3.</div>
  <div style="margin-top:10px"><span class="btn gold ${(me.gems||0)>=ENERGY.refillGems&&e<EMAX()?'':'dis'}" data-act="refill">Восполнить за ${ENERGY.refillGems}💎</span><span class="btn blue" data-act="gems">Кристаллы</span><span class="btn" data-act="closedaily">Закрыть</span></div>`;}
function showGems(){$('auth').style.display='flex';$('authbox').innerHTML=`<h3 style="font-size:14px">💎 Кристаллы</h3><div>У тебя: <b>${me.gems||0}💎</b></div>
  <div class="mut" style="margin:6px 0">Кристаллы ускоряют стройку, восполняют энергию и покупают редкую экипировку. Бесплатно — за ежедневный вход и задания.</div>
  ${[[100,'99 ₽'],[550,'449 ₽ · +10%'],[1200,'899 ₽ · +20%'],[3000,'1990 ₽ · +50%']].map(([g,p])=>`<div class="row">💎 <b>${g}</b> — ${p} <span class="btn sm dis">Скоро</span></div>`).join('')}
  <div class="mut">Скоро</div><span class="btn" data-act="closedaily">Закрыть</span>`;}
function showDaily(){const y=new Date(Date.now()-864e5).toISOString().slice(0,10),s=me.last_daily===y?(me.streak||0)+1:1;
  $('auth').style.display='flex';$('authbox').innerHTML=`<h3 style="font-size:15px">🎁 Ежедневная награда</h3><div>День ${s} подряд: <b>+${DAILY[Math.min(s,7)-1]}💎</b> и +20 XP</div>
  <div style="display:flex;gap:4px;margin:10px 0;flex-wrap:wrap">${DAILY.map((g,i)=>`<div class="chip" style="${i+1===Math.min(s,7)?'outline:2px solid #ffd166;':''}opacity:${i+1<Math.min(s,7)?.5:1}">д${i+1}<br>${g}💎</div>`).join('')}</div>
  <div class="mut">Заходи каждый день — серия растёт. Кристаллы 💎 восполняют энергию и ускоряют стройку.</div><span class="btn gold" data-act="daily" style="font-size:17px">Забрать</span><span class="btn blue" data-act="closedaily">Позже</span>`;}
let lastBody='',lastTabs='';
function renderUI(){
  if(roomCtx&&roomCtx.club&&room.state){const C=roomCtx.club,e=EN(),mx=EMAX();$('chic').textContent=C.ic;$('chn').textContent=C.n;$('chppl').textContent='👥 '+Math.max(1,room.state.people.size);
    $('chbar').style.width=(e/mx*100).toFixed(1)+'%';$('chval').textContent=`${Math.floor(e)}/${mx}`;}
  document.body.classList.toggle('chaton',!!me&&!ob&&mode==='city');
  if(me){const l=LV(),x0=xpFor(l),x1=xpFor(l+1),fr=Math.max(0,Math.min(1,((me.xp||0)-x0)/(x1-x0)));
    $('hlvl').textContent=l;$('hxp').setAttribute('stroke-dasharray',`${(fr*100.5).toFixed(1)} 101`);
    $('money').textContent='💰 '+fmt(me.money);$('hgems').textContent='💎 '+(me.gems||0);
    const e=Math.floor(EN());$('hen').textContent='⚡ '+e+(mobile?'':'/'+EMAX());$('hen').classList.toggle('low',e<ENERGY.shift);
    const c=CAP(),full=GK.some(g=>inv(me,g)>=c),n=GK.reduce((a,g)=>a+Math.floor(inv(me,g)),0);$('invn').textContent=full?'!':n?(n>999?'999+':n):'';$('invn').style.background=full?'#c0392b':'#3a7d44';}
  {const gh=world.gameHour(),hh=Math.floor(gh),mm=Math.floor((gh-hh)*60);$('htime').textContent=`${hh>=6&&hh<20?'☀️':'🌙'} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;}
  if(ob){$('money').textContent='💰 '+ob.money+' уч.';$('hen').textContent='⚡ '+ob.en;const q=Math.floor(ob.inv.wheat||0);$('invn').textContent=q||'';}
  if(me)$('hprof').innerHTML='👤'+(mobile?'':' '+esc(me.nick));
  $('topbtns').style.display=me&&!ob&&mode==='city'?'':'none';
  document.body.classList.toggle('sheetopen',sheetOpen);document.body.classList.toggle('onisland',!!ob);
  if(mobile&&ob){$('coach').classList.toggle('mini',coachMin);$('coach').classList.toggle('withsheet',sheetOpen);}
  const T=mode==='room'?(roomCtx&&roomCtx.club?CLUB_TABS:ROOM_TABS):CITY_TABS;if(!T.some(t=>t[0]===tab)&&!(mode==='city'&&(tab==='obj'||tab==='inv'||tab==='profile'||tab==='stop')))tab=T[0][0];
  const th=ob?'':T.filter(t=>!t[3]||LV()>=t[3]).map(([k,ic,n])=>`<div class="tab ${k===tab&&sheetOpen?'on':''}" data-tab="${k}"><span class="ic">${ic}${newTabs.has(k)?'✨':''}</span>${n}</div>`).join('');
  if(th!==lastTabs){$('tabs').innerHTML=th;lastTabs=th;}
  $('sheet').classList.toggle('collapsed',!sheetOpen);
  const body=ob?(tab==='inv'?obInvHTML():obHTML()):{profile:profileHTML,inv:invHTML,obj:objHTML,stop:stopHTML,market:marketHTML,work:workHTML,home:homeHTML,gov:govHTML,more:moreHTML,furn:furnHTML,guests:guestsHTML,club:clubHTML}[tab]();
  if(body!==lastBody){const s=$('tabbody').scrollTop;$('tabbody').innerHTML=body;$('tabbody').scrollTop=s;lastBody=body;}
  $('hand').style.display=room.state&&room.state.hand?'inline':'none';
  dirty=false;tutCheck();
}

// ================= КНОПКИ =================
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-tab],[data-act],[data-auth],[data-color],[data-tut],[data-visit],[data-lk],[data-ob]');if(!t)return;
  if(t.dataset.ob&&ob){await obAction(t.dataset.ob,t);lastBody='';renderUI();return;}
  if(t.dataset.lk){const k=t.dataset.lk;let v=t.dataset.v;if(k==='skin')v=+v;draft[k]=v;if(k==='g'){draft.hair=v==='f'?'long':'short';if(v==='m'&&draft.bk==='skirt')draft.bk='pants';if(v==='f')draft.beard='none';}updateCreator();return;}
  if(t.dataset.color){myColor=t.dataset.color;document.querySelectorAll('.sw').forEach(s=>s.classList.toggle('on',s.dataset.color===myColor));return;}
  if(t.dataset.auth)return authAction(t.dataset.auth);
  if(t.dataset.tut)return t.dataset.tut==='next'?tutGo(tutI+1):tutEnd();
  if(t.dataset.visit!=null){$('toast').style.display='none';if(mode==='room')leaveRoom();return enterRoom({unit:+t.dataset.visit,hostUid:t.dataset.host,hostNick:t.dataset.hn,editable:false});}
  if(t.dataset.lock&&t.dataset.tab){toast(`🔒 Откроется на ${t.dataset.lock} уровне`);return;}
  if(t.dataset.tab){newTabs.delete(t.dataset.tab);if(t.dataset.tab==='more')moreOpen=false;if(mobile&&t.dataset.tab===tab&&sheetOpen)sheetOpen=false;else{tab=t.dataset.tab;sheetOpen=true;}lastBody='';return renderUI();}
  const a=t.dataset.act,id=t.dataset.id!=null?+t.dataset.id:null;
  switch(a){
    case 'daily':{const r=await act('claim_daily');if(r){$('auth').style.display='none';toast(`🎁 +${DAILY[Math.min(me.streak,7)-1]}💎 · серия ${me.streak} дн.`);}break;}
    case 'closedaily':$('auth').style.display='none';break;
    case 'buyskin':await act('buy_skin',{p_item:t.dataset.it});break;
    case 'equip':await act('equip_skin',{p_item:t.dataset.it||null});break;
    case 'vote':if(await act('vote',{p_election:+t.dataset.e,p_cand:t.dataset.c}))toast('🗳 Голос принят');loadGov();break;
    case 'run':{const sl=($('slogan')?.value||'').trim();if(await act('run_for',{p_pos:t.dataset.pos,p_slogan:sl}))toast('Ты в списке кандидатов!');loadGov();break;}
    case 'govset':{const raw=$('gv_'+t.dataset.k)?.value??t.dataset.v??'0';const v=parseFloat(String(raw).replace(',','.'))||0;if(await act('gov_set',{p_key:t.dataset.k,p_val:t.dataset.pct?v/100:v}))toast('Сохранено');break;}
    case 'moresec':moreSec=t.dataset.s;moreOpen=true;break;
    case 'moreback':moreOpen=false;break;
    case 'profile':if(ob)break;if(tab==='profile'&&sheetOpen)sheetOpen=false;else{tab='profile';sheetOpen=true;}break;
    case 'mksec':mkSec=t.dataset.s;break;
    case 'inv':if(tab==='inv'&&sheetOpen)sheetOpen=false;else{tab='inv';sheetOpen=true;}break;
    case 'levels':if(ob)break;tab='more';moreSec='levels';moreOpen=true;sheetOpen=true;break;
    case 'psec':tab='more';moreSec=t.dataset.s;moreOpen=true;break;
    case 'plook':showCreator(false);return;
    case 'logout2':if(confirm('Выйти из аккаунта?')){await sb.auth.signOut();location.reload();}return;
    case 'toex':tab='market';mkSec='ex';break;
    case 'aucnew':showAucCreate(props.get(id));return;
    case 'aucgo':{const st=+$('ac_s').value,bo=+($('ac_b').value||0),hh=+$('ac_h').value;if(await act('create_auction',{p_id:id,p_start:st,p_buyout:bo||null,p_hours:hh})){$('auth').style.display='none';toast('🔨 Лот выставлен');mkSec='auc';tab='market';}break;}
    case 'auccancel':if(await act('cancel_auction',{p_auction:id}))toast('Лот снят');break;
    case 'bid':if(await act('bid',{p_auction:id,p_amount:+t.dataset.v}))toast('🔨 Ставка принята');break;
    case 'bidx':{const v=prompt('Твоя ставка, 💰 (минимум '+t.dataset.v+')',t.dataset.v);if(v&&await act('bid',{p_auction:id,p_amount:+v}))toast('🔨 Ставка принята');break;}
    case 'openauc':tab='market';mkSec='auc';sheetOpen=true;break;
    case 'upgrade':if(await act('upgrade',{p_id:id}))toast('⬆ Улучшение началось');break;
    case 'speedup':if(await act('speedup',{p_id:id}))toast('🏗 Готово!');break;
    case 'energy':showEnergy();return;
    case 'refill':if(await act('refill_energy')){$('auth').style.display='none';toast('⚡ Энергия восполнена');}return;
    case 'gems':showGems();return;
    case 'next':{const a2=t.dataset.a,v=t.dataset.v;if(a2==='tab'){tab=v;sheetOpen=true;newTabs.delete(v);}
      else if(a2==='goto'){const pl=plots[+v];sel=pl;world.select(pl);world.flyTo(pl.x,pl.y,mobile?11:14);tab='obj';if(mobile)sheetOpen=true;}
      else if(a2==='land'){const c=cheapLand();if(c){const pl=plots[c.plot];sel=pl;world.select(pl);world.flyTo(pl.x,pl.y,mobile?11:14);world.arrow=pl;setTimeout(()=>{if(tutI>=TUT.length)world.arrow=null;},8000);}}break;}
    case 'exlist':{const g=$('ex_g')?.value,q=parseInt($('ex_q')?.value||'0'),pr=parseFloat($('ex_p')?.value||'0');if(!g||!q||!pr){toast('Укажи количество и цену');break;}if(await act('list_good',{p_good:g,p_qty:q,p_price:pr}))toast('Лот выставлен');break;}
    case 'exbuy':if(await act('buy_listing',{p_id:id,p_qty:+t.dataset.q}))toast('Куплено!');break;
    case 'excancel':await act('cancel_listing',{p_id:id});break;
    case 'getgear':if(await act('get_gear',{p_id:t.dataset.id}))toast('🦺 Получено и надето!');break;
    case 'equipgear':await act('equip_gear',{p_slot:t.dataset.slot,p_id:t.dataset.id});break;
    case 'unequip':await act('equip_gear',{p_slot:t.dataset.slot,p_id:''});break;
    case 'ccat':cCat=t.dataset.c;updateCreator();return;
    case 'crot':if(pv){pv.auto=false;pv.rot+=+t.dataset.d*Math.PI/4;}return;
    case 'czoom':if(pv){pv.face=!pv.face;t.textContent=pv.face?'🧍 Весь':'🔍 Лицо';}return;
    case 'crand':randomLook();updateCreator();return;
    case 'closecreator':pvClose();$('auth').style.display='none';$('authbox').style.width='';return;
    case 'savelook':{const first=!me.look;if(await act('set_look',{p_look:draft})){pvClose();$('authbox').style.width='';$('auth').style.display='none';if(first&&me.onboarded&&me.last_daily!==new Date().toISOString().slice(0,10))showDaily();}break;}
    case 'quest':{const Q=QUESTS[t.dataset.q],P=world.POIS[Q.poi];quest={id:t.dataset.q,phase:'go'};world.me.goal='quest';world.goMe(P.x,P.y);world.flyTo(P.x,P.y);if(mobile)sheetOpen=false;toast(`Идёшь: ${P.ic} ${P.n}`);break;}
    case 'qcancel':quest=null;if(world.me)world.me.goal=null;break;
    case 'gopoi':{const P=world.POIS[QUESTS[t.dataset.q].poi];world.flyTo(P.x,P.y,mobile?12:16);if(mobile)sheetOpen=false;break;}
    case 'closesheet':sheetOpen=false;break;
    case 'coachmin':coachMin=!$('coach').classList.contains('mini');$('coach').classList.toggle('mini');break;
    case 'buyland':await act('buy_land',{p_id:id});break;
    case 'build':await act('build',{p_id:id,p_type:t.dataset.t});break;
    case 'hire':await act('hire',{p_id:id,p_delta:1});break;
    case 'fire':await act('hire',{p_id:id,p_delta:-1});break;
    case 'sell':if(await act('sell',{p_good:t.dataset.g,p_q:Math.floor(inv(me,t.dataset.g))})){toast('🚚 Грузовик выехал на базу');loadShips();}break;
    case 'buy':await act('buy',{p_good:t.dataset.g,p_q:5});break;
    case 'job':if(world.me)world.me.hold=false;if(await act('take_job',{p_id:id}))toast('💼 Принят на работу');break;
    case 'quit':await act('quit_job');break;
    case 'buyunit':if(await act('buy_unit',{p_id:id}))toast('🎉 Поздравляем с покупкой!');break;
    case 'sellprop':if(confirm('Точно продать?'))await act('sell_prop',{p_id:id});break;
    case 'sethome':await act('set_home',{p_id:id});{const h=homePlot();world.me&&(world.me.goal=null);}break;
    case 'longstart':{const h=+t.dataset.h;if(await act('start_long_shift',{p_id:id,p_hours:h})){toast(`🕒 Смена началась: ${h} ч`);}break;}
    case 'longclaim':{const before=me.money;if(await act('claim_long_shift')){const d=Math.round(me.money-before);toast(`✅ Смена окончена: +${fmt(d)}💰`);world.me&&world.float(`+${fmt(d)}💰`,world.me.x,1.7,world.me.y,'#c8ffb0');}break;}
    case 'longcancel':if(confirm('Уйти со смены раньше? Оплаты не будет.'))await act('cancel_long_shift');break;
    case 'busmap':showBusMap();break;
    case 'busgo':busGo(+t.dataset.i);break;
    case 'gostop':{const s=world.STOPS[stopSel];if(s){world.goMe(s.x,s.y);if(mobile)sheetOpen=false;}break;}
    case 'closemodal':$('auth').style.display='none';break;
    case 'club':if(mode==='room')leaveRoom();goClub(id);break;
    case 'enter':if(mode==='room')leaveRoom();await enterRoom({unit:id,hostUid:me.id,hostNick:me.nick,editable:true});break;
    case 'redit':if(room.state){room.setEdit(!room.state.edit);sheetOpen=true;tab='furn';}break;
    case 'rwall':room.setDecor('wall',t.dataset.v);break;
    case 'rfloor':room.setDecor('floor',t.dataset.v);break;
    case 'home':{if(!me)break;if(mode==='room'){leaveRoom();break;}const h=homeSpot();if(h){world.flyTo(h.x,h.y,mobile?12:16);if(mobile)sheetOpen=false;}break;}
    case 'leave':leaveRoom();break;
    case 'findme':if(mode==='city'&&world.me)world.flyTo(world.me.x,world.me.y);break;
    case 'map':$('mmbox').classList.toggle('show');break;
    case 'goto':{const p=plots[+t.dataset.plot];world.flyTo(p.x,p.y,mobile?12:16);sel=p;world.select(p);tab='obj';sheetOpen=true;break;}
    case 'place':if(room.takeToHand(t.dataset.it)&&mobile)sheetOpen=false;break;
    case 'rot':room.rotateHand();break;
    case 'drop':room.dropHand();break;
    case 'buyfurn':if(await act('buy_furn',{p_item:t.dataset.it})&&room.state)room.state.owned=me.furn;break;
    case 'invite':{if(!me.home_unit){toast('Сначала купи квартиру');break;}const n=$('invnick').value.trim();if(n&&await act('invite',{p_nick:n}))toast('Приглашение отправлено');break;}
    case 'logout':await sb.auth.signOut();location.reload();break;
  }
  lastBody='';renderUI();
});
$('auth').addEventListener('keydown',e=>{if(e.key==='Enter'){const b=$('authbox').querySelector('[data-auth^="do"],[data-auth="mknick"]');b&&authAction(b.dataset.auth);}});
// миникарта
{const mm=$('mm');mm.width=world.W;mm.height=world.H;const ctx=mm.getContext('2d');let down=false;const jump=e=>{const r=mm.getBoundingClientRect();world.jump((e.clientX-r.left)/r.width*world.W,(e.clientY-r.top)/r.height*world.H);};
  mm.addEventListener('pointerdown',e=>{down=true;jump(e);});addEventListener('pointermove',e=>{if(down)jump(e);});addEventListener('pointerup',()=>{if(down&&mobile)$('mmbox').classList.remove('show');down=false;});
  setInterval(()=>{if(mode==='city')world.drawMini(ctx,performance.now()/1000);},300);}

// ================= ОБУЧЕНИЕ (Петрович) =================
const tutFlags={room:false};let tutI=-1;
const cheapLand=()=>{const m=world.me||marketPlot,sc=p=>p.price+Math.hypot(p.x-m.x,p.y-m.y)*1.2;return[...props.values()].filter(p=>p.kind==='land'&&!p.owner&&(p.reg==='v'||p.reg==='d')).sort((a,b)=>sc(a)-sc(b))[0];};
let recLand=null;
let camStart=null;
const fly=p=>p&&world.flyTo(p.x,p.y,mobile?11:14);
const TUT=[
  {t:'Это твоя <b>деревня</b> — здесь твой дом, пока нет квартиры. Покажу, что где.',btn:'Показать',enter(){fly(homeVillage());}},
  {t:'Здесь <b>работа</b>: ПВЗ «Коробас». Нажми на здание и «Работать» — это первые деньги.',btn:'Дальше',enter(){fly(homeVillage());},arrow:()=>homeVillage()},
  {t:'<b>«Градус»</b> платит больше. А ещё у входа бывает весело.',btn:'Дальше',enter(){fly(nearPlot(homeVillage(),'alko'));},arrow:()=>nearPlot(homeVillage(),'alko')},
  {t:'<b>Дом культуры</b>: внутри энергия ⚡ копится втрое быстрее.',btn:'Дальше',enter(){fly(nearPlot(homeVillage(),'dk'));},arrow:()=>nearPlot(homeVillage(),'dk')},
  {t:'<b>Остановка</b>: автобус до города — бесплатно. Нажми на неё и выбери, куда ехать.',btn:'Дальше',enter(){const s=nearStopV(homeVillage());s&&world.flyTo(s.x,s.y,mobile?11:14);},arrow:()=>{const s=nearStopV(homeVillage());return s&&{x:s.x+.5,y:s.y-.5};}},
  {t:'Кнопка <b>🏠</b> справа всегда вернёт камеру к дому, а <b>📍</b> — к тебе. Удачи в Пиксельграде!',btn:'Понятно',hl:['topbtns'],enter(){fly(homeVillage());}},
];
// ================= ОБУЧЕНИЕ: остров «Учебный» (всё понарошку, только у клиента) =================
let ob=null;const IS=world.ISLAND,OB_SHIFT=4;
const OBH={pvz:{x:IS.pvz.x,y:IS.pvz.y},alko:{x:IS.alko.x,y:IS.alko.y},lavka:{x:IS.lavka.x,y:IS.lavka.y},pier:{x:IS.pier.x+.5,y:IS.pier.y},boat:{x:world.FERRY.x,y:world.FERRY.y},
  plot:{x:IS.plot.x0+1.5,y:IS.plot.y0+1.5},house:{x:IS.spawn.x,y:IS.spawn.y},mill:{x:IS.mill.x,y:IS.mill.y},board:{x:IS.board.x,y:IS.board.y}};
// где встать у каждой точки (персонаж сам идёт туда, а по приходу открывается нужная карточка)
const OBSTAND={pvz:[IS.pvz.x,IS.pvz.y+1],alko:[IS.alko.x,IS.alko.y+1],lavka:[IS.lavka.x,IS.lavka.y+1],house:[IS.spawn.x,IS.spawn.y+1],mill:[IS.mill.x,IS.mill.y+2],
  plot:[IS.plot.x0+1,IS.plot.y0+4],board:[IS.pier.x,IS.board.y],pier:[IS.pier.x,IS.pier.y+1]};
const OB=[
  {t:'Добро пожаловать на остров «Учебный»! Я Петрович. Тут всё понарошку: научу работать, отдыхать, строить, перерабатывать и торговать — а потом паром отвезёт тебя в Пиксельград.',btn:'Начнём'},
  {t:mobile?'Проведи пальцем по экрану, чтобы двигать карту. Двумя пальцами — приблизить или отдалить.':'Потяни карту мышкой. Колесо — приблизить или отдалить.',enter(){camStart={x:world.camT.x,z:world.camT.z};},done:()=>Math.hypot(world.camT.x-camStart.x,world.camT.z-camStart.z)>5},
  {t:'Первая работа — <b>ПВЗ «Коробас»</b>. Я довёл тебя до двери: жми «Работать». Каждая смена — деньги и минус ⚡ энергии.',go:'pvz',done:()=>ob.shifts.pvz>=3},
  {t:'В <b>«Градусе»</b> платят больше. Отработай там 2 смены.',go:'alko',done:()=>ob.shifts.alko>=2},
  {t:'Энергия ⚡ почти кончилась. Быстрее всего она копится в <b>Доме культуры</b> и <b>кинотеатре</b> — втрое быстрее. Тут на острове их заменяет <b>Гостевой домик</b>: зайди и отдохни.',go:'house',done:()=>ob.rested},
  {t:'Отдохнул(а)! Ещё ⚡: <b>ежедневная награда</b> заряжает полностью, а 💎 кристаллы — мгновенно. Теперь купи <b>учебный участок</b> за 40💰.',go:'plot',done:()=>ob.plot},
  {t:'Построй на участке <b>ферму</b> (20💰). Стройка займёт пару секунд (в настоящем мире — минуты).',go:'plot',done:()=>ob.farm},
  {t:'Работник сам собирает урожай. Загляни на склад — нажми на подсвеченную кнопку <b>📦</b>.',hl:'inv',done:()=>tab==='inv'&&sheetOpen&&(ob.inv.wheat||0)>=3},
  {t:'Сырьё дешёвое. Отнеси пшеницу на <b>Мельницу</b>: из 3🌾 выйдет 1 мешок муки — а он стоит почти в 5 раз дороже. Это <b>переработка</b>.',go:'mill',done:()=>ob.milled},
  {t:'Продай муку в <b>Лавке скупщика</b> и сравни цену с сырьём.',go:'lavka',done:()=>ob.sold},
  {t:'Лучшие участки, квартиры и бизнесы в городе продаются на <b>аукционе</b>. Попробуй на <b>доске аукционов</b>: сделай ставку, а если перебьют — ставь ещё.',go:'board',done:()=>ob.aucWon},
  {t:'Ты готов(а)! Паром у <b>пристани</b> отвезёт тебя в Пиксельград. Начни с работы в ПВЗ или «Градусе» в своей деревне. Удачи!',go:'pier'},
];
const OBS={pvz:2,alko:3,rest:4,plot:5,farm:6,mill:8,sell:9,auc:10};const OBNEED={pvz:3,alko:2};
const FLOUR=14,WHEAT=3;
function startOnboarding(){ob={i:-1,money:0,en:12,inv:{},shifts:{pvz:0,alko:0},job:null,shiftT:0,plot:false,farm:false,farmT:0,sold:false,sel:null,walkTo:null};
  world.tutReset();world.setFog(true);world.setMe(me.nick,me.color,IS.spawn.x,IS.spawn.y+2,me.skin,me.look);world.jump(IS.spawn.x,IS.spawn.y+2);tab='ob';sheetOpen=false;obGo(0);}
// новый шаг: закрыть все окна, подсветить что нужно и самим довести персонажа до места
function obGo(i){if(i>=OB.length)return;ob.i=i;const st=OB[i];st.enter&&st.enter();
  ob.sel=null;sheetOpen=false;tab='ob';ob.walkTo=null;
  document.querySelectorAll('.hl').forEach(e=>e.classList.remove('hl'));if(st.hl)$(st.hl).classList.add('hl');
  $('coach').style.display='flex';$('coach').classList.remove('mini');coachMin=false;
  $('cwho').textContent=`ОСТРОВ «УЧЕБНЫЙ» · ${i+1}/${OB.length}`;$('ctxt').innerHTML=st.t;$('cbtn').innerHTML=st.btn?`<span class="btn gold" data-ob="next">${st.btn}</span>`:'<span class="mut">▶ выполни — и продолжим</span>';
  if(st.go){const h=OBH[st.go],sd=OBSTAND[st.go],m=world.me;world.flyTo(h.x,h.y,mobile?10:12);ob.walkTo=st.go;if(m){m.goal=null;world.goMe(sd[0],sd[1]);}}
  dirty=true;}
function obOpen(k){ob.sel=k;tab='ob';sheetOpen=true;dirty=true;}
function obUpdate(dt){if(!ob)return;const st=OB[ob.i];world.arrow=st&&st.go&&!sheetOpen?OBH[st.go]:null;if(st&&st.done&&st.done()){obGo(ob.i+1);return;}
  const m=world.me;
  // дошёл до места — сразу открываем нужную карточку
  if(ob.walkTo&&m&&!m.path.length&&!ob.job){const sd=OBSTAND[ob.walkTo];if(Math.hypot(m.x-sd[0],m.y-sd[1])<1.6){const k=ob.walkTo;ob.walkTo=null;obOpen(k);}}
  if(ob.job&&m){const h=OBH[ob.job],tx=Math.round(h.x),ty=Math.round(h.y)+1;if(m.goal!==ob.job){m.goal=ob.job;world.goMe(tx,ty);ob.shiftT=0;}
    const at=!m.path.length&&Math.hypot(m.x-tx,m.y-ty)<1.3;m.working=at;
    if(at){ob.shiftT+=dt;if(ob.shiftT>=OB_SHIFT){ob.shiftT=0;const pay=ob.job==='pvz'?10:15;ob.money+=pay;ob.en=Math.max(1,ob.en-1);ob.shifts[ob.job]++;world.float(`+${pay}💰  −1⚡`,m.x,1.6,m.y);dirty=true;
      if((ob.job==='pvz'&&ob.shifts.pvz>=3)||(ob.job==='alko'&&ob.shifts.alko>=2)){ob.job=null;m.goal=null;m.working=false;toast('✅ Смена окончена!');}}}
    const b=$('obbar');if(b)b.style.width=Math.min(100,ob.shiftT/OB_SHIFT*100)+'%';}
  if(ob.farm&&Date.now()>ob.farmReady){ob.farmT+=dt;if(ob.farmT>=2.5){ob.farmT=0;if((ob.inv.wheat||0)<12){ob.inv.wheat=(ob.inv.wheat||0)+1;dirty=true;}}}
  // отдых в гостевом домике: энергия бежит втрое быстрее, полная — выходим сами
  if(ob.resting){ob.restT=(ob.restT||0)+dt;if(ob.restT>=.3){ob.restT=0;ob.en=Math.min(20,ob.en+1);dirty=true;}if(ob.en>=20)obRestOut();}
  // мельница мелет
  if(ob.grind!=null){ob.grind+=dt;const b=$('obgr');if(b)b.style.width=Math.min(100,ob.grind/3*100)+'%';
    if(ob.grind>=3){const q=Math.floor((ob.inv.wheat||0)/3);ob.inv.wheat-=q*3;ob.inv.flour=(ob.inv.flour||0)+q;ob.grind=null;ob.milled=true;toast(`🌾→🥖 Готово: ${q} мешк. муки`);}}
  // учебный аукцион: Петрович один раз перебивает ставку
  const A=ob.auc;if(A&&!A.done){const now=Date.now();
    if(A.lead==='me'&&!A.botDone&&now>A.myAt+1500){A.botDone=true;A.bid+=5;A.lead='bot';A.end=Math.max(A.end,now+6000);toast('🔨 Петрович перебил твою ставку! Ставь ещё');}
    if(now>=A.end){if(A.lead==='me'){A.done=true;ob.aucWon=true;ob.money-=A.bid;toast(`🎉 Лот твой за ${A.bid}💰! Так же в городе продаются участки, квартиры и бизнесы`,6000);}else{A.end=now+10000;A.bid=10;A.lead='bot';A.botDone=false;}}
    if(ob.sel==='board')dirty=true;}}
function obRestIn(){ob.resting=true;setMode('room');room.open({...CLUBS.dk,title:'Гостевой домик',editable:false,owned:{},elsewhere:{},makeAvatar:world.makeAvatar,meId:me.id,onSave:()=>{},onMove:()=>{}});
  room.setPeople([{uid:me.id,nick:me.nick,color:me.color,look:me.look,skin:me.skin}]);document.body.classList.add('inroom');sheetOpen=true;dirty=true;}
function obRestOut(){ob.resting=false;ob.rested=true;room.close();setMode('city');document.body.classList.remove('inroom');toast('⚡ Энергия полная!');dirty=true;}
function setMode(v){mode=v;}
function obHotspot(g){if(!g)return null;let best=null,bd=3.2;for(const[k,h]of Object.entries(OBH)){const d=Math.hypot(g.x-h.x,g.z-h.y);if(d<bd){bd=d;best=k;}}return best==='boat'?'pier':best;}
function obCan(k){if(k==='pvz'||k==='alko')return ob.i===OBS[k]&&ob.shifts[k]<OBNEED[k];return true;}
function obTopUp(cost,what){if(ob.money<cost){toast(`👷 Петрович подкинул ${cost-ob.money}💰 на ${what}`);ob.money=cost;}}
const obWait='<div class="mut" style="margin-top:6px">⏳ Сначала выполни задание Петровича сверху.</div>';
function obHTML(){const k=ob.sel,mny=n=>`<b>${n}💰</b>`;
  if(k==='pvz'||k==='alko'){const n=k==='pvz'?'ПВЗ «Коробас»':'Алкомаркет «Градус»',pay=k==='pvz'?10:15;
    return`<h3>${k==='pvz'?'📦':'🍾'} ${n}</h3><div>${mny(pay)} за смену · ⚡1</div>`+
      (ob.job===k?`<div style="margin-top:6px">✅ Ты работаешь здесь (${ob.shifts[k]}/${OBNEED[k]} смен)<div class="bar"><i id="obbar" style="width:0"></i></div></div>`:
       obCan(k)?`<span class="btn gold" data-ob="job" data-k="${k}">Работать</span>`:
       `<div class="mut" style="margin-top:6px">${ob.shifts[k]>=OBNEED[k]?'✅ Тут ты уже поработал(а).':'⏳ Сначала выполни задание Петровича сверху.'}</div>`);}
  if(k==='house'){if(ob.resting)return`<h3>🏠 Гостевой домик</h3><div>⚡ Энергия копится <b>×3</b></div><div style="font-size:24px;margin:6px 0">⚡ ${ob.en}/20</div><div class="bar"><i style="width:${ob.en/20*100}%"></i></div>`;
    return`<h3>🏠 Гостевой домик</h3><div>Внутри энергия копится втрое быстрее — как в Доме культуры и кинотеатре в городе.</div>`+(ob.i===OBS.rest?`<span class="btn gold" data-ob="rest">Зайти отдохнуть</span>`:obWait);}
  if(k==='plot'){if(!ob.plot)return`<h3>🌱 Учебный участок</h3><div>Цена ${mny(40)}, у тебя ${mny(ob.money)}.</div>`+(ob.i>=OBS.plot?`<span class="btn gold" data-ob="buy">Купить участок</span>`:obWait);
    if(!ob.farm)return`<h3>🌱 Твой участок</h3><div>Пшеница растёт сама, работник собирает урожай. Цена ${mny(20)}.</div><span class="btn gold" data-ob="build">Построить ферму</span>`;
    return`<h3>🌾 Ферма</h3><div>Пшеницы на складе: <b>${Math.floor(ob.inv.wheat||0)}</b></div>`;}
  if(k==='mill'){const w=Math.floor(ob.inv.wheat||0),q=Math.floor(w/3);
    if(ob.grind!=null)return`<h3>🏭 Мельница</h3><div>Мелем ${q*3}🌾 → ${q} мешк. муки…</div><div class="bar"><i id="obgr" style="width:0"></i></div>`;
    if(ob.i!==OBS.mill)return`<h3>🏭 Мельница</h3>${ob.milled?'<div>✅ Мука готова.</div>':obWait}`;
    return`<h3>🏭 Мельница</h3><div>3🌾 → 1 мешок муки. Пшеница ${mny(WHEAT)}/шт, мука ${mny(FLOUR)}/шт.</div><div>У тебя ${w}🌾 → выйдет <b>${q}</b> мешк.: ${q*3}🌾 стоили бы ${mny(q*3*WHEAT)}, а мука — ${mny(q*FLOUR)}</div>`+
      (q>0?`<span class="btn gold" data-ob="grind">Смолоть</span>`:`<div class="mut">Урожай ещё растёт: ${w}/3🌾</div>`);}
  if(k==='lavka'){const w=Math.floor(ob.inv.wheat||0),f=Math.floor(ob.inv.flour||0);
    return`<h3>🧺 Лавка скупщика</h3><div>🌾 пшеница ${mny(WHEAT)} · 🥖 мука ${mny(FLOUR)}</div><div>У тебя: ${f} муки, ${w} пшеницы → <b>${f*FLOUR+w*WHEAT}💰</b></div>`+
      (ob.i===OBS.sell?`<span class="btn gold ${f+w>0?'':'dis'}" data-ob="sell">Продать всё</span>`:ob.sold?'<div>✅ Продано.</div>':obWait);}
  if(k==='board'){if(ob.i!==OBS.auc)return`<h3>🔨 Доска аукционов</h3>${ob.aucWon?'<div>✅ Лот выигран.</div>':obWait}`;
    const A=ob.auc||(ob.auc={bid:10,lead:'bot',end:Date.now()+15000,botDone:false,myAt:0}),left=Math.max(0,Math.ceil((A.end-Date.now())/1000)),nb=A.bid+5;
    return`<h3>🔨 Аукцион</h3><div>Лот: <b>🎣 Удочка рыбака</b></div><div>Ставка: ${mny(A.bid)} · лидирует: <b>${A.lead==='me'?'ты ✅':'Петрович'}</b></div><div>⏱ До конца: <b>${left} с</b> (новая ставка продлевает торги)</div>`+
      (A.lead==='me'?'<div class="mut" style="margin-top:6px">Ты лидируешь — жди конца торгов.</div>':`<span class="btn gold" data-ob="bid">Поставить ${nb}💰</span>`)+
      `<div class="mut" style="margin-top:6px">В городе: «Рынок → Аукцион». Если тебя перебили — деньги возвращаются.</div>`;}
  if(k==='pier')return`<h3>⛴ Пристань</h3>`+(ob.i>=OB.length-1?`<div>Паром в Пиксельград готов. Учебные деньги останутся тут, а в городе тебя ждут 150💰 и работа в деревне.</div><span class="btn gold" data-ob="sail">Отплыть в Пиксельград →</span>`:'<div>Паром ждёт, пока ты закончишь обучение.</div>');
  return`<h3>🏝 Остров «Учебный»</h3><div>Следуй подсказкам Петровича сверху.</div>`;}
function obInvHTML(){const q=Math.floor(ob.inv.wheat||0),f=Math.floor(ob.inv.flour||0);return`<h3>📦 Склад</h3><div class="row">🌾 Пшеница — ${q}<div class="bar"><i style="width:${Math.min(100,q/12*100)}%"></i></div></div>`+(f?`<div class="row">🥖 Мука — ${f}</div>`:'');}
async function obAction(a,t){
  if(a==='next')obGo(ob.i+1);
  if(a==='job'&&obCan(t.dataset.k)){if(ob.en<1){ob.en=20;toast('👷 Петрович угостил чаем — ⚡ восстановлена');}ob.job=t.dataset.k;ob.sel=null;sheetOpen=false;}
  if(a==='rest'&&ob.i===OBS.rest&&!ob.resting){obRestIn();}
  if(a==='buy'&&!ob.plot&&ob.i===OBS.plot){obTopUp(40,'участок');ob.money-=40;ob.plot=true;world.tutPlotState({owner:'me',color:me.color,nick:me.nick});toast('🌱 Участок твой!');}
  if(a==='build'&&ob.plot&&!ob.farm&&ob.i===OBS.farm){obTopUp(20,'ферму');ob.money-=20;ob.farm=true;ob.farmReady=Date.now()+5000;ob.job=null;world.tutPlotState({owner:'me',color:me.color,nick:me.nick,building:'farm',workers:1,builtAt:Date.now()+5000});toast('🏗 Стройка пошла!');}
  if(a==='grind'&&ob.i===OBS.mill&&ob.grind==null&&(ob.inv.wheat||0)>=3){ob.grind=0;}
  if(a==='sell'&&ob.i===OBS.sell){const w=Math.floor(ob.inv.wheat||0),f=Math.floor(ob.inv.flour||0),sum=f*FLOUR+w*WHEAT;if(sum>0){ob.money+=sum;ob.inv.wheat=0;ob.inv.flour=0;ob.sold=true;
    toast(`🧺 +${sum}💰 · ${f} муки дали ${f*FLOUR}💰, а то же зерно сырьём — ${f*3*WHEAT}💰`,6000);}}
  if(a==='bid'&&ob.i===OBS.auc&&ob.auc&&ob.auc.lead!=='me'){const A=ob.auc,nb=A.bid+5;obTopUp(nb,'ставку');A.bid=nb;A.lead='me';A.myAt=Date.now();A.end=Math.max(A.end,Date.now()+5000);}
  if(a==='sail'){ob.job=null;sheetOpen=false;$('coach').style.display='none';world.arrow=null;const sp=villageSpawn();
    toast('⛴ Паром отчаливает в Пиксельград…',6000);
    world.ferry({x:171.5,y:170},async()=>{const r=await act('finish_onboarding',{p_x:sp.x,p_y:sp.y});if(!r)return;ob=null;world.tutReset();
      me.last_x=sp.x;me.last_y=sp.y;localStorage.setItem('pg_vil',sp.id);localStorage.removeItem('pg_tour');enterWorld();toast('🏡 Добро пожаловать в Пиксельград!',5000);setTimeout(()=>tutGo(0),600);});}
  dirty=true;}
function tutGo(i){document.querySelectorAll('.hl').forEach(e=>e.classList.remove('hl'));
  if(i>=TUT.length){tutEnd();return;}tutI=i;
  const s=TUT[i];s.enter&&s.enter();(s.hl||[]).forEach(id=>$(id)?.classList.add('hl'));
  $('coach').style.display='flex';$('coach').classList.remove('mini');$('cwho').textContent=`ПЕТРОВИЧ · ${i+1}/${TUT.length}${mobile?' · нажми, чтобы свернуть':''}`;$('ctxt').innerHTML=s.t;
  $('cbtn').innerHTML=(s.btn?`<span class="btn gold" data-tut="next">${s.btn}</span>`:'<span class="mut">▶ выполни — и продолжим</span>')+(i<TUT.length-1?'<span class="skip" data-tut="skip">пропустить обучение</span>':'');}
function tutEnd(){tutI=TUT.length;$('coach').style.display='none';world.arrow=null;document.querySelectorAll('.hl').forEach(e=>e.classList.remove('hl'));localStorage.setItem('pg_tour','1');}
function tutCheck(){if(!me||tutI<0||tutI>=TUT.length)return;const s=TUT[tutI];s.tick&&s.tick();world.arrow=s.arrow?s.arrow():null;if(s.done&&s.done())tutGo(tutI+1);}

// ================= ЦИКЛ =================
let last=performance.now(),uiT=0,settleT=10,lastSaved='';
function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;
  if(mode==='city')world.frameUpdate(dt);else room.render(dt);
  if(me){if(ob)obUpdate(dt);else{updateJob(dt);checkPendingClub();}trackPos(false);if((settleT-=dt)<=0){settleT=15;act('settle',{},true);const m=world.me;if(m){const k=Math.round(m.x)+','+Math.round(m.y);if(k!==lastSaved){lastSaved=k;rpc('set_pos',{p_x:m.x,p_y:m.y}).catch(()=>{});}}}}
  if((uiT-=dt)<=0||dirty){uiT=.5;renderUI();}}
requestAnimationFrame(loop);
renderUI();
// отладка обучения без сервера: ?offline&obtest
if(!sb&&new URLSearchParams(location.search).has('obtest')){me={id:'t',nick:'Тест',color:'#ffd166',look:null,skin:null,xp:0,money:0,gems:0,energy:60,energy_at:new Date().toISOString(),shifts:0,inv:{},furn:{}};startOnboarding();setTimeout(()=>{$('auth').style.display='none';},0);}
if(new URLSearchParams(location.search).has('film'))import('./film.js').then(f=>f.run({world,room,CLUBS,setMode:v=>{mode=v;},$}));
if(new URLSearchParams(location.search).has('fog'))setTimeout(()=>{world.setFog(true);world.jump(215,245);},60);
{const c=new URLSearchParams(location.search).get('cam');if(c){const[x,y]=c.split(',').map(Number);setTimeout(()=>world.jump(x,y),50);}}

if(!sb)showAuth('noserver');
else{loadWorld().then(async()=>{const {data:{session}}=await sb.auth.getSession();if(session)afterLogin();else showAuth('login');}).catch(e=>{toast('Ошибка загрузки: '+esc(e.message),8000);showAuth('login');});}
