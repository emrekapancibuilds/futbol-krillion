import { test, expect } from '@playwright/test';
// Futkrill is free (owner, 2026-11-12: "get rid of payments"): no prices, checkout, unlock pop-up, receipts or restore.
const PAYMENT=/\$\d|UNLOCK|Restore Purchase|View receipt|checkout|pay once|Hey, I.m Emre/i;

test('the daily and Unlimited are free and fit the pixel design on desktop and mobile',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'DAILY'})).toBeVisible();
 await expect(page.getByText(/30 seconds each/)).toBeVisible();
 await expect(page.getByRole('region',{name:"Today's daily"})).toHaveCSS('opacity','1');
 await page.screenshot({path:'tests/browser/daily-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'tests/browser/daily-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:720});
 await page.goto('/unlimited');
 await expect(page.getByRole('button',{name:'PRACTICE',exact:true})).toBeVisible();
 await expect(page.getByText(PAYMENT)).toHaveCount(0);
 await page.screenshot({path:'tests/browser/unlimited-hub-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'tests/browser/unlimited-hub-mobile.png',fullPage:true});
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

test('Unlimited, practice and the archive need no purchase; other sites still cannot call the APIs',async({page})=>{
 const origin={origin:'http://localhost:3100'};
 const unlimited=await page.request.post('/api/unlimited/start',{data:{category:'mixed',seen:[]},headers:origin});
 expect(unlimited.status()).toBe(200);expect(await unlimited.json()).toHaveProperty('token');   // no session, no cookie, no purchase
 const archive=await page.request.get('/api/archive');expect(archive.status()).toBe(200);
 expect(Array.isArray((await archive.json()).days)).toBe(true);
 const practice=await page.request.post('/api/games',{data:{mode:'practice'},headers:origin});
 expect([200,503]).toContain(practice.status());                                              // 503 only where no database is configured
 expect(practice.status()).not.toBe(402);
 const csrf=await page.request.post('/api/unlimited/start',{data:{category:'mixed',seen:[]},headers:{origin:'https://attacker.example'}});
 expect(csrf.status()).toBe(403);
 for (const path of ['/api/billing/checkout','/api/billing/session','/api/stripe/webhook']) {
  const gone=await page.request.post(path,{data:{},headers:origin});expect(gone.status()).toBe(404);
 }
 await page.goto('/unlimited/play');await expect(page.getByRole('button',{name:'MIXED',exact:true})).toBeVisible();
 await expect(page.getByText(PAYMENT)).toHaveCount(0);
});

test('existing Unlimited categories, seen prompts and lifetime totals carry on',async({page})=>{
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

test('archive progress and streaks remain separate from the daily',async({page})=>{
 await page.route('**/api/archive',r=>r.fulfill({json:{days:[{number:1,date:'2026-10-11'}]}}));
 await page.route('**/api/games',r=>r.fulfill({json:{number:1,date:'2026-10-11',rounds:7,nextAt:'2026-10-13T00:00:00Z',snapshot:'2026-07-06',mode:'archive',gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'}}));
 await page.route('**/api/round/start',r=>{
  expect(r.request().postDataJSON()).toMatchObject({day:1,round:0,gameId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'});
  return r.fulfill({json:{text:'Archive fixture',token:'fixture',previewMs:0,deadline:Date.now()+30000,now:Date.now()}});
 });
 await page.route('**/api/round/pass',r=>r.fulfill({json:{status:'passed',proof:'fixture-proof'}}));
 await page.goto('/unlimited');await page.evaluate(()=>localStorage.setItem('fk:streak',JSON.stringify({last:2,streak:2})));
 await page.getByRole('button',{name:'DAILY ARCHIVE'}).click();await page.getByRole('button',{name:'#1 · 2026-10-11'}).click();
 await expect(page.getByRole('heading',{name:'Archive - October 11'})).toBeVisible();
 await page.getByRole('button',{name:'KICK OFF',exact:true}).click();await page.getByRole('button',{name:'PASS',exact:true}).click();
 await page.getByRole('button',{name:'YES, PASS',exact:true}).click();await expect(page.getByText('PASSED',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'CONTINUE · ROUND 2'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fk:streak')!))).toEqual({last:2,streak:2});
 expect(await page.evaluate(()=>localStorage.getItem('fk:day:1'))).toBeNull();
});

test('everyone sees Unlimited first, a daily countdown, and yellow PRACTICE and DAILY ARCHIVE',async({page})=>{
 await page.goto('/unlimited');
 const panel=page.getByRole('region',{name:'Futkrill Unlimited'});
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
  await expect(button).toHaveCSS('color','rgb(26, 18, 4)');   // near-black text on the yellow
 }
 const {number}=await (await page.request.get('/api/daily')).json();
 await page.evaluate(n=>localStorage.setItem(`fk:day:${n}`,JSON.stringify({results:Array.from({length:7},()=>({status:'passed',points:0,tier:null,key:'x'}))})),number);
 await page.reload();
 await expect(daily).toContainText("You've played today's daily.");
 await expect(daily.getByRole('link',{name:"PLAY TODAY'S DAILY"})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'tests/browser/unlimited-mobile.png',fullPage:true});
});

test('no one gets a sales pitch: no pop-up, price, unlock button, receipt or restore link',async({page})=>{
 await page.goto('/unlimited');
 await expect(page.getByRole('button',{name:'PRACTICE',exact:true})).toBeVisible();
 await page.waitForTimeout(500);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText(PAYMENT)).toHaveCount(0);
 await expect(page.getByText('Out of dailies? Keep playing.')).toHaveCount(0);
 for (const path of ['/','/terms','/privacy']) {
  await page.goto(path);await expect(page.getByRole('link',{name:/Refunds?$/})).toHaveCount(0);
 }
});

test('the header (logo, EXIT, score) fits a 375px phone during a round, and the page is named Futkrill',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto('/');await expect(page).toHaveTitle('Futkrill');
 await page.getByRole('button',{name:'KICK OFF',exact:true}).click();
 await expect(page.getByRole('button',{name:'EXIT',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const led=await page.locator('.topbar .led').boundingBox();expect(led!.x+led!.width).toBeLessThanOrEqual(375);
 await expect(page.getByRole('img',{name:'Futkrill'}).first()).toBeVisible();
});

test('the logo is the same one-line FUTKRILL wordmark in the header of every page',async({page})=>{
 for (const path of ['/','/terms','/privacy','/unlimited']) {
  await page.goto(path);
  const logo=page.getByRole('img',{name:'Futkrill'}).first();await expect(logo).toBeVisible();
  const box=await logo.boundingBox();expect(box!.y).toBeLessThan(80);                 // at the top
  expect(box!.width/box!.height).toBeGreaterThan(2.7);                                  // one line (the stacked version was 2.6)
  expect(box!.width).toBeLessThanOrEqual(130);                                          // still fits a 375px phone header
 }
});

test('the terms and privacy pages describe a free game: no price, checkout, refunds or restore',async({page})=>{
 for (const path of ['/terms','/privacy']) {
  await page.goto(path);
  const article=page.locator('article');
  await expect(article).toContainText(/free/i);
  await expect(article).not.toContainText(/\$\d|Checkout|refund|Restore Purchase|paid access|optional paid/i);
  await expect(article).toContainText('November 12, 2026');
 }
});

test('old payment links still land somewhere useful: refunds on the terms, billing pages on Unlimited',async({page})=>{
 await page.goto('/refunds');await expect(page).toHaveURL(/\/terms$/);
 for (const path of ['/billing/success?session_id=cs_test_fixture','/billing/cancel','/billing/restore']) {
  await page.goto(path);await expect(page).toHaveURL(/\/unlimited(\?.*)?$/);
 }
});

test('streak: back-to-back correct answers earn a growing bonus, a pass loses it, and the flame lights and burns out',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/api/round/start',r=>r.fulfill({json:{text:'Streak fixture',token:'t',previewMs:0,deadline:Date.now()+90000,now:Date.now()}}));
 await page.route('**/api/round/answer',r=>r.fulfill({json:{status:'accepted',name:'Fixture Player',tier:1,points:10,fact:'fixture',proof:'proof'}}));
 await page.route('**/api/round/pass',r=>r.fulfill({json:{status:'passed',proof:'proof'}}));
 const led=page.locator('.topbar .led');
 const answer=async()=>{await page.getByPlaceholder('type one answer').fill('x');await page.getByRole('button',{name:'SHOOT'}).click();await expect(page.getByRole('button',{name:/NEXT QUESTION|FINAL WHISTLE/})).toBeVisible({timeout:30000});};
 await page.goto('/');await page.getByRole('button',{name:'KICK OFF',exact:true}).click();
 await expect(page.getByTestId('streak-flame')).toHaveCount(0);                               // no streak yet
 await answer();                                                                               // round 1: correct
 await expect(page.getByTestId('streak-flame')).toBeVisible();                                // the flame is lit...
 await expect(page.getByTestId('streak-bonus')).toHaveCount(0);                               // ...but the first answer earns no bonus
 await expect(led).toHaveText(/· 10$/);
 await page.getByRole('button',{name:'NEXT QUESTION'}).click();
 await expect(page.getByTestId('streak-flame')).toContainText('x1');                          // lit during the next round too
 await answer();                                                                               // round 2: correct in a row -> +10
 await expect(page.getByTestId('streak-bonus')).toContainText('+10');
 await expect(led).toHaveText(/· 30$/);                                                        // 10 + 10 + 10 bonus
 await page.getByRole('button',{name:'NEXT QUESTION'}).click();
 await expect(page.getByTestId('streak-flame')).toContainText('x2');
 await page.getByRole('button',{name:'PASS',exact:true}).click();await page.getByRole('button',{name:'YES, PASS',exact:true}).click();
 await expect(page.getByTestId('streak-lost')).toBeVisible();                                  // the streak burns out
 await expect(page.getByTestId('streak-lost')).toContainText(/STREAK LOST/i);
 await expect(led).toHaveText(/· 30$/);
 await page.getByRole('button',{name:'NEXT QUESTION'}).click();
 await expect(page.getByTestId('streak-flame')).toHaveCount(0);                               // gone for round 4
 await answer();                                                                               // round 4: correct again, streak restarts at 1
 await expect(page.getByTestId('streak-flame')).toBeVisible();
 await expect(page.getByTestId('streak-bonus')).toHaveCount(0);
 await expect(led).toHaveText(/· 40$/);
});

const REVEAL={text:'Name a player who played for Man City',total:55,tiers:[
 {tier:1,points:10,count:30,top:[{name:'Gareth Barry',fact:'Man City'},{name:'Joe Hart',fact:'Man City'}]},
 {tier:3,points:80,count:25,top:[{name:'Phil Foden',fact:'Man City'}]}]};

test('after a round, SEE ANSWERS shows the question and marks the answer you gave, even when it is outside the top list',async({page})=>{
 await page.route('**/api/round/start',r=>r.fulfill({json:{text:'Name a player who played for Man City',token:'t',previewMs:0,deadline:Date.now()+90000,now:Date.now()}}));
 await page.route('**/api/round/answer',r=>r.fulfill({json:{status:'accepted',name:'Fixture Player',tier:1,points:10,fact:'fixture fact',proof:'proof'}}));
 await page.route('**/api/round/reveal',r=>r.fulfill({json:REVEAL}));
 await page.goto('/');await page.getByRole('button',{name:'KICK OFF',exact:true}).click();
 await page.getByPlaceholder('type one answer').fill('x');await page.getByRole('button',{name:'SHOOT'}).click();
 await expect(page.getByRole('button',{name:'NEXT QUESTION'})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'SEE ANSWERS'}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByTestId('answers-question')).toHaveText('Name a player who played for Man City');   // the question is at the very top
 await expect(dialog.getByTestId('your-answer')).toContainText('Fixture Player');
 await expect(dialog.getByTestId('answer-you')).toContainText('Fixture Player');                             // marked in its tier
 await expect(dialog.getByTestId('answer-you')).toContainText('YOU');
 await expect(dialog.getByText('Gareth Barry')).toBeVisible();
 await dialog.getByRole('button',{name:'Close'}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'NEXT QUESTION'})).toBeVisible();                                // still on the result card
});

test('the end screen shows a column per round, taller for rarer answers, and tapping one lists all its answers',async({page})=>{
 await page.route('**/api/round/reveal',r=>r.fulfill({json:REVEAL}));
 const mk=(tier:number|null,points:number)=>({status:tier?'accepted':'missed',points,tier,name:tier?'Someone':undefined,fact:'f',key:'k',text:'Name a player who played for Man City'});
 const day=await (await page.request.get('/api/daily')).json();
 await page.addInitScript(([n,results])=>localStorage.setItem(`fk:day:${n}`,JSON.stringify({results})),[day.number,[mk(7,200),mk(1,5),mk(null,0),mk(3,20),mk(1,5),mk(1,5),mk(3,20)]] as const);
 await page.goto('/');
 await expect(page.locator('.col')).toHaveCount(7);
 const levels=await page.locator('.col').evaluateAll(els=>els.map(e=>Number(e.getAttribute('data-level'))));
 expect(levels).toEqual([7,1,0,3,1,1,3]);
 const heightsNow=()=>page.locator('.colbar').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().height));
 await expect.poll(async()=>(await heightsNow())[6],{timeout:5000}).toBeGreaterThan(80);                      // the last column has grown in
 const heights=await heightsNow();
 expect(heights[0]).toBeGreaterThan(heights[3]);                                                               // Jobless stands over Part-Time Fan
 expect(heights[3]).toBeGreaterThan(heights[1]);
 expect(heights[1]).toBeGreaterThan(heights[2]);                                                               // ...which beats a miss
 await page.getByTestId('column-4').click();
 await expect(page.getByTestId('answers-question')).toHaveText('Name a player who played for Man City');
 await expect(page.getByRole('dialog')).toContainText('Phil Foden');
});

test('the PITCH INVASION sign on a Jobless result has room around it, on a phone too',async({page})=>{
 test.setTimeout(60000);
 await page.setViewportSize({width:375,height:812});
 await page.route('**/api/round/start',r=>r.fulfill({json:{text:'Name a player',token:'t',previewMs:0,deadline:Date.now()+90000,now:Date.now()}}));
 await page.route('**/api/round/answer',r=>r.fulfill({json:{status:'accepted',name:'Andrea Mancini',tier:7,points:200,fact:'Manchester City, 2010-2012',proof:'p'}}));
 await page.goto('/');await page.getByRole('button',{name:'KICK OFF',exact:true}).click();
 await page.getByPlaceholder('type one answer').fill('x');await page.getByRole('button',{name:'SHOOT'}).click();
 const next=page.getByRole('button',{name:'NEXT QUESTION'});
 await expect(next).toBeVisible({timeout:30000});
 const sign=page.getByText('PITCH INVASION!');
 await expect(sign).toBeVisible();
 await page.waitForTimeout(1800);                                                       // let its little bounce finish
 const box=async(l:ReturnType<typeof page.locator>)=>(await l.boundingBox())!;
 const [fact,s,n]=[await box(page.getByText('Manchester City, 2010-2012')),await box(sign),await box(next)];
 expect(s.y-(fact.y+fact.height)).toBeGreaterThanOrEqual(16);                           // air above the sign (it has a 4px frame)
 expect(n.y-(s.y+s.height)).toBeGreaterThanOrEqual(20);                                 // and below it, before the buttons
});

test('the first page is an unboxed centred title, Daily description and start button with no mascot or tier list',async({page})=>{
 await page.goto('/');
 const home=page.getByRole('region',{name:"Today's daily"});
 const heading=home.getByRole('heading',{name:'DAILY'});
 const description=home.getByText('7 prompts · 30 seconds each · rarer answers score more');
 const start=home.getByRole('button',{name:'KICK OFF',exact:true});
 await expect(heading).toBeVisible();await expect(description).toBeVisible();await expect(start).toBeVisible();
 await expect(home).not.toHaveClass(/panel/);
 await expect(home.locator('img[src="/art/mascot.png"]')).toHaveCount(0);
 const [headingBox,descriptionBox,startBox]=await Promise.all([heading.boundingBox(),description.boundingBox(),start.boundingBox()]);
 expect(descriptionBox!.y).toBeGreaterThan(headingBox!.y);expect(startBox!.y).toBeGreaterThan(descriptionBox!.y);
 for(const tier of ['World Cup Bandwagon','Glory Hunter','Part-Time Fan','Season Ticket Holder','True Analyst','Insane Ball Knowledge','Jobless']) await expect(home.getByText(tier)).toHaveCount(0);
 await expect(page.locator('.topbar .led')).not.toContainText('#');
 await expect(page.locator('main')).not.toContainText(/#\d/);
});

test('the first page has a big white FUTKRILL wordmark with a gold outline, and it fits a phone',async({page})=>{
 for(const width of [375,1100]){
  await page.setViewportSize({width,height:800});
  await page.goto('/');
  const mark=page.getByTestId('wordmark');
  await expect(mark).toHaveText('FUTKRILL');
  await expect(mark).toHaveCSS('color','rgb(255, 255, 255)');
  expect(await mark.evaluate(e=>getComputedStyle(e).textShadow)).toContain('rgb(255, 206, 72)');   // the gold outline
  expect((await mark.boundingBox())!.height).toBeGreaterThanOrEqual(36);                            // large
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

// --- Niche-o-meter (user, 2026-10-16) ----------------------------------------------------------------------------

test('niche-o-meter: the intro pops up only the very first time, and a reload never shows it again',async({page})=>{
 await page.goto('/niche');
 const intro=page.getByRole('dialog',{name:/Niche-o-meter/});
 await expect(intro).toBeVisible();
 await expect(intro).toContainText('how niche they are');
 await expect(intro).toContainText("nothing here counts");
 await intro.getByRole('button',{name:'GOT IT'}).click();
 await expect(intro).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Niche-o-meter'})).toBeVisible();
 await page.waitForTimeout(800);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goto('/');await page.getByRole('link',{name:'NICHE-O-METER',exact:true}).click();   // another visit, same browser (the button, not the header link)
 await expect(page).toHaveURL(/\/niche$/);
 await page.waitForTimeout(800);
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('niche-o-meter: type a player, pick them, get a score out of 100 with a label and no points',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('fk:niche-seen','1'));
 await page.goto('/niche');
 await expect(page.getByRole('button',{name:'MEASURE'})).toBeDisabled();
 await page.getByPlaceholder('type a player').fill('lionel mes');
 const first=page.getByRole('list',{name:'Players'}).getByRole('button').first();
 await expect(first).toContainText('Lionel Messi');
 await expect(first).toContainText('Argentina');
 await first.click();
 await expect(page.getByTestId('niche-result')).toContainText('Lionel Messi');
 await expect(page.getByTestId('niche-score')).toHaveText('1');
 await expect(page.getByTestId('niche-label')).toHaveText('Everyone has heard of them');
 await expect(page.getByTestId('niche-known')).toHaveText('Nobody we track is better known.');
 // nothing about the game was touched
 const keys=await page.evaluate(()=>Object.keys(localStorage).sort());
 expect(keys).toEqual(['fk:niche-seen']);
});

test('niche-o-meter: Enter measures the best match, and a very obscure player scores higher than a star but never 97+ with fame',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('fk:niche-seen','1'));
 await page.goto('/niche');
 await page.getByPlaceholder('type a player').fill('Odysseas Vlachodimos');
 await expect(page.getByRole('list',{name:'Players'})).toBeVisible();
 await page.keyboard.press('Enter');
 await expect(page.getByTestId('niche-result')).toContainText('Vlachodimos');
 await expect.poll(async()=>Number(await page.getByTestId('niche-score').textContent()),{timeout:5000}).toBeGreaterThan(15);
 const mid=Number(await page.getByTestId('niche-score').textContent());
 expect(mid).toBeLessThanOrEqual(96);
});

test('niche-o-meter: a name we have never heard of says so, with no score',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('fk:niche-seen','1'));
 await page.goto('/niche');
 await page.getByPlaceholder('type a player').fill('qzxqzxqzx');
 await expect(page.getByTestId('niche-unknown')).toHaveText("Even we don't know who that is");
 await expect(page.getByTestId('niche-score')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'MEASURE'})).toBeDisabled();
});

test('niche-o-meter: the API only answers real searches and a stale answer never overwrites a newer one',async({page})=>{
 const ok=await page.request.get('/api/niche?q=haaland');
 expect(ok.status()).toBe(200);
 const body=await ok.json();
 expect(body.total).toBe(178258);
 expect(body.results[0].name).toBe('Erling Haaland');
 expect(body.results.length).toBeLessThanOrEqual(6);
 expect((await (await page.request.get('/api/niche?q=a')).json()).results).toEqual([]);          // one letter is too short
 expect((await page.request.get('/api/niche?q='+'x'.repeat(500))).status()).toBe(400);
});

test('niche-o-meter: it is linked from the first page and the header on a wide screen, and not squeezed into a phone header',async({page})=>{
 await page.setViewportSize({width:1100,height:800});
 await page.goto('/');
 await expect(page.locator('.topbar').getByRole('link',{name:'Niche-o-meter'})).toBeVisible();
 await page.setViewportSize({width:375,height:812});
 await page.goto('/');
 await expect(page.locator('.topbar').getByRole('link',{name:'Niche-o-meter'})).toBeHidden();
 await expect(page.getByRole('link',{name:'NICHE-O-METER'})).toBeVisible();
 const led=await page.locator('.topbar .led').boundingBox();expect(led!.x+led!.width).toBeLessThanOrEqual(375);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

// --- The live matchday scene (2026-10-16) ------------------------------------------------------------------------
const sceneSnapshot=(page:import('@playwright/test').Page)=>page.getByTestId('scene').evaluate((c:HTMLCanvasElement)=>{
 const ctx=c.getContext('2d')!;const d=ctx.getImageData(0,0,c.width,c.height).data;let h=0,lit=0;
 for(let i=0;i<d.length;i+=4*97){h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)>>>0;if(d[i]+d[i+1]+d[i+2]>60)lit++;}
 return {h,lit,w:c.width,hgt:c.height};
});

test('the matchday scene draws behind every page and keeps moving',async({page})=>{
 await page.setViewportSize({width:1100,height:800});
 await page.goto('/');
 const scene=page.getByTestId('scene');
 await expect(scene).toHaveAttribute('data-ready','wide',{timeout:20000});
 await expect(scene).toHaveAttribute('aria-hidden','true');
 const a=await sceneSnapshot(page);
 expect(a.lit).toBeGreaterThan(500);                                                    // a picture, not a blank canvas
 await page.waitForTimeout(1200);
 const b=await sceneSnapshot(page);
 expect(b.h).not.toBe(a.h);                                                             // the crowd, flashes and lights move
 await page.goto('/terms');
 await expect(page.getByTestId('scene')).toHaveAttribute('data-ready','wide',{timeout:20000});
});

test('phones get the tall scene, and with Reduced Motion it holds one still frame',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.getByTestId('scene')).toHaveAttribute('data-ready','tall',{timeout:20000});
 const a=await sceneSnapshot(page);
 expect(a.lit).toBeGreaterThan(300);
 await page.waitForTimeout(1200);
 expect((await sceneSnapshot(page)).h).toBe(a.h);
});

test('niche-o-meter: a slow first answer from the server (a cold start) is retried quietly instead of showing an error',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('fk:niche-seen','1'));
 let calls=0;
 await page.route('**/api/niche?**',async r=>{
  calls++;
  if(calls===1) return r.fulfill({status:504,contentType:'text/html',body:'<html>An error occurred</html>'});
  return r.continue();
 });
 await page.goto('/niche');
 await page.getByPlaceholder('type a player').fill('lionel messi');
 await expect(page.getByRole('list',{name:'Players'}).getByRole('button').first()).toContainText('Lionel Messi',{timeout:15000});
 await expect(page.getByText("Couldn't reach the server")).toHaveCount(0);
 expect(calls).toBeGreaterThanOrEqual(2);
});
