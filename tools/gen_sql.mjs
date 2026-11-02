// node tools/gen_sql.mjs > sql/002_data.sql
import {GOODS,BLD,EMP,FURN} from '../js/config.js';
import {buildLayout,isEmployer} from '../js/layout.js';

const q=s=>`'${String(s).replace(/'/g,"''")}'`;
const j=o=>q(JSON.stringify(o||{}))+'::jsonb';
const out=[];
out.push('-- сгенерировано tools/gen_sql.mjs — не править руками');
out.push('insert into public.goods(good,name,base,target,stock) values');
out.push(Object.entries(GOODS).map(([k,g])=>`(${q(k)},${q(g.n)},${g.base},${g.target},${Math.round(g.target*.3)})`).join(',\n')+
  '\non conflict(good) do update set name=excluded.name, base=excluded.base, target=excluded.target;');
out.push('insert into public.recipes(building,name,kind,reg,inputs,outputs,rate,wage,pay,cost,mat,ord) values');
out.push(Object.entries(BLD).map(([k,b])=>`(${q(k)},${q(b.n)},${q(b.kind)},${q(b.reg)},${j(b.in)},${j(b.out)},${b.rate},${b.wage},${b.pay||0},${b.cost},${j(b.mat)},${b.ord})`).join(',\n')+
  '\non conflict(building) do update set name=excluded.name,kind=excluded.kind,reg=excluded.reg,inputs=excluded.inputs,outputs=excluded.outputs,rate=excluded.rate,wage=excluded.wage,pay=excluded.pay,cost=excluded.cost,mat=excluded.mat,ord=excluded.ord;');
out.push('insert into public.employers(sp,name,pay,req,out_per_min) values');
out.push(Object.entries(EMP).map(([k,e])=>`(${q(k)},${q(e.n)},${e.pay},${e.req},${j(e.out)})`).join(',\n')+
  '\non conflict(sp) do update set name=excluded.name,pay=excluded.pay,req=excluded.req,out_per_min=excluded.out_per_min;');
out.push('insert into public.furn_items(item,name,cost,money) values');
out.push(Object.entries(FURN).map(([k,f])=>`(${q(k)},${q(f.n)},${j(f.cost)},${f.money})`).join(',\n')+
  '\non conflict(item) do update set name=excluded.name,cost=excluded.cost,money=excluded.money;');

const {plots,units}=buildLayout();
const rows=[];
for(const p of plots){
  if(p.sp==='res')continue;
  const kind=p.sp?(isEmployer(p.sp)?'npc':null):'land';
  if(!kind)continue;
  rows.push(`(${p.id},${q(kind)},${p.id},${q(p.reg)},${p.sp?q(p.sp):'null'},null,null,${p.price},${p.x},${p.y},${p.demand})`);
}
for(const u of units){const p=plots[u.plot];
  rows.push(`(${u.id},${q(u.kind)},${u.plot},${q(u.kind==='office'?'B':'c')},null,${q(u.tier)},${u.floor},${u.price},${p.x},${p.y},${u.demand||0})`);}
for(let k=0;k<rows.length;k+=400){
  out.push('insert into public.props(id,kind,plot,reg,sp,tier,floor,price,x,y,demand) values');
  out.push(rows.slice(k,k+400).join(',\n')+'\non conflict(id) do update set kind=excluded.kind,plot=excluded.plot,reg=excluded.reg,sp=excluded.sp,tier=excluded.tier,floor=excluded.floor,price=excluded.price,x=excluded.x,y=excluded.y,demand=excluded.demand;');
}
console.log(out.join('\n'));
console.error(`plots ${plots.length}, props ${rows.length}, units ${units.length}, land ${plots.filter(p=>!p.sp).length}, res ${plots.filter(p=>p.sp==='res').length}, bc ${plots.filter(p=>p.sp==='bc').length}`);
