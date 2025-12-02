/* =========================
   MINI ROUTER (hash alapú)
   ========================= */
const router = (() => {
  const views = [...document.querySelectorAll('.view')];
  const routes = views.map(v => v.dataset.route);
  const defaultRoute = 'home';

  const routeBackgrounds = {
    home:    "https://i.imgur.com/GEkwVNS.jpg",
    schedule:"https://i.imgur.com/tpCLdb3.png",
    weather: "https://i.imgur.com/W6vicWF.jpg",
    tours:   "https://i.imgur.com/WVlR7CT.jpeg"
  };

  function setBg(url){
    document.documentElement.style.setProperty('--bg-url', `url('${url}')`);
  }

  function show(route){
    if (!routes.includes(route)) route = defaultRoute;
    views.forEach(v => v.classList.toggle('active', v.dataset.route === route));
    setBg(routeBackgrounds[route] || routeBackgrounds[defaultRoute]);
    window.dispatchEvent(new CustomEvent('routechange', { detail:{ route } }));
  }

  function current(){
    const h = (location.hash || '').replace(/^#\/?/, '').trim();
    const top = h.split('/')[0] || '';
    return top || defaultRoute;
  }

  function navigate(route, subpath = ''){
    const target = subpath ? `#/${route}/${subpath.replace(/^\/+/,'')}` : `#/${route}`;
    if ((location.hash || '') === target){ show(route); return; }
    location.hash = target;
  }

  function back(){
    if (history.length > 1) history.back();
    else navigate(defaultRoute);
  }

  window.addEventListener('hashchange', () => show(current()));
  show(current());

  return { navigate, back, setBg, current };
})();
window.router = router;

/* =========================
   MENETREND MODUL
   ========================= */
const GTFS_BASE = "https://raw.githubusercontent.com/szonjakrizsan-arch/balatongo-menetrend0926/refs/heads/main/";
const FILES = {
  stops: "stops.txt",
  routes: "routes.txt",
  trips: "trips.txt",
  stop_times: "stop_times.txt",
  calendar: "calendar.txt",
  calendar_dates: "calendar_dates.txt"
};
const GTFS = { stops: [], routes: [], trips: [], stop_times: [], calendar: [], calendar_dates: [] };
let byStopId = new Map(), byTripId = new Map(), byRouteId = new Map();

async function loadCsv(url){
  try{
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    const txt = await res.text();
    return new Promise(resolve => {
      Papa.parse(txt, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: r => resolve(r.data) });
    });
  } catch(e){
    console.warn("[GTFS hiba]", url, e);
    return [];
  }
}
const cleanStopName = n => (n || "").replace(/\d+\.?\s*hajóállás/ig, "").replace(/hajóállás/ig, "").trim();
const timeToSec = t => { if (!t) return 0; const [H,M,S=0]=t.split(":").map(Number); return H*3600+M*60+S; };
const ymd = d => { const x = new Date(d); return x.getFullYear() + String(x.getMonth()+1).padStart(2,"0") + String(x.getDate()).padStart(2,"0"); };
const dow = d => new Date(d).getDay();

function activeServiceIds(dateStr){
  const days=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const weekday=days[dow(dateStr)];
  const y=ymd(dateStr); const act=new Set();
  for (const c of GTFS.calendar){
    if (String(c.start_date)<=y && y<=String(c.end_date) && c[weekday]===1) act.add(c.service_id);
  }
  for (const cd of GTFS.calendar_dates){
    if (String(cd.date)===y){
      if (cd.exception_type===1) act.add(cd.service_id);
      if (cd.exception_type===2) act.delete(cd.service_id);
    }
  }
  return act;
}
function buildIndexes(){
  byStopId=new Map(GTFS.stops.map(s=>[String(s.stop_id),s]));
  byTripId=new Map(GTFS.trips.map(t=>[String(t.trip_id),t]));
  byRouteId=new Map(GTFS.routes.map(r=>[String(r.route_id),r]));
}
function fillStopSelects(){
  const from=document.getElementById('fromPort');
  const to=document.getElementById('toPort');
  if (!from || !to) return;
  const grouped={};
  for (const s of GTFS.stops){
    const name=cleanStopName(s.stop_name);
    if(!grouped[name]) grouped[name]=[];
    grouped[name].push(s.stop_id);
  }
  const names=Object.keys(grouped).sort((a,b)=>a.localeCompare(b,'hu'));
  from.innerHTML=`<option value="">Válassz kiindulási kikötőt</option>`;
  to.innerHTML  =`<option value="">Válassz érkezési kikötőt</option>`;
  for (const n of names){
    from.add(new Option(n, grouped[n].join(',')));
    to.add(new Option(n, grouped[n].join(',')));
  }
}
function setDateQuick(kind){
  const d=document.getElementById('datePick'); if(!d) return;
  const now=new Date();
  if (kind==="today"){ d.value = now.toISOString().slice(0,10); return; }
  if (kind==="tomorrow"){ now.setDate(now.getDate()+1); d.value = now.toISOString().slice(0,10); return; }
}
window.setDateQuick = setDateQuick;

function searchTrips(){
  const fromSel = document.getElementById('fromPort');
  const toSel   = document.getElementById('toPort');
  const dateStr = document.getElementById('datePick')?.value;
  const box     = document.getElementById('results');
  if (!box) return;
  box.innerHTML = "";

  if (!fromSel?.value || !toSel?.value || !dateStr){
    box.innerHTML = `<p>Válassz indulási pontot és dátumot – segítek megtalálni a következő járatot.</p>`;
    return;
  }

  const fromIds = fromSel.value.split(',');
  const toIds   = toSel.value.split(',');
  const active  = activeServiceIds(dateStr);

  const timesByTrip = new Map();
  for (const st of GTFS.stop_times){
    const trip = byTripId.get(String(st.trip_id));
    if (!trip) continue;
    if (!timesByTrip.has(st.trip_id)) timesByTrip.set(st.trip_id, []);
    timesByTrip.get(st.trip_id).push(st);
  }

  const rows = [];
  for (const [trip_id, arr] of timesByTrip){
    arr.sort((a,b) => a.stop_sequence - b.stop_sequence);
    const fromIdx = arr.findIndex(x => fromIds.includes(String(x.stop_id)));
    const toIdx   = arr.findIndex(x => toIds.includes(String(x.stop_id)));
    if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;

    const trip  = byTripId.get(String(trip_id));
    if (!active.has(trip.service_id)) continue;
    const route = byRouteId.get(String(trip.route_id));

    let type = "Menetrendi hajó";
    if (route?.route_long_name?.toLowerCase().includes("sétahajó") ||
        route?.route_desc?.toLowerCase().includes("sétahajó")) type = "Sétahajó";

    rows.push({ dep: arr[fromIdx].departure_time, arr: arr[toIdx].arrival_time, type });
  }

  const uniq = new Map();
  for (const r of rows){
    const key = `${r.dep}|${r.arr}|${r.type}`;
    if (!uniq.has(key)) uniq.set(key, r);
  }

  const list = [...uniq.values()].sort((a,b) => timeToSec(a.dep) - timeToSec(b.dep));
  renderResults(list, fromIds[0], toIds[0]);
}
window.searchTrips = searchTrips;

function renderResults(list, fromStopId, toStopId){
  const box = document.getElementById('results');
  if (!box) return;
  const fromName = cleanStopName(byStopId.get(String(fromStopId))?.stop_name) || "—";
  const toName   = cleanStopName(byStopId.get(String(toStopId))?.stop_name)   || "—";

  if (!list.length){
    box.innerHTML = `<div class="result-head">${fromName} ➜ ${toName}</div><p>Nincs találat erre az útvonalra.</p>`;
    return;
  }
  let html = `<div class="result-head">${fromName} ➜ ${toName}</div>`;
  html += list.map(r => `
    <div class="result-item">
      <strong>${r.dep.slice(0,5)}</strong> ➜ ${r.arr.slice(0,5)}<br>${r.type}
    </div>
  `).join("");
  box.innerHTML = html;
}

let scheduleLoaded = false;
async function initSchedule(force = false){
  const dateInput = document.getElementById('datePick');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);

  if (GTFS.stops.length && !force){
    fillStopSelects();
    return;
  }
  GTFS.stops          = await loadCsv(GTFS_BASE + FILES.stops);
  GTFS.routes         = await loadCsv(GTFS_BASE + FILES.routes);
  GTFS.trips          = await loadCsv(GTFS_BASE + FILES.trips);
  GTFS.stop_times     = await loadCsv(GTFS_BASE + FILES.stop_times);
  GTFS.calendar       = await loadCsv(GTFS_BASE + FILES.calendar);
  GTFS.calendar_dates = await loadCsv(GTFS_BASE + FILES.calendar_dates);
  buildIndexes();
  fillStopSelects();
  scheduleLoaded = true;
}
window.addEventListener('routechange', (e) => {
  if (e.detail.route === 'schedule'){
    initSchedule(!scheduleLoaded);
  }
});

/* =========================
   IDŐJÁRÁS
   ========================= */
const defaultBackground = "https://i.imgur.com/GEkwVNS.jpg";
const weatherBackgrounds = {
  clear:        "https://i.imgur.com/GEkwVNS.jpg",
  clouds:       "https://i.imgur.com/W6vicWF.jpg",
  rain:         "https://i.imgur.com/HaAkoZv.jpg",
  drizzle:      "https://i.imgur.com/HaAkoZv.jpg",
  snow:         "https://i.imgur.com/G2gDnqI.jpg",
  thunderstorm: "https://i.imgur.com/HaAkoZv.jpg"
};

function setBackground(url){
  document.documentElement.style.setProperty('--bg-url', `url('${url}')`);
}

function getTempClass(temp){
  if (temp < 10) return "temp-cold";
  if (temp < 20) return "temp-mild";
  if (temp < 30) return "temp-warm";
  return "temp-hot";
}

function getWeatherIcon(main){
  const m = (main || "").toLowerCase();
  if (m === "clear")        return "☀️";
  if (m === "clouds")       return "☁️";
  if (m === "rain")         return "🌧️";
  if (m === "drizzle")      return "🌦️";
  if (m === "snow")         return "❄️";
  if (m === "thunderstorm") return "⛈️";
  return "🌡️";
}

// Szélirány fokból égtáj (É, ÉK, K, DK, D, DNY, NY, ÉNY)
function degToDir(deg){
  if (deg == null || isNaN(deg)) return "";
  const dirs = ["É", "ÉK", "K", "DK", "D", "DNY", "NY", "ÉNY"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

// Szél adatok formázása (km/h + irány, erős szélre ⚠️)
function formatWind(fc){
  if (!fc.wind) return "";
  const speedMs = Number(fc.wind.speed || 0);      // m/s
  const speedKmh = Math.round(speedMs * 3.6);      // km/h
  const dir = degToDir(fc.wind.deg);
  const label = `${dir ? dir + " " : ""}${speedKmh} km/h`;
  if (speedKmh >= 40) return `⚠️ ${label}`;
  return label;
}

async function getWeather(){
  const cityEl = document.getElementById("cityInput");
  const result = document.getElementById("result");
  const btn    = document.getElementById("goBtn");
  const city   = (cityEl?.value || "").trim();

  if (!city){
    if (result) result.innerHTML = "<p class='placeholder'>Írj be egy várost!</p>";
    return;
  }

  const apiKey = "21e5384f9a11e585cdfdf510dd5a64f6";
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=hu`;

  if (result) result.innerText = "Lekérés folyamatban...";
  if (btn) btn.disabled = true;

  try{
    const response = await fetch(url);
    if (!response.ok) throw new Error("Hiba a lekérésnél");
    const data = await response.json();

    if (!data.list || !data.list.length || !data.city){
      if (result) result.innerText = "Nem található előrejelzés ehhez a helyhez.";
      return;
    }

    const firstMain = (data.list[0].weather?.[0]?.main || "").toLowerCase();
    setBackground(weatherBackgrounds[firstMain] || defaultBackground);

    // Zivatar figyelmeztetés – első ~24 óra (8 * 3h)
    const hasStorm = data.list
      .slice(0, 8)
      .some(fc => {
        const main = (fc.weather?.[0]?.main || "").toLowerCase();
        const desc = (fc.weather?.[0]?.description || "").toLowerCase();
        return main === "thunderstorm" || desc.includes("zivatar");
      });

    let html = `<h3>${data.city.name}</h3>`;

    if (hasStorm){
      html += `
        <p class="alert-storm">
          ⛈️ Figyelem, a következő órákban zivatar előfordulhat. Indulás előtt nézd meg az aktuális riasztásokat!
        </p>`;
    }

    html += `<p>Következő órák előrejelzése:</p>`;

    const limit = Math.min(3, data.list.length);
    for (let i = 0; i < limit; i++) {
      const fc   = data.list[i];
      const time = fc.dt_txt.slice(11, 16);
      const temp = Math.round(fc.main.temp);
      const desc = fc.weather[0].description;
      const main = fc.weather[0].main;
      const pop  = Math.round((fc.pop || 0) * 100);
      const icon = getWeatherIcon(main);
      const wind = formatWind(fc);

      html += `
        <div class="forecast-item">
          ${icon} <strong>${time}</strong> –
          <span class="${getTempClass(temp)}">${temp} °C</span>,
          ${desc}
          ${wind ? `, Szél: ${wind}` : ""}
          , Eső esélye: ${pop}% 
        </div>`;
    }

    if (result) result.innerHTML = html;
  } catch(e){
    console.error(e);
    if (result) result.innerText = "Nem sikerült lekérni az adatokat.";
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.getWeather = getWeather;

// Ha elnavigálsz az időjárásról, tisztítunk és visszaállítjuk a hátteret
window.addEventListener('routechange', (e) => {
  if (e.detail.route !== 'weather'){
    const result = document.getElementById('result');
    if (result){
      result.innerHTML = `<p class="placeholder">Írd be a város nevét!</p>`;
    }
    const input = document.getElementById('cityInput');
    if (input) input.value = '';
    router.setBg(defaultBackground);
  }
});

/* =========================
   TÚRAÚTVONALAK (#/tours/…)
   ========================= */
(function(){
  "use strict";
  const toursRoot = document.querySelector('.view[data-route="tours"]');
  if (!toursRoot) return;

  const getSub = () => {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    if (!raw.startsWith('tours')) return '';
    const sub = raw.slice('tours'.length).replace(/^\/?/, '');
    return sub;
  };
  const setSub = (path) => { router.navigate('tours', path); };

  const CSV_URL = "https://raw.githubusercontent.com/szonjakrizsan-arch/balatongo-tura/main/BalatonGo_tura_master.csv?v=12";
  const TITLE = {
    "view-home":   "Túraútvonalak",
    "view-search": "Lélekfeltöltő kirándulások",
    "view-detail": "Túra részletei",
    "view-map":    "Ahol az útvonal kirajzolódik",
    "view-nearby": "A közelben",
  };
  const SUB = {
    "view-home":   "",
    "view-search": "",
    "view-detail": "Egy hely, sok élménnyel",
    "view-map":    "",
    "view-nearby": "Közeli helyek – séta vagy bringa? 🚶‍♀️🚴",
  };

  const norm = (s) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  const compareHu = (a,b) => String(a||"").localeCompare(String(b||""),"hu",{sensitivity:"base"});
  const slugify = (s) => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s\-]+/g,"").trim().replace(/\s+/g,"-").replace(/\-+/g,"-");
  const parseNum = (v) => v==null ? NaN : Number(String(v).replace(",","."));
  const R = 6371;
  const toRad = (d)=>d*Math.PI/180;
  const haversine=(la1,lo1,la2,lo2)=>2*R*Math.atan2(Math.sqrt(Math.sin((la2-la1)*Math.PI/360)**2+Math.cos(toRad(la1))*Math.cos(toRad(la2))*Math.sin((lo2-lo1)*Math.PI/360)**2),Math.sqrt(1-(Math.sin((la2-la1)*Math.PI/360)**2+Math.cos(toRad(la1))*Math.cos(toRad(la2))*Math.sin((lo2-lo1)*Math.PI/360)**2)));

  let lastView = "view-home";
  const setView = (id) => {
    toursRoot.setAttribute("data-view", id);
    toursRoot.querySelectorAll(".tview.view").forEach(v=>v.classList.remove("active"));
    toursRoot.querySelector(`#${id}`)?.classList.add("active");
    const h1 = toursRoot.querySelector("#page-title"); if(h1) h1.textContent = TITLE[id] || "Túraútvonalak";
    const sub = toursRoot.querySelector("#page-subtitle"); if(sub) sub.textContent = SUB[id] || "";
    if(id==="view-map") setTimeout(()=>mapInvalidateSize(),150);
  };

  /* ===== Adat ===== */
  let loaded=false, allRows=[], bySlug=new Map();
  let latKey="lat", lonKey="lon";

  const showMsg = (msg, sel="#view-search .view-inner")=>{
    const host=toursRoot.querySelector(sel); if(!host) return;
    let box=host.querySelector(".csv-status");
    if(!box){ box=document.createElement("div"); box.className="csv-status"; host.appendChild(box); }
    box.textContent = msg || "";
  };

  const parseCsv = (text)=>{
    const delim = text.indexOf(";")>-1 && text.indexOf(",")===-1 ? ";" : ",";
    const ls=/\r?\n/; const cs=new RegExp(`${delim}(?=(?:[^"]*"[^"]*")*[^"]*$)`);
    const lines=text.split(ls).filter(l=>l.trim().length); if(!lines.length) return [];
    const headers=lines[0].split(cs).map(h=>h.replace(/^"|"$/g,"").trim());
    return lines.slice(1).map(line=>{
      const cells=line.split(cs).map(c=>c.replace(/^"|"$/g,"").trim());
      const o={}; headers.forEach((h,i)=>o[h]=(cells[i]??"").trim()); return o;
    });
  };

  function detectCoordKeys(rows){
    if(!rows.length) return;
    const keys=Object.keys(rows[0]).map(k=>k.trim());
    const find=(cands)=>{ for(const k of keys){ const kk=k.toLowerCase(); if(cands.some(rx=>rx.test(kk))) return k; } return null; };
    latKey = find([/^lat$/, /^latitude$/, /^lat_deg$/, /^y$/]) || "lat";
    lonKey = find([/^lon$/, /^lng$/, /^long$/, /^longitude$/, /^x$/]) || "lon";
  }

  async function ensureData(){
    if(loaded) return;
    showMsg("Betöltés…");
    const r=await fetch(CSV_URL+"&t="+Date.now(),{cache:"no-store"});
    if(!r.ok){ showMsg(`Hiba: ${r.status}`); return; }
    const t=await r.text();
    allRows = parseCsv(t);
    bySlug.clear();
    allRows.forEach(row=>{
      const slug=row.slug?.trim() || slugify(row.name_hu||row.name||"");
      row.__slug=slug; if(slug) bySlug.set(slug,row);
    });
    detectCoordKeys(allRows);
    loaded=true; showMsg("");
  }

  function buildIndex(r){
    return norm([r.name_hu,r.locality,r.region,r.type,r.category,r.intro,r.highlights,r.access_notes].filter(Boolean).join(" "));
  }

  function exactLocalityMatch(q){
    if(!q) return null;
    const Q = norm(q);
    const set = new Set(allRows.map(r => norm(r.locality||"")).filter(Boolean));
    return set.has(Q) ? Q : null;
  }

  function renderList(qText=""){
    const wrap=toursRoot.querySelector("#view-search .view-inner"); if(!wrap) return;
    wrap.querySelector(".tura-list")?.remove();

    const q=norm(qText);
    let rows = allRows;

    const exactLoc = exactLocalityMatch(q);
    if (q && exactLoc){
      rows = allRows.filter(r => norm(r.locality||"") === exactLoc);
    } else if (q){
      const toks=q.split(" ");
      rows = allRows.filter(r=>toks.every(t=>buildIndex(r).includes(t)));
    }

    if(!rows.length){ showMsg(q?"Nincs találat.":"Nincs megjeleníthető tétel."); return; } else showMsg("");

    const sorted=[...rows].sort((a,b)=>{
      const ap=(a.locality||a.region||"").trim(); const bp=(b.locality||b.region||"").trim();
      const p=compareHu(ap,bp); if(p!==0) return p; return compareHu((a.name_hu||"").trim(), (b.name_hu||"").trim());
    });

    const ul=document.createElement("ul"); ul.className="tura-list";
    sorted.forEach(r=>{
      const name=(r.name_hu||"").trim(); if(!name) return;
      const where = r.locality?.trim()? ` – ${r.locality.trim()}` : r.region?.trim()? ` – ${r.region.trim()}` : "";
      const li=document.createElement("li");
      const left=document.createElement("div"); left.className="left";
      const t=document.createElement("div"); t.className="title"; t.textContent=name;
      const m=document.createElement("div"); m.className="meta"; m.textContent=`${where}`;
      left.append(t,m); li.appendChild(left);
      const right=document.createElement("div"); right.className="right";
      const hasDetail=!!((r.intro&&r.intro.trim())||(r.highlights&&r.highlights.trim())||(r.access_notes&&r.access_notes.trim()));
      if(hasDetail){ const badge=document.createElement("span"); badge.className="badge"; badge.textContent="Részletek"; right.appendChild(badge); }
      li.appendChild(right);
      li.addEventListener("click", ()=>{ lastView="view-search"; if(r.__slug) setSub(`detail/${r.__slug}`); });
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }

  function renderDetail(slug){
    const host=toursRoot.querySelector("#detail-card"); if(!host) return;
    host.innerHTML="";
    const r=bySlug.get(slug);
    if(!r){ host.innerHTML='<p class="muted">A kért túra nem található.</p>'; return; }
    const title=(r.name_hu||"").trim();
    const where = r.locality?.trim()? `${r.locality.trim()}${r.region ? ", "+r.region.trim() : ""}` : r.region?.trim()? r.region.trim() : "";
    const head=document.createElement("div"); head.className="detail-head";
    const txt=document.createElement("div");
    const h=document.createElement("h3"); h.id="detail-title"; h.className="detail-title"; h.textContent=title;
    const sub=document.createElement("div"); sub.className="detail-sub"; sub.textContent=where;
    txt.append(h,sub); head.appendChild(txt);
    const chips=document.createElement("div"); chips.className="detail-chips";
    const addChip=(lab)=>{ if(!lab) return; const c=document.createElement("span"); c.className="chip"; c.textContent=lab; chips.appendChild(c); };
    addChip(r.type); addChip(r.category); if(r.distance_km?.trim()) addChip(`${r.distance_km} km`);
    const body=document.createElement("div"); body.className="detail-body";
    const addPara=(txt)=>{ if(!txt||!String(txt).trim()) return; const p=document.createElement("p"); p.textContent=String(txt).trim(); body.appendChild(p); };
    addPara(r.intro); addPara(r.highlights); addPara(r.access_notes);
    host.append(head); if(chips.children.length) host.appendChild(chips); host.appendChild(body);
  }

  /* ===== Térkép (életciklus-biztos) ===== */
  let map=null, markerLayer=null;
  const mapInvalidateSize=()=>{ if(map) map.invalidateSize(); };

  // Ha elhagyod a Túrák modult, a térképet teljesen felszabadítjuk
  window.addEventListener('routechange', (e)=>{
    if (e.detail.route !== 'tours' && map){
      try { map.remove(); } catch {}
      map=null; markerLayer=null;
    }
  });

  function renderMap(filterText=""){
    const statusEl=toursRoot.querySelector("#map-status");
    const counterEl=toursRoot.querySelector("#map-counter");
    if(statusEl) statusEl.textContent="";
    const host=toursRoot.querySelector("#map"); if(!host) return;

    if(!map){
      map=L.map(host,{zoomControl:true,scrollWheelZoom:true});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19, attribution:"&copy; OpenStreetMap közreműködők"}).addTo(map);
      markerLayer=L.layerGroup().addTo(map);
    }
    markerLayer.clearLayers();

    const q=norm(filterText);
    let rows = allRows;
    const exactLoc = exactLocalityMatch(q);
    if (q && exactLoc){
      rows = allRows.filter(r => norm(r.locality||"") === exactLoc);
    } else if (q){
      const toks=q.split(" ");
      rows = allRows.filter(r=>toks.every(t=>buildIndex(r).includes(t)));
    }

    const pts=[]; let placed=0;
    rows.forEach(r=>{
      const lat=parseNum(r[latKey]); const lon=parseNum(r[lonKey]);
      if(isFinite(lat)&&isFinite(lon)){
        const title=(r.name_hu||r.name||"").trim()||"Ismeretlen hely";
        const slug=r.__slug;
        const m=L.marker([lat,lon]);
        const popupHtml = `
          <div style="min-width:160px">
            <strong>${title}</strong><br/>
            ${r.locality? `<span style="color:#556">${r.locality}</span><br/>` : ""}
            ${slug? `<button data-open-detail="${slug}" class="leaflet-detail-btn">Részletek</button>` : ""}
          </div>`;
        m.bindPopup(popupHtml);
        m.on("popupopen", e=>{
          const btn=e.popup._contentNode.querySelector(`[data-open-detail="${slug}"]`);
          if(btn){ btn.addEventListener("click", ()=>{ lastView="view-map"; if(slug) setSub(`detail/${slug}`); }); }
        });
        m.addTo(markerLayer);
        pts.push([lat,lon]); placed++;
      }
    });

    if(pts.length){ map.fitBounds(L.latLngBounds(pts).pad(0.15)); if(statusEl) statusEl.textContent=""; }
    else { map.setView([46.85,17.9],9); if(statusEl) statusEl.textContent="Nincs megjeleníthető pont."; }
    if(counterEl) counterEl.textContent=`📍 ${placed} pont`;
    setTimeout(()=>mapInvalidateSize(),50);
  }

/* =========================
   KÖZELBEN
   ========================= */

// Ha máshol használnád, maradhat, de itt csak a Google Maps link kell.
// Az OSRM-et most nem hívjuk, hogy ne lassítson.
const OSRM = {
  base: "https://router.project-osrm.org/route/v1",
  async duration(profile, from, to){
    const prof = profile === "foot" ? "walking"
                : (profile === "bicycle" ? "cycling" : profile);
    const url = `${this.base}/${prof}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&alternatives=false&annotations=duration`;
    try{
      const r = await fetch(url, { cache: "no-store" });
      if(!r.ok) return null;
      const j = await r.json();
      const sec = j?.routes?.[0]?.duration;
      return (typeof sec === "number" && isFinite(sec)) ? sec : null;
    }catch{
      return null;
    }
  }
};

const fmtKm = (km) =>
  km < 1
    ? `${Math.round(km * 1000)} m`
    : `${(Math.round(km * 10) / 10).toFixed(1)} km`;

let userPos    = null;
let geoWatchId = null;

// szűrőt most nem használunk, de a változó maradhat, hogy a többi kód ne omoljon
let nearbyType = "all";

function gmapsLinks(lat, lon) {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  return {
    walk: `${base}&travelmode=walking`,
    bike: `${base}&travelmode=bicycling`
  };
}

function askLocation(oneShot = true){
  const stat = toursRoot.querySelector("#nearby-status");
  if(!("geolocation" in navigator)){
    if(stat) stat.textContent = "A böngésző nem támogatja a helymeghatározást.";
    return;
  }

  const onOk = (pos)=>{
    userPos = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude
    };
    localStorage.setItem("bg_last_pos", JSON.stringify(userPos));
    if(stat) stat.textContent = "Pozíció frissítve.";
    renderNearby();
  };

  const onErr = (err)=>{
    if(stat) stat.textContent = "Nem sikerült a helymeghatározás. (HTTPS vagy engedély szükséges)";
    console.error(err);
  };

  if(stat) stat.textContent = "Pozíció lekérése…";

  if(oneShot){
    navigator.geolocation.getCurrentPosition(
      onOk,
      onErr,
      { enableHighAccuracy:true, timeout:10000, maximumAge:60000 }
    );
  }else{
    if(geoWatchId != null){
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    geoWatchId = navigator.geolocation.watchPosition(
      onOk,
      onErr,
      { enableHighAccuracy:true, maximumAge:0 }
    );
  }
}

function loadSavedPos(){
  try{
    const s = localStorage.getItem("bg_last_pos");
    if(!s) return null;
    const o = JSON.parse(s);
    if(o && isFinite(o.lat) && isFinite(o.lon)) return o;
  }catch{}
  return null;
}

// megmarad, ha később mégis akarsz típus szerinti szűrést, de most NEM használjuk
function normType(s){
  const t = norm(s);
  if(/forras/.test(t))       return "forras";
  if(/tanosveny/.test(t))    return "tanosveny";
  if(/rom|var/.test(t))      return "romvar";
  if(/poi|pont|hely/.test(t))return "poi";
  return "poi";
}

// OSRM-hez használt util – most nem kell, de maradhat, ha máshol hivatkozol rá
async function mapLimit(arr, limit, iter){
  const ret = [];
  const run = new Set();
  for(const item of arr){
    const p = (async()=>iter(item))().then(v=>{
      run.delete(p);
      return v;
    });
    run.add(p);
    ret.push(p);
    if(run.size >= limit) await Promise.race(run);
  }
  return Promise.all(ret);
}

/**
 * KÖZELBEN LISTA
 * - csak távolság szerint szűr
 * - NINCS típus-szűrés
 * - NINCS fallback: ha a sugáron belül 0 pont, akkor NINCS kártya
 */
function renderNearby(){
  const list    = toursRoot.querySelector("#nearby-list");
  const stat    = toursRoot.querySelector("#nearby-status");
  const counter = toursRoot.querySelector("#nearby-counter");

  if(!list) return;
  list.innerHTML = "";

  if(!userPos){
    if(stat) stat.textContent = "Kattints az „Engedélyezem a helyzetmeghatározást” gombra!";
    if(counter) counter.textContent = "—";
    return;
  }

  const radiusInput = toursRoot.querySelector("#nearby-radius");
  const radiusLabel = toursRoot.querySelector("#nearby-radius-val");
  const radiusKmRaw = radiusInput ? Number(radiusInput.value) : NaN;
  const radiusKm    = Number.isFinite(radiusKmRaw) ? radiusKmRaw : 250;

  if(radiusLabel) radiusLabel.textContent = radiusKm;

  const withDist = [];

  // allRows, latKey, lonKey, parseNum, haversine a meglévő kódból jön
  allRows.forEach(r => {
    const lat = parseNum(r[latKey]);
    const lon = parseNum(r[lonKey]);
    if(isFinite(lat) && isFinite(lon)){
      const d = haversine(userPos.lat, userPos.lon, lat, lon); // km
      withDist.push({
        row:  r,
        lat,
        lon,
        dist: d
      });
    }
  });

  // távolság szerint növekvő
  withDist.sort((a, b) => a.dist - b.dist);

  // CSAK a sugáron belüliek
  const filtered = withDist.filter(x => x.dist <= radiusKm);

  if(counter) counter.textContent = `📍 ${filtered.length} pont`;

  if(filtered.length === 0){
    if(stat) stat.textContent = "A megadott sugáron belül nincs koordinátás pont.";
    return;
  }else{
    if(stat) stat.textContent = "";
  }

  const toShow = filtered.slice(0, 20);

  // KÁRTYÁK – azonnal, OSRM várakozás nélkül
  toShow.forEach((x)=>{
    const r = x.row;
    const d = x.dist;

    const name = (r.name_hu || r.name || "").trim();
    const where = r.locality?.trim()
      ? ` – ${r.locality.trim()}`
      : (r.region?.trim() ? ` – ${r.region.trim()}` : "");

    const li   = document.createElement("li");

    // BAL OLDAL
    const left = document.createElement("div");
    left.className = "left";

    const t = document.createElement("div");
    t.className = "title";
    t.textContent = name;

    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = `${where} • ${fmtKm(d)}`;

    left.append(t, m);
    li.appendChild(left);

    // JOBB OLDAL – Gyalog / Bringával + Részletek
    const right = document.createElement("div");
    right.className = "right";

    const links = gmapsLinks(x.lat, x.lon);
    const navWrap = document.createElement("span");
    navWrap.innerHTML = `
      <a class="navbtn" href="${links.walk}" target="_blank" rel="noopener">Gyalog</a>
      <a class="navbtn" href="${links.bike}" target="_blank" rel="noopener">Bringával</a>
    `;
    right.appendChild(navWrap);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Részletek";
    right.appendChild(badge);

    li.appendChild(right);

    li.addEventListener("click",(ev)=>{
      if(ev.target.closest("a.navbtn")) return;
      lastView = "view-nearby";
      if(r.__slug) setSub(`detail/${r.__slug}`);
    });

    list.appendChild(li);
  });
}
  
  /* ===== Router a tours-on belül ===== */
  const parseSubHash=()=>{
    const sub = getSub();
    if(!sub) return {view:"view-home"};
    const p=sub.split("/");
    if(p[0]==="detail"&&p[1]) return {view:"view-detail", slug:p.slice(1).join("/")};
    if(p[0]==="search") return {view:"view-search"};
    if(p[0]==="map") return {view:"view-map"};
    if(p[0]==="nearby") return {view:"view-nearby"};
    return {view:"view-home"};
  };

  async function applyRoute(){
    if (router.current()!=='tours') return;
    const r=parseSubHash(); setView(r.view);
    if(r.view==="view-search"){ await ensureData(); renderList(toursRoot.querySelector("#search-input")?.value||""); }
    if(r.view==="view-detail"){ await ensureData(); renderDetail(r.slug); }
    if(r.view==="view-map"){ await ensureData(); renderMap(toursRoot.querySelector("#map-filter")?.value||""); }
    if(r.view==="view-nearby"){ await ensureData(); userPos = loadSavedPos(); renderNearby(); }
  }

  toursRoot.addEventListener("click",(e)=>{
    const to=e.target.closest("[data-nav-to]");
    if(to){
      const id=to.getAttribute("data-nav-to");
      if(id==="view-search"){ lastView="view-home"; setSub("search"); }
      else if(id==="view-map"){ lastView="view-home"; setSub("map"); }
      else if(id==="view-nearby"){ lastView="view-home"; setSub("nearby"); }
      return;
    }
    const back=e.target.closest("[data-nav-back]");
    if(back){
      const r=parseSubHash();
      if(r.view==="view-detail"){
        if(lastView==="view-map") setSub("map");
        else if(lastView==="view-search") setSub("search");
        else if(lastView==="view-nearby") setSub("nearby");
        else setSub("");
      } else if (r.view==="view-home"){
        router.navigate('home');
      } else {
        setSub("");
      }
    }
  });

  const debounce=(fn,ms=150)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  function hookControls(){
    const s=toursRoot.querySelector("#search-input"); if(s) s.addEventListener("input", debounce(()=>renderList(s.value),180));
    const m=toursRoot.querySelector("#map-filter");  if(m) m.addEventListener("input", debounce(()=>renderMap(m.value),180));
    const ask=toursRoot.querySelector("#nearby-ask");
    const refresh=toursRoot.querySelector("#nearby-refresh");
    const radius=toursRoot.querySelector("#nearby-radius");
    const watch=toursRoot.querySelector("#nearby-watch");
    if(ask)     ask.addEventListener("click", ()=>askLocation(true));
    if(refresh) refresh.addEventListener("click", ()=>askLocation(true));
    if(radius)  radius.addEventListener("input", debounce(()=>renderNearby(),150));
    if(watch){
      watch.addEventListener("change", ()=>{
        if(watch.checked){ askLocation(false); }
        else if(geoWatchId!=null){ navigator.geolocation.clearWatch(geoWatchId); geoWatchId=null; }
      });
    }
    toursRoot.querySelectorAll(".chip-toggle").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        toursRoot.querySelectorAll(".chip-toggle").forEach(b=>b.classList.remove("is-active"));
        btn.classList.add("is-active");
        nearbyType = btn.getAttribute("data-type") || "all";
        renderNearby();
      });
    });
  }

  window.addEventListener("hashchange", () => { if (router.current() === 'tours') applyRoute(); });
  window.addEventListener("routechange", (e)=>{ if (e.detail.route === 'tours') applyRoute(); });

  (function init(){ hookControls(); if (router.current()==='tours') applyRoute(); })();
})();
