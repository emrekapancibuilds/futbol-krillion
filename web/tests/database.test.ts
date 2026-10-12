import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const pg = new PGlite();
const migration = readdirSync('supabase/migrations').find(x=>x.endsWith('_account_free_subscriptions.sql'))!;
const query = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const digest = (letter: string) => letter.repeat(64);
let visitorId: string;
before(async () => {
 await pg.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
 await pg.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
 visitorId = (await query<{id:string}>("select public.fk_new_session($1) as id", [digest('a')]))[0].id;
});
after(async () => { await pg.close(); });

test('migration: all private tables have RLS, no public grants, and invoker-only RPCs', async () => {
 const tables = await query<{name:string;rls:boolean}>("select relname name,relrowsecurity rls from pg_class where relname like 'fk_%' and relkind='r'");
 assert.equal(tables.length,11); assert.ok(tables.every(t=>t.rls));
 assert.deepEqual(await query("select table_name from information_schema.role_table_grants where table_name like 'fk_%' and grantee in ('anon','authenticated','PUBLIC')"), []);
 assert.deepEqual(await query("select proname from pg_proc where proname like 'fk_%' and prosecdef"), []);
 for (const role of ['anon','authenticated']) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(()=>query('select * from public.fk_sessions'), /permission denied/);
  await assert.rejects(()=>query('select public.fk_new_session($1)', [digest('b')]), /permission denied/);
  await pg.exec('reset role');
 }
});

test('sessions: credential hashes are distinct from public visitors and rotation revokes the old credential', async () => {
 assert.notEqual(visitorId,digest('a'));
 assert.equal((await query<{ok:boolean}>('select public.fk_rotate_session($1,$2) ok',[digest('a'),digest('b')]))[0].ok,true);
 assert.equal((await query<{ok:boolean}>('select public.fk_rotate_session($1,$2) ok',[digest('a'),digest('c')]))[0].ok,false);
 assert.equal((await query('select visitor_id from fk_sessions where revoked_at is null'))[0].visitor_id,visitorId);
});

test('rate limiting and distributed leases are atomic; an expired worker cannot commit', async () => {
 for (let i=0;i<3;i++) assert.equal((await query<{ok:boolean}>('select fk_rate_limit($1,2,3600) ok',['test']))[0].ok,i<2);
 const owner=randomUUID();
 assert.equal((await query<{ok:boolean}>('select fk_acquire_lock($1,$2) ok',['customer:false:cus_test',owner]))[0].ok,true);
 assert.equal((await query<{ok:boolean}>('select fk_acquire_lock($1,$2) ok',['customer:false:cus_test',randomUUID()]))[0].ok,false);
 await assert.rejects(()=>query('select fk_sync_customer($1,false,$2,$3,$4::jsonb)',['cus_test','owner@example.com',randomUUID(),'[]']),/lease expired/);
 await query('select fk_release_lock($1,$2)',['customer:false:cus_test',owner]);
});

async function sync(id: string, state: string, paidThrough: string | null, event: string, checkout: string | null = null) {
 const owner=randomUUID();
 await query('select fk_acquire_lock($1,$2)',['customer:false:cus_test',owner]);
 try {
  await query('select fk_sync_customer($1,false,$2,$3,$4::jsonb,$5,$6,$7,$8)',[
   'cus_test','owner@example.com',owner,JSON.stringify([{id,price_id:'price_test',status:state,paid_through:paidThrough,
   current_period_end:paidThrough,cancel_at_period_end:state==='canceled',cancel_at:null}]),checkout,checkout?'cs_test_session':null,event,'invoice.paid']);
 } finally { await query('select fk_release_lock($1,$2)',['customer:false:cus_test',owner]); }
}

test('purchase: atomic checkout ownership and active entitlement; duplicate events do not mutate access', async () => {
 await query("insert into fk_customers(id,livemode) values('cus_test',false)");
 const checkout=(await query<{id:string}>("insert into fk_checkouts(visitor_id,customer_id,livemode) values($1,'cus_test',false) returning id",[visitorId]))[0].id;
 await assert.rejects(()=>query("insert into fk_checkouts(visitor_id,customer_id,livemode) values($1,'cus_test',false)",[visitorId]),/duplicate key/);
 await sync('sub_test','active',new Date(Date.now()+86400000).toISOString(),'evt_initial',checkout);
 assert.equal((await query<{active:boolean}>('select active from fk_entitlements where visitor_id=$1',[visitorId]))[0].active,true);
 await sync('sub_test','canceled','2000-01-01T00:00:00Z','evt_initial');
 assert.equal((await query<{active:boolean}>('select active from fk_entitlements where visitor_id=$1',[visitorId]))[0].active,true);
 assert.equal((await query('select * from fk_webhook_events')).length,1);
});

test('billing lifecycle: renewal, failed payment, cancellation, expiration, and disabled statuses', async () => {
 const future=new Date(Date.now()+3600000).toISOString();
 for (const [state,through,active] of [['active',future,true],['past_due',future,true],['canceled',future,true],
  ['past_due','2000-01-01T00:00:00Z',false],['canceled','2000-01-01T00:00:00Z',false],['incomplete',future,false],['unpaid',future,false]] as const) {
  await sync('sub_test',state,through,`evt_${randomUUID()}`);
  assert.equal((await query<{active:boolean}>('select active from fk_entitlements where visitor_id=$1',[visitorId]))[0].active,active,state);
 }
});

test('restoration: another browser has no ownership until verified token consumption; replay and expired tokens fail', async () => {
 const second=(await query<{id:string}>('select fk_new_session($1) id',[digest('d')]))[0].id;
 assert.equal((await query('select * from fk_entitlements where visitor_id=$1',[second])).length,0);
 await query("insert into fk_recovery_tokens(token_hash,email,livemode) values($1,'owner@example.com',false)",[digest('e')]);
 assert.equal((await query<{ok:boolean}>("select fk_restore($1,'owner@example.com',false,$2,$3,array['cus_test']) ok",[digest('e'),digest('d'),digest('f')]))[0].ok,true);
 assert.equal((await query('select * from fk_entitlements where visitor_id=$1',[second])).length,1);
 assert.equal((await query<{ok:boolean}>("select fk_restore($1,'owner@example.com',false,$2,$3,array['cus_test']) ok",[digest('e'),digest('f'),digest('0')]))[0].ok,false);
 await query("insert into fk_recovery_tokens(token_hash,email,livemode,expires_at) values($1,'owner@example.com',false,now()-interval '1 second')",[digest('1')]);
 assert.equal((await query<{ok:boolean}>("select fk_restore($1,'owner@example.com',false,$2,$3,array['cus_test']) ok",[digest('1'),digest('f'),digest('0')]))[0].ok,false);
 assert.equal((await query<{ok:boolean}>("select fk_restore($1,'attacker@example.com',false,$2,$3,array['cus_test']) ok",[digest('e'),digest('f'),digest('0')]))[0].ok,false);
});

test('database relationships and cross-customer restoration cannot be manipulated', async () => {
 await assert.rejects(()=>query("insert into fk_sessions(credential_hash,visitor_id,expires_at) values($1,$2,now()+interval '1 day')",[digest('2'),randomUUID()]),/foreign key/);
 await query("insert into fk_customers(id,livemode,email) values('cus_other',false,'other@example.com')");
 await query("insert into fk_recovery_tokens(token_hash,email,livemode) values($1,'owner@example.com',false)",[digest('3')]);
 await assert.rejects(()=>query("select fk_restore($1,'owner@example.com',false,$2,$3,array['cus_other'])",[digest('3'),digest('f'),digest('4')]),/customer mismatch/);
 assert.equal((await query('select used_at from fk_recovery_tokens where token_hash=$1',[digest('3')]))[0].used_at,null);
});
