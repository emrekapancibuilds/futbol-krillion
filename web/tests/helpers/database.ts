import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export async function database() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
  for (const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await pg.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
  class Query {
    table: string; filters: string[]=[]; values: unknown[]=[]; operation='select'; payload: Record<string,unknown>|null=null;
    fields='*'; sort=''; cap=''; one=false; nullable=false; conflict='';
    constructor(table:string){ if(!/^fk_\w+$/.test(table))throw new Error('Bad table');this.table=table; }
    bind(value:unknown){this.values.push(value);return `$${this.values.length}`;}
    select(fields='*'){this.fields=fields;return this;}
    eq(key:string,value:unknown){this.filters.push(`${key}=${this.bind(value)}`);return this;}
    gt(key:string,value:unknown){this.filters.push(`${key}>${this.bind(value)}`);return this;}
    is(key:string,_value:null){this.filters.push(`${key} is null`);return this;}
    order(key:string,options:{ascending:boolean}){this.sort=` order by ${key} ${options.ascending?'asc':'desc'}`;return this;}
    limit(n:number){this.cap=` limit ${n}`;return this;}
    maybeSingle(){this.one=true;this.nullable=true;return this;}
    single(){this.one=true;return this;}
    insert(value:Record<string,unknown>){this.operation='insert';this.payload=value;return this;}
    update(value:Record<string,unknown>){this.operation='update';this.payload=value;return this;}
    upsert(value:Record<string,unknown>,options:{onConflict:string}){this.operation='insert';this.payload=value;this.conflict=options.onConflict;return this;}
    async then(resolve:(value:unknown)=>unknown,reject?:(reason:unknown)=>unknown){
      try {
        const where=this.filters.length?` where ${this.filters.join(' and ')}`:'';
        let sql=`select ${this.fields} from ${this.table}${where}${this.sort}${this.cap}`;
        if(this.operation==='insert'){
          const entries=Object.entries(this.payload!);
          sql=`insert into ${this.table}(${entries.map(([k])=>k)}) values(${entries.map(([,v])=>this.bind(v))})`;
          if(this.conflict)sql+=` on conflict(${this.conflict}) do update set ${entries.map(([k])=>`${k}=excluded.${k}`).join(',')}`;
          sql+=` returning ${this.fields}`;
        } else if(this.operation==='update') sql=`update ${this.table} set ${Object.entries(this.payload!).map(([k,v])=>`${k}=${this.bind(v)}`).join(',')}${where} returning ${this.fields}`;
        const result=await pg.query(sql,this.values);
        if(this.one&&result.rows.length>1)throw new Error('Multiple rows');
        if(this.one&&!this.nullable&&!result.rows.length)throw new Error('Missing row');
        return resolve({data:this.one?result.rows[0]??null:result.rows,error:null});
      }catch(error){if(reject)return reject(error);throw error;}
    }
  }
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    const values=Object.values(args).map(v=>typeof v==='object'&&v!==null&&!Array.isArray(v)?JSON.stringify(v):v);
    // jsonb snapshots are arrays; PostgreSQL must receive JSON, not a text[] literal.
    Object.keys(args).forEach((k,i)=>{if(k==='p_subscriptions')values[i]=JSON.stringify(args[k]);});
    const result=await pg.query<{value:unknown}>(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) as value`,values);
    return result.rows[0]?.value;
  };
  const checked=async(query:PromiseLike<{data:unknown;error:unknown}>)=>{const r=await query;if(r.error)throw r.error;return r.data;};
  const withLock=async(key:string,fn:(owner:string)=>Promise<unknown>)=>{
    const owner=randomUUID();if(!await rpc('fk_acquire_lock',{p_key:key,p_owner:owner}))throw new Error('Lease busy');
    try{return await fn(owner);}finally{await rpc('fk_release_lock',{p_key:key,p_owner:owner});}
  };
  return {pg,db:()=>({from:(name:string)=>new Query(name)}),checked,rpc,withLock};
}
