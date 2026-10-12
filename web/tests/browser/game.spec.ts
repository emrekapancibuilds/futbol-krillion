import { test, expect } from '@playwright/test';
const free={premium:false,canManage:false,configured:true,restoreAvailable:true,status:'free',paidThrough:null,renewsAt:null,cancelsAt:null};
const premium={...free,premium:true,canManage:true,status:'active',paidThrough:'2026-12-01T00:00:00Z',renewsAt:'2026-12-01T00:00:00Z'};

test('daily stays free; monthly pricing matches the existing pixel design on desktop and mobile',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:/Daily #/})).toBeVisible();
 await expect(page.getByText(/30 seconds each/)).toBeVisible();
 await expect(page.locator('section.panel').first()).toHaveCSS('opacity','1');
 await page.screenshot({path:'tests/browser/daily-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'tests/browser/daily-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:720});
 await page.goto('/unlimited');await expect(page.getByText('$4.99 USD / month',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'UPGRADE TO UNLIMITED'})).toBeVisible();
 await expect(page.getByText(/Renews monthly until canceled/)).toBeVisible();
 await expect(page.getByText(/No subscription|PLAY FREE/)).toHaveCount(0);
 await page.screenshot({path:'tests/browser/billing-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'tests/browser/billing-mobile.png',fullPage:true});
 expect(errors).toEqual([]);
});

test('free player passes a round and retains daily progress after reload',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'KICK OFF',exact:true}).click();
 await page.getByRole('button',{name:'PASS',exact:true}).click();
 await page.getByRole('button',{name:'YES, PASS',exact:true}).click();
 await expect(page.getByText('PASSED',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'CONTINUE · ROUND 2'})).toBeVisible();
 const saved=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fk:day:')).map(k=>JSON.parse(localStorage.getItem(k)!)));
 expect(saved[0].results).toHaveLength(1);
});

test('forged flags and credentials cannot unlock either premium API family',async({page})=>{
 await page.goto('/unlimited');await page.evaluate(()=>localStorage.setItem('isPremium','true'));
 await page.getByRole('button',{name:'PRACTICE',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Unlimited unlocks');
 await page.getByRole('button',{name:'DAILY ARCHIVE',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Upgrade to Unlimited');
 for (const [path,data] of Object.entries({
  '/api/games':{mode:'practice',premium:true}, '/api/unlimited/start':{category:'mixed',seen:[]},
  '/api/round/answer':{prompt:'p0000000000',token:'forged',input:'Messi'},
  '/api/round/pass':{prompt:'p0000000000',token:'forged'},
  '/api/round/reveal':{prompt:'p0000000000',token:'forged'}
 })) {
  const response=await page.request.post(path,{data,headers:{origin:'http://localhost:3100',cookie:'fk_session=forged'}});
  expect([402,503]).toContain(response.status());expect(await response.json()).not.toHaveProperty('token');
 }
 const csrf=await page.request.post('/api/billing/checkout',{data:{},headers:{origin:'https://attacker.example'}});expect(csrf.status()).toBe(403);
 const large=await page.request.post('/api/unlimited/start',{data:{seen:Array(2000).fill('p0123456789')},headers:{origin:'http://localhost:3100'}});
 expect([402,503]).toContain(large.status());
 await page.goto('/unlimited/play');await expect(page.getByRole('button',{name:'UPGRADE TO UNLIMITED'})).toBeVisible();
 await expect(page.getByRole('button',{name:'MIXED',exact:true})).toHaveCount(0);
});

test('checkout provider errors leave free play available',async({page})=>{
 await page.route('**/api/billing/session',r=>r.fulfill({json:free}));
 await page.route('**/api/billing/checkout',r=>r.fulfill({status:503,json:{error:'Checkout temporarily unavailable.'}}));
 await page.goto('/unlimited');await page.getByRole('button',{name:'UPGRADE TO UNLIMITED'}).click();
 await expect(page.getByRole('status')).toContainText('Checkout temporarily unavailable');
 await page.goto('/');await expect(page.getByRole('button',{name:'KICK OFF',exact:true})).toBeEnabled();
});

test('anonymous bootstrap is coalesced before checkout',async({page})=>{
 let requests=0;let release!:()=>void;
 const ready=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/billing/session',async r=>{requests++;await ready;await r.fulfill({json:free});});
 await page.goto('/unlimited');const upgrade=page.getByRole('button',{name:'UPGRADE TO UNLIMITED'});
 await expect(upgrade).toBeDisabled();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));release();
 await expect(upgrade).toBeEnabled();expect(requests).toBe(1);
});

test('restore removes token fragment and requires an explicit verification POST',async({page})=>{
 await page.route('**/api/billing/restore/verify',r=>{
  expect(r.request().method()).toBe('POST');expect(r.request().postDataJSON()).toEqual({token:'verification-fixture',accessToken:'signed.email.proof'});
  return r.fulfill({json:{...premium,message:'Purchase restored to this browser.'}});
 });
 await page.goto('/billing/restore?request=verification-fixture#access_token=signed.email.proof&refresh_token=discard-me');
 await expect(page).toHaveURL('http://localhost:3100/billing/restore');
 await expect(page.getByRole('heading',{name:'UNLIMITED ACTIVE'})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('signed.email.proof');
 expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('discard-me');
 await page.getByRole('button',{name:'RESTORE TO THIS BROWSER'}).click();
 await expect(page.getByRole('heading',{name:'UNLIMITED ACTIVE'})).toBeVisible();
 await expect(page.getByRole('link',{name:'PLAY UNLIMITED'})).toHaveAttribute('href','/unlimited/play');
});

test('success URL alone cannot activate premium; cancellation returns safely',async({page})=>{
 await page.goto('/billing/success');await expect(page.getByRole('status')).toContainText('No checkout was specified');
 await expect(page.getByRole('heading',{name:'UNLIMITED ACTIVE'})).toHaveCount(0);
 await page.route('**/api/billing/checkout/confirm',r=>r.fulfill({json:premium}));
 await page.goto('/billing/success?session_id=cs_test_fixture');
 await expect(page.getByRole('heading',{name:'UNLIMITED ACTIVE'})).toBeVisible();
 await page.goto('/billing/cancel');await expect(page.getByRole('status')).toContainText('Checkout canceled');
});

test('existing Unlimited categories, seen prompts and lifetime totals survive subscription integration',async({page})=>{
 await page.route('**/api/billing/session',r=>r.fulfill({json:premium}));
 await page.goto('/');
 await page.evaluate(()=>localStorage.setItem('fk:unlimited',JSON.stringify({results:[],category:'premier-league',total:4321,played:21,sets:3,seen:['pold']})));
 await page.route('**/api/unlimited/start',r=>{
  const body=r.request().postDataJSON();expect(body.category).toBe('premier-league');expect(body.seen).toContain('pold');
  return r.fulfill({json:{text:'Category fixture',prompt:'pnew',token:'fixture',previewMs:0,deadline:Date.now()+30000,now:Date.now()}});
 });
 await page.route('**/api/round/pass',r=>r.fulfill({json:{status:'passed',proof:'fixture-proof'}}));
 await page.goto('/unlimited/play');await expect(page.getByText('3 sets played · 4,321 points all time')).toBeVisible();
 await page.getByRole('button',{name:'PREMIER LEAGUE',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Category fixture'})).toBeVisible();
 await page.getByRole('button',{name:'EXIT',exact:true}).click();await page.getByRole('button',{name:'YES, LEAVE',exact:true}).click();
 await expect(page.getByRole('button',{name:'CONTINUE PREMIER LEAGUE · ROUND 2'})).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fk:unlimited')!));
 expect(saved).toMatchObject({category:'premier-league',total:4321,played:22,sets:3,seen:['pold','pnew']});
 await expect(page.locator('section.panel').first()).toHaveCSS('opacity','1');
 await page.screenshot({path:'tests/browser/unlimited-desktop.png',fullPage:true});
});

test('archive progress and streaks remain separate from free daily',async({page})=>{
 await page.route('**/api/billing/session',r=>r.fulfill({json:premium}));
 await page.route('**/api/archive',r=>r.fulfill({json:{days:[{number:1,date:'2026-10-11'}]}}));
 await page.route('**/api/games',r=>r.fulfill({json:{number:1,date:'2026-10-11',rounds:7,nextAt:'2026-10-13T00:00:00Z',snapshot:'2026-07-06',mode:'archive',gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}}));
 await page.route('**/api/round/start',r=>{
  expect(r.request().postDataJSON()).toMatchObject({day:1,round:0,gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'});
  return r.fulfill({json:{text:'Archive fixture',token:'fixture',previewMs:0,deadline:Date.now()+30000,now:Date.now()}});
 });
 await page.route('**/api/round/pass',r=>r.fulfill({json:{status:'passed',proof:'fixture-proof'}}));
 await page.goto('/unlimited');await page.evaluate(()=>localStorage.setItem('fk:streak',JSON.stringify({last:2,streak:2})));
 await page.getByRole('button',{name:'DAILY ARCHIVE'}).click();await page.getByRole('button',{name:'#1 · 2026-10-11'}).click();
 await expect(page.getByRole('heading',{name:'Archive #1'})).toBeVisible();
 await page.getByRole('button',{name:'KICK OFF',exact:true}).click();await page.getByRole('button',{name:'PASS',exact:true}).click();
 await page.getByRole('button',{name:'YES, PASS',exact:true}).click();await expect(page.getByText('PASSED',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'CONTINUE · ROUND 2'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fk:streak')!))).toEqual({last:2,streak:2});
 expect(await page.evaluate(()=>localStorage.getItem('fk:day:1'))).toBeNull();
});

test('subscribers see Unlimited first, a daily countdown, and yellow PRACTICE and DAILY ARCHIVE',async({page})=>{
 await page.route('**/api/billing/session',r=>r.fulfill({json:premium}));
 await page.goto('/unlimited');
 const panel=page.getByRole('region',{name:'Soccer Krillion Unlimited'});
 const daily=page.getByRole('region',{name:"Today's daily"});
 await expect(daily).toContainText(/Next daily in \d\d:\d\d:\d\d/);
 await expect(daily.getByRole('link',{name:"PLAY TODAY'S DAILY"})).toBeVisible();
 await expect(page.getByText('Out of dailies? Keep playing.')).toHaveCount(0);
 expect((await panel.boundingBox())!.y).toBeLessThan((await daily.boundingBox())!.y);
 const yellow=await daily.getByRole('link',{name:"PLAY TODAY'S DAILY"}).evaluate(e=>getComputedStyle(e).backgroundColor);
 for (const name of ['PRACTICE','DAILY ARCHIVE']) {
  const button=panel.getByRole('button',{name,exact:true});
  await expect(button).not.toHaveClass(/secondary/);
  await expect(button).toHaveCSS('background-color',yellow);
 }
 const {number}=await (await page.request.get('/api/daily')).json();
 await page.evaluate(n=>localStorage.setItem(`fk:day:${n}`,JSON.stringify({results:Array.from({length:7},()=>({status:'passed',points:0,tier:null,key:'x'}))})),number);
 await page.reload();
 await expect(daily).toContainText("You've played today's daily.");
 await expect(daily.getByRole('link',{name:"PLAY TODAY'S DAILY"})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'tests/browser/unlimited-subscriber-mobile.png',fullPage:true});
});

test('non-subscribers still see what Unlimited offers above the upgrade panel',async({page})=>{
 await page.route('**/api/billing/session',r=>r.fulfill({json:free}));
 await page.goto('/unlimited');
 const perks=page.getByText('Out of dailies? Keep playing.');
 await expect(perks).toBeVisible();
 await expect(page.getByRole('region',{name:"Today's daily"})).toHaveCount(0);
 await expect(page.getByText(/Wrexham|two-club|No ads/)).toHaveCount(0);
 expect((await perks.boundingBox())!.y).toBeLessThan((await page.getByRole('button',{name:'UPGRADE TO UNLIMITED'}).boundingBox())!.y);
 await expect(page.getByRole('button',{name:'PRACTICE',exact:true})).toHaveClass(/secondary/);
});
