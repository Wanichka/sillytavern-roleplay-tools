// Focused browser regression: real host with a scrollable docked panel fixture.
// node tests/scroll-layout.cjs (requires playwright and Chromium)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright` : 'playwright');
const root = path.resolve(__dirname, '..');
const key = 'wani_roleplay_tools_layout_v1';
(async () => {
 const browser = await chromium.launch({headless: true});
 try {
 const page = await browser.newPage({viewport: {width: 1100, height: 850}});
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.route('http://rpt.test/**', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('http://rpt.test/');
 await page.evaluate(key => localStorage.setItem(key, JSON.stringify({version:1,active:'appearance',pinContext:true,
  geometry:{width:510,height:740,x:30,y:60},pages:[{id:'appearance',name:'Appearance'},{id:'live',name:'Live'}],
  modules:{atelier:{page:'appearance',height:1600},other:{page:'live'},context:{page:'live'}}})), key);
 async function boot() {
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'style.css'),'utf8') + `
  .fixture {display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .fixture header {flex:none;height:48px;display:flex}
  .fixture-body {flex:1;min-height:0;overflow:auto;padding:12px}
  `});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'index.js'),'utf8')});
  await page.evaluate(() => {
   for (const id of ['other','context','atelier']) {
    const panel=document.createElement('section'); panel.id=id;panel.className='fixture';
    panel.innerHTML=id==='context'?'<div style="height:48px">Context</div>':'<header>'+id+'<span class="controls"></span></header><div class="fixture-body">'+Array.from({length:80},(_,i)=>'<p>Setting '+i+'</p>').join('')+'<p class="last">All changes saved</p></div>';
    document.body.append(panel);
    window.WaniRoleplayTools.register({id,element:panel,controls:panel.querySelector('.controls'),minHeight:300});
   }
  });
 }
 async function checkScroll(label) {
  const result=await page.evaluate(() => {
   const outer=document.querySelector('.rpt-page:not([hidden])');
   const inner=document.querySelector('#atelier .fixture-body');inner.scrollTop=inner.scrollHeight;
   const last=inner.querySelector('.last').getBoundingClientRect(),bounds=inner.getBoundingClientRect();
   return {outerOverflow:outer.scrollHeight-outer.clientHeight,innerOverflow:inner.scrollHeight-inner.clientHeight,lastVisible:last.bottom<=bounds.bottom+1,contained:bounds.bottom<=outer.getBoundingClientRect().bottom+1};
  });
  assert(result.outerOverflow<=1,label+': no outer overflow');
  assert(result.innerOverflow>0 && result.lastVisible && result.contained,label+': bottom reachable with one scrollbar');
 }
 await boot(); await checkScroll('saved oversized height');
 await page.locator('#atelier .controls button').first().click();
 await page.getByRole('tab',{name:'Live',exact:true}).click();
 assert(await page.locator('#other').isVisible(),'other page remains visible');
 await page.getByRole('tab',{name:'Appearance',exact:true}).click();
 assert(await page.locator('#atelier .fa-compress').count(),'expansion survives tab switch');
 await checkScroll('expanded after switching');
 await page.reload(); await boot();
 assert(await page.locator('#atelier .fa-compress').count(),'expansion survives reload and late registration');
 await page.locator('#atelier .controls button').first().click();
 await page.setViewportSize({width:390,height:600});await checkScroll('small viewport restored');
 await page.setViewportSize({width:1100,height:850});
 await page.evaluate(() => {
  const panel=document.createElement('section');panel.id='peer';panel.className='fixture';panel.innerHTML='<header>Peer<span></span></header><div class="fixture-body">Peer content</div>';document.body.append(panel);
  window.WaniRoleplayTools.register({id:'peer',element:panel,controls:panel.querySelector('span'),defaultPage:{id:'appearance',name:'Appearance'}});
 });
 assert(await page.locator('#peer').isVisible(),'multi-panel layout keeps peers');
 await page.locator('#atelier .controls button').first().click();
 assert(!(await page.locator('#peer').isVisible()),'expansion hides peer');
 await page.getByRole('tab',{name:'Live',exact:true}).click();
 await page.getByRole('tab',{name:'Appearance',exact:true}).click();
 assert(!(await page.locator('#peer').isVisible()),'multi-panel expansion remembered');
 await page.evaluate(() => window.WaniRoleplayTools.open('peer'));
 assert(await page.locator('#peer').isVisible(),'opening a hidden module reveals it');
 assert.deepEqual(errors,[]);
 console.log('PASS: single scroll, bottom reachability, resize, tab/reload expansion, multi-panel layout and API open');
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
