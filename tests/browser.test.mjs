import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
let server,browser,origin;
const sid='a'.repeat(64);
const fakePoint={lat:0,lon:0,accuracy:5,time:Date.now(),distance:120,durationMs:62000,progressMeters:120,remaining:100,fraction:.54,approximate:true};
before(async()=>{
  server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname.replace(/^\/Dido-Live-Run-Viewer(?=\/)/,'');
    if(!/^\/[A-Za-z0-9_.-]*$/.test(path)){res.writeHead(404).end();return;}
    try {
      const file=path==='/'?'index.html':path.slice(1);
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
      res.end(await readFile(`web/${file}`));
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  const executablePath=process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function routes(page) {
  await page.route('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    await route.fulfill({body:await readFile(`node_modules/leaflet/dist/${name}`),contentType:name.endsWith('.css')?'text/css':'application/javascript'});
  });
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),contentType:'image/png'}));
  await page.route('**/config.json',route=>route.fulfill({json:{databaseURL:'https://demo.firebaseio.com'}}));
}
test('mobile Leaflet page displays GPX, live runner, stats, then clears on STOP',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});await routes(page);
  let stopped=false;
  await page.route('https://demo.firebaseio.com/**',route=>{
    const p=new URL(route.request().url()).pathname;
    if(p.endsWith('/status.json'))return route.fulfill({json:{active:!stopped,leaseAt:Date.now()}});
    if(p.endsWith('/payload.json'))return route.fulfill({json:{laps:2,route:{'0000':{lat:0,lon:0},'0001':{lat:0,lon:.001},'0002':{lat:0,lon:0}},points:{'0000':fakePoint},stats:fakePoint}});
    return route.fulfill({json:p.endsWith('/stats.json')?fakePoint:null});
  });
  await page.clock.install();await page.goto(`${origin}/#u=runner&s=${sid}`);
  await page.waitForFunction(()=>document.getElementById('distance').textContent.includes('0,12'));
  assert.equal(await page.locator('#duration').textContent(),'00:01:02');
  assert.match(await page.locator('#progress').textContent(),/54%/);
  assert(await page.locator('.leaflet-interactive').count()>=4);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
  stopped=true;await page.clock.fastForward(13000);
  await page.waitForFunction(()=>document.getElementById('status').textContent==='Проследяването приключи');
  assert.equal(await page.locator('#distance').textContent(),'—');assert.equal(await page.locator('.leaflet-interactive').count(),0);
  await page.close();
});
test('invalid link displays useful Bulgarian message and no coordinates',async()=>{
  const page=await browser.newPage({viewport:{width:1280,height:800}});await routes(page);
  await page.goto(origin);await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Невалиден'));
  assert.equal(await page.locator('#distance').textContent(),'—');await page.close();
});
test('REST permission denial hides previously displayed route and position',async()=>{
  const page=await browser.newPage();await routes(page);let denied=false;
  await page.route('https://demo.firebaseio.com/**',route=>{
    if(denied)return route.fulfill({status:403,json:{error:'Permission denied'}});
    if(new URL(route.request().url()).pathname.endsWith('/status.json'))return route.fulfill({json:{active:true}});
    return route.fulfill({json:{laps:1,points:{'0000':fakePoint},stats:fakePoint}});
  });
  await page.clock.install();await page.goto(`${origin}/#u=runner&s=${sid}`);
  await page.waitForFunction(()=>document.getElementById('distance').textContent!=='—');
  denied=true;await page.clock.fastForward(13000);
  await page.waitForFunction(()=>document.getElementById('distance').textContent==='—');
  assert.equal(await page.locator('.leaflet-interactive').count(),0);await page.close();
});

test('offline browser hides coordinates after sixty seconds without a successful read',async()=>{
  const page=await browser.newPage();await routes(page);let offline=false;
  await page.route('https://demo.firebaseio.com/**',route=>{
    if(offline)return route.abort('internetdisconnected');
    if(new URL(route.request().url()).pathname.endsWith('/status.json'))return route.fulfill({json:{active:true}});
    return route.fulfill({json:{laps:1,points:{'0000':fakePoint},stats:fakePoint}});
  });
  await page.clock.install();await page.goto(`${origin}/#u=runner&s=${sid}`);
  await page.waitForFunction(()=>document.getElementById('distance').textContent!=='—');
  offline=true;
  for(let i=0;i<6;i++){await page.clock.fastForward(12000);await page.waitForTimeout(10);}
  await page.waitForFunction(()=>document.getElementById('distance').textContent==='—');
  assert.equal(await page.locator('.leaflet-interactive').count(),0);await page.close();
});

test('GitHub Pages project path loads scripts and explains missing Firebase configuration',async()=>{
  const page=await browser.newPage();await routes(page);
  await page.route('**/config.json',route=>route.fulfill({status:404,body:'Not configured'}));
  await page.goto(`${origin}/Dido-Live-Run-Viewer/#u=runner&s=${sid}`);
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('още не е настроена'));
  assert.equal(await page.locator('#distance').textContent(),'—');
  await page.close();
});
