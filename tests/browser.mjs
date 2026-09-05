// Browser integration test: loads the actual six extensions, with only ST's
// backend/context replaced. Run instructions and limits are in README.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`) : require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siblings = process.env.RPT_EXTENSIONS_DIR || path.dirname(root);
const source = {
    host: root,
    thoughts: path.join(siblings, 'character-thoughts'),
    relations: path.join(siblings, 'relationship-memory-tracker'),
    context: path.join(siblings, 'context-tracker'),
    visual: path.join(siblings, 'character-visual'),
    notes: path.join(siblings, 'story-notes'),
    goals: path.join(siblings, 'story-goals'),
};
const base = '/scripts/extensions/third-party/';
const stub = `
export const event_types = Object.fromEntries([
 'MESSAGE_RECEIVED','MESSAGE_SENT','CHAT_CHANGED','MESSAGE_DELETED','MESSAGE_EDITED',
 'MESSAGE_SWIPED','MESSAGE_UPDATED','GENERATION_ENDED','GENERATION_STARTED',
 'GENERATE_BEFORE_COMBINE_PROMPTS','CHAT_COMPLETION_PROMPT_READY','GENERATE_AFTER_COMBINE_PROMPTS'
].map(x=>[x,x]));
const listeners = new Map();
export const eventSource = {
 on(name,fn){if(!name)throw Error('Missing event'); const list=listeners.get(name)||[]; list.push(fn);listeners.set(name,list)},
 async emit(name,data){for(const fn of listeners.get(name)||[])await fn(data)},
 counts(){return Object.fromEntries([...listeners].map(([key,list])=>[key,list.length]))}
};
window.events = eventSource;
window.promptCalls = [];
export function setExtensionPrompt(...args){window.promptCalls.push(args)}
export const extension_prompt_types = {IN_CHAT:1};
export const extension_prompt_roles = {SYSTEM:0};
window.context = {
 chatId:'test-chat',getCurrentChatId(){return this.chatId},chatMetadata:{},
 extensionSettings:JSON.parse(sessionStorage.getItem('qa-settings')||'{}'),chat:[],name2:'Test card',characters:[],maxContext:32000,
 saveMetadata(){},saveMetadataDebounced(){},saveSettingsDebounced(){sessionStorage.setItem('qa-settings',JSON.stringify(this.extensionSettings))},
 getTokenCountAsync:async text=>Math.ceil(text.length/4),eventTypes:event_types,event_types,eventSource,
 registerMacro(name,fn){window.macros[name]=fn},unregisterMacro(name){delete window.macros[name]},
 libs:{localforage:window.localforage}
};
window.macros={};
// Their original default launchers share a position. Seed distinct saved user
// positions, as in an existing Tavern setup, so fallback is pointer-testable.
if(!localStorage.getItem('story_notes_button_pos'))localStorage.setItem('story_notes_button_pos',JSON.stringify({left:20,top:100}));
if(!localStorage.getItem('story_goals_button_pos'))localStorage.setItem('story_goals_button_pos',JSON.stringify({left:20,top:170}));
window.SillyTavern = {getContext:()=>window.context};
window.jQuery = fn=>Promise.resolve().then(fn);
window.toastr = {warning:console.warn,success(){},error:console.error,info(){}};
`;
const html = order => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root {--SmartThemeBlurTintColor:#0b1720;--SmartThemeBodyColor:#d2d7dc;--SmartThemeQuoteColor:#b7997c;--SmartThemeBlurStrength:10;--mainFontFamily:Arial}
body{margin:0;background:#202d38;color:var(--SmartThemeBodyColor);font-family:Arial}*{box-sizing:border-box}
#extensions_settings,#extensions_settings2,#extensionsMenu{display:none}button,input,select{font:inherit}button{cursor:pointer}
.qa-chat{margin:60px auto;padding:28px;width:45%;background:#0b1720;border-radius:12px;line-height:1.7}
</style>
${Object.keys(source).map(id=>`<link rel="stylesheet" href="${base}${id}/style.css">`).join('')}
</head><body><div class="qa-chat"><h2>Тестовый разговор</h2><p>Панели используют настоящие стили расширений. Данные и события Tavern заменены тестовым контекстом.</p></div>
<div id="extensions_settings"></div><div id="extensions_settings2"></div><div id="extensionsMenu"></div><div id="chat"></div>
${order.startsWith('six') ? '<script src="/localforage.js"></script>' : ''}
<script type="module">
await import('/script.js');
${['first','six'].includes(order) ? `await import('${base}host/index.js');` : ''}
await Promise.all(${JSON.stringify(order.startsWith('six')?['thoughts','relations','context','visual','notes','goals']:['thoughts','relations','context'])}.map(id=>import('${base}'+id+'/index.js')));
${['last','six-last'].includes(order) ? `setTimeout(()=>import('${base}host/index.js'),1600);` : ''}
</script></body></html>`;
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        let content, type;
        if (url.pathname === '/') { content = html(url.searchParams.get('order') || 'first'); type = 'text/html'; }
        else if (url.pathname === '/script.js') { content = stub; type = 'text/javascript'; }
        else if (url.pathname === '/localforage.js') {
            content=await readFile(process.env.RPT_LOCALFORAGE_PATH || require.resolve('localforage/dist/localforage.js'));
            type='text/javascript';
        }
        else {
            const match = url.pathname.match(/^\/scripts\/extensions\/third-party\/(host|thoughts|relations|context|visual|notes|goals)\/(index\.js|style\.css|roleplay-tools-adapter\.js|constants\.js|storage\.js)$/);
            if (!match) { res.writeHead(404); res.end(); return; }
            content = await readFile(path.join(source[match[1]], match[2]));
            type = match[2].endsWith('.css') ? 'text/css' : 'text/javascript';
        }
        res.writeHead(200, {'Content-Type':type}); res.end(content);
    } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,
    ...(process.env.RPT_CHROMIUM_PATH ? {executablePath:process.env.RPT_CHROMIUM_PATH} : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage',
        ...(process.env.RPT_CHROMIUM_PATH ? ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] : [])]});
let checks = 0;
const check = (condition, label) => { assert.ok(condition,label); checks++; console.log('PASS',label); };
const wait = page=>page.waitForFunction(()=>document.querySelectorAll('[data-rpt-docked]').length===3);
const data = page=>page.evaluate(()=>({
    storage:Object.fromEntries(Object.entries(localStorage).filter(([key])=>!key.startsWith('wani_roleplay'))),
    metadata:JSON.stringify(context.chatMetadata),settings:JSON.stringify(context.extensionSettings),
    events:events.counts(),prompts:promptCalls.length,
}));
const rect = (page,selector)=>page.locator(selector).boundingBox();
const settings = page=>page.getByRole('button',{name:'Страницы и размещение',exact:true}).click();
async function drag(page,selector,dx,dy) {
    const box = await rect(page,selector); assert.ok(box,selector);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:10});await page.mouse.up();
}
async function send(page,thought='Нужно обсудить план.',trust=64) {
    await page.evaluate(async ({thought,trust})=>{
        const mes='<char_thoughts>Алекс: '+thought+'</char_thoughts><char_mood>Алекс: Спокоен</char_mood>\n<relationship>Relationship with User = Алекс:\nTrust/Friendship: '+trust+'% - Доверие\nLove/Affection: 20% - Симпатия\nDesire/Attraction: 10% - Интерес\nHostility/Conflict: 0% - Нет\nJealousy: 0% - Нет\nCurrent Dynamic: Обсуждают маршрут.\n</relationship>';
        context.chat.push({mes,is_user:false,name:'Алекс'});
        await events.emit('MESSAGE_RECEIVED',context.chat.length-1);
    },{thought,trust});
    await page.waitForFunction(()=>document.querySelector('#ct-body')?.textContent.includes('Алекс'));
    await page.waitForFunction(()=>document.querySelector('[data-ctt="visible"]')?.textContent===String(context.chat.length));
}
async function bottomResize(page,label) {
    const tiles=page.locator('.rpt-page:not([hidden]) .rpt-tile:not([hidden])');
    const first=await tiles.first().boundingBox(),last=await tiles.last().boundingBox();
    const id=await tiles.last().getAttribute('data-module');
    const shell=await rect(page,'#rpt-shell');
    await drag(page,'.rpt-page:not([hidden]) .rpt-bottom-grip',0,-20);
    check((await tiles.last().boundingBox()).height<last.height-10,`${label}: bottom grip shrinks last block`);
    check(Math.abs((await tiles.first().boundingBox()).height-first.height)<2,`${label}: upper block keeps its height`);
    assert.deepEqual(await rect(page,'#rpt-shell'),shell);
    await page.locator('.rpt-page:not([hidden]) .rpt-bottom-grip').press('ArrowDown');
    check(Math.abs((await tiles.last().boundingBox()).height-last.height)<2,`${label}: keyboard grows last block`);
    await page.getByRole('tab').first().click();
    await page.evaluate(id=>WaniRoleplayTools.open(id),id);
    check(Math.abs((await tiles.last().boundingBox()).height-last.height)<2,`${label}: custom height survives page activation`);
    await page.locator('.rpt-page:not([hidden]) .rpt-divider-grip').press('ArrowDown');
    const a=await tiles.first().boundingBox(),b=await tiles.last().boundingBox();
    check(a.height>first.height && Math.abs(a.height+b.height-first.height-last.height)<2,`${label}: middle grip works with manual heights`);
    const contextTop=await rect(page,'.rpt-footer');
    for(let i=0;i<12;i++)await page.locator('.rpt-page:not([hidden]) .rpt-bottom-grip').press('ArrowDown');
    check(await page.locator('.rpt-page:not([hidden])').evaluate(el=>el.scrollHeight>el.clientHeight),`${label}: tall last block remains scrollable`);
    assert.deepEqual(await rect(page,'.rpt-footer'),contextTop);
    await page.locator('.rpt-page:not([hidden]) .rpt-bottom-grip').dblclick();
    check(await page.evaluate(id=>!Number.isFinite(JSON.parse(localStorage.getItem('wani_roleplay_tools_layout_v1')).modules[id].height),id),`${label}: double click restores automatic heights`);
}
try {
    const errors = [];
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);await wait(page);await send(page);
    check(await page.locator('#rm-tracker-body').textContent().then(x=>x.includes('64%')), 'real parsers populate hosted panels');
    check(await page.locator('.rpt-footer [data-ctt="visible"]').textContent().then(x=>x==='1'), 'context uses chat events');
    check(await page.locator('.rpt-footer').evaluate(el=>el.previousElementSibling.classList.contains('rpt-tabs') && el.nextElementSibling.classList.contains('rpt-workspace')),'pinned context sits between tabs and panels');
    const original = await data(page);
    const before=await rect(page,'#rpt-shell');
    await drag(page,'.rpt-resize-left',-130,130);
    const after=await rect(page,'#rpt-shell');
    check(after.width>before.width+100 && after.height>before.height+100, 'window width and height resize');
    const upper=await rect(page,'[data-module="thoughts"]');
    await drag(page,'.rpt-divider-grip',0,50);
    check((await rect(page,'[data-module="thoughts"]')).height>upper.height+35,'splitter changes panel proportions');
    await page.locator('[data-module="thoughts"]').getByRole('button',{name:'Свернуть блок',exact:true}).click();
    check((await rect(page,'[data-module="thoughts"]')).height<100,'collapse leaves only panel header');
    await page.locator('[data-module="thoughts"]').getByRole('button',{name:'Раскрыть блок'}).click();
    await page.locator('[data-module="thoughts"]').getByRole('button',{name:'Развернуть блок'}).click();
    check(!await page.locator('[data-module="relations"]').isVisible() && await page.locator('.rpt-footer').isVisible(),'maximize preserves pinned context');
    await page.getByRole('button',{name:'Вернуть все блоки'}).click();
    await settings(page);await page.getByRole('button',{name:'Добавить страницу'}).click();
    await page.getByRole('textbox',{name:'Название страницы'}).nth(1).fill('Персонажи');
    await page.getByRole('textbox',{name:'Название страницы'}).nth(1).press('Enter');
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    await settings(page);
    const pageId=await page.getByRole('textbox',{name:'Название страницы'}).nth(1).getAttribute('data-page-name');
    await page.getByLabel('Страница: Relationship Memory',{exact:true}).selectOption(pageId);
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    check(await page.locator('#ct-panel').isVisible() && !await page.locator('#rm-tracker-panel').isVisible(),'module moved to another page');
    await page.getByRole('tab',{name:'Персонажи',exact:true}).click();
    check(await page.locator('#rm-tracker-panel').isVisible() && await page.locator('.rpt-footer').isVisible(),'page switch and pinned footer');
    assert.deepEqual(await data(page),original);checks++;console.log('PASS layout operations preserve RP data, settings, event subscriptions and prompt calls');
    await send(page,'Обновилось на скрытой странице.',71);
    await page.getByRole('tab',{name:'Live',exact:true}).click();
    check((await page.locator('#ct-body').textContent()).includes('Обновилось на скрытой странице.'),'hidden page keeps receiving new messages');
    await page.reload();await wait(page);
    check(await page.getByRole('tab',{name:'Персонажи',exact:true}).count()===1 && (await rect(page,'#rpt-shell')).width===after.width,'layout survives reload');
    const beforeDisable=await data(page);
    await settings(page);await page.getByLabel('Собирать расширения в общую панель',{exact:true}).uncheck();
    check(await page.locator('[data-rpt-docked]').count()===0,'disable restores all original panels');
    await page.getByRole('button',{name:'Свернуть панель',exact:true}).click();
    await page.locator('#ct-button').click();
    check(await page.locator('#ct-panel').isVisible(),'original launcher and window work after release');
    await page.locator('#rpt-launcher').click();
    await page.getByLabel('Собирать расширения в общую панель',{exact:true}).check();
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    assert.deepEqual(await data(page),beforeDisable);checks++;console.log('PASS release/remount preserve RP state and do not double-subscribe');
    await settings(page);await page.getByRole('button',{name:'Удалить страницу, перенести блоки на соседнюю'}).nth(1).click();
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    check(await page.locator('#ct-panel').isVisible() && await page.locator('#rm-tracker-panel').isVisible(),'delete page transfers panels safely');
    await drag(page,'.rpt-header .rpt-brand',-200,-15);
    check(await page.locator('#rpt-shell').getAttribute('data-side')==='free','header moves window freely');
    for(const width of [1920,800,600,360]) {
        await page.setViewportSize({width,height:900});
        await page.waitForFunction(()=>{
            const r=document.getElementById('rpt-shell').getBoundingClientRect();
            return r.right<=innerWidth && r.bottom<=innerHeight;
        });
        const shell=await rect(page,'#rpt-shell');
        check(shell.x>=0 && shell.y>=0 && shell.x+shell.width<=width && shell.y+shell.height<=900,`window stays in ${width}px viewport`);
        const overflow=await page.evaluate(()=>[...document.querySelectorAll('#rpt-shell .rpt-page:not([hidden]),#ct-header,#rm-tracker-header')].some(el=>el.scrollWidth>el.clientWidth+2));
        check(!overflow,`no horizontal panel overflow at ${width}px`);
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:process.env.RPT_SCREENSHOT || '/tmp/roleplay-tools-qa.png'});
    check(errors.length===0,`no browser exceptions: ${errors.join('; ')}`);
    await page.close();
    const touch=await browser.newPage({viewport:{width:360,height:800},hasTouch:true});
    touch.on('pageerror',error=>errors.push(error.message));
    await touch.goto(url);await wait(touch);await send(touch);
    check(await touch.locator('#rpt-shell').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'touch layout fits narrow phone');
    await settings(touch);await touch.getByLabel('Context закреплён под вкладками',{exact:true}).uncheck();
    await touch.getByRole('button',{name:'Готово',exact:true}).click();
    check(await touch.locator('.rpt-page [data-module="context"]').count()===1 && !await touch.locator('.rpt-footer').isVisible(),'context can become a regular page block');
    await touch.locator('[data-module="context"]').getByRole('button',{name:'Свернуть блок',exact:true}).click();
    check(!await touch.locator('[data-module="context"] .ctt-stats').isVisible(),'regular context block can collapse');
    await touch.evaluate(()=>{
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor','#f5f0e9');
        document.documentElement.style.setProperty('--SmartThemeBodyColor','#29241f');
        document.documentElement.style.setProperty('--SmartThemeQuoteColor','#855b37');
    });
    check(await touch.locator('#rpt-shell').evaluate(el=>getComputedStyle(el).color==='rgb(41, 36, 31)'),'host follows a light Tavern theme');
    await touch.close();
    const six=await browser.newPage({viewport:{width:1440,height:1000}});
    six.on('pageerror',error=>errors.push(error.message));
    six.on('dialog',dialog=>dialog.accept());
    await six.goto(`${url}/?order=six`);
    await six.waitForFunction(()=>document.querySelectorAll('[data-rpt-docked]').length===6);
    await six.waitForFunction(()=>Object.keys(macros).length===2);
    check(await six.getByRole('tab').count()===3,'six panels get Live, character and story pages');
    await six.getByRole('tab',{name:'Сюжет',exact:true}).click();
    check(await six.locator('#sn-panel').isVisible() && await six.locator('#sg-panel').isVisible(),'notes and goals share a page');
    check(await six.locator('.sn-empty').count()===1 && await six.locator('.sg-empty').count()===1,'new panels render on first mount');
    await bottomResize(six,'Story');
    await six.locator('#sn-add').click();
    await six.locator('.sn-editor-input').fill('Черновик: встретиться у маяка.');
    await six.getByRole('tab',{name:'Live',exact:true}).click();
    await six.getByRole('tab',{name:'Сюжет',exact:true}).click();
    check(await six.locator('.sn-editor-input').inputValue()==='Черновик: встретиться у маяка.','page switch preserves unsaved note');
    await six.locator('[data-sn-save]').click();
    check((await six.locator('.sn-card-text').textContent()).includes('маяка'),'hosted note save works');
    await six.locator('[data-sn-toggle]').click();
    check(await six.locator('.sn-card.sn-off').count()===1,'hosted note injection toggle works');
    await six.locator('#sg-add').click();
    await six.locator('.sg-editor-input').fill('Найти путь к маяку');
    await six.getByRole('tab',{name:'Персонаж',exact:true}).click();
    await six.getByRole('tab',{name:'Сюжет',exact:true}).click();
    check(await six.locator('.sg-editor-input').inputValue()==='Найти путь к маяку','page switch preserves unsaved goal');
    await six.locator('[data-sg-save]').click();
    await six.locator('[data-sg-add-step]').click();
    await six.locator('.sg-editor-input').fill('Найти карту');
    await six.locator('[data-sg-save]').click();
    await six.locator('[data-sg-step-check]').click();
    check(await six.locator('.sg-step.sg-done').count()===1,'goal steps save and complete in host');
    await six.locator('[data-sg-check]').click();
    check(await six.locator('.sg-card.sg-done').count()===1,'hosted goal completion works');
    const noteDownload=six.waitForEvent('download');
    await six.locator('#sn-export').click();
    const exportedNote=await noteDownload;
    check((await readFile(await exportedNote.path(),'utf8')).includes('маяка'),'hosted note export works');
    await six.locator('#sn-import-file').setInputFiles(await exportedNote.path());
    await six.waitForFunction(()=>document.querySelector('.sn-card-text')?.textContent.includes('маяка'));
    check(await six.locator('.sn-card').count()===1,'hosted note import works');
    await six.getByRole('tab',{name:'Персонаж',exact:true}).click();
    const cvSize=await rect(six,'#rpt-shell');
    const standaloneSize=await six.evaluate(()=>JSON.stringify(Object.values(context.extensionSettings).find(x=>x.storageNamespace)?.panelSize));
    await six.locator('#cv-toggle-preview').click();
    await six.locator('#cv-toggle-preview').click();
    check(JSON.stringify(await rect(six,'#rpt-shell'))===JSON.stringify(cvSize),'visual preview toggle keeps host geometry');
    check(await six.evaluate(()=>JSON.stringify(Object.values(context.extensionSettings).find(x=>x.storageNamespace)?.panelSize))===standaloneSize,'visual preview preserves standalone size');
    await six.locator('.cv-field-input').first().fill('Синяя куртка');
    await six.waitForFunction(async()=>{
        const db=localforage.createInstance({name:'character-visual',storeName:'wardrobe_data'});
        const key=(await db.keys()).find(x=>x.includes('::chat::'));
        return key && JSON.stringify(await db.getItem(key)).includes('Синяя куртка');
    });
    check(await six.evaluate(()=>Object.values(macros).some(fn=>fn().includes('Синяя куртка'))),'visual edits reach IndexedDB and macro');
    await six.locator('#cv-save-as-new').click();
    await six.locator('#cv-dialog-name').fill('Походный образ');
    await six.locator('.cv-dialog-confirm').click();
    await six.waitForFunction(()=>document.querySelector('.cv-editor-heading h2')?.textContent==='Походный образ');
    await six.locator('#cv-nav-wardrobe').click();
    check(await six.locator('.cv-wardrobe-toolbar').isVisible(),'visual wardrobe navigation works');
    check((await six.locator('.cv-outfit-card h3').textContent())==='Походный образ','visual outfit saves to wardrobe');
    await six.locator('.cv-apply-outfit').click();
    await six.waitForFunction(()=>document.querySelector('.cv-field-input')?.value==='Синяя куртка');
    check(true,'visual saved outfit applies from wardrobe');
    await six.locator('#cv-nav-settings').click();
    check(await six.locator('.cv-settings-grid').isVisible(),'visual settings navigation works');
    await six.locator('#cv-nav-editor').click();
    await six.locator('[data-module="visual"]').getByRole('button',{name:'Свернуть блок',exact:true}).click();
    const collapsed=await rect(six,'[data-module="visual"]');
    check(collapsed.height>25 && collapsed.height<140,'visual collapse preserves usable header');
    await six.locator('[data-module="visual"]').getByRole('button',{name:'Раскрыть блок',exact:true}).click();
    const snapshot=await data(six);
    await settings(six);await six.getByLabel('Собирать расширения в общую панель',{exact:true}).uncheck();
    check(await six.locator('[data-rpt-docked]').count()===0,'all six panels release');
    await six.getByRole('button',{name:'Свернуть панель',exact:true}).click();
    for(const p of ['sn','sg','cv']) {
        await six.locator(`#${p}-button`).click();
        check(await six.locator(`#${p}-panel`).isVisible(),`${p} original launcher works after release`);
        await six.locator(`#${p}-close`).click();
    }
    await six.locator('#rpt-launcher').click();
    await six.getByLabel('Собирать расширения в общую панель',{exact:true}).check();
    await six.getByRole('button',{name:'Готово',exact:true}).click();
    // Opening native windows legitimately updates their own layout/settings;
    // assert only content and subscription counts for this round trip.
    const restored=await data(six);
    check(restored.metadata===snapshot.metadata && JSON.stringify(restored.events)===JSON.stringify(snapshot.events),'six-panel release/remount preserves metadata and subscriptions');
    for(const width of [390,360]) {
        await six.setViewportSize({width,height:900});
        await six.waitForFunction(()=>document.getElementById('rpt-shell').getBoundingClientRect().right<=innerWidth);
        for(const name of ['Персонаж','Сюжет']) {
            await six.getByRole('tab',{name,exact:true}).click();
            check(await six.locator('.rpt-page:not([hidden])').evaluate(el=>el.scrollWidth<=el.clientWidth+2),`${name} fits ${width}px`);
        }
        await six.getByRole('tab',{name:'Персонаж',exact:true}).click();
        await six.locator('#cv-nav-wardrobe').click();
        check(await six.locator('#cv-content').evaluate(el=>el.scrollWidth<=el.clientWidth+2),`wardrobe fits ${width}px`);
        await six.locator('#cv-nav-settings').click();
        check(await six.locator('#cv-content').evaluate(el=>el.scrollWidth<=el.clientWidth+2),`visual settings fit ${width}px`);
        await six.locator('#cv-nav-editor').click();
    }
    await six.screenshot({path:'/tmp/roleplay-tools-six-qa.png'});
    await six.reload();await six.waitForFunction(()=>document.querySelectorAll('[data-rpt-docked]').length===6);
    check(await six.getByRole('tab').count()===3,'suggested pages do not duplicate on reload');
    await six.getByRole('tab',{name:'Персонаж',exact:true}).click();
    await six.waitForFunction(()=>document.querySelector('.cv-field-input')?.value==='Синяя куртка');
    check(true,'visual state reloads from IndexedDB');
    await six.getByRole('tab',{name:'Сюжет',exact:true}).click();
    check((await six.locator('.sn-card-text').textContent()).includes('маяка') && (await six.locator('.sg-card-text').textContent()).includes('маяку'),'stored notes and goals display after reload without manual refresh');
    await six.close();
    const upgrade=await browser.newPage({viewport:{width:1400,height:1000}});
    upgrade.on('pageerror',error=>errors.push(error.message));
    await upgrade.addInitScript(()=>{
        if(localStorage.getItem('wani_roleplay_tools_layout_v1'))return;
        localStorage.setItem('wani_roleplay_tools_layout_v1',JSON.stringify({
            version:1,enabled:true,open:true,side:'left',geometry:{width:450,height:700,x:8,y:70},
            active:'custom',pinContext:true,pages:[{id:'custom',name:'Мой Live'}],
            modules:{thoughts:{page:'custom',order:1,weight:55,collapsed:false},relations:{page:'custom',order:0,weight:45,collapsed:false},context:{page:'custom',order:2,weight:15,collapsed:false}}
        }));
    });
    await upgrade.goto(`${url}/?order=six`);
    await upgrade.waitForFunction(()=>document.querySelectorAll('[data-rpt-docked]').length===6);
    const migrated=await upgrade.evaluate(()=>JSON.parse(localStorage.getItem('wani_roleplay_tools_layout_v1')));
    check(migrated.side==='left' && migrated.geometry.width===450 && migrated.modules.thoughts.page==='custom' && migrated.modules.thoughts.weight===55 && migrated.modules.relations.order===0,'upgrade preserves beta.1 custom geometry and module placement');
    await bottomResize(upgrade,'Thoughts last');
    await upgrade.locator('.rpt-page:not([hidden]) .rpt-bottom-grip').press('ArrowDown');
    const manualHeight=await upgrade.locator('[data-module="thoughts"]').evaluate(el=>el.getBoundingClientRect().height);
    await upgrade.reload();await upgrade.waitForFunction(()=>document.querySelectorAll('[data-rpt-docked]').length===6);
    check(Math.abs((await rect(upgrade,'[data-module="thoughts"]')).height-manualHeight)<2,'manual height survives reload');
    await settings(upgrade);
    await upgrade.locator('.rpt-page-editor').filter({has:upgrade.locator('[data-page-name="story"]')}).getByRole('button',{name:'Удалить страницу, перенести блоки на соседнюю'}).click();
    await upgrade.reload();await upgrade.waitForFunction(()=>document.querySelectorAll('[data-rpt-docked]').length===6);
    check(await upgrade.getByRole('tab',{name:'Сюжет',exact:true}).count()===0,'deleted suggested page stays deleted after reload');
    await upgrade.close();
    for(const order of ['six-last','six-none']) {
        const p=await browser.newPage({viewport:{width:1280,height:900}});
        p.on('pageerror',error=>errors.push(error.message));
        await p.goto(`${url}/?order=${order}`);
        await p.waitForSelector('#cv-button',{state:'attached'});
        if(order==='six-last') {
            await p.waitForFunction(()=>document.querySelectorAll('[data-rpt-docked]').length===6);
            check(true,'all six connect when host loads last');
        } else {
            for(const id of ['sn','sg','cv']) {
                await p.locator(`#${id}-button`).click();
                check(await p.locator(`#${id}-panel`).isVisible(),`${id} works without host installed`);
                await p.locator(`#${id}-close`).click();
            }
        }
        await p.close();
    }
    for(const order of ['last','none']) {
        const other=await browser.newPage({viewport:{width:1280,height:900}});
        other.on('pageerror',error=>errors.push(error.message));
        await other.goto(`${url}/?order=${order}`);
        await other.waitForSelector('#ct-button',{state:'attached'});
        if(order==='last'){await wait(other);check(await other.locator('[data-rpt-docked]').count()===3,'host loaded after extensions');}
        else {
            await other.locator('#ct-button').click();
            check(await other.locator('#ct-panel').isVisible() && await other.locator('#rpt-shell').count()===0,'adapters work without host installed');
        }
        await other.close();
    }
    check(errors.length===0, 'all load orders have no browser exceptions');
    console.log(`${checks} checks passed. Uses ST context stubs; a live Tavern smoke test is still required.`);
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
