import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { database } from './helpers/database.ts';
import { credential, hash, sessionCookie, assertSameOrigin, HttpError } from '../lib/billing/security.ts';

process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.STRIPE_MODE='test';process.env.STRIPE_PRICE_ID='price_test';
process.env.APP_SECURITY_SECRET='a'.repeat(64);process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
const emails:{email:string;redirectTo:string}[]=[];
const emailProofs=new Map<string,string>();
let emailFailure=false;
mock.module('../lib/billing/email.ts',{namedExports:{emailConfigured:()=>true,
 sendVerification:async(email:string,redirectTo:string)=>{if(emailFailure)throw new Error('Email unavailable');emails.push({email,redirectTo});},
 verifiedEmail:async(proof:unknown)=>{const email=emailProofs.get(String(proof));if(!email)throw new HttpError(400,'Invalid email proof');return email;}
}});
const databaseFixture=await database();
mock.module('../lib/billing/db.ts',{namedExports:databaseFixture});
// External Stripe test fixtures are deliberately offline; no payment or network calls.
const customers=new Map<string, {id:string;email:string|null;livemode:boolean;metadata:Record<string,string>}>();
const intents=new Map<string, Record<string,unknown>>();
const disputes=new Map<string, {id:string;payment_intent:string;status:string}>();
const checkouts=new Map<string, Record<string,unknown>>();
let sequence=0;let checkoutCreates=0;let lastCheckout:Record<string,unknown>={};
const list=<T>(items:T[])=>({data:items,async *[Symbol.asyncIterator](){yield* items;}});
const api={
 prices:{retrieve:async()=>({id:'price_test',active:true,livemode:false,currency:'usd',unit_amount:499,type:'one_time',recurring:null})},
 customers:{create:async(v:{metadata:Record<string,string>})=>{const c={id:`cus_${++sequence}`,email:null,livemode:false,metadata:v.metadata};customers.set(c.id,c);return c;},
  retrieve:async(id:string)=>{const c=customers.get(id);if(!c)throw new Error('Unknown customer');return c;},
  list:({email}:{email:string})=>list([...customers.values()].filter(c=>c.email===email))},
 paymentIntents:{retrieve:async(id:string)=>{const p=intents.get(id);if(!p)throw new Error('Unknown payment');return p;}},
 disputes:{list:async()=>({data:[...disputes.values()],has_more:false}),retrieve:async(id:string)=>disputes.get(id)},
 checkout:{sessions:{create:async(v:Record<string,unknown>)=>{checkoutCreates++;lastCheckout=v;const id=`cs_test_${++sequence}`;const r={...v,id,livemode:false,status:'open',created:Math.floor(Date.now()/1000),expires_at:Math.floor(Date.now()/1000)+1800,url:`https://checkout.stripe.com/${id}`};checkouts.set(id,r);return r;},
 retrieve:async(id:string)=>{const c=checkouts.get(id);if(!c)throw new Error('Unknown checkout');return c;},
 list:({customer}:{customer:string})=>list([...checkouts.values()].filter(s=>s.customer===customer&&s.status==='complete')),
 listLineItems:async(id:string)=>({has_more:false,data:[{price:{id:checkouts.get(id)?.fixturePrice??'price_test'},quantity:1,amount_subtotal:499,currency:'usd',amount_discount:0}]}),
 expire:async(id:string)=>{checkouts.get(id)!.status='expired';}
 }}
};
mock.module('../lib/billing/stripe.ts',{namedExports:{APP:'futbol-krillion',billingMode:()=>false,priceId:()=> 'price_test',stripe:()=>api,
 objectId:(v:unknown)=>typeof v==='string'?v:(v as {id:string}|null)?.id??null,validatePrice:async()=>{const p=await api.prices.retrieve();if(p.unit_amount!==499)throw new Error('Invalid price');}}});
const service=await import('../lib/billing/service.ts');
const sessions=await import('../lib/billing/session.ts');
const recovery=await import('../lib/billing/restore.ts');
const {roundContext,createGame,unlimitedContext}=await import('../lib/game/premium.ts');
const {startRound,passRound}=await import('../lib/game/engine.ts');
const {gameData,gameSecret}=await import('../lib/game/server.ts');
const {pg}=databaseFixture;
after(async()=>{mock.restoreAll();await pg.close();});
const req=(cookie='',body?:object)=>new Request('http://localhost:3000/api/test',{method:body?'POST':'GET',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const first=await sessions.visitor(req());const other=await sessions.visitor(req());
const firstCookie=first!.cookie!.split(';')[0];const otherCookie=other!.cookie!.split(';')[0];
let checkoutId='';let customerId='';let intentId='';
const charge=()=>intents.get(intentId)!.latest_charge as Record<string,unknown>;
const evt=(id:string,type:string,object:object)=>({id,type,livemode:false,data:{object}} as Stripe.Event);

test('free anonymous play uses the original engine; forged browser premium flags give no access',async()=>{
 const day=gameData().days[0];const started=startRound(gameData(),{day:day.number,round:0},Date.now(),gameSecret());assert.ok(started);
 await assert.rejects(()=>service.requirePremium(first!.id), (e:unknown)=>e instanceof HttpError&&e.status===402);
 await assert.rejects(()=>createGame(first!.id,'practice',null),/Upgrade/);
 assert.equal((await service.status(first!.id)).premium,false);
 assertSameOrigin(req());assert.throws(()=>assertSameOrigin(new Request('http://localhost:3000',{headers:{origin:'https://attacker.example'}})),/origin/);
});

test('checkout creates a one-time payment session and reuses it on duplicate clicks',async()=>{
 const a=await service.createCheckout(first!);const b=await service.createCheckout(first!);assert.equal(a.url,b.url);assert.equal(checkoutCreates,1);
 assert.equal(lastCheckout.mode,'payment');assert.deepEqual(lastCheckout.line_items,[{price:'price_test',quantity:1}]);
 assert.deepEqual(lastCheckout.automatic_tax,{enabled:false});
 assert.deepEqual(lastCheckout.managed_payments,{enabled:false});
 assert.equal(lastCheckout.subscription_data,undefined);
 assert.ok(lastCheckout.payment_intent_data);
 checkoutId=[...checkouts.keys()][0];customerId=checkouts.get(checkoutId)!.customer as string;
 assert.equal((await service.confirmCheckout(first!.id,checkoutId)).premium,false);
 await assert.rejects(()=>service.confirmCheckout(other!.id,checkoutId),/another browser/);
 await assert.rejects(()=>service.portal(other!.id),/Restore Purchase/);
});

test('verified payment activates only the purchasing browser; signed webhook replay is harmless',async()=>{
 customers.get(customerId)!.email='owner@example.com';intentId='pi_test';
 intents.set(intentId,{id:intentId,customer:customerId,livemode:false,currency:'usd',status:'succeeded',amount_received:499,
 latest_charge:{id:'ch_test',paid:true,captured:true,amount_captured:499,refunded:false,disputed:false,receipt_url:'https://pay.stripe.com/receipts/test'}});
 Object.assign(checkouts.get(checkoutId)!,{status:'complete',payment_status:'paid',payment_intent:intentId,amount_total:499});
 const event=evt('evt_checkout','checkout.session.completed',{id:checkoutId});
 await service.handleEvent(event);await service.handleEvent(event);
 assert.equal((await service.status(first!.id)).premium,true);assert.equal((await service.status(other!.id)).premium,false);
 assert.equal((await pg.query('select * from fk_webhook_events where id=$1',['evt_checkout'])).rows.length,1);
 assert.ok((await service.portal(first!.id)).url.startsWith('https://pay.stripe.com/receipts/'));
 await assert.rejects(()=>service.createCheckout(first!),/already have/);
});

test('premium practice is unlimited, avoids recent prompts, and binds every round token to its owner and game',async()=>{
 const one=await createGame(first!.id,'practice',null);const two=await createGame(first!.id,'practice',null);
 const a=await roundContext(req(firstCookie),{gameId:one.gameId,day:0});const b=await roundContext(req(firstCookie),{gameId:two.gameId,day:0});
 assert.equal(a.data.days[0].prompts.filter(p=>b.data.days[0].prompts.includes(p)).length,0);
 const token=startRound(a.data,{day:0,round:0},Date.now(),a.secret)!;
 assert.equal(passRound(a.data,{day:0,round:0},token.token,a.secret).status,'passed');
 assert.equal(passRound(b.data,{day:0,round:0},token.token,b.secret).status,'invalid');
 await assert.rejects(()=>roundContext(req(otherCookie),{gameId:one.gameId,day:0}),/Upgrade/);
 await assert.rejects(()=>roundContext(req('fk_session=forged'),{gameId:one.gameId,day:0}),/Restore/);
 assert.equal(passRound(gameData(),{day:1,round:0},token.token,gameSecret()).status,'invalid');
});

test('category Unlimited checks entitlement on every operation and rejects tokens stolen by another paid visitor',async()=>{
 const context=await unlimitedContext(req(firstCookie));
 const prompt=context.data.unlimited[0];
 const started=startRound(context.data,{prompt},Date.now(),context.secret)!;
 assert.ok(started);
 const again=await roundContext(req(firstCookie),{prompt});
 assert.equal(passRound(again.data,{prompt},started.token,again.secret).status,'passed');
 assert.equal(passRound(gameData(),{prompt},started.token,gameSecret()).status,'invalid');
 await assert.rejects(()=>roundContext(req(otherCookie),{prompt}),/Upgrade/);
 await assert.rejects(()=>roundContext(req(),{prompt}),/Restore/);
 await assert.rejects(()=>roundContext(req(firstCookie),{prompt,day:1,round:0}),/Ambiguous/);
 await pg.query("insert into fk_visitor_customers(visitor_id,customer_id,method) values($1,$2,'email')",[other!.id,customerId]);
 const otherContext=await unlimitedContext(req(otherCookie));
 assert.equal(passRound(otherContext.data,{prompt},started.token,otherContext.secret).status,'invalid');
 await pg.query('delete from fk_visitor_customers where visitor_id=$1',[other!.id]);
 charge().refunded=true;await service.syncCustomer(customerId);
 await assert.rejects(()=>roundContext(req(firstCookie),{prompt}),/Upgrade/);
 charge().refunded=false;await service.syncCustomer(customerId);
});

test('archive keeps the published daily prompts and rejects today and unknown dates',async()=>{
 await service.syncCustomer(customerId);
 mock.timers.enable({apis:['Date'],now:Date.now()+86400000});
 try {
  const archived=await createGame(first!.id,'archive',1);
  const context=await roundContext(req(firstCookie),{gameId:archived.gameId,day:1});
  assert.deepEqual(context.data.days[0].prompts,gameData().days[0].prompts);
  const today=gameData().days.find(d=>d.date===new Date().toISOString().slice(0,10))!;
  await assert.rejects(()=>createGame(first!.id,'archive',today.number),/not in the archive/);
  await assert.rejects(()=>createGame(first!.id,'archive',-1),/not in the archive/);
 } finally {mock.timers.reset();}
});

test('one-time access does not expire; refunds and disputes follow authoritative payment state',async()=>{
 mock.timers.enable({apis:['Date'],now:Date.now()+400*86400000});
 try {assert.equal((await service.status(first!.id)).premium,true);} finally {mock.timers.reset();}
 // Partial refunds keep access. Full refunds revoke it, even with a stale paid event.
 charge().amount_refunded=100;await service.handleEvent(evt('evt_partial','charge.refunded',{id:'ch_test',customer:customerId}));
 assert.equal((await service.status(first!.id)).premium,true);
 charge().refunded=true;await service.handleEvent(evt('evt_refund','charge.refunded',{id:'ch_test',customer:customerId}));
 assert.equal((await service.status(first!.id)).premium,false);
 await service.handleEvent(evt('evt_late_paid','checkout.session.completed',{id:checkoutId}));
 assert.equal((await service.status(first!.id)).premium,false);
 await assert.rejects(()=>createGame(first!.id,'practice',null),/Upgrade/);
 charge().refunded=false;charge().disputed=true;
 disputes.set('dp_test',{id:'dp_test',payment_intent:intentId,status:'needs_response'});
 await service.handleEvent(evt('evt_dispute','charge.dispute.created',{id:'dp_test'}));
 assert.equal((await service.status(first!.id)).premium,false);
 disputes.get('dp_test')!.status='won';
 await service.handleEvent(evt('evt_dispute_won','charge.dispute.closed',{id:'dp_test'}));
 assert.equal((await service.status(first!.id)).premium,true);
 charge().disputed=false;disputes.clear();
});

test('wrong price, unpaid, uncaptured, wrong customer and legacy subscription sessions never grant a one-time unlock',async()=>{
 const session=checkouts.get(checkoutId)!;const intent=intents.get(intentId)!;
 for(const [object,key,value] of [[session,'fixturePrice','price_wrong'],[session,'payment_status','unpaid'],
  [session,'mode','subscription'],[intent,'amount_received',498],[intent,'customer','cus_wrong'],[charge(),'captured',false]] as const){
   const original=object[key];object[key]=value;
   await service.syncCustomer(customerId);assert.equal((await service.status(first!.id)).premium,false,key);
   object[key]=original;
 }
 await service.syncCustomer(customerId);assert.equal((await service.status(first!.id)).premium,true);
});

test('restore sends equal responses, requires verified email, rotates the credential, rejects replay, supports cookie loss',async()=>{
 const found=await recovery.requestRestore(req(), 'owner@example.com');const absent=await recovery.requestRestore(req(),'unknown@example.com');
 assert.deepEqual(found,absent);assert.equal(emails.length,2);
 const token=new URL(emails[0].redirectTo).searchParams.get('request')!;
 emailProofs.set('verified-owner','owner@example.com');emailProofs.set('verified-other','unknown@example.com');
 await assert.rejects(()=>recovery.restore(req(otherCookie),other!,token,'forged'),/Invalid email proof/);
 await assert.rejects(()=>recovery.restore(req(otherCookie),other!,token,'verified-other'),/does not match/);
 assert.equal((await service.status(other!.id)).premium,false);
 assert.equal((await service.status(other!.id)).premium,false);
 charge().refunded=false;
 const result=await recovery.restore(req(otherCookie),other!,token,'verified-owner');assert.equal(result.premium,true);
 assert.ok(other!.cookie);assert.notEqual(other!.cookie!.split(';')[0],otherCookie);
 assert.equal(await sessions.visitor(req(otherCookie),false),null);
 await assert.rejects(()=>recovery.restore(req(),other!,token,'verified-owner'),/expired/);
 await assert.rejects(()=>recovery.restore(req(),other!,credential(),'verified-owner'),/expired/);
 const third=await sessions.visitor(req());assert.equal((await service.status(third!.id)).premium,false);
 await assert.rejects(()=>service.portal(third!.id),/Restore/);
});

test('failed Supabase email delivery invalidates the recovery request',async()=>{
 emailFailure=true;
 try {await assert.rejects(()=>recovery.requestRestore(req(),'delivery-failed@example.com'),/Email unavailable/);}
 finally {emailFailure=false;}
 const rows=await pg.query<{used_at:unknown}>("select used_at from fk_recovery_tokens where email='delivery-failed@example.com'");
 assert.equal(rows.rows.length,1);assert.ok(rows.rows[0].used_at);
});

test('Stripe raw-body signature verification rejects tampering and wrong webhook secrets',()=>{
 const sdk=new Stripe('sk_test_fixture');const payload=JSON.stringify({id:'evt_signature',object:'event',type:'invoice.paid',data:{object:{}}});
 const header=sdk.webhooks.generateTestHeaderString({payload,secret:'whsec_fixture'});
 assert.equal(sdk.webhooks.constructEvent(payload,header,'whsec_fixture').id,'evt_signature');
 assert.throws(()=>sdk.webhooks.constructEvent(payload+' ',header,'whsec_fixture'));
 assert.throws(()=>sdk.webhooks.constructEvent(payload,header,'whsec_wrong'));
 const cookie=sessionCookie(credential());assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
 assert.equal(hash(credential()).length,64);
});
