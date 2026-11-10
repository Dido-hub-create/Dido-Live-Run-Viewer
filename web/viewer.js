import {parseLink,databaseURL,completedCourse,duration,AccessEnded,ViewerSession} from './model.js';
const el=id=>document.getElementById(id);
let map, layers, runner, lastPosition, first=true, polling=false, session;
const number=new Intl.NumberFormat('bg-BG',{maximumFractionDigits:2});
function clear(message) {
  layers?.clearLayers(); map?.setView([0,0],2); runner=null; lastPosition=null; first=true;
  for(const id of ['distance','duration','remaining','progress']) el(id).textContent='—';
  el('updated').textContent='GPS координатите не се показват.';
  el('status').textContent=message;
}
function draw({stats,route,laps,live}) {
  layers.clearLayers(); runner=null; lastPosition=null;
  const latlng=ps=>ps.map(p=>[p.lat,p.lon]);
  if(route.length) {
    L.polyline(latlng(route),{color:'#477ec0',weight:5,opacity:.6}).addTo(layers);
    if(first) {map.fitBounds(latlng(route),{padding:[30,30],maxZoom:16});first=false;}
    const done=completedCourse(route,laps,stats.progressMeters || 0);
    if(done.length>1) L.polyline(latlng(done),{color:'#248542',weight:7}).addTo(layers);
    for(const [point,label,css] of [[route[0],'С','start-pin'],[route.at(-1),'Ф','finish-pin']])
      L.marker([point.lat,point.lon],{icon:L.divIcon({className:css,html:label,iconSize:[26,26]})}).bindTooltip(label==='С'?'Старт':'Финал').addTo(layers);
  }
  if(live.length) {
    // Long gaps have no invented straight-line connector.
    let segment=[];
    for(const p of live) {
      if(segment.length && p.time-segment.at(-1).time > 120000) { L.polyline(latlng(segment),{color:'#d18724',weight:3}).addTo(layers);segment=[]; }
      segment.push(p);
    }
    L.polyline(latlng(segment),{color:'#d18724',weight:3}).addTo(layers);
    const p=live.at(-1); lastPosition=[p.lat,p.lon];
    runner=L.circleMarker(lastPosition,{radius:9,color:'#fff',weight:3,fillColor:'#d17712',fillOpacity:1}).bindTooltip('Бегач').addTo(layers);
    L.circle(lastPosition,{radius:p.accuracy,color:'#d17712',weight:1,fillOpacity:.07}).addTo(layers);
    if(first) { if(route.length) map.fitBounds(latlng(route),{padding:[30,30],maxZoom:16}); else map.setView(lastPosition,16);first=false; }
    const stale=Date.now()-p.time > 45000;
    el('status').textContent=stale?'Няма нова GPS позиция повече от 45 секунди.':'● Проследяване на живо';
    el('updated').textContent=`Последна GPS позиция: ${new Date(p.time).toLocaleTimeString('bg-BG')} · точност ±${Math.round(p.accuracy)} м`;
  } else { el('status').textContent='Бегачът стартира. Изчакване на GPS…'; el('updated').textContent='Още няма GPS позиция.'; }
  el('distance').textContent=Number.isFinite(stats.distance)?`${number.format(stats.distance/1000)} км`:'—';
  el('duration').textContent=duration(stats.durationMs);
  el('remaining').textContent=route.length && Number.isFinite(stats.remaining)?`${stats.approximate?'≈ ':''}${number.format(stats.remaining/1000)} км`:'—';
  el('progress').textContent=route.length && Number.isFinite(stats.fraction)?`${stats.approximate?'≈ ':''}${Math.round(stats.fraction*100)}% · ${laps} об.`:'—';
}
el('follow').addEventListener('click',()=>{ if(lastPosition) map.setView(lastPosition,16); });
async function main() {
  const {uid,sid}=parseLink(location.hash);
  const configResponse=await fetch('./config.json',{cache:'no-store'});
  if(!configResponse.ok) throw Error('Страницата още не е настроена. Следвайте README за Firebase и GitHub Pages.');
  const config=await configResponse.json(), base=databaseURL(config.databaseURL);
  if(!globalThis.L) throw Error('Картата не се зареди. Проверете интернет и презаредете страницата.');
  map=L.map('map').setView([0,0],2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  layers=L.layerGroup().addTo(map);
  const root=`${base}/runners/${encodeURIComponent(uid)}/share/${sid}`;
  const read=async (path,startAt)=>{
    const url=new URL(`${root}/${path}.json`);
    if(startAt) {url.searchParams.set('orderBy',JSON.stringify('$key'));url.searchParams.set('startAt',JSON.stringify(startAt));url.searchParams.set('limitToFirst','1000');}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(url,{cache:'no-store',signal:controller.signal,credentials:'omit'});
      if(response.status===401 || response.status===403) throw new AccessEnded();
      if(!response.ok) throw Error('Временен проблем с връзката. Опитваме отново…');
      return await response.json();
    } finally {clearTimeout(timeout);}
  };
  session=new ViewerSession(read,draw,clear);
  async function poll() {
    if(polling || document.hidden) return;
    polling=true;
    try {await session.poll();}
    catch(error) {
      if(error instanceof AccessEnded) session.hide('Проследяването приключи или достъпът е изтекъл. Поискайте актуален линк.');
      else el('status').textContent='Връзката е прекъсната. Опитваме отново…';
    } finally {polling=false;}
  }
  await poll();
  setInterval(poll,12000);
  setInterval(()=>session.watchdog(),1000);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) session.hide('Координатите са скрити, докато страницата е на заден план.');
    else poll();
  });
  addEventListener('hashchange',()=>{session.hide('Зареждане на нов линк…');location.reload();});
}
main().catch(error=>clear(error.message || 'Страницата не може да се зареди.'));
