import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_KEY} from './supabase-config.js';

export const sb=SUPABASE_URL&&SUPABASE_KEY?createClient(SUPABASE_URL,SUPABASE_KEY):null;

export async function rpc(name,args={}){
  const {data,error}=await sb.rpc(name,args);
  if(error)throw new Error(error.message.replace(/^.*?: /,''));
  return data;
}
export async function selectAll(table,cols='*'){
  const out=[];for(let from=0;;from+=1000){
    const {data,error}=await sb.from(table).select(cols).range(from,from+999);
    if(error)throw new Error(error.message);out.push(...data);if(data.length<1000)break;}
  return out;
}
