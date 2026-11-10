export function parseLink(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const uid = params.get('u'), sid = params.get('s');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid || '') || !/^[a-f0-9]{64}$/.test(sid || '')) throw Error('Невалиден личен линк. Поискайте нов линк от бегача.');
  return {uid, sid};
}
export function databaseURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/\.(firebaseio\.com|firebasedatabase\.app)$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Невалидна Firebase конфигурация.');
  return url.origin;
}
export function coordinates(p) { return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180; }
export function points(data) {
  return Object.entries(data || {}).filter(([key, value]) => /^\d{4}$/.test(key) && coordinates(value))
    .sort(([a],[b]) => a.localeCompare(b));
}
export function haversine(a,b) {
  const r = Math.PI/180, dLat=(b.lat-a.lat)*r, dLon=(b.lon-a.lon)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
export function completedCourse(base, laps, progress) {
  if (!Number.isFinite(progress) || progress < 0 || !Number.isInteger(laps) || laps < 1 || laps > 20 || base.length > 2000) return [];
  const expanded=Array.from({length:laps},()=>base).flat();
  if (!expanded.length) return [];
  const completed=[expanded[0]]; let distance=0;
  for (let i=1;i<expanded.length;i++) {
    const a=expanded[i-1],b=expanded[i],segment=haversine(a,b);
    if (distance+segment <= progress) completed.push(b);
    else { const t=segment ? (progress-distance)/segment : 0; completed.push({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t}); break; }
    distance+=segment;
  }
  return completed;
}
export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s=Math.floor(ms/1000);
  return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(v=>String(v).padStart(2,'0')).join(':');
}
export class AccessEnded extends Error {}
export class ViewerSession {
  constructor(read, render, clear, clock=()=>Date.now()) {
    Object.assign(this,{read,render,clear,clock}); this.revision=0; this.reset();
  }
  reset() { this.live=new Map(); this.route=[]; this.loaded=false; this.authorizedAt=0; this.expired=true; }
  hide(message) { this.revision++; this.reset(); this.clear(message); }
  async poll() {
    const revision=this.revision;
    const status=await this.read('status');
    if (revision!==this.revision) return;
    if (!status || status.active !== true) { this.hide('Проследяването приключи'); return; }
    let payload;
    if (!this.loaded) {
      payload=await this.read('payload');
      if (revision!==this.revision) return;
      if (!payload) throw new AccessEnded();
      this.route=points(payload.route).map(([,p])=>p); this.laps=payload.laps || 1;
      this.live=new Map(points(payload.points)); this.loaded=true;
    } else {
      const keys=[...this.live.keys()]; const next=keys.length ? String(Number(keys.at(-1))+1).padStart(4,'0') : '0000';
      const [stats, more]=await Promise.all([this.read('payload/stats'),this.read('payload/points',next)]);
      if (revision!==this.revision) return;
      payload={stats};
      for (const [key,point] of points(more)) this.live.set(key,point);
    }
    if (this.live.size > 7200) throw Error('Прекалено много GPS точки');
    this.authorizedAt=this.clock(); this.expired=false;
    this.render({status,stats:payload.stats || {},route:this.route,laps:this.laps,live:[...this.live.values()]});
  }
  watchdog() { if (!this.expired && this.clock()-this.authorizedAt >= 60000) this.hide('Връзката е прекъсната. Координатите са скрити.'); }
}
