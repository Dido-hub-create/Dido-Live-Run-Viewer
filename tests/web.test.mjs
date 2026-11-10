import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLink,databaseURL,completedCourse,duration,ViewerSession,AccessEnded} from '../web/model.js';
const sid='a'.repeat(64);
test('capability parser rejects unsafe or missing fragments',()=>{
  assert.deepEqual(parseLink(`#u=runner&s=${sid}`),{uid:'runner',sid});
  for(const hash of ['',`#u=../evil&s=${sid}`,'#u=runner&s=short']) assert.throws(()=>parseLink(hash));
});
test('only HTTPS Firebase database hosts are allowed',()=>{
  assert.equal(databaseURL('https://demo.firebaseio.com/'),'https://demo.firebaseio.com');
  for(const value of ['http://demo.firebaseio.com','https://demo.firebaseio.com.evil.org','https://evil.org','https://demo.firebaseio.com/path','https://user@demo.firebaseio.com']) assert.throws(()=>databaseURL(value));
});
test('duration and repeated-course completion stay bounded and ordered',()=>{
  assert.equal(duration(3661000),'01:01:01');assert.equal(duration(NaN),'—');
  const route=[{lat:0,lon:0},{lat:0,lon:.001},{lat:0,lon:0}];
  assert.equal(completedCourse(route,3,0).at(-1).lon,0);
  assert.equal(completedCourse(route,3,10000).length,9);
  const firstLap=completedCourse(route,3,220);
  assert(firstLap.length<5); assert(firstLap.at(-1).lon<.0001);
});
test('incremental reads merge without duplicates; STOP clears map and cached points',async()=>{
  let stopped=false, first=true, rendered, cleared;
  const read=async(path,start)=>{
    if(path==='status') return {active:!stopped};
    if(path==='payload') return {laps:1,points:{'0000':{lat:0,lon:0}},stats:{distance:0}};
    if(path==='payload/stats') return {distance:10};
    assert.equal(start,'0001');return {'0001':{lat:0,lon:.0001}};
  };
  const viewer=new ViewerSession(read,v=>rendered=v,m=>cleared=m);
  await viewer.poll();await viewer.poll();assert.equal(rendered.live.length,2);
  stopped=true;await viewer.poll();assert.equal(cleared,'Проследяването приключи');assert.equal(viewer.live.size,0);
});
test('offline viewer watchdog removes coordinates within sixty seconds',async()=>{
  let now=1,clearMessage;
  const viewer=new ViewerSession(async p=>p==='status'?{active:true}:{laps:1,points:{'0000':{lat:0,lon:0}}},()=>{},m=>clearMessage=m,()=>now);
  await viewer.poll();now+=60000;viewer.watchdog();assert.match(clearMessage,/скрити/);assert.equal(viewer.live.size,0);
});
test('permission denial cannot render a payload',async()=>{
  let rendered=false;
  const viewer=new ViewerSession(async p=>{if(p==='status')return {active:true};throw new AccessEnded();},()=>rendered=true,()=>{});
  await assert.rejects(()=>viewer.poll(),AccessEnded);assert.equal(rendered,false);
});
test('a delayed request cannot redraw coordinates after the viewer was hidden',async()=>{
  let release,rendered=false,cleared=false;
  const gate=new Promise(resolve=>release=resolve);
  const viewer=new ViewerSession(async p=>{
    if(p==='status')return {active:true};
    await gate;return {laps:1,points:{'0000':{lat:0,lon:0}}};
  },()=>rendered=true,()=>cleared=true);
  const pending=viewer.poll();await Promise.resolve();
  viewer.hide('hidden');release();await pending;
  assert(cleared);assert.equal(rendered,false);assert.equal(viewer.live.size,0);
});
