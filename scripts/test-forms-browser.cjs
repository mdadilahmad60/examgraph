// Run against local Netlify dev on port 8889 with Playwright installed.
// All POSTs are intercepted; no real lead or contact records are created.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({args:['--no-sandbox']});
 const errors=[];
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await context.addInitScript(()=>{try {localStorage.setItem('eg-consent',JSON.stringify({v:1,a:false,ad:false,t:Date.now()}))} catch {}});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 let mode='success', posts=[];
 await page.route('**/*', async route=>{
   const req=route.request();
   if(req.method()==='POST') {
     posts.push(new URLSearchParams(req.postData()));
     if(mode==='network') return route.abort();
     if(mode==='timeout') { await new Promise(r=>setTimeout(r,9000)); return route.abort().catch(()=>{}); }
     return route.fulfill({status:mode==='error'?503:200,body:'test response'});
   }
   if(req.isNavigationRequest()) {
     const response=await route.fetch();
     const html=(await response.text()).replace(/ data-netlify="true"/g,'');
     return route.fulfill({response,body:html});
   }
   return route.continue();
 });
 for (const scenario of ['success','error','network','timeout']) {
   mode=scenario; posts=[];
   await page.goto('http://localhost:8889/');
   const form=page.locator('form[name="cheatsheet"]');
   assert.equal(await form.getAttribute('novalidate'),'');
   if(scenario==='success') {
     await form.locator('button[type=submit]').click();
     await page.waitForFunction(()=>document.querySelector('#su-name').getAttribute('aria-invalid')==='true');
     assert.equal(posts.length,0);
   }
   await form.locator('[name=name]').fill('Browser QA');
   await form.locator('[name=email]').fill('browser-qa@example.com');
   await form.locator('button[type=submit]').click();
   await page.waitForURL('**/thanks/',{timeout:12000});
   const payload=posts.findLast(p=>p.get('form-name')==='cheatsheet');
   assert.ok(payload, 'submission must reach fetch in '+scenario);
   assert.equal(payload.get('form-name'),'cheatsheet');
   assert.equal(payload.get('name'),'Browser QA');
   for (const ext of ['pdf','xlsx']) {
     const downloadPromise=page.waitForEvent('download');
     await page.locator(`a[download][href$=".${ext}"]`).click();
     const download=await downloadPromise;
     assert.equal(await download.failure(),null);
     assert.ok(download.suggestedFilename().endsWith('.'+ext));
   }
   console.log('PASS processed HTML: '+scenario+' → thanks → PDF + Excel downloads');
 }
 mode='error';
 await page.goto('http://localhost:8889/legal/contact.html');
 const contact=page.locator('form[name=contact]');
 await contact.locator('[name=name]').fill('Browser QA');
 await contact.locator('[name=email]').fill('browser-qa@example.com');
 await contact.locator('textarea').fill('A complete test message for the contact form.');
 const consent=contact.locator('[name=consent]'); if(await consent.count()) await consent.check();
 await contact.locator('button[type=submit]').click();
 await contact.locator('.form-status.is-error').waitFor();
 assert.ok(page.url().endsWith('/legal/contact.html'));
 console.log('PASS contact failure stays visible; no false success');
 for(const width of [390,1440]) {
   await page.setViewportSize({width,height:900});
   await page.goto('http://localhost:8889/');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`/tmp/examgrapher-${width}.png`,fullPage:true});
   console.log('PASS homepage horizontal layout at '+width+'px');
 }
 assert.deepEqual(errors,[]);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
