function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderHealthPage(current, history) {
  const data = { current, history, generatedAt: Date.now() };
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NexChat — Status</title>
<style>
  :root { --bg:#0b0b0f; --bg2:#141419; --bg3:#1c1c24; --line:#2a2a33; --gold:#eac847; --amber:#f0b429; --green:#3ecf8e; --red:#ef4444; --text:#e8e8ee; --muted:#8a8a99; }
  * { box-sizing: border-box; }
  body { margin:0; background:linear-gradient(180deg,#0b0b0f,#0e0e13); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:24px 18px 48px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
  h1 { font-size:20px; margin:0; letter-spacing:.3px; }
  h1 span { color:var(--gold); }
  .badge { display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:4px 10px; border-radius:999px; border:1px solid var(--line); background:var(--bg2); }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--green); box-shadow:0 0 8px var(--green); }
  .range { display:flex; gap:6px; }
  .range button { background:var(--bg2); color:var(--muted); border:1px solid var(--line); padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer; }
  .range button.active { color:#0b0b0f; background:linear-gradient(135deg,var(--gold),var(--amber)); border-color:transparent; font-weight:700; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-bottom:18px; }
  .card { background:var(--bg2); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .card .ttl { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; }
  .card .big { font-size:28px; font-weight:800; font-variant-numeric:tabular-nums; margin:4px 0 2px; }
  .card .sub { font-size:11px; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap; }
  .card .sub b { color:var(--text); font-weight:700; }
  .panel { background:var(--bg2); border:1px solid var(--line); border-radius:14px; padding:16px; margin-bottom:14px; }
  .panel h2 { font-size:13px; margin:0 0 10px; color:var(--gold); letter-spacing:.4px; }
  .chart { width:100%; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media(max-width:720px){ .grid2 { grid-template-columns:1fr; } }
  .plats { display:flex; flex-direction:column; gap:8px; }
  .plat { display:flex; align-items:center; gap:10px; font-size:12px; }
  .plat .nm { width:64px; color:var(--muted); }
  .plat .bar { flex:1; height:10px; background:var(--bg3); border-radius:6px; overflow:hidden; }
  .plat .fill { height:100%; background:linear-gradient(90deg,var(--gold),var(--amber)); border-radius:6px; }
  .plat .val { width:30px; text-align:right; font-variant-numeric:tabular-nums; }
  .foot { font-size:11px; color:var(--muted); text-align:center; margin-top:18px; }
  .err { color:var(--red); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Nex<span>Chat</span> · Status</h1>
    <div class="range" id="range">
      <button data-r="1h">1h</button>
      <button data-r="24h" class="active">24h</button>
      <button data-r="7d">7d</button>
    </div>
  </header>

  <div class="cards" id="cards"></div>

  <div class="grid2">
    <div class="panel"><h2>Usuários ativos</h2><div id="chart_users" class="chart"></div></div>
    <div class="panel"><h2>Conexões (WebSockets)</h2><div id="chart_conn" class="chart"></div></div>
  </div>

  <div class="grid2">
    <div class="panel"><h2>Salas & Fila</h2><div id="chart_rooms" class="chart"></div></div>
    <div class="panel"><h2>Plataformas (agora)</h2><div id="plats" class="plats"></div></div>
  </div>

  <div class="panel"><h2>Picos & Quedas</h2><div id="events" style="font-size:12px; color:var(--muted); line-height:1.8;"></div></div>

  <div class="foot" id="foot"></div>
</div>

<script id="hc-data" type="application/json">__DATA__</script>
<script>
var DATA = JSON.parse(document.getElementById('hc-data').textContent);
var range = '24h';

function rangeMs(){ return range==='1h'?3600e3 : range==='24h'?86400e3 : 7*86400e3; }
function filtered(){ var cut=Date.now()-rangeMs(); return DATA.history.filter(function(h){ return h.ts>=cut; }); }
function downsample(arr, max){
  if(arr.length<=max) return arr;
  var step=arr.length/max, out=[];
  for(var i=0;i<max;i++){ out.push(arr[Math.floor(i*step)]); }
  out.push(arr[arr.length-1]);
  return out;
}
function summarize(vals){
  if(!vals.length) return {cur:0,peak:0,min:0,avg:0,drops:0,bigdrop:0};
  var cur=vals[vals.length-1], peak=vals[0], min=vals[0], sum=0, drops=0, bigdrop=0;
  for(var i=0;i<vals.length;i++){
    var v=vals[i]; sum+=v; if(v>peak)peak=v; if(v<min)min=v;
    if(i>0 && v<vals[i-1]){ drops++; var d=vals[i-1]-v; if(d>bigdrop)bigdrop=d; }
  }
  return {cur:cur,peak:peak,min:min,avg:Math.round(sum/vals.length),drops:drops,bigdrop:bigdrop};
}
function fmtTime(ts){
  var d=new Date(ts);
  return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
}
function buildSVG(vals, color){
  var W=600,H=190,padL=40,padR=12,padT=14,padB=24;
  var iw=W-padL-padR, ih=H-padT-padB, n=vals.length;
  if(n===0) return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="190"><text x="'+(W/2)+'" y="'+(H/2)+'" fill="#8a8a99" font-size="12" text-anchor="middle">sem dados</text></svg>';
  var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals), span=(max-min)||1;
  var xs=[], ys=[];
  for(var i=0;i<n;i++){ xs.push(padL + (n===1?iw/2:(i/(n-1))*iw)); ys.push(padT + ih - ((vals[i]-min)/span)*ih); }
  var line='M'+xs[0].toFixed(1)+','+ys[0].toFixed(1);
  for(var j=1;j<n;j++){ line+=' L'+xs[j].toFixed(1)+','+ys[j].toFixed(1); }
  var area=line+' L'+(padL+iw)+','+(padT+ih)+' L'+padL+','+(padT+ih)+' Z';
  var grid='';
  for(var g=0;g<=2;g++){ var gy=padT+(ih/2)*g; grid+='<line x1="'+padL+'" y1="'+gy.toFixed(1)+'" x2="'+(padL+iw)+'" y2="'+gy.toFixed(1)+'" stroke="#2a2a33" stroke-width="1"/>'; }
  var labMax='<text x="'+(padL-6)+'" y="'+(padT+4)+'" fill="#8a8a99" font-size="10" text-anchor="end">'+max+'</text>';
  var labMin='<text x="'+(padL-6)+'" y="'+(padT+ih)+'" fill="#8a8a99" font-size="10" text-anchor="end">'+min+'</text>';
  var labAvg='<text x="'+(padL-6)+'" y="'+(padT+ih/2+3)+'" fill="#8a8a99" font-size="10" text-anchor="end">'+Math.round((min+max)/2)+'</text>';
  var lastDot='<circle cx="'+xs[n-1].toFixed(1)+'" cy="'+ys[n-1].toFixed(1)+'" r="3" fill="'+color+'"/>';
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="190" preserveAspectRatio="none">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity="0.35"/><stop offset="100%" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'
    + grid + labMax + labAvg + labMin
    + '<path d="'+area+'" fill="url(#g)"/>'
    + '<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    + lastDot + '</svg>';
}
function el(id){ return document.getElementById(id); }
function render(){
  var h=filtered();
  // Série do histórico + ponto "agora" (live) para que cards/gráficos fiquem
  // consistentes com o painel de plataformas (que é ao vivo).
  var users=h.map(function(x){return x.activeUsers;}); users.push(DATA.current.activeUsers);
  var conn=h.map(function(x){return x.connections;}); conn.push(DATA.current.connections);
  var rooms=h.map(function(x){return x.rooms;}); rooms.push(DATA.current.rooms);
  var queue=h.map(function(x){return x.queue;}); queue.push(DATA.current.queue);
  var roomsQ=[]; for(var i=0;i<rooms.length;i++){ roomsQ.push(rooms[i]+queue[i]); }

  users=downsample(users,220); conn=downsample(conn,220); roomsQ=downsample(roomsQ,220);
  var su=summarize(users), sc=summarize(conn), sr=summarize(roomsQ);
  el('cards').innerHTML =
    card('Usuários ativos', su.cur, su) +
    card('Conexões', sc.cur, sc) +
    card('Salas + Fila', DATA.current.rooms, {peak:sr.peak,min:sr.min,drops:sr.drops}) +
    card('Versão', DATA.current.version, {peak:'',min:'',drops:''}, true);

  el('chart_users').innerHTML = buildSVG(users,'#eac847');
  el('chart_conn').innerHTML = buildSVG(conn,'#3ecf8e');
  el('chart_rooms').innerHTML = buildSVG(roomsQ,'#f0b429');

  var p=DATA.current.platforms||{};
  var total=0; for(var k in p) total+=p[k];
  var rows='';
  ['android','ios','windows','mac','linux','other'].forEach(function(k){
    var v=p[k]||0; var pct= total? Math.round(v/total*100):0;
    rows+='<div class="plat"><span class="nm">'+k+'</span><span class="bar"><span class="fill" style="width:'+pct+'%"></span></span><span class="val">'+v+'</span></div>';
  });
  el('plats').innerHTML = rows || '<span class="muted">sem dados</span>';

  var ev='';
  ev+='Pico de usuários: <b>'+su.peak+'</b> &nbsp;·&nbsp; Mínimo: <b>'+su.min+'</b> &nbsp;·&nbsp; Média: <b>'+su.avg+'</b><br/>';
  ev+='Pico de conexões: <b>'+sc.peak+'</b> &nbsp;·&nbsp; Maior queda (usuários): <b>'+su.bigdrop+'</b> em um intervalo<br/>';
  ev+='Quedas detectadas neste período: <b>'+su.drops+'</b> (transições para baixo de usuários ativos)<br/>';
  ev+='Amostras: <b>'+h.length+'</b> (1 por minuto)';
  el('events').innerHTML = ev;

  var alive = DATA.current.alive ? '<span class="dot"></span> online' : '<span class="dot" style="background:var(--red);box-shadow:0 0 8px var(--red)"></span> offline';
  el('foot').innerHTML = 'Gerado em '+new Date(DATA.generatedAt).toLocaleString()+' &nbsp;·&nbsp; <span class="badge">'+alive+'</span> &nbsp;·&nbsp; fonte: /health';
}
function card(ttl, big, s, isText){
  var sub = isText
    ? '<div class="sub"></div>'
    : '<div class="sub">pico <b>'+s.peak+'</b> · mín <b>'+s.min+'</b> · quedas <b>'+s.drops+'</b></div>';
  return '<div class="card"><div class="ttl">'+ttl+'</div><div class="big">'+big+'</div>'+sub+'</div>';
}

document.getElementById('range').addEventListener('click', function(e){
  var b=e.target.closest('button'); if(!b) return;
  range=b.getAttribute('data-r');
  var btns=document.querySelectorAll('#range button');
  for(var i=0;i<btns.length;i++) btns[i].classList.remove('active');
  b.classList.add('active');
  render();
});

setInterval(function(){
  fetch('/health/v1?json=1').then(function(r){return r.json();}).then(function(d){
    DATA=d; render();
  }).catch(function(){});
}, 20000);

render();
</script>
</body>
</html>`;

  return html.replace('__DATA__', payload);
}

module.exports = { renderHealthPage };
