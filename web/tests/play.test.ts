import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { database } from './helpers/database.ts';
import { assertSameOrigin } from '../lib/server/security.ts';

// Futkrill is free (owner, 2026-11-12: "get rid of payments"): Unlimited, practice and the daily archive are open to
// every browser. Practice and archive games are still stored per browser, so their round tokens stay bound to it.
process.env.APP_SECURITY_SECRET='a'.repeat(64);process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
const databaseFixture=await database();
mock.module('../lib/server/db.ts',{namedExports:databaseFixture});
const sessions=await import('../lib/server/session.ts');
const {roundContext,createGame,unlimitedContext}=await import('../lib/game/modes.ts');
const {startRound,passRound}=await import('../lib/game/engine.ts');
const {gameData,gameSecret}=await import('../lib/game/server.ts');
const {pg}=databaseFixture;
after(async()=>{mock.restoreAll();await pg.close();});
const req=(cookie='',body?:object)=>new Request('http://localhost:3000/api/test',{method:body?'POST':'GET',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const first=await sessions.visitor(req());const other=await sessions.visitor(req());
const firstCookie=first!.cookie!.split(';')[0];const otherCookie=other!.cookie!.split(';')[0];

test('the daily still runs on the original engine',()=>{
 const day=gameData().days[0];
 assert.ok(startRound(gameData(),{day:day.number,round:0},Date.now(),gameSecret()));
});

test('Unlimited is free: any browser plays a round, with no session and no purchase',async()=>{
 const context=unlimitedContext();
 const prompt=context.data.unlimited[0];
 const started=startRound(context.data,{prompt},Date.now(),context.secret)!;
 assert.ok(started);
 for (const cookie of ['',firstCookie,'fk_session=forged']) {
  const again=await roundContext(req(cookie),{prompt});
  assert.equal(passRound(again.data,{prompt},started.token,again.secret).status,'passed');
 }
 assert.notEqual(context.secret,gameSecret());                               // its own key: an Unlimited ticket is no daily ticket
 await assert.rejects(()=>roundContext(req(),{prompt,day:1,round:0}),/Ambiguous/);
});

test('practice is free for a brand-new browser, avoids recent prompts, and binds round tokens to its owner and game',async()=>{
 const one=await createGame(first!.id,'practice',null);const two=await createGame(first!.id,'practice',null);
 const a=await roundContext(req(firstCookie),{gameId:one.gameId,day:0});const b=await roundContext(req(firstCookie),{gameId:two.gameId,day:0});
 assert.equal(a.data.days[0].prompts.filter(p=>b.data.days[0].prompts.includes(p)).length,0);
 const token=startRound(a.data,{day:0,round:0},Date.now(),a.secret)!;
 assert.equal(passRound(a.data,{day:0,round:0},token.token,a.secret).status,'passed');
 assert.equal(passRound(b.data,{day:0,round:0},token.token,b.secret).status,'invalid');
 await assert.rejects(()=>roundContext(req(otherCookie),{gameId:one.gameId,day:0}),/not found in this browser/);
 await assert.rejects(()=>roundContext(req('fk_session=forged'),{gameId:one.gameId,day:0}),/not found in this browser/);
 assert.equal(passRound(gameData(),{day:1,round:0},token.token,gameSecret()).status,'invalid');
 const fresh=await createGame(other!.id,'practice',null);                     // no purchase step for anyone
 assert.equal(fresh.rounds,7);
});

test('the archive is free, keeps the published daily prompts, and rejects today and unknown dates',async()=>{
 mock.timers.enable({apis:['Date'],now:Date.now()+86400000});
 try {
  const archived=await createGame(other!.id,'archive',1);
  const context=await roundContext(req(otherCookie),{gameId:archived.gameId,day:1});
  assert.deepEqual(context.data.days[0].prompts,gameData().days[0].prompts);
  const today=gameData().days.find(d=>d.date===new Date().toISOString().slice(0,10))!;
  await assert.rejects(()=>createGame(other!.id,'archive',today.number),/not in the archive/);
  await assert.rejects(()=>createGame(other!.id,'archive',-1),/not in the archive/);
 } finally {mock.timers.reset();}
});

test('requests from other sites are refused',()=>{
 assertSameOrigin(req());
 assert.throws(()=>assertSameOrigin(new Request('http://localhost:3000',{headers:{origin:'https://attacker.example'}})),/origin/);
});

test('no payment code ships: no Stripe package, no billing, webhook or refund routes',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 assert.equal({...pkg.dependencies,...pkg.devDependencies}.stripe,undefined);
 for (const path of ['lib/billing','app/api/billing','app/api/stripe','app/billing','app/refunds',
  'components/SubscriptionPanel.tsx','components/UnlockModal.tsx','components/UnlockPitch.tsx','components/BillingReturn.tsx'])
  assert.equal(existsSync(path),false,`${path} should be gone`);
});
