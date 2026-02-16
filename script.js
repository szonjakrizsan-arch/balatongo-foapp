// BalatonGo – Összevont script:
// - Mini router (home / időjárás / menetrend / túrák)
// - Menetrend (GTFS)
// - Időjárás
// - Túrák + Közeli helyek
// - Menü + modálok + többnyelvűség + Firebase Auth + kedvencek + Kapcsolat + EmailJS

document.addEventListener("DOMContentLoaded", () => {
   let currentLang = "hu";
  
 function t(key) {
  const all = window.translations || {};
  const dict = all[currentLang] || all.hu || {};

  // üres string ("") is lehet érvényes fordítás!
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  if (all.hu && Object.prototype.hasOwnProperty.call(all.hu, key)) return all.hu[key];

  return key;
}
window.t = t;
function applyTranslationsToDom() {
  // 1) data-i18n szövegek
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;

    const translated = t(key);
    if (translated && translated !== key) {
      el.textContent = translated;
    }
  });

  // 2) placeholder fordítás
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;

    const translated = t(key);
    if (translated && translated !== key) {
      el.setAttribute("placeholder", translated);
    }
  });

  // 3) HTML-es fordítások (pl. ÁSZF / Adatkezelés checkbox szöveg)
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (!key) return;

    const translated = t(key);
    if (translated && translated !== key) {
      el.innerHTML = translated;
    }
  });

  // 4) Súgó – copyright szöveg (CSS ::after)
  document.documentElement.style.setProperty(
    "--help-copyright",
    `"${t("footer.copy")}"`
  );
}

// globálisan is elérhető
window.applyTranslationsToDom = applyTranslationsToDom;
 
/* =========================
   MINI ROUTER (hash alapú)
   ========================= */
let router = (() => {
  // Összes nézet (section.view)
  const views = Array.from(document.querySelectorAll(".view"));
  const routes = views
    .map((v) => v.dataset.route)
    .filter((r) => typeof r === "string" && r.length > 0);

  const defaultRoute = "home";

  // Háttérképek route-onként
  const routeBackgrounds = {
    home: "https://i.imgur.com/GEkwVNS.jpg",
    schedule: "https://i.imgur.com/tpCLdb3.png",
    weather: "https://i.imgur.com/W6vicWF.jpg",
    tours: "https://i.imgur.com/WVlR7CT.jpeg",
  };

  function setBg(url) {
    document.documentElement.style.setProperty("--bg-url", `url('${url}')`);
  }

  // Aktív oldal megjelenítése
  function show(route) {
    if (!routes.includes(route)) {
      route = defaultRoute;
    }

    // MINDIG ugorjunk a lap tetejére route-váltáskor
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // Nézetek kapcsolása
    views.forEach((v) => {
      const isActive = v.dataset.route === route;
      v.classList.toggle("active", isActive);
    });


    // Háttérkép: weather oldalon ne írjuk felül a dinamikus időjárás-hátteret
if (route === "weather" && window.__weatherBgUrl) {
  setBg(window.__weatherBgUrl);
} else {
  setBg(routeBackgrounds[route] || routeBackgrounds[defaultRoute]);
}


    // Szóljunk a többi modulnak
    window.dispatchEvent(
      new CustomEvent("routechange", { detail: { route } })
    );
  }

  // Aktuális route kiolvasása a hash-ből
  function current() {
    const h = (location.hash || "").replace(/^#\/?/, "").trim();
    const top = h.split("/")[0] || "";
    return top || defaultRoute;
  }

  // Navigálás egy route-ra
  function navigate(route, subpath = "") {
    const target = subpath
      ? `#/${route}/${subpath.replace(/^\/+/, "")}`
      : `#/${route}`;

    // Ha már ezen az útvonalon vagyunk, csak frissítsük a nézetet
    if ((location.hash || "") === target) {
      show(route);
      return;
    }

    // Különben hash-csere → hashchange esemény is lefut
    location.hash = target;
  }

  // Vissza gomb logika
  function back() {
    if (history.length > 1) {
      history.back();
    } else {
      navigate(defaultRoute);
    }
  }

  // Hash változás figyelése
  window.addEventListener("hashchange", () => {
    show(current());
  });

  // Induláskor aktuális route megjelenítése
  show(current());

  // Külső moduloknak elérhető API
  return { navigate, back, setBg, current };
})();

// Globális router hivatkozás
window.router = router;


    /* =========================
     MENETREND MODUL (GTFS)
     ========================= */
  const GTFS_BASE =
    "https://raw.githubusercontent.com/szonjakrizsan-arch/balatongo-menetrend0926/refs/heads/main/";
  const FILES = {
    stops: "stops.txt",
    routes: "routes.txt",
    trips: "trips.txt",
    stopTimes: "stop_times.txt",
    calendar: "calendar.txt",
    calendarDates: "calendar_dates.txt",
  };

  const GTFS = {
    stops: [],
    routes: [],
    trips: [],
    stopTimes: [],
    calendar: [],
    calendarDates: [],
  };
window.GTFS = GTFS;

  let byStopId = new Map();
  let byTripId = new Map();
  let byRouteId = new Map();

  async function loadCsv(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Nem sikerült betölteni: " + url);
    const text = await res.text();
    return Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    }).data;
  }

const cleanStopName = (s) => {
  let x = (s || "").replace(/\s+/g, " ").trim();

  // egységesítsük a kötőjeleket / gondolatjeleket
  x = x.replace(/\s*[-–—]\s*/g, " – ");

  // csak a település rész kell: az első elválasztóig
  // (vessző, gondolatjel, zárójel)
  x = x.replace(/\s+\d+(?:\/[A-Z])?\.\s*hajóállás.*$/i, "");

  const cut = x.split(",")[0].split(" – ")[0].split("(")[0].trim();

  return cut;
};

  const timeToSec = (ts) => {
    if (!ts) return null;
    const [hh, mm, ss] = ts.split(":").map(Number);
    return hh * 3600 + mm * 60 + (ss || 0);
  };

  const ymd = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  };

  const dow = (d) => d.getDay();

  function activeServiceIds(dateStr) {
    const date = new Date(dateStr);
    const day = dow(date);
    const ymdStr = ymd(date);

    const calendarActive = new Set(
      GTFS.calendar
        .filter((c) => {
          const start = c.start_date;
          const end = c.end_date;
          if (ymdStr < String(start) || ymdStr > String(end)) return false;

          if (day === 0 && c.sunday !== "1") return false;
          if (day === 1 && c.monday !== "1") return false;
          if (day === 2 && c.tuesday !== "1") return false;
          if (day === 3 && c.wednesday !== "1") return false;
          if (day === 4 && c.thursday !== "1") return false;
          if (day === 5 && c.friday !== "1") return false;
          if (day === 6 && c.saturday !== "1") return false;
          return true;
        })
        .map((c) => c.service_id)
    );

    GTFS.calendarDates.forEach((cd) => {
      if (String(cd.date) !== ymdStr) return;
      const sid = cd.service_id;
      if (cd.exception_type === "1") {
        calendarActive.add(sid);
      } else if (cd.exception_type === "2") {
        calendarActive.delete(sid);
      }
    });

    return calendarActive;
  }

  function buildIndexes() {
    byStopId = new Map();
    GTFS.stops.forEach((s) => byStopId.set(s.stop_id, s));

    byTripId = new Map();
    GTFS.trips.forEach((t) => byTripId.set(t.trip_id, t));

    byRouteId = new Map();
    GTFS.routes.forEach((r) => byRouteId.set(r.route_id, r));
  }

function fillStopSelects() {
  const from = document.getElementById("fromPort");
  const to = document.getElementById("toPort");
  if (!from || !to) return;

  // Település-szintű nevek (duplikátumok nélkül)
  const namesSet = new Set();
  GTFS.stops.forEach((s) => {
    const name = cleanStopName(s.stop_name);
    if (name) namesSet.add(name);
  });

  const names = [...namesSet].sort((a, b) => a.localeCompare(b, "hu"));

  from.innerHTML = `<option value="">${t("schedule.selectFrom")}</option>`;
  to.innerHTML = `<option value="">${t("schedule.selectTo")}</option>`;

  names.forEach((name) => {
    const opt1 = document.createElement("option");
    opt1.value = name;          // ← MOST A NÉV A VALUE
    opt1.textContent = name;

    const opt2 = opt1.cloneNode(true);

    from.appendChild(opt1);
    to.appendChild(opt2);
  });
}


  function setDateQuick(kind) {
    const inp = document.getElementById("datePick");
    if (!inp) return;
    const d = new Date();
    if (kind === "tomorrow") {
      d.setDate(d.getDate() + 1);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    inp.value = `${yyyy}-${mm}-${dd}`;
  }
  window.setDateQuick = setDateQuick;

  function searchTrips() {
  const fromSel = document.getElementById("fromPort");
  const toSel = document.getElementById("toPort");
  const dateInp = document.getElementById("datePick");
  const box = document.getElementById("results");

  // Sétahajó hint megjelenítése: indulás = érkezés
  const hint = document.querySelector("#scheduleView .hint");
  if (hint) {
    if (fromSel && toSel && fromSel.value && fromSel.value === toSel.value) {
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }
  }

  if (!fromSel || !toSel || !dateInp || !box) return;

  const dateStr = dateInp.value;
  if (!fromSel.value || !toSel.value || !dateStr) {
    box.innerHTML = `<p>${t("schedule.missingInputs")}</p>`;
    return;
  }

  const active = activeServiceIds(dateStr);
  const fromId = fromSel.value;
  const toId = toSel.value;

  const candidates = GTFS.stopTimes.filter((st) => {
    if (!active.has(st.service_id)) return false;
    return st.stop_id === fromId;
  });

    const trips = [];
    for (const st of candidates) {
      const trip = byTripId.get(st.trip_id);
      if (!trip) continue;
      const depSec = timeToSec(st.departure_time);
      const endStop = GTFS.stopTimes.find(
        (x) => x.trip_id === st.trip_id && x.stop_id === toId
      );
      if (!endStop) continue;
      const arrSec = timeToSec(endStop.arrival_time);
      if (depSec == null || arrSec == null) continue;

      const route = byRouteId.get(trip.route_id);
      let type = t("schedule.type.regular");
      const longName = route?.route_long_name || "";
      const desc = trip?.trip_headsign || "";
      if (longName.includes("sétahajó") || desc.includes("sétahajó")) {
        type = t("schedule.type.cruise");
      }

      trips.push({
        depSec,
        arrSec,
        dep: st.departure_time,
        arr: endStop.arrival_time,
        route,
        trip,
        type,
      });
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let nowSec = 0;
    if (dateStr === todayStr) {
      nowSec =
        now.getHours() * 3600 +
        now.getMinutes() * 60 +
        now.getSeconds();
    }

    trips.sort((a, b) => a.depSec - b.depSec);

    const uniq = new Map();
    for (const tTrip of trips) {
      const key = `${tTrip.dep}|${tTrip.arr}|${tTrip.type}`;
      if (!uniq.has(key)) uniq.set(key, tTrip);
    }
    const list = [...uniq.values()].filter(
      (tTrip) => tTrip.depSec >= nowSec
    );

    renderResults(list, fromId, toId);
  }
  window.searchTrips = searchTrips;

  function renderResults(list, fromStopId, toStopId) {
    const box = document.getElementById("results");
    if (!box) return;

    box.innerHTML = "";

    const fromStop = byStopId.get(fromStopId);
    const toStop = byStopId.get(toStopId);

    const fromName = cleanStopName(fromStop?.stop_name || "");
    const toName = cleanStopName(toStop?.stop_name || "");

    if (!list.length) {
      box.innerHTML = `
        <div class="result-head">${fromName} ➜ ${toName}</div>
        <p>${t("schedule.noResults")}</p>
      `;
      return;
    }

    const head = document.createElement("div");
    head.className = "result-head";
    head.textContent = `${fromName} ➜ ${toName}`;
    box.appendChild(head);

    const ul = document.createElement("ul");
    ul.className = "results-list";

    list.forEach((r) => {
      const li = document.createElement("li");
      li.className = "result-item";

      const timePart = document.createElement("div");
      timePart.className = "result-time";
      timePart.textContent = `${r.dep} → ${r.arr}`;

      const metaPart = document.createElement("div");
      metaPart.className = "result-meta";
      const durationSec = r.arrSec - r.depSec;
      const durMin = Math.round(durationSec / 60);

      let durationText;
      if (durMin < 60) {
        durationText = `${durMin} ${t("schedule.minutes")}`;
      } else {
        durationText = `${Math.floor(durMin / 60)} ${t(
          "schedule.hours"
        )} ${durMin % 60} ${t("schedule.minutes")}`;
      }

      const routeName =
        r.route?.route_long_name || r.trip?.trip_headsign || "";

      metaPart.innerHTML = `
        <div>${routeName}</div>
        <div class="result-extra">${r.type} • ${durationText}</div>
      `;

      li.appendChild(timePart);
      li.appendChild(metaPart);
      ul.appendChild(li);
    });

    box.appendChild(ul);
  }

  let scheduleLoaded = false;

  async function initSchedule(force = false) {
    if (scheduleLoaded && !force) return;

    const box = document.getElementById("results");
    if (box) {
      box.innerHTML = `<p class="schedule-loading">${t(
        "schedule.loading"
      )}</p>`;
    }

    try {
      const [
        stops,
        routes,
        trips,
        stopTimes,
        calendar,
        calendarDates,
      ] = await Promise.all([
        loadCsv(GTFS_BASE + FILES.stops),
        loadCsv(GTFS_BASE + FILES.routes),
        loadCsv(GTFS_BASE + FILES.trips),
        loadCsv(GTFS_BASE + FILES.stopTimes),
        loadCsv(GTFS_BASE + FILES.calendar),
        loadCsv(GTFS_BASE + FILES.calendarDates),
      ]);

      GTFS.stops = stops;
      GTFS.routes = routes;
      GTFS.trips = trips;
      GTFS.stopTimes = stopTimes;
      GTFS.calendar = calendar;
      GTFS.calendarDates = calendarDates;

      buildIndexes();
      fillStopSelects();
      scheduleLoaded = true;

      if (box) {
        box.innerHTML = "";
      }
    } catch (e) {
      console.error(e);
      if (box) {
        box.innerHTML = `<p>${t("schedule.error_load")}</p>`;
      }
    }
  }

  window.addEventListener("routechange", (e) => {
    if (e.detail.route === "schedule") {
      initSchedule(true);
    }
  });

/* =========================
   IDŐJÁRÁS – 3 nyelvű
   ========================= */
const defaultBackground = "https://i.imgur.com/GEkwVNS.jpg";
const weatherBackgrounds = {
  clear: "https://i.imgur.com/GEkwVNS.jpg",
  clouds: "https://i.imgur.com/W6vicWF.jpg",
  rain: "https://i.imgur.com/HaAkoZv.jpg",
  drizzle: "https://i.imgur.com/HaAkoZv.jpg",
  snow: "https://i.imgur.com/G2gDnqI.jpg",
  thunderstorm: "https://i.imgur.com/HaAkoZv.jpg",
};

function setBackground(url) {
  document.documentElement.style.setProperty("--bg-url", `url('${url}')`);
}

function getTempClass(temp) {
  if (temp < 10) return "temp-cold";
  if (temp < 20) return "temp-mild";
  if (temp < 30) return "temp-warm";
  return "temp-hot";
}

function getWeatherIcon(main) {
  const m = (main || "").toLowerCase();
  if (m === "clear") return "☀️";
  if (m === "clouds") return "☁️";
  if (m === "rain") return "🌧️";
  if (m === "drizzle") return "🌦️";
  if (m === "snow") return "❄️";
  if (m === "thunderstorm") return "⛈️";
  return "🌡️";
}

// Szélirány fokból – nyelvfüggő égtáj rövidítések
function degToDir(deg) {
  if (deg == null || isNaN(deg)) return "";
  const dirsCodes = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  const code = dirsCodes[idx];
  const key = `weather.wind.${code}`;
  return t(key) || code;
}

function formatWind(fc) {
  if (!fc.wind) return "";
  const speedMs = Number(fc.wind.speed || 0); // m/s
  const speedKmh = Math.round(speedMs * 3.6);
  const dir = degToDir(fc.wind.deg);
  const label = `${dir ? dir + " " : ""}${speedKmh} km/h`;
  if (speedKmh >= 40) return `⚠️ ${label}`;
  return label;
}

async function getWeather() {
  const cityEl = document.getElementById("cityInput");
  const result = document.getElementById("result");
  const btn = document.getElementById("goBtn");
  const city = (cityEl?.value || "").trim();

  // ❗ Ha nincs város: nyelvfüggő placeholder, data-i18n-nel
  if (!city) {
    if (result) {
      result.innerHTML =
        `<p class="placeholder" data-i18n="weather.placeholder.enter_city">` +
        t("weather.placeholder.enter_city") +
        `</p>`;
    }
    return;
  }

  const apiKey = "21e5384f9a11e585cdfdf510dd5a64f6";
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
    city
  )}&appid=${apiKey}&units=metric&lang=${currentLang || "hu"}`;

  if (result) result.innerText = t("weather.fetching");
  if (btn) btn.disabled = true;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Hiba a lekérésnél");
    const data = await response.json();

    if (!data.list || !data.list.length || !data.city) {
      if (result) result.innerText = t("weather.no_forecast");
      return;
    }

const firstMain = (data.list[0].weather?.[0]?.main || "").toLowerCase();
const bgUrl = weatherBackgrounds[firstMain] || defaultBackground;

// elmentjük, hogy nyelvváltás/route frissítés után is megmaradjon
window.__weatherBgUrl = bgUrl;

// a router háttérkezelőjét használjuk (ha van), különben fallback
if (window.router && typeof window.router.setBg === "function") {
  window.router.setBg(bgUrl);
} else {
  setBackground(bgUrl);
}

    // Zivatar figyelmeztetés – első 24 óra
    const hasStorm = data.list.slice(0, 8).some((fc) => {
      const main = (fc.weather?.[0]?.main || "").toLowerCase();
      const desc = (fc.weather?.[0]?.description || "").toLowerCase();
      return main === "thunderstorm" || desc.includes("zivatar");
    });

    let html = `<h3>${data.city.name}</h3>`;

    if (hasStorm) {
      html += `
      <p class="alert-storm">
        ${t("weather.storm_warning")}
      </p>`;
    }

    html += `<p>${t("weather.next_hours_title")}</p>`;

    const limit = Math.min(3, data.list.length);
for (let i = 0; i < limit; i++) {
  const fc = data.list[i];
  const time = fc.dt_txt.slice(11, 16);
  const temp = Math.round(fc.main.temp);

  // ⬇️ EZ A LÉNYEG: ne az API description-t használjuk
  const main = (fc.weather?.[0]?.main || "").toLowerCase();
  const desc = t(`weather.desc.${main}`) || (fc.weather?.[0]?.description || "");

  const pop = Math.round((fc.pop || 0) * 100);
  const icon = getWeatherIcon(main);
  const wind = formatWind(fc);

  html += `
  <div class="forecast-item">
    ${icon} <strong>${time}</strong> –
    <span class="${getTempClass(temp)}">${temp} °C</span>,
    ${desc}
    ${wind ? `, ${t("weather.label.wind")}: ${wind}` : ""}
    , ${t("weather.label.rain_chance")}: ${pop}%
  </div>`;
}
    if (result) result.innerHTML = html;
  } catch (e) {
    console.error(e);
    if (result) result.innerText = t("weather.error_fetch");
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.getWeather = getWeather;

// Ha elnavigálsz az Időjárás oldalról, takarítsunk
window.addEventListener("routechange", (e) => {
  if (e.detail.route !== "weather") {
    const result = document.getElementById("result");
    if (result) {
      result.innerHTML =
        `<p class="placeholder" data-i18n="weather.placeholder.idle">` +
        t("weather.placeholder.idle") +
        `</p>`;
    }
    const input = document.getElementById("cityInput");
    if (input) input.value = "";
    window.__weatherBgUrl = null;
router.setBg(defaultBackground);

  }
});

  /* =========================
     TÚRAÚTVONALAK + KÖZELBEN
     ========================= */
  (function () {
    "use strict";
    const toursRoot = document.querySelector(
      '.view[data-route="tours"]'
    );
    if (!toursRoot) return;

    const getSub = () => {
      const raw = (location.hash || "").replace(/^#\/?/, "");
      if (!raw.startsWith("tours")) return "";
      const sub = raw.slice("tours".length).replace(/^\/?/, "");
      return sub;
    };
    const setSub = (path) => {
      router.navigate("tours", path);
    };

    const CSV_URL =
      "https://raw.githubusercontent.com/szonjakrizsan-arch/balatongo-tura/main/BalatonGo_tura_master.csv?v=12";
    const TITLE = {
      "view-home": "Túraútvonalak",
      "view-search": "Lélekfeltöltő kirándulások",
      "view-detail": "Túra részletei",
      "view-map": "Ahol az útvonal kirajzolódik",
      "view-nearby": "A közelben",
    };
    const SUB = {
      "view-home": "",
      "view-search": "",
      "view-detail": "Egy hely, sok élménnyel",
      "view-map": "",
      "view-nearby": "Közeli helyek – séta vagy bringa? 🚶‍♀️🚴",
    };

    const norm = (s) =>
      (s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const compareHu = (a, b) =>
      String(a || "").localeCompare(String(b || ""), "hu", {
        sensitivity: "base",
      });
    const slugify = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/\-+/g, "-");
    const parseNum = (v) =>
      v == null ? NaN : Number(String(v).replace(",", "."));
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const haversine = (la1, lo1, la2, lo2) =>
      2 *
      R *
      Math.atan2(
        Math.sqrt(
          Math.sin(((la2 - la1) * Math.PI) / 360) ** 2 +
            Math.cos(toRad(la1)) *
              Math.cos(toRad(la2)) *
              Math.sin(((lo2 - lo1) * Math.PI) / 360) ** 2
        ),
        Math.sqrt(
          1 -
            (Math.sin(((la2 - la1) * Math.PI) / 360) ** 2 +
              Math.cos(toRad(la1)) *
                Math.cos(toRad(la2)) *
                Math.sin(((lo2 - lo1) * Math.PI) / 360) ** 2)
        )
      );

   let lastView = "view-home";

const VIEW_TITLE_KEY = {
  "view-home": "title_home",
  "view-search": "title_search",
  "view-map": "title_map",
  "view-nearby": "title_nearby",
};

const VIEW_SUB_KEY = {
  "view-home": "sub_home",
  "view-search": "sub_search",
  "view-map": "sub_map",
  "view-nearby": "sub_nearby",
};

const setView = (id) => {
  toursRoot.setAttribute("data-view", id);
  toursRoot
    .querySelectorAll(".tview.view")
    .forEach((v) => v.classList.remove("active"));
  toursRoot.querySelector(`#${id}`)?.classList.add("active");

  const titleKey = VIEW_TITLE_KEY[id] || "title_home";
  const subKey = VIEW_SUB_KEY[id] || "sub_home";

  const h1 = toursRoot.querySelector("#page-title");
  if (h1) h1.textContent = (typeof t === "function" ? t(titleKey) : "Túraútvonalak");

  const sub = toursRoot.querySelector("#page-subtitle");
  if (sub) sub.textContent = (typeof t === "function" ? t(subKey) : "");

  if (id === "view-map") setTimeout(() => mapInvalidateSize(), 150);
};

    /* ===== Adat ===== */
    let loaded = false,
      allRows = [],
      bySlug = new Map();
    let latKey = "lat",
      lonKey = "lon";

    const showMsg = (msg, sel = "#view-search .view-inner") => {
      const host = toursRoot.querySelector(sel);
      if (!host) return;
      let box = host.querySelector(".csv-status");
      if (!box) {
        box = document.createElement("div");
        box.className = "csv-status";
        host.appendChild(box);
      }
      box.textContent = msg || "";
    };

    const parseCsv = (text) => {
      const delim =
        text.indexOf(";") > -1 && text.indexOf(",") === -1 ? ";" : ",";
      const ls = /\r?\n/;
      const cs = new RegExp(
        `${delim}(?=(?:[^"]*"[^"]*")*[^"]*$)`
      );
      const lines = text
        .split(ls)
        .filter((l) => l.trim().length);
      if (!lines.length) return [];
      const headers = lines[0].split(cs).map((h) =>
        h.replace(/^"|"$/g, "").trim()
      );
      return lines.slice(1).map((line) => {
        const cells = line
          .split(cs)
          .map((c) => c.replace(/^"|"$/g, "").trim());
        const o = {};
        headers.forEach((h, i) => (o[h] = (cells[i] ?? "").trim()));
        return o;
      });
    };

    function detectCoordKeys(rows) {
      if (!rows.length) return;
      const keys = Object.keys(rows[0]).map((k) => k.trim());
      const find = (cands) => {
        for (const k of keys) {
          const kk = k.toLowerCase();
          if (cands.some((rx) => rx.test(kk))) return k;
        }
        return null;
      };
      latKey =
        find([
          /^lat$/,
          /^latitude$/,
          /^lat_deg$/,
          /^y$/,
        ]) || "lat";
      lonKey =
        find([
          /^lon$/,
          /^lng$/,
          /^long$/,
          /^longitude$/,
          /^x$/,
        ]) || "lon";
    }

    async function ensureData() {
      if (loaded) return;
      showMsg("Betöltés…");
      const r = await fetch(CSV_URL + "&t=" + Date.now(), {
        cache: "no-store",
      });
      if (!r.ok) {
        showMsg(`Hiba: ${r.status}`);
        return;
      }
      const t = await r.text();
      allRows = parseCsv(t);
      bySlug.clear();
      allRows.forEach((row) => {
        const slug = row.slug?.trim() || slugify(row.name_hu || row.name || "");
        row.__slug = slug;
        if (slug) bySlug.set(slug, row);
      });
      detectCoordKeys(allRows);
      loaded = true;
      showMsg("");
    }


// =========================
// CSV NYELVVÁLASZTÓ – TÚRÁK
// =========================
function getCsvLang() {
 const lang = (typeof window.currentLang === "string" ? window.currentLang : "hu").toLowerCase();

  if (lang === "de" || lang === "en" || lang === "hu") return lang;
  return "hu";
}

// base mezők: name | region | intro | highlights | access_notes | opening_info | ticket_info | difficulty
function csvText(r, base) {
  const lang = getCsvLang();

  // NAME: name_hu / name_de / name_en
  if (base === "name") {
    const v =
      (lang === "de" ? r.name_de : lang === "en" ? r.name_en : r.name_hu) ||
      r.name_hu ||
      r.name_en ||
      r.name_de ||
      r.name ||
      "";
    return String(v).trim();
  }

  // REGION: region / region_de / region_en (HU: region)
  if (base === "region") {
    const v =
      (lang === "de" ? r.region_de : lang === "en" ? r.region_en : r.region) ||
      r.region ||
      r.region_en ||
      r.region_de ||
      "";
    return String(v).trim();
  }

  // INTRO: intro / intro_de / intro_en (HU: intro)
  if (base === "intro") {
    const v =
      (lang === "de" ? r.intro_de : lang === "en" ? r.intro_en : r.intro) ||
      r.intro ||
      r.intro_en ||
      r.intro_de ||
      "";
    return String(v).trim();
  }

  // HIGHLIGHTS: highlights / highlights_de / highlights_en (HU: highlights)
  if (base === "highlights") {
    const v =
      (lang === "de" ? r.highlights_de : lang === "en" ? r.highlights_en : r.highlights) ||
      r.highlights ||
      r.highlights_en ||
      r.highlights_de ||
      "";
    return String(v).trim();
  }

  // ACCESS NOTES: access_notes / access_notes_de / access_notes_en (HU: access_notes)
  if (base === "access_notes") {
    const v =
      (lang === "de" ? r.access_notes_de : lang === "en" ? r.access_notes_en : r.access_notes) ||
      r.access_notes ||
      r.access_notes_en ||
      r.access_notes_de ||
      "";
    return String(v).trim();
  }

  // OPENING INFO: opening_info / opening_info_de / opening_info_en
  if (base === "opening_info") {
    const v =
      (lang === "de" ? r.opening_info_de : lang === "en" ? r.opening_info_en : r.opening_info) ||
      r.opening_info ||
      r.opening_info_en ||
      r.opening_info_de ||
      "";
    return String(v).trim();
  }

  // TICKET INFO: ticket_info / ticket_info_de / ticket_info_en
  if (base === "ticket_info") {
    const v =
      (lang === "de" ? r.ticket_info_de : lang === "en" ? r.ticket_info_en : r.ticket_info) ||
      r.ticket_info ||
      r.ticket_info_en ||
      r.ticket_info_de ||
      "";
    return String(v).trim();
  }

  // DIFFICULTY: difficulty / difficulty_de / difficulty_en
  if (base === "difficulty") {
    const v =
      (lang === "de" ? r.difficulty_de : lang === "en" ? r.difficulty_en : r.difficulty) ||
      r.difficulty ||
      r.difficulty_en ||
      r.difficulty_de ||
      "";
    return String(v).trim();
  }

  return "";
}
function exactLocalityMatch(q) {
  if (!q) return null;
  const Q = norm(q);

  const set = new Set(
    allRows
      .map((r) => norm((r && r.locality) ? r.locality : ""))
      .filter(Boolean)
  );

  return set.has(Q) ? Q : null;
}

    function renderList(qText = "") {
      const wrap = toursRoot.querySelector("#view-search .view-inner");
      if (!wrap) return;
      wrap.querySelector(".tura-list")?.remove();

      const q = norm(qText);
      let rows = allRows;

      const exactLoc = exactLocalityMatch(q);
      if (q && exactLoc) {
        rows = allRows.filter(
          (r) => norm(r.locality || "") === exactLoc
        );
      } else if (q) {
        const toks = q.split(" ");
        rows = allRows.filter((r) =>
          toks.every((t) => buildIndex(r).includes(t))
        );
      }

      if (!rows.length) {
        showMsg(q ? "Nincs találat." : "Nincs megjeleníthető tétel.");
        return;
      } else showMsg("");

    const sorted = [...rows].sort((a, b) => {
  const aPlace = ((a.locality || csvText(a, "region") || "")).trim();
  const bPlace = ((b.locality || csvText(b, "region") || "")).trim();

  const p = compareHu(aPlace, bPlace);
  if (p !== 0) return p;

  const aName = (csvText(a, "name") || "").trim();
  const bName = (csvText(b, "name") || "").trim();
  return compareHu(aName, bName);
});

const ul = document.createElement("ul");
ul.className = "tura-list";

sorted.forEach((r) => {
  const name = (csvText(r, "name") || "").trim();
  if (!name) return;

  const regionTxt = (csvText(r, "region") || "").trim();
  const where = r.locality?.trim()
    ? ` – ${r.locality.trim()}`
    : regionTxt
    ? ` – ${regionTxt}`
    : "";

  const labelForFav = `${name}${where || ""}`;
  const encodedLabel = encodeURIComponent(labelForFav);

  const li = document.createElement("li");

  const left = document.createElement("div");
  left.className = "left";

  const titleEl = document.createElement("div");
  titleEl.className = "title";
  titleEl.textContent = name;

  const m = document.createElement("div");
  m.className = "meta";
  m.textContent = `${where}`;

  left.append(titleEl, m);
  li.appendChild(left);

  const right = document.createElement("div");
  right.className = "right";


        // Kedvenc csillag a listában
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.textContent = "☆";
        favBtn.title = "Kedvenc kapcsolása";
        favBtn.classList.add("fav-toggle");
        favBtn.dataset.favLabel = encodedLabel;
        favBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (typeof addFavorite === "function") {
            addFavorite(labelForFav);
          }
        });
        right.appendChild(favBtn);

        const hasDetail = !!(
          (r.intro && r.intro.trim()) ||
          (r.highlights && r.highlights.trim()) ||
          (r.access_notes && r.access_notes.trim())
        );
        if (hasDetail) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = (typeof window.t === "function" ? window.t("tours.list.details") : "Részletek");

          right.appendChild(badge);
        }
        li.appendChild(right);

        li.addEventListener("click", () => {
          lastView = "view-search";
          if (r.__slug) setSub(`detail/${r.__slug}`);
        });
        ul.appendChild(li);
      });
      wrap.appendChild(ul);

      if (typeof window.updateFavoriteStars === "function") {
        window.updateFavoriteStars();
      }
    }
function renderDetail(slug) {
  const host = toursRoot.querySelector("#detail-card");
  if (!host) return;
  host.innerHTML = "";

  const r = bySlug.get(slug);
  if (!r) {
    host.innerHTML = '<p class="muted">A kért túra nem található.</p>';
    return;
  }

  // Fordítás segéd:
  // - ha nincs window.t => fallback
  // - ha window.t van, de hiányzik a kulcs és visszaadja magát a kulcsot => fallback
  const tr = (key, fallback) => {
    if (typeof window.t !== "function") return fallback;
    const out = window.t(key);
    return out && out !== key ? out : fallback;
  };

  // CSV-ből nyelvfüggő mezők
  const title =
    (csvText(r, "name") || "").trim() ||
    tr("tours.detail.unknown", "Ismeretlen hely");

  // locality marad (nincs locality_de/en), region viszont nyelvfüggő
  const loc = (r.locality || "").trim();
  const reg = (csvText(r, "region") || "").trim();
  const where = loc ? `${loc}${reg ? ", " + reg : ""}` : reg;

  const labelForFav = `${title}${where ? " – " + where : ""}`;
  const encodedLabel = encodeURIComponent(labelForFav);

  // ---- FEJLÉC
  const head = document.createElement("div");
  head.className = "detail-head";

  const txt = document.createElement("div");

  const h = document.createElement("h3");
  h.id = "detail-title";
  h.className = "detail-title";
  h.textContent = title;

  const sub = document.createElement("div");
  sub.className = "detail-sub";
  sub.textContent = where;

  txt.append(h, sub);
  head.appendChild(txt);

  // ---- KEDVENC gomb (csak csillag, mint eddig)
  const favBtnDetail = document.createElement("button");
  favBtnDetail.type = "button";
  favBtnDetail.className = "fav-toggle";
  favBtnDetail.textContent = "☆";
  favBtnDetail.title = tr("tours.fav.toggle", "Kedvenc kapcsolása");
  favBtnDetail.dataset.favLabel = encodedLabel;

  favBtnDetail.addEventListener("click", () => {
    let label;
    try {
      label = decodeURIComponent(encodedLabel);
    } catch {
      label = labelForFav;
    }
    if (typeof addFavorite === "function") addFavorite(label);
    if (typeof window.updateFavoriteStars === "function") {
      window.updateFavoriteStars();
    }
  });

  head.appendChild(favBtnDetail);
  host.appendChild(head);

  // ---- CHIPEK (type/category/difficulty + táv)
  const chips = document.createElement("div");
  chips.className = "detail-chips";

  // Chip-fordító: a CSV-ben lévő értékből (pl. "Tanösvény") kulcsot képez ("chip.tanosveny"),
  // és ha van rá fordítás, azt adja vissza. Ha nincs, marad az eredeti.
const trChip = (raw) => {
  const s = (raw || "").toString().trim();
  if (!s) return "";

  const normalized = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // KÜLÖN KEZELÉS: Park/Sétány -> chip.parksétany
  // (mert a CSV-ben "Park/Sétány" van, és ebből nem lehet automatikusan "parksétany"-t képezni)
  if (normalized === "park/setany" || normalized === "park / setany") {
    const key = "chip.parksétany";
    const translated = typeof window.t === "function" ? window.t(key) : key;
    return translated && translated !== key ? translated : s;
  }

  // általános kulcsképzés (pl. "kilátópont" -> chip.kilatopont)
  const key =
    "chip." +
    normalized
      .replace(/\s+/g, "_")
      .replace(/[^\w-]+/g, "");

  const translated = typeof window.t === "function" ? window.t(key) : key;
  return translated && translated !== key ? translated : s;
};


  const addChip = (lab) => {
    const s = (lab || "").toString().trim();
    if (!s) return;
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = s;
    chips.appendChild(c);
  };

  // Fordított (ha van rá kulcs), különben eredeti
  addChip(trChip(r.type));
  addChip(trChip(r.category));
  addChip(trChip(csvText(r, "difficulty")));

  if ((r.distance_km || "").toString().trim()) addChip(`${String(r.distance_km).trim()} km`);

  if (chips.childElementCount) host.appendChild(chips);


  // ---- SZEKCIÓ segéd
  const addSection = (titleKey, titleFallback, bodyText) => {
    const text = (bodyText || "").toString().trim();
    if (!text) return;

    const wrap = document.createElement("div");
    wrap.className = "detail-section";

    const lab = document.createElement("div");
    lab.className = "detail-label";
    lab.textContent = tr(titleKey, titleFallback);

    const p = document.createElement("div");
p.className = "detail-text";
p.textContent = text.replace(/^"+|"+$/g, "");


    wrap.append(lab, p);
    host.appendChild(wrap);
  };

  // ---- SZEKCIÓK (kulcs + fallback)
  addSection("tours.detail.intro", "Leírás", csvText(r, "intro"));
  addSection("tours.detail.highlights", "Főbb pontok", csvText(r, "highlights"));
  addSection("tours.detail.access", "Megközelítés", csvText(r, "access_notes"));
  addSection("tours.detail.opening", "Nyitvatartás", csvText(r, "opening_info"));
  addSection("tours.detail.ticket", "Jegyinformáció", csvText(r, "ticket_info"));

  // ---- LINK / TEL (ha van)
  const website = (r.website || "").trim();
  const phone = (r.phone || "").trim();

  if (website || phone) {
    const wrap = document.createElement("div");
    wrap.className = "detail-section";

    const lab = document.createElement("div");
    lab.className = "detail-label";
    lab.textContent = tr("tours.detail.contact", "Kapcsolat");

    const box = document.createElement("div");
    box.className = "detail-text";

    if (website) {
      const a = document.createElement("a");
      a.href = website;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = website;
      box.appendChild(a);
    }

    if (phone) {
      if (website) box.appendChild(document.createElement("br"));
      const a2 = document.createElement("a");
      a2.href = `tel:${phone}`;
      a2.textContent = phone;
      box.appendChild(a2);
    }

    wrap.append(lab, box);
    host.appendChild(wrap);
  }

  if (typeof window.updateFavoriteStars === "function") {
    window.updateFavoriteStars();
  }
}

    /* ===== Térkép ===== */
    let map = null,
      markerLayer = null;
    const mapInvalidateSize = () => {
      if (map) map.invalidateSize();
    };

    window.addEventListener("routechange", (e) => {
      if (e.detail.route !== "tours" && map) {
        try {
          map.remove();
        } catch {}
        map = null;
        markerLayer = null;
      }
    });

    function renderMap(filterText = "") {
      const statusEl = toursRoot.querySelector("#map-status");
      const counterEl = toursRoot.querySelector("#map-counter");
      if (statusEl) statusEl.textContent = "";
      const host = toursRoot.querySelector("#map");
      if (!host) return;

      if (!map) {
        map = L.map(host, {
          zoomControl: true,
          scrollWheelZoom: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap közreműködők",
        }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
      }
      markerLayer.clearLayers();

      const q = norm(filterText);
      let rows = allRows;
      const exactLoc = exactLocalityMatch(q);
      if (q && exactLoc) {
        rows = allRows.filter(
          (r) => norm(r.locality || "") === exactLoc
        );
      } else if (q) {
        const toks = q.split(" ");
        rows = allRows.filter((r) =>
          toks.every((t) => buildIndex(r).includes(t))
        );
      }

      const pts = [];
      let placed = 0;
      rows.forEach((r) => {
        const lat = parseNum(r[latKey]);
        const lon = parseNum(r[lonKey]);
        if (isFinite(lat) && isFinite(lon)) {
          const nameKey = `name_${window.currentLang || "hu"}`;

const title =
  (r[nameKey] || r.name_hu || r.name || "").trim() ||
  (typeof t === "function" ? t("tours.unknown_place") : "Ismeretlen hely");

          const slug = r.__slug;
          const labelForFav = `${title}${
            r.locality ? " – " + r.locality : ""
          }`;
          const encodedLabel = encodeURIComponent(labelForFav);

         const m = L.marker([lat, lon]);
const popupHtml = `
<div style="min-width:160px">
  <strong>${title}</strong><br/>
  ${
    r.locality
      ? `<span style="color:#556">${r.locality}</span><br/>`
      : ""
  }
  ${
    slug
      ? `<button data-open-detail="${slug}" class="leaflet-detail-btn">${
          typeof t === "function" ? t("tours.map.popup.details") : "Részletek"
        }</button><br/>`
      : ""
  }
  <button data-fav-label="${encodedLabel}" class="leaflet-fav-btn fav-toggle">☆ ${
    typeof t === "function" ? t("tours.map.popup.fav") : "Kedvenc"
  }</button>
</div>`;

          m.bindPopup(popupHtml);
          m.on("popupopen", (e) => {
            const node = e.popup._contentNode;
            const btnDetail =
              node.querySelector(
                `[data-open-detail="${slug}"]`
              );
            if (btnDetail) {
              btnDetail.addEventListener("click", () => {
                lastView = "view-map";
                if (slug) setSub(`detail/${slug}`);
              });
            }
            const favBtnNode = node.querySelector(".leaflet-fav-btn");
            if (favBtnNode) {
              favBtnNode.addEventListener("click", () => {
                const enc = favBtnNode.getAttribute("data-fav-label") || "";
                let label;
                try {
                  label = decodeURIComponent(enc);
                } catch {
                  label = enc;
                }
                if (typeof addFavorite === "function") {
                  addFavorite(label);
                }
              });
            }
            if (typeof window.updateFavoriteStars === "function") {
              window.updateFavoriteStars();
            }
          });
          m.addTo(markerLayer);
          pts.push([lat, lon]);
          placed++;
        }
      });

      if (pts.length) {
        map.fitBounds(L.latLngBounds(pts).pad(0.15));
        if (statusEl) statusEl.textContent = "";
      } else {
        map.setView([46.85, 17.9], 9);
        if (statusEl) statusEl.textContent = "Nincs megjeleníthető pont.";
      }
      if (counterEl) {
  const txt = (typeof t === "function"
    ? t("tours.map.counter").replace("{n}", String(placed))
    : `${placed} pont`);
  counterEl.textContent = `📍 ${txt}`;
}

      setTimeout(() => mapInvalidateSize(), 50);

      if (typeof window.updateFavoriteStars === "function") {
        window.updateFavoriteStars();
      }
    }

    /* =========================
       KÖZELBEN
       ========================= */

    const OSRM = {
      base: "https://router.project-osrm.org/route/v1",
      async duration(profile, from, to) {
        const prof =
          profile === "foot"
            ? "walking"
            : profile === "bicycle"
            ? "cycling"
            : profile;
        const url = `${this.base}/${prof}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&alternatives=false&annotations=duration`;
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) return null;
          const j = await r.json();
          const sec = j?.routes?.[0]?.duration;
          return typeof sec === "number" && isFinite(sec) ? sec : null;
        } catch {
          return null;
        }
      },
    };

    const fmtKm = (km) =>
      km < 1
        ? `${Math.round(km * 1000)} m`
        : `${(Math.round(km * 10) / 10).toFixed(1)} km`;

    let userPos = null;
    let geoWatchId = null;

    let nearbyType = "all"; // most nem használjuk, csak a kód miatt marad

    function gmapsLinks(lat, lon) {
      const base = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
      return {
        walk: `${base}&travelmode=walking`,
        bike: `${base}&travelmode=bicycling`,
      };
    }

    function askLocation(oneShot = true) {
      const stat = toursRoot.querySelector("#nearby-status");
      if (!("geolocation" in navigator)) {
        if (stat)
          stat.textContent =
            "A böngésző nem támogatja a helymeghatározást.";
        return;
      }

      const onOk = (pos) => {
        userPos = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        localStorage.setItem("bg_last_pos", JSON.stringify(userPos));
        if (stat) stat.textContent = "Pozíció frissítve.";
        renderNearby();
      };

      const onErr = (err) => {
        if (stat)
          stat.textContent =
            "Nem sikerült a helymeghatározás. (HTTPS vagy engedély szükséges)";
        console.error(err);
      };

      if (stat) stat.textContent = "Pozíció lekérése…";

      if (oneShot) {
        navigator.geolocation.getCurrentPosition(onOk, onErr, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      } else {
        if (geoWatchId != null) {
          navigator.geolocation.clearWatch(geoWatchId);
          geoWatchId = null;
        }
        geoWatchId = navigator.geolocation.watchPosition(onOk, onErr, {
          enableHighAccuracy: true,
          maximumAge: 0,
        });
      }
    }

    function loadSavedPos() {
      try {
        const s = localStorage.getItem("bg_last_pos");
        if (!s) return null;
        const o = JSON.parse(s);
        if (o && isFinite(o.lat) && isFinite(o.lon)) return o;
      } catch {}
      return null;
    }

    function renderNearby() {
      const list = toursRoot.querySelector("#nearby-list");
      const stat = toursRoot.querySelector("#nearby-status");
      const counter = toursRoot.querySelector("#nearby-counter");

      if (!list) return;
      list.innerHTML = "";

      if (!userPos) {
        if (stat) {
  stat.textContent =
    typeof t === "function"
      ? t("tours.nearby.need_permission")
      : 'Kattints az „Engedélyezem a helyzetmeghatározást” gombra!';
}
if (counter) counter.textContent = "—";
return;

      }

      const radiusInput = toursRoot.querySelector("#nearby-radius");
      const radiusLabel = toursRoot.querySelector("#nearby-radius-val");
      const radiusKmRaw = radiusInput ? Number(radiusInput.value) : NaN;
      const radiusKm = Number.isFinite(radiusKmRaw) ? radiusKmRaw : 250;

      if (radiusLabel) radiusLabel.textContent = radiusKm;

      const withDist = [];

      allRows.forEach((r) => {
        const lat = parseNum(r[latKey]);
        const lon = parseNum(r[lonKey]);
        if (isFinite(lat) && isFinite(lon)) {
          const d = haversine(
            userPos.lat,
            userPos.lon,
            lat,
            lon
          );
          withDist.push({
            row: r,
            lat,
            lon,
            dist: d,
          });
        }
      });

      withDist.sort((a, b) => a.dist - b.dist);

      const filtered = withDist.filter((x) => x.dist <= radiusKm);

      if (counter) {
  counter.textContent =
    typeof window.t === "function"
      ? `📍 ${window.t("tours.nearby.counter").replace("{n}", filtered.length)}`
      : `📍 ${filtered.length} pont`;
}

      if (filtered.length === 0) {
        if (stat) {
  stat.textContent =
    typeof window.t === "function"
      ? window.t("tours.nearby.no_points")
      : "A megadott sugáron belül nincs koordinátás pont.";
}
return;

      } else {
        if (stat) stat.textContent = "";
      }

      const toShow = filtered.slice(0, 20);

      toShow.forEach((x) => {
        const r = x.row;
        const d = x.dist;

const name = (csvText(r, "name") || "").trim() || (r.name || "").trim();

const locTxt = (r.locality || "").trim();
const regTxt = (csvText(r, "region") || "").trim() || (r.region || "").trim();

const where = locTxt
  ? ` – ${locTxt}`
  : regTxt
  ? ` – ${regTxt}`
  : "";

        const labelForFav = `${name}${where || ""}`;
        const encodedLabel = encodeURIComponent(labelForFav);

        const li = document.createElement("li");

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

        const right = document.createElement("div");
        right.className = "right";

       const links = gmapsLinks(x.lat, x.lon);
const navWrap = document.createElement("span");

const walkLabel =
  typeof window.t === "function"
    ? window.t("tours.nearby.walk")
    : "Gyalog";

const bikeLabel =
  typeof window.t === "function"
    ? window.t("tours.nearby.bike")
    : "Bringával";

navWrap.innerHTML = `
  <a class="navbtn" href="${links.walk}" target="_blank" rel="noopener">${walkLabel}</a>
  <a class="navbtn" href="${links.bike}" target="_blank" rel="noopener">${bikeLabel}</a>
`;
right.appendChild(navWrap);


        const badge = document.createElement("span");
        badge.className = "badge";
       badge.textContent = (typeof window.t === "function"
  ? window.t("tours.list.details")
  : "Részletek");

        right.appendChild(badge);

        // Kedvenc csillag a Közeli listában
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.textContent = "☆";
        favBtn.title = "Kedvenc kapcsolása";
        favBtn.classList.add("fav-toggle");
        favBtn.dataset.favLabel = encodedLabel;
        favBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (typeof addFavorite === "function") {
            addFavorite(labelForFav);
          }
        });
        right.appendChild(favBtn);

        li.appendChild(right);

        li.addEventListener("click", (ev) => {
          if (ev.target.closest("a.navbtn")) return;
          lastView = "view-nearby";
          if (r.__slug) setSub(`detail/${r.__slug}`);
        });

        list.appendChild(li);
      });

      if (typeof window.updateFavoriteStars === "function") {
        window.updateFavoriteStars();
      }
    }

    const parseSubHash = () => {
      const sub = getSub();
      if (!sub) return { view: "view-home" };
      const p = sub.split("/");
      if (p[0] === "detail" && p[1])
        return { view: "view-detail", slug: p.slice(1).join("/") };
      if (p[0] === "search") return { view: "view-search" };
      if (p[0] === "map") return { view: "view-map" };
      if (p[0] === "nearby") return { view: "view-nearby" };
      return { view: "view-home" };
    };

    async function applyRoute() {
      if (router.current() !== "tours") return;
      const r = parseSubHash();
      setView(r.view);
      if (r.view === "view-search") {
        await ensureData();
        renderList(
          toursRoot.querySelector("#search-input")?.value || ""
        );
      }
      if (r.view === "view-detail") {
        await ensureData();
        renderDetail(r.slug);
      }
      if (r.view === "view-map") {
        await ensureData();
        renderMap(
          toursRoot.querySelector("#map-filter")?.value || ""
        );
      }
      if (r.view === "view-nearby") {
        await ensureData();
        userPos = loadSavedPos();
        renderNearby();
      }
    }

    toursRoot.addEventListener("click", (e) => {
      const to = e.target.closest("[data-nav-to]");
      if (to) {
        const id = to.getAttribute("data-nav-to");
        if (id === "view-search") {
          lastView = "view-home";
          setSub("search");
        } else if (id === "view-map") {
          lastView = "view-home";
          setSub("map");
        } else if (id === "view-nearby") {
          lastView = "view-home";
          setSub("nearby");
        }
        return;
      }
      const back = e.target.closest("[data-nav-back]");
      if (back) {
        const r = parseSubHash();
        if (r.view === "view-detail") {
          if (lastView === "view-map") setSub("map");
          else if (lastView === "view-search") setSub("search");
          else if (lastView === "view-nearby") setSub("nearby");
          else setSub("");
        } else if (r.view === "view-home") {
          router.navigate("home");
        } else {
          setSub("");
        }
      }
    });

    const debounce = (fn, ms = 150) => {
      let t;
      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    };
    function hookControls() {
      const s = toursRoot.querySelector("#search-input");
      if (s)
        s.addEventListener(
          "input",
          debounce(() => renderList(s.value), 180)
        );
      const m = toursRoot.querySelector("#map-filter");
      if (m)
        m.addEventListener(
          "input",
          debounce(() => renderMap(m.value), 180)
        );
      const ask = toursRoot.querySelector("#nearby-ask");
      const refresh = toursRoot.querySelector("#nearby-refresh");
      const radius = toursRoot.querySelector("#nearby-radius");
      const watch = toursRoot.querySelector("#nearby-watch");
      if (ask) ask.addEventListener("click", () => askLocation(true));
      if (refresh)
        refresh.addEventListener("click", () => askLocation(true));
      if (radius)
        radius.addEventListener(
          "input",
          debounce(() => renderNearby(), 150)
        );
      if (watch) {
        watch.addEventListener("change", () => {
          if (watch.checked) {
            askLocation(false);
          } else if (geoWatchId != null) {
            navigator.geolocation.clearWatch(geoWatchId);
            geoWatchId = null;
          }
        });
      }
      toursRoot.querySelectorAll(".chip-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
          toursRoot
            .querySelectorAll(".chip-toggle")
            .forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          nearbyType = btn.getAttribute("data-type") || "all";
          renderNearby();
        });
      });
    }

    window.addEventListener("hashchange", () => {
      if (router.current() === "tours") applyRoute();
    });
    window.addEventListener("routechange", (e) => {
      if (e.detail.route === "tours") applyRoute();
    });

    (function init() {
      hookControls();
      if (router.current() === "tours") applyRoute();
    })();
  })();

  /* =========================
     FIREBASE + EmailJS INIT
     ========================= */
  const firebaseConfig = {
    apiKey: "AIzaSyBG62-fRpZj0q2bZI0APFuJ2l1CjdhNPTM",
    authDomain: "balatongo-c6705.firebaseapp.com",
    projectId: "balatongo-c6705",
    storageBucket: "balatongo-c6705.firebasestorage.app",
    messagingSenderId: "889044985423",
    appId: "1:889044985423:web:1b83358aea4cc466f42c3a",
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  let db = null;
  if (firebase.firestore) {
    db = firebase.firestore();
  }

  const EMAILJS_PUBLIC_KEY = "slEvbTBzwvLc3Gw5n";
  const EMAILJS_SERVICE_ID = "service_zq32bpd";
  const EMAILJS_TEMPLATE_ID = "template_m39i3gk";

  if (window.emailjs) {
    try {
      emailjs.init({
        publicKey: EMAILJS_PUBLIC_KEY,
      });
      console.log("EmailJS inicializálva.");
    } catch (e) {
      console.error("EmailJS init hiba:", e);
    }
  } else {
    console.warn(
      "EmailJS SDK nem töltődött be (window.emailjs undefined)."
    );
  }
window.translations = {
  hu: {
    // ===== MENÜ / HEADER =====
    "app.logo": "BalatonGo",
    "menu.title": "BalatonGo – Menü",
    "menu.subtitle": "Válassz funkciót vagy információt.",
    "menu.language.label": "Nyelv:",
    "menu.login": "Felhasználói belépés",
    "menu.favorites": "Kedvencek",
    "menu.contact": "Kapcsolat",
    "menu.terms": "ÁSZF",
    "menu.imprint": "Impresszum",
    "menu.privacy": "Adatkezelés",
    "menu.help": "Súgó",
    "menu.logout": "Kijelentkezés",
    "menu.pro": "Pro verzió",
    "menu.storm_guide": "Viharjelzés ismertető",
    "menu.trail_guide": "Túrajelzések ismertető",
    "menu.close": "Menü bezárása",
"login.title": "Felhasználói belépés",
"login.status.logged_out": "Nem vagy bejelentkezve. Új fiókhoz töltsd ki az összes mezőt.",
"login.status.logged_in": "Be vagy jelentkezve.",
    "login.email.placeholder": "E-mail cím",
"login.password.placeholder": "Jelszó (min. 6 karakter)",
"login.displayname.placeholder": "Megjelenített név (pl. Balázs)",
"login.submit": "Belépek / Regisztrálok",
"login.favorites.btn": "Kedvencek",
"login.settings.btn": "Beállítások",
"login.logout": "Kijelentkezés",
"btn.close": "Bezár",
    "favorites.placeholder.add_by_star":
  "Kedvencet a kártyák csillagával adhatsz hozzá.",
"favorites.hint": "Kedvencet a kártyák csillagával adhatsz hozzá.",
    "login.accept.prefix": "Kijelentem, hogy elolvastam és elfogadom az",
    "login.accept.aszf": "ÁSZF",
"login.accept.privacy": "Adatkezelési Tájékoztató",

"login.accept.middle": "-et és az",
"login.accept.suffix": ".",
"login.submit": "Belépek / Regisztrálok",
"favorites.title": "Kedvencek",
"favorites.intro": "Itt látod a saját kedvenceidet.",
"favorites.empty": "Még nincsenek kedvenceid.",
"favorites.info.logged_in": "Kedvencet a kártyák csillagával adhatsz hozzá.",
"login.settings.title": "Profil beállítások",
"login.settings.subtitle": "Válassz avatart magadnak:",
"login.settings.hint": "Az avatar csak a BalatonGo appban jelenik meg, és a böngésződben tároljuk.",
    "login.forgot": "Elfelejtetted a jelszavad?",
"login.forgot.title": "Jelszó visszaállítása",
"login.forgot.sub": "Add meg az e-mail címed, és küldünk egy jelszó-visszaállító linket.",
"login.forgot.send": "Küldés",
"login.forgot.sending": "Küldés folyamatban…",
"login.forgot.success": "Elküldtük a jelszó-visszaállító e-mailt. Nézd meg a bejövő levelek között (és a spam mappát is).",

"login.forgot.error.empty": "Kérlek add meg az e-mail címed.",
"login.forgot.error.invalid": "Kérlek érvényes e-mail címet adj meg.",
"login.forgot.error.user_not_found": "Ehhez az e-mail címhez nem tartozik felhasználói fiók.",
"login.forgot.error.too_many": "Túl sok próbálkozás. Kérlek várj egy kicsit, majd próbáld újra.",
"login.forgot.error.generic": "Hiba történt a jelszó-visszaállítás során. Kérlek próbáld meg később.",
    "btn.back": "Vissza",
"settings.title": "Profil beállítások",
"settings.choose_avatar": "Válassz avatart magadnak:",
"settings.avatar_note": "Az avatar csak a BalatonGo appban jelenik meg, és a böngésződben tároljuk.",
"help.title": "BalatonGo – Felhasználói kézikönyv",
"help.intro": "Üdvözlünk a BalatonGo alkalmazásban! Fedezd fel a Balaton környékét magabiztosan! Legyen szó időjárásról, közlekedésről vagy a legjobb túraútvonalakról, nálunk minden fontos információt és biztonsági tudnivalót egy helyen érsz el.",
"help.home.title": "Kezdőlap",
"help.home.text": "A főoldalról éred el az alkalmazás legfontosabb funkcióit:",
"help.home.item.weather": "Időjárás – aktuális állapot és előrejelzés",
"help.home.item.ferry": "Menetrend – komp- és hajóindulások",
"help.home.item.hikes": "Túrák – útvonalak, részletek, térkép és „Közelben”",

"help.weather.title": "Időjárás",
"help.weather.text": "Az időjárás menüpontban láthatod az aktuális hőmérsékletet, csapadékot, szélirányt és erősséget. A háttérkép színei a Balaton aktuális időjárásához igazodnak.",

"help.ferry.title": "Menetrend",
"help.ferry.text": "A menüpontban megtalálod a Bahart Zrt. komp- és hajójáratait. Az információk hivatalos forrásból származnak, de tájékoztató jellegűek.",
"help.ferry.tip": "Tipp: a szürkével jelölt sorok általában azt jelentik, hogy a járat épp nem közlekedik.",

"help.hikes.title": "Túraútvonalak",
"help.hikes.text": "Itt találod a gyalogos és kerékpáros túrákat, hosszuk és nehézségük szerint. A térképes nézet segít a tájékozódásban, a „Közelben” gomb pedig megmutatja a környékbeli útvonalakat. Itt találod a jegyinformációkat és az esetleges nyitvatartási időket is.",
"help.hikes.tip": "Tipp: a „engedélyezd a helymeghatározást, hogy a térkép valós időben mutassa a pozíciód!",

"help.menu.title": "Oldalsó menü",
"help.login.title": "Felhasználói belépés",
"help.login.text": "Bejelentkezés után a BalatonGo személyre szabható (pl. kedvencek), és a profilodhoz kapcsolódik.",
"help.login.delete": "Fióktörlés: ha szeretnéd törölni a fiókodat és a hozzá kapcsolódó adataidat, kérjük írj a balaton.go.info@gmail.com címre a regisztrált e-mail címeddel. A kérést a jogszabályoknak megfelelően feldolgozzuk.",

"help.favorites.title": "Kedvencek",
"help.favorites.text": "Elmentheted kedvenc helyeidet, túráidat és útvonalaidat. Bejelentkezett felhasználóként ezeket a saját fiókodhoz kapcsolhatod.",

"help.settings.title": "Beállítások",
"help.settings.text": "Itt válthatsz nyelvet, és beállíthatsz avatart. A beállítások az eszközödön tárolódnak.",

"help.safety.title": "Biztonság és jelzések",
"help.safety.text": "Itt találod a biztonsági tudnivalókat:",
"help.safety.trail": "Turistajelzések ismertető  – mit jelentenek a színek és formák az ösvényeken.",
"help.safety.storm": "Viharjelzés ismertető – hogyan ismerd fel a fokozatokat és a fényjelzéseket.",

"help.language.title": "Nyelv",
"help.language.text": "Választhatsz magyar, angol vagy német nyelvet. A szövegek automatikusan átállnak.",

"help.legal.title": "Jogi információk",
"help.legal.text": "Itt éred el az ÁSZF-et, az Adatkezelési tájékoztatót és az Impresszumot.",

"help.contact.title": "Kapcsolat",
"help.contact.text": "Kérdés vagy hibajelzés esetén írj a megadott e-mail címre.",

"help.outro.title": "Zárszó",
"help.outro.text": "A BalatonGo célja, hogy megbízható és barátságos segítőtársad legyen a Balaton felfedezésében. Kívánunk sok napsütést és tartalmas élményeket!",
 "pro.title": "Pro verzió",
"pro.text": "A jövőben elérhető lehet előfizetés alapú, reklámmentes, extra tartalmakat adó Pro verzió (pl. részletes útvonalak, exkluzív ajánlatok, offline térkép). A feltételek külön lesznek közzétéve, csak a bevezetéskor válnak érvényessé.",
"storm.title": "Viharjelzés ismertető",
"storm.intro": "A Balaton partján elhelyezett viharjelző tornyok villogó fényei segítenek megelőzni a baleseteket. A jelzések a szél erősségére és a várható időjárási veszélyre figyelmeztetnek. Akár fürdesz, horgászol, csónakázol vagy SUP-ozol, fontos, hogy tudd, mit látsz.",

"storm.levels.title": "A viharjelzés fokozatai",

"storm.level.none.title": "⚪ Nincs jelzés",
"storm.level.none.text": "A torony fénye nem villog. A szél gyenge (általában kb. 20 km/h alatt). A víz többnyire biztonságos: lehet úszni, csónakázni, SUP-ozni.",

"storm.level.one.title": "🟡 I. fok – Lassú villogás",
"storm.level.one.text": "A fény lassan villog. Erősödő szél és hullámzás várható (kb. 40 km/h körüli széllökésekkel). Csónakkal, SUP-pal vagy úszva maradj a part közelében, és figyeld a változásokat.",

"storm.level.two.title": "🔴 II. fok – Gyors villogás",
"storm.level.two.text": "A fény gyorsan villog. Viharos szél várható, 60 km/h feletti széllökésekkel. Tilos vízre menni! Minden fürdés, csónakázás és sporttevékenység fokozottan veszélyes.",

"storm.tips.title": "Mire figyelj?",
"storm.tip.1": "A viharjelzés az adott tómedencére érvényes akkor is, ha éppen nem látod a jelzőtornyot.",
"storm.tip.2": "A jelzés nappal és éjszaka is irányadó – sötétben is a villogó fényt kövesd.",
"storm.tip.3": "Erős szél a Balatonon nagyon gyorsan kialakulhat – ne várd meg a fekete felhőket.",
"storm.tip.4": "Ha bizonytalan vagy, mindig a biztonságosabb megoldást válaszd: inkább a part, mint a kockázat.",

"storm.balatongo.title": "BalatonGo tippek",
"storm.balatongo.tip1": "🌊 I. foknál se menj messzire: SUP-pal, matraccal vagy csónakkal maradj csak pár perces távolságra a parttól.",
"storm.balatongo.tip2": "⚡ II. foknál azonnal gyere ki a vízből, és segíts figyelmeztetni másokat is, ha nem követik a jelzéseket.",
"storm.balatongo.tip3": "👀 Ne csak az eget figyeld: ha a villogás felgyorsul, az egyértelmű jele annak, hogy baj közeleg.",

"btn.ok": "Rendben",
"trail.title": "Túrajelzések ismertető",
"trail.intro": "A Balaton körül sétálva vagy kerékpározva gyakran találkozhatsz színes turistajelzésekkel. Ezek a jelek mutatják, merre vezet az út, milyen célhoz jutsz el, és melyik útvonalon haladhatsz biztonságosan. A jelzések fehér alapra festett színes formák – ugyanúgy, ahogy az erdőben a fákon látod.",

"trail.colors.title": "A színek jelentése",
"trail.colors.text": "A színek nem a túra nehézségét jelzik, hanem az útvonal szerepét és jelentőségét.",

"trail.color.blue.title": "Kék – fő gerincútvonal",
"trail.color.blue.text": "Hosszú, fontos főútvonalak. Példa: az Országos Kéktúra Balaton környéki szakaszai.",

"trail.color.red.title": "Piros – kiemelt útvonal",
"trail.color.red.text": "Fontos regionális útvonalak, látványos pontokat és településeket kötnek össze.",

"trail.color.green.title": "Zöld – helyi túra",
"trail.color.green.text": "Rövidebb, helyi útvonalak, kilátókhoz, tanösvényekhez és könnyebb túrákhoz.",

"trail.color.yellow.title": "Sárga – összekötő út",
"trail.color.yellow.text": "Összekötő, leágazó vagy tematikus mellékutak és tanösvények.",

"trail.forms.title": "A jelzések formái",
"trail.forms.text": "A szín és a forma együtt mutatja meg, milyen útvonalon jársz, és milyen célhoz vezet.",

"trail.form.sav.title": "Sávjelzés",
"trail.form.sav.text": "Folyamatos fő turistaútvonal. Hosszabb, jól követhető gerinc- vagy főút.",

"trail.form.cross.title": "Kereszt",
"trail.form.cross.text": "Összekötő vagy rövidítő út két jelzett útvonal között.",

"trail.form.triangle.title": "Háromszög",
"trail.form.triangle.text": "Kilátóhoz, csúcshoz vagy panorámaponthoz vezető út.",

"trail.form.square.title": "Négyzet",
"trail.form.square.text": "Szálláshelyhez, kulcsosházhoz vagy menedékházhoz vezető út.",

"trail.form.circle.title": "Kör",
"trail.form.circle.text": "Forráshoz, kúthoz vagy ivóvízvételi helyhez vezető jelzés.",

"trail.form.omega.title": "Omega",
"trail.form.omega.text": "Barlanghoz vezető út jelzése.",

"trail.form.ruin.title": "Rom jel",
"trail.form.ruin.text": "Várromhoz, romokhoz vagy történelmi helyszínhez vezető út.",

"trail.form.loop.title": "Körséta / tanösvény",
"trail.form.loop.text": "Jelzett körtúra, amely ugyanoda tér vissza, ahonnan indultál.",

"trail.read.title": "Hogyan olvasd a jelzéseket?",
"trail.read.1": "Minden jelzés fehér alapra festett színes forma – mint az erdőben a fákon.",
"trail.read.2": "A szín az útvonal szerepét, a forma a célt mutatja.",
"trail.read.3": "Ha több jelzés van egymás mellett, ott elágazás, csomópont vagy közös szakasz található.",
"trail.read.4": "Az irányváltást eltolva festett jel vagy nyílra emlékeztető forma mutatja a fán vagy kövön.",
"trail.read.5": "Ha egy ideje nem látsz új jelzést, állj meg és térj vissza az utolsó biztos jelhez – lehet, hogy letértél.",
"trail.read.6": "Mindig a következő jelzést keresd, mielőtt letérnél az útról!",

"trail.tips.title": "BalatonGo tippek túrázóknak",
"trail.tip.1": "🌿 Maradj a jelzett úton – szőlőhegyen, magánterület közelében és védett területen ez különösen fontos.",
"trail.tip.2": "🧭 Ha eltűnnek a jelzések, térj vissza az utolsó biztos ponthoz – ne vágj át találomra az erdőn.",
"trail.tip.3": "💧 Nyáron mindig legyen nálad elegendő víz. A forrásjelzés segíthet, de az ihatóságot helyben ellenőrizd.",
"trail.tip.4": "⚡ Vihar esetén kerüld a hegytetőket, kilátókat és magányos fákat – menj lejjebb, védettebb helyre.",
"trail.tip.5": "📱 A BalatonGo célja, hogy a térképen látott útvonalakat összekapcsolja a terepen látott jelzésekkel.",
"contact.name.placeholder": "Név (nem kötelező)",
"contact.email.placeholder": "E-mail cím (ajánlott)",
"contact.message.placeholder": "Üzeneted...",
"contact.title": "Kapcsolat",
"contact.intro": "Kérdésed, észrevételed vagy javaslatod van a BalatonGo-val kapcsolatban? Írj nekünk.",
"btn.cancel": "Mégse",
"contact.submit": "Üzenet küldése",
"menu.legal.note": "A jogi linkek külön, hivatalos oldalon nyílnak meg.",

    // ===== FŐOLDAL / HERO =====
    "home.subtitle": "Fedezd fel a Balaton rejtett szépségeit",
    "home.card.weather": "🌅 Időjárás",
    "home.card.schedule": "🚢 Hajómenetrend",
    "home.card.tours": "🚴 Túraútvonalak",

    // ===== IDŐJÁRÁS OLDAL =====
    "weather.title": "Időjárás kereső",
    "weather.placeholder": "Merre kirándulunk ma?",
    "weather.go": "Induljunk! 🚲",
    "weather.start": "Írd be a város nevét!",
        "weather.back": "← Vissza",

    // ===== IDŐJÁRÁS LOGIKA =====
    "weather.placeholder.enter_city": "Írj be egy várost!",
    "weather.placeholder.idle": "Írd be a város nevét!",
    "weather.fetching": "Lekérés folyamatban...",
    "weather.no_forecast": "Nem található előrejelzés ehhez a helyhez.",
    "weather.error_fetch": "Nem sikerült lekérni az adatokat.",
    "weather.next_hours_title": "Következő órák előrejelzése:",
    "weather.storm_warning":
      "⛈️ Figyelem, a következő órákban zivatar előfordulhat. Indulás előtt nézd meg az aktuális riasztásokat!",
    "weather.label.wind": "Szél",
    "weather.label.rain_chance": "Eső esélye",
"weather.desc.clear": "tiszta égbolt",
"weather.desc.clouds": "felhős",
"weather.desc.rain": "eső",
"weather.desc.drizzle": "szitálás",
"weather.desc.snow": "havazás",
"weather.desc.thunderstorm": "zivatar",
    "weather.wind.N": "É",
    "weather.wind.NE": "ÉK",
    "weather.wind.E": "K",
    "weather.wind.SE": "DK",
    "weather.wind.S": "D",
    "weather.wind.SW": "DNY",
    "weather.wind.W": "NY",
    "weather.wind.NW": "ÉNY",

    // ===== MENETREND / HAJÓMENETREND =====
    "schedule.title": "Menetrend kereső",
    "schedule.label.from": "Honnan:",
    "schedule.label.to": "Hová:",
    "schedule.label.date": "Dátum:",
    "schedule.today": "Ma",
    "schedule.tomorrow": "Holnap",
    "schedule.search": "🔎 Keresés",
    "schedule.hint":
      "ℹ️ Sétahajó esetén a kiindulási pont és az érkezési pont ugyanaz.",
    "schedule.selectFrom": "Válassz kiindulási kikötőt",
    "schedule.selectTo": "Válassz érkezési kikötőt",
    "schedule.missingInputs":
      "Válassz indulási pontot és dátumot – segítek megtalálni a következő járatot.",
    "schedule.noResults": "Nincs találat erre az útvonalra.",
    "schedule.type.regular": "Menetrendi hajó",
    "schedule.type.cruise": "Sétahajó",
    "schedule.loading": "Betöltés…",
    "schedule.error_load": "Nem sikerült betölteni a menetrendi adatokat.",
    "schedule.minutes": "perc",
    "schedule.hours": "óra",
    "schedule.source":
      "Az adatok a Bahart Zrt. hivatalos szolgáltatásából származnak.",
    "schedule.seasonal": "ℹ️ A hajómenetrend szezonális. A téli időszakban általában nincs menetrend szerinti hajóforgalom a Balatonon.",

        // ===== EGYÉB =====
    "generic.back": "Vissza",
    "footer.copy": "© 2025 BalatonGo",

    "title_home": "Túraútvonalak",
    "tours.search.placeholder": "Írj be települést vagy útvonalnevet…",
    "tours.search.hint": "Tipp: „Zamárdi”, „Szent György-hegy” – azonnal szűr 🤸‍♀️",
    "tours.search.aria": "Keresés",
    "tours.search.title": "Keresés",
    "tours.list.details": "Részletek",
"tours.detail.intro": "Leírás",
"tours.home.srtitle": "Kezdőlap",
"tours.home.lead": "Válaszd ki, hogyan indulnál neki:",
"tours.home.card.search.title": "Keresés",
"tours.home.card.search.desc": "Írj be települést vagy útvonalat",
"tours.home.card.map.title": "Térképen",
"tours.home.card.map.desc": "Nézd meg a pontokat térképen",
"tours.map.popup.details": "Részletek",
"tours.map.popup.fav": "Kedvenc",
"chip.poi": "POI",
"chip.romvar": "Rom/Vár",
"chip.szoboremlekhely": "Szobor/Emlékhely",
"chip.forras": "Forrás",
"chip.parksétany": "Park/Sétány",
"chip.muzeum": "Múzeum",
"chip.kilato": "Kilátó",
"chip.barlang": "Barlang",
"chip.arboretum": "Arborétum",
"chip.szikla": "Szikla",
"chip.tanosveny": "Tanösvény",
"chip.hid": "Híd",
"chip.kilatopont": "Kilátópont",
"chip.parksétany": "Park/Sétány",
  "chip.parksétány": "Park/Sétány",
    "tours.detail.opening": "Nyitvatartás",
"tours.detail.ticket": "Jegyinformáció",
"chip.belepos": "Belépős",
"chip.poi": "POI",
"chip.tura": "Túra",

"tours.home.card.nearby.title": "A közelben",
"tours.home.card.nearby.desc": "Mutasd a közeli helyeket",
"tours.map.counter": "{n} pont",
"tours.unknown_place": "Ismeretlen hely",
"tours.nearby.ask": "Engedélyezem a helyzetmeghatározást",
"tours.nearby.refresh": "Újbóli helymeghatározás",
"tours.nearby.live": "Élő követés",

    "sub_home": "",
    "title_search": "Keresés",
    "sub_search": "",
    "sub_map": "",
    "sub_nearby": "",
    "title_map": "Térképen",
    "tours.map.srtitle": "Térképes nézet",
    "tours.map.filter.placeholder": "Szűrés a térképen (pl. település, név)…",
    "title_nearby": "A közelben",
    "tours.nearby.radius": "Sugár:",
"units.km": "km",
"tours.nearby.counter": "{n} pont",
"tours.nearby.need_permission": "Kattints az „Engedélyezem a helyzetmeghatározást” gombra!",
"tours.nearby.counter": "{n} pont",
"tours.nearby.no_points": "A megadott sugáron belül nincs koordinátás pont.",
"tours.nearby.walk": "Gyalog",
"tours.nearby.bike": "Bringával",
"menu.storm": "Viharjelzés ismertető",
"menu.trail": "Túrajelzések ismertető",
"menu.legal": "Jogi információk",

  },

  en: {
    "app.logo": "BalatonGo",
    "menu.title": "BalatonGo – Menu",
    "menu.subtitle": "Choose a function or information.",
    "menu.language.label": "Language:",
    "menu.login": "User login",
    "menu.favorites": "Favorites",
    "menu.contact": "Contact",
    "menu.terms": "Terms of Service",
    "menu.imprint": "Imprint",
    "menu.privacy": "Privacy Policy",
    "menu.help": "Help",
    "menu.logout": "Log out",
    "login.submit": "Sign in / Register",
    "menu.pro": "Pro version",
    "menu.storm_guide": "Storm warning guide",
    "menu.trail_guide": "Trail markings guide",
    "menu.close": "Close menu",
"login.title": "User login",
"login.status.logged_out": "You are not logged in. To create a new account, fill in all fields.",
"login.status.logged_in": "You are logged in.",
    "login.email.placeholder": "Email address",
"login.password.placeholder": "Password (min. 6 characters)",
"login.displayname.placeholder": "Display name (e.g. Alex)",
"login.submit": "Log in / Sign up",
    "login.accept.prefix": "I declare that I have read and accept the",
"login.accept.middle": "and the",
"login.accept.suffix": ".",
"login.accept.aszf": "Terms of Service",
"login.accept.privacy": "Privacy Policy",

"login.favorites.btn": "Favorites",
"login.settings.btn": "Settings",
"login.logout": "Log out",
"btn.close": "Close",
    "login.forgot": "Forgot your password?",
"login.forgot.title": "Reset password",
"login.forgot.sub": "Enter your email address and we will send you a password reset link.",
"login.forgot.send": "Send",
"login.forgot.sending": "Sending…",
"login.forgot.success": "We’ve sent you a password reset email. Please check your inbox (and spam folder).",

"login.forgot.error.empty": "Please enter your email address.",
"login.forgot.error.invalid": "Please enter a valid email address.",
"login.forgot.error.user_not_found": "No account is associated with this email address.",
"login.forgot.error.too_many": "Too many attempts. Please wait a moment and try again.",
"login.forgot.error.generic": "Something went wrong. Please try again later.",
"btn.back": "Back",

"favorites.placeholder.add_by_star":
  "Add favorites by tapping the star on the cards.",
"favorites.title": "Favorites",
"favorites.intro": "Here you can see your favorites.",
"favorites.empty": "You don't have any favorites yet.",
"favorites.info.logged_in": "Add favorites by tapping the star on the cards.",
"login.settings.title": "Profile settings",
"login.settings.subtitle": "Choose an avatar:",
"login.settings.hint": "The avatar is only shown in the BalatonGo app and is stored in your browser.",
"settings.title": "Profile settings",
"settings.choose_avatar": "Choose an avatar:",
"settings.avatar_note": "The avatar is only shown in the BalatonGo app and is stored in your browser.",
"favorites.hint": "Add favorites by tapping the star on the cards.",
"help.title": "BalatonGo – User Guide",
"help.intro": "Welcome to the BalatonGo app! Explore the Lake Balaton region with confidence. Whether you need weather updates, transport information, or the best hiking routes, you’ll find all essential information and safety guidance in one place.",

"help.home.title": "Home",
"help.home.text": "From the home screen you can access the most important features of the app:",
"help.home.item.weather": "Weather – current conditions and forecast",
"help.home.item.ferry": "Timetable – ferry and boat departures",
"help.home.item.hikes": "Hikes – routes, details, map and “Nearby”",

"help.weather.title": "Weather",
"help.weather.text": "In the Weather section you can see the current temperature, precipitation, wind direction and strength. The background visuals adapt to the current weather conditions around Lake Balaton.",

"help.ferry.title": "Timetable",
"help.ferry.text": "Here you can find ferry and boat services operated by Bahart Zrt. The information comes from official sources but is provided for informational purposes only.",
"help.ferry.tip": "Tip: rows shown in grey usually indicate that the service is currently not operating.",
"schedule.seasonal": "ℹ️ The boat schedule is seasonal. During the winter period, regular passenger services on Lake Balaton are generally not available.",

"help.hikes.title": "Hiking routes",
"help.hikes.text": "Here you can browse walking and cycling routes by length and difficulty. The map view helps with orientation, while the “Nearby” button shows routes close to your current location. Ticket information and opening hours are also displayed where available.",
"help.hikes.tip": "Tip: enable location access so the map can show your position in real time!",

"help.menu.title": "Side menu",
"help.login.title": "User login",
"help.login.text": "After logging in, BalatonGo can be personalized (e.g. favorites) and linked to your user profile.",
"help.login.delete": "Account deletion: if you would like to delete your account and the related data, please send an email to balaton.go.info@gmail.com from your registered email address. Your request will be processed in accordance with applicable laws.",

"help.favorites.title": "Favorites",
"help.favorites.text": "You can save your favorite places, hikes and routes. When logged in, these are linked to your personal account.",

"help.settings.title": "Settings",
"help.settings.text": "Here you can change the language and choose an avatar. Settings are stored locally on your device.",

"help.safety.title": "Safety and signs",
"help.safety.text": "Here you will find important safety information:",
"help.safety.trail": "Trail markings guide – explanation of colors and symbols used on hiking trails.",
"help.safety.storm": "Storm warning guide – how to recognize alert levels and light signals.",

"help.language.title": "Language",
"help.language.text": "You can choose Hungarian, English or German. All texts will update automatically.",

"help.legal.title": "Legal information",
"help.legal.text": "Here you can access the Terms of Service, Privacy Policy and Imprint.",

"help.contact.title": "Contact",
"help.contact.text": "If you have questions or want to report an issue, please write to the provided email address.",

"help.outro.title": "Closing words",
"help.outro.text": "The goal of BalatonGo is to be a reliable and friendly companion while exploring Lake Balaton. We wish you plenty of sunshine and memorable experiences!",
"pro.title": "Pro version",
"pro.text": "In the future, a subscription-based, ad-free Pro version may be available, offering extra features (e.g. detailed routes, exclusive recommendations, offline map). The terms will be published separately and will only apply upon launch.",
"storm.title": "Storm warning guide",
"storm.intro": "Storm-warning towers along Lake Balaton use flashing lights to help prevent accidents. The signals warn about wind strength and expected weather danger. Whether you’re swimming, fishing, boating or SUP paddling, it’s important to know what you’re seeing.",

"storm.levels.title": "Storm warning levels",

"storm.level.none.title": "⚪ No signal",
"storm.level.none.text": "The tower light does not flash. The wind is weak (typically below about 20 km/h). The water is generally safe: swimming, boating and SUP are allowed.",

"storm.level.one.title": "🟡 Level I – Slow flashing",
"storm.level.one.text": "The light flashes slowly (shown here with a slower blink). Increasing wind and waves are expected (gusts around about 40 km/h). If you’re boating, SUP paddling or swimming, stay close to shore and watch for changes.",

"storm.level.two.title": "🔴 Level II – Fast flashing",
"storm.level.two.text": "The light flashes rapidly (shown here with a faster blink). Stormy wind is expected, with gusts above 60 km/h. Do not go on the water! Swimming, boating and sports activities become highly dangerous.",

"storm.tips.title": "What to watch for",
"storm.tip.1": "The storm warning applies to the given basin of the lake even if you can’t see the tower.",
"storm.tip.2": "The signal is valid day and night — in the dark, follow the light.",
"storm.tip.3": "Strong wind can form very quickly on Lake Balaton — don’t wait for black clouds.",
"storm.tip.4": "If you’re unsure, always choose the safer option: shore over risk.",

"storm.balatongo.title": "BalatonGo tips",
"storm.balatongo.tip1": "🌊 Even at Level I, don’t go far: with SUP, an air mattress or a boat, stay only a few minutes from shore.",
"storm.balatongo.tip2": "⚡ At Level II, get out of the water and help warn others if they’re not watching the signals.",
"storm.balatongo.tip3": "👀 Don’t watch only the sky: if the flashing becomes faster, it’s a clear sign trouble may be coming.",

"btn.ok": "OK",
"trail.title": "Trail markings guide",
"trail.intro": "While walking or cycling around Lake Balaton, you will often see colorful trail markings. These signs show where the path leads, what destination it reaches, and which route you can safely follow. The markings are colored shapes painted on a white background – just like those you see on trees in forests.",

"trail.colors.title": "Meaning of the colors",
"trail.colors.text": "The colors do not indicate difficulty, but rather the role and importance of the route.",

"trail.color.blue.title": "Blue – main long-distance route",
"trail.color.blue.text": "Long, important main routes. Example: sections of the National Blue Trail around Lake Balaton.",

"trail.color.red.title": "Red – major route",
"trail.color.red.text": "Important regional routes connecting scenic spots and settlements.",

"trail.color.green.title": "Green – local hike",
"trail.color.green.text": "Shorter local routes leading to lookouts, nature trails, and easier hikes.",

"trail.color.yellow.title": "Yellow – connector route",
"trail.color.yellow.text": "Connecting, branching, or thematic side routes and nature trails.",

"trail.forms.title": "Trail marking shapes",
"trail.forms.text": "The combination of color and shape tells you what kind of route you are on and what destination it leads to.",

"trail.form.sav.title": "Stripe",
"trail.form.sav.text": "Continuous main hiking route. Longer, well-marked backbone route.",

"trail.form.cross.title": "Cross",
"trail.form.cross.text": "Connector or shortcut between two marked routes.",

"trail.form.triangle.title": "Triangle",
"trail.form.triangle.text": "Route leading to a lookout, peak, or panoramic point.",

"trail.form.square.title": "Square",
"trail.form.square.text": "Route leading to accommodation, a hut, or shelter.",

"trail.form.circle.title": "Circle",
"trail.form.circle.text": "Route leading to a spring, well, or drinking water source.",

"trail.form.omega.title": "Omega",
"trail.form.omega.text": "Route leading to a cave.",

"trail.form.ruin.title": "Ruin symbol",
"trail.form.ruin.text": "Route leading to castle ruins, ruins, or historical sites.",

"trail.form.loop.title": "Loop trail / nature trail",
"trail.form.loop.text": "Marked circular route that returns to the starting point.",

"trail.read.title": "How to read the markings",
"trail.read.1": "Each marking is a colored shape painted on a white background, like those on trees in forests.",
"trail.read.2": "The color shows the route’s role, the shape shows the destination.",
"trail.read.3": "Multiple markings together indicate a junction, intersection, or shared section.",
"trail.read.4": "Direction changes are shown by offset markings or arrow-like paint on trees or stones.",
"trail.read.5": "If you haven’t seen a marking for a while, stop and return to the last confirmed one – you may have left the route.",
"trail.read.6": "Always look for the next marking before leaving the path!",

"trail.tips.title": "BalatonGo tips for hikers",
"trail.tip.1": "🌿 Stay on marked paths – especially important near vineyards, private land, and protected areas.",
"trail.tip.2": "🧭 If markings disappear, go back to the last confirmed one – don’t cut across the forest randomly.",
"trail.tip.3": "💧 Always carry enough water in summer. Spring markings can help, but check water safety locally.",
"trail.tip.4": "⚡ During storms, avoid ridges, lookouts, and solitary trees – move to lower, sheltered areas.",
"trail.tip.5": "📱 BalatonGo helps you connect routes on the map with markings you see in the field.",
"contact.name.placeholder": "Name (optional)",
"contact.email.placeholder": "Email address (recommended)",
"contact.message.placeholder": "Your message...",
"contact.title": "Contact",
"contact.intro": "Do you have a question, feedback or a suggestion about BalatonGo? Write to us.",
"btn.cancel": "Cancel",
"contact.submit": "Send message",
"menu.legal.note": "Legal links open on a separate official website.",

    "home.subtitle": "Discover Lake Balaton’s hidden beauties",
    "home.card.weather": "🌅 Weather",
    "home.card.schedule": "🚢 Ferry timetable",
    "home.card.tours": "🚴 Hiking & tours",
    "weather.title": "Weather search",
    "weather.placeholder": "Where are we heading today?",
    "weather.go": "Let’s go! 🚲",
    "weather.start": "Type the city name!",
    "weather.back": "← Back",

    "weather.placeholder.enter_city": "Enter a city!",
    "weather.placeholder.idle": "Type the name of the city!",
    "weather.fetching": "Fetching forecast...",
    "weather.no_forecast": "No forecast available for this location.",
    "weather.error_fetch": "Could not fetch weather data.",
    "weather.next_hours_title": "Forecast for the next hours:",
    "weather.storm_warning":
      "⛈️ Warning: thunderstorms possible in the next hours. Please check the latest alerts before you go!",
    "weather.label.wind": "Wind",
    "weather.label.rain_chance": "Rain chance",
"weather.desc.clear": "clear sky",
"weather.desc.clouds": "cloudy",
"weather.desc.rain": "rain",
"weather.desc.drizzle": "drizzle",
"weather.desc.snow": "snow",
"weather.desc.thunderstorm": "thunderstorm",
    "weather.wind.N": "N",
    "weather.wind.NE": "NE",
    "weather.wind.E": "E",
    "weather.wind.SE": "SE",
    "weather.wind.S": "S",
    "weather.wind.SW": "SW",
    "weather.wind.W": "W",
    "weather.wind.NW": "NW",

    "schedule.title": "Timetable search",
    "schedule.label.from": "From:",
    "schedule.label.to": "To:",
    "schedule.label.date": "Date:",
    "schedule.today": "Today",
    "schedule.tomorrow": "Tomorrow",
    "schedule.search": "🔎 Search",
    "schedule.hint":
      "ℹ️ For cruise boats the departure and arrival port are the same.",
    "schedule.selectFrom": "Choose a departure port",
    "schedule.selectTo": "Choose an arrival port",
    "schedule.missingInputs":
      "Choose departure port and date – I’ll help you find the next departure.",
    "schedule.noResults": "No sailings found for this route.",
    "schedule.type.regular": "Scheduled boat",
    "schedule.type.cruise": "Cruise boat",
    "schedule.loading": "Loading…",
    "schedule.error_load": "Could not load timetable data.",
    "schedule.minutes": "minutes",
    "schedule.hours": "hours",
    "schedule.source": "Data comes from the official service of Bahart Zrt.",

    "generic.back": "Back",
    "footer.copy": "© 2025 BalatonGo",

    "title_home": "Tours",
    "tours.search.placeholder": "Type a town or route name…",
    "tours.search.hint": "Tip: “Zamárdi”, “Szent György Hill” – filters instantly 🤸‍♀️",
    "tours.list.details": "Details",
"tours.detail.intro": "Description",
    "tours.search.aria": "Search",
    "tours.search.title": "Search",
"tours.home.srtitle": "Home",
"tours.home.lead": "Choose how you’d like to start:",
"tours.unknown_place": "Unknown place",
"chip.poi": "POI",
"chip.romvar": "Castle/Ruins",
"chip.szoboremlekhely": "Statue/Memorial",
"chip.forras": "Spring",
"chip.parksétany": "Park/Promenade",
"chip.muzeum": "Museum",
"chip.kilato": "Lookout",
"chip.barlang": "Cave",
"chip.arboretum": "Arboretum",
"chip.szikla": "Rock",
"chip.tanosveny": "Nature trail",
"chip.hid": "Bridge",
"chip.kilatopont": "Lookout point",
"chip.parksétany": "Park / Walkway",
  "chip.parksétány": "Park / Walkway",
"tours.home.card.search.title": "Search",
"tours.home.card.search.desc": "Type a town or route name",
"tours.map.popup.details": "Details",
"tours.map.popup.fav": "Favorite",
"tours.detail.opening": "Opening hours",
"tours.detail.ticket": "Ticket info",
"chip.belepos": "Ticketed",
"chip.poi": "POI",
"chip.tura": "Tour",

"tours.home.card.map.title": "On map",
    "tours.map.srtitle": "Map view",
"tours.home.card.map.desc": "View points on the map",
"tours.map.filter.placeholder": "Filter on the map (e.g. town, name)…",
"tours.home.card.nearby.title": "Nearby",
"tours.home.card.nearby.desc": "Show nearby places",
"tours.map.counter": "{n} points",
"tours.nearby.ask": "Enable location access",
"tours.nearby.refresh": "Refresh location",
"tours.nearby.live": "Live tracking",

    "sub_home": "",
    "title_search": "Search",
    "sub_search": "",
    "sub_map": "",
    "sub_nearby": "",
    "title_map": "On map",
    "title_nearby": "Nearby",
    "tours.nearby.radius": "Radius:",
"units.km": "km",
"tours.nearby.counter": "{n} points",
"tours.nearby.need_permission": "Tap “Enable location access” to show nearby places.",
"tours.nearby.counter": "{n} points",
"tours.nearby.no_points": "There are no places with coordinates within the selected radius.",
"tours.nearby.walk": "Walking",
"tours.nearby.bike": "By bike",
"menu.storm": "Storm warning guide",
"menu.trail": "Trail markings guide",
"menu.legal": "Legal",

  },

  de: {
    "app.logo": "BalatonGo",
    "menu.title": "BalatonGo – Menü",
    "menu.subtitle": "Wähle eine Funktion oder Information.",
    "menu.language.label": "Sprache:",
    "menu.login": "Benutzeranmeldung",
    "menu.favorites": "Favoriten",
    "menu.contact": "Kontakt",
    "menu.terms": "AGB",
    "menu.imprint": "Impressum",
    "menu.privacy": "Datenschutz",
    "menu.help": "Hilfe",
    "menu.logout": "Abmelden",
    "menu.pro": "Pro-Version",
    "menu.storm_guide": "Sturmwarnungen – Info",
    "menu.trail_guide": "Wegmarkierungen – Info",
    "menu.close": "Menü schließen",
"login.title": "Benutzeranmeldung",
"login.status.logged_out": "Du bist nicht angemeldet. Für ein neues Konto fülle alle Felder aus.",
    "login.email.placeholder": "E-Mail-Adresse",
"login.password.placeholder": "Passwort (mind. 6 Zeichen)",
"login.displayname.placeholder": "Anzeigename (z. B. Alex)",
"login.submit": "Anmelden / Registrieren",
"login.status.logged_in": "Du bist angemeldet.",
    "login.submit": "Anmelden / Registrieren",
    "login.accept.prefix": "Ich erkläre, dass ich die",
"login.accept.middle": "und die",
"login.accept.suffix": ".",
"login.accept.aszf": "AGB",
"login.accept.privacy": "Datenschutzerklärung",

"login.favorites.btn": "Favoriten",
"login.settings.btn": "Einstellungen",
"login.logout": "Abmelden",
"btn.close": "Schließen",
"favorites.info.logged_in": "Füge Favoriten über den Stern auf den Karten hinzu.",
"login.settings.title": "Profileinstellungen",
"login.settings.subtitle": "Wähle einen Avatar:",
"login.settings.hint": "Der Avatar wird nur in der BalatonGo-App angezeigt und in deinem Browser gespeichert.",
    "login.forgot": "Passwort vergessen?",
"login.forgot.title": "Passwort zurücksetzen",
"login.forgot.sub": "Gib deine E-Mail-Adresse ein, und wir senden dir einen Link zum Zurücksetzen des Passworts.",
"login.forgot.send": "Senden",
"login.forgot.sending": "Wird gesendet…",
"login.forgot.success": "Wir haben dir eine E-Mail zum Zurücksetzen des Passworts gesendet. Bitte prüfe auch den Spam-Ordner.",

"login.forgot.error.empty": "Bitte gib deine E-Mail-Adresse ein.",
"login.forgot.error.invalid": "Bitte gib eine gültige E-Mail-Adresse ein.",
"login.forgot.error.user_not_found": "Zu dieser E-Mail-Adresse gibt es kein Benutzerkonto.",
"login.forgot.error.too_many": "Zu viele Versuche. Bitte warte kurz und versuche es erneut.",
"login.forgot.error.generic": "Etwas ist schiefgelaufen. Bitte versuche es später erneut.",
"btn.back": "Zurück",

"favorites.title": "Favoriten",
"favorites.intro": "Hier siehst du deine Favoriten.",
"favorites.empty": "Du hast noch keine Favoriten.",
"favorites.placeholder.add_by_star":
  "Füge Favoriten hinzu, indem du auf den Stern auf den Karten tippst.",
"settings.title": "Profileinstellungen",
"settings.choose_avatar": "Wähle einen Avatar:",
"settings.avatar_note": "Der Avatar wird nur in der BalatonGo-App angezeigt und in deinem Browser gespeichert.",
"favorites.hint": "Füge Favoriten hinzu, indem du auf den Stern auf den Karten tippst.",
"help.title": "BalatonGo – Benutzerhandbuch",
"help.intro": "Willkommen in der BalatonGo App! Entdecke die Region rund um den Balaton sicher und entspannt. Ob Wetter, Verkehr oder die besten Wanderrouten – hier findest du alle wichtigen Informationen und Sicherheitshinweise an einem Ort.",

"help.home.title": "Startseite",
"help.home.text": "Von der Startseite aus erreichst du die wichtigsten Funktionen der App:",
"help.home.item.weather": "Wetter – aktuelle Bedingungen und Vorhersage",
"help.home.item.ferry": "Fahrplan – Fähr- und Schiffsabfahrten",
"help.home.item.hikes": "Touren – Routen, Details, Karte und „In der Nähe“",

"help.weather.title": "Wetter",
"help.weather.text": "Im Wetterbereich siehst du die aktuelle Temperatur, Niederschlag sowie Windrichtung und -stärke. Die Hintergrunddarstellung passt sich dem aktuellen Wetter am Balaton an.",

"help.ferry.title": "Fahrplan",
"help.ferry.text": "Hier findest du die Fähr- und Schiffsverbindungen der Bahart Zrt. Die Angaben stammen aus offiziellen Quellen, dienen jedoch nur zur Orientierung.",
"help.ferry.tip": "Tipp: grau dargestellte Zeilen bedeuten in der Regel, dass die Verbindung derzeit nicht verkehrt.",

"help.hikes.title": "Wanderrouten",
"help.hikes.text": "Hier findest du Wander- und Radrouten nach Länge und Schwierigkeitsgrad sortiert. Die Kartenansicht hilft bei der Orientierung, während die Schaltfläche „In der Nähe“ Routen in deiner Umgebung anzeigt. Ticketinformationen und eventuelle Öffnungszeiten werden ebenfalls angezeigt.",
"help.hikes.tip": "Tipp: Aktiviere die Standortfreigabe, damit die Karte deine Position in Echtzeit anzeigen kann!",

"help.menu.title": "Seitenmenü",
"help.login.title": "Benutzeranmeldung",
"help.login.text": "Nach der Anmeldung kann BalatonGo personalisiert werden (z. B. Favoriten) und mit deinem Benutzerprofil verknüpft werden.",

"help.favorites.title": "Favoriten",
"help.favorites.text": "Du kannst deine Lieblingsorte, Touren und Routen speichern. Angemeldet werden diese mit deinem persönlichen Konto verknüpft.",
"help.login.delete": "Kontolöschung: Wenn Sie Ihr Benutzerkonto und die dazugehörigen Daten löschen möchten, senden Sie bitte eine E-Mail von Ihrer registrierten E-Mail-Adresse an balaton.go.info@gmail.com. Ihre Anfrage wird gemäß den geltenden gesetzlichen Vorschriften bearbeitet.",

"help.settings.title": "Einstellungen",
"help.settings.text": "Hier kannst du die Sprache ändern und einen Avatar auswählen. Die Einstellungen werden lokal auf deinem Gerät gespeichert.",

"help.safety.title": "Sicherheit und Markierungen",
"help.safety.text": "Hier findest du wichtige Sicherheitshinweise:",
"help.safety.trail": "Wegemarkierungen – Erklärung der Farben und Symbole auf Wanderwegen.",
"help.safety.storm": "Sturmwarnsystem – wie man Warnstufen und Lichtsignale erkennt.",

"help.language.title": "Sprache",
"help.language.text": "Du kannst zwischen Ungarisch, Englisch und Deutsch wählen. Die Texte werden automatisch umgestellt.",

"help.legal.title": "Rechtliche Hinweise",
"help.legal.text": "Hier findest du die AGB, die Datenschutzerklärung und das Impressum.",

"help.contact.title": "Kontakt",
"help.contact.text": "Bei Fragen oder Fehlermeldungen schreibe bitte an die angegebene E-Mail-Adresse.",

"help.outro.title": "Schlusswort",
"help.outro.text": "BalatonGo möchte dein zuverlässiger und freundlicher Begleiter bei der Erkundung des Balaton sein. Wir wünschen dir viel Sonnenschein und unvergessliche Erlebnisse!",
"pro.title": "Pro-Version",
"pro.text": "In Zukunft könnte eine abonnementbasierte, werbefreie Pro-Version verfügbar sein, die zusätzliche Inhalte bietet (z. B. detaillierte Routen, exklusive Empfehlungen, Offline-Karte). Die Bedingungen werden separat veröffentlicht und gelten erst bei Einführung.",
"storm.title": "Sturmwarnung – Info",
"storm.intro": "Sturmwarnanlagen am Balaton nutzen blinkende Lichter, um Unfälle zu verhindern. Die Signale warnen vor Windstärke und erwarteten Wettergefahren. Egal ob du schwimmst, angelst, bootest oder SUP fährst – es ist wichtig zu wissen, was du siehst.",

"storm.levels.title": "Warnstufen",

"storm.level.none.title": "⚪ Keine Warnung",
"storm.level.none.text": "Das Licht blinkt nicht. Der Wind ist schwach (meist unter ca. 20 km/h). Das Wasser ist in der Regel sicher: Schwimmen, Bootfahren und SUP sind möglich.",

"storm.level.one.title": "🟡 Stufe I – Langsames Blinken",
"storm.level.one.text": "Das Licht blinkt langsam (hier durch langsameres Blinken dargestellt). Zunehmender Wind und Wellengang sind zu erwarten (Böen um ca. 40 km/h). Mit Boot, SUP oder beim Schwimmen bleibe in Ufernähe und beobachte die Entwicklung.",

"storm.level.two.title": "🔴 Stufe II – Schnelles Blinken",
"storm.level.two.text": "Das Licht blinkt schnell (hier durch schnelleres Blinken dargestellt). Sturmischer Wind mit Böen über 60 km/h ist zu erwarten. Nicht aufs Wasser gehen! Baden, Bootfahren und Sportaktivitäten sind besonders gefährlich.",

"storm.tips.title": "Worauf achten?",
"storm.tip.1": "Die Sturmwarnung gilt für das jeweilige Seebecken – auch wenn du den Turm gerade nicht sehen kannst.",
"storm.tip.2": "Das Signal gilt tagsüber und nachts – im Dunkeln orientiere dich am Licht.",
"storm.tip.3": "Starker Wind kann am Balaton sehr schnell entstehen – warte nicht auf dunkle Wolken.",
"storm.tip.4": "Wenn du unsicher bist, entscheide dich immer für Sicherheit: lieber ans Ufer als Risiko.",

"storm.balatongo.title": "BalatonGo-Tipps",
"storm.balatongo.tip1": "🌊 Auch bei Stufe I nicht weit raus: Mit SUP, Luftmatratze oder Boot bleibe nur wenige Minuten vom Ufer entfernt.",
"storm.balatongo.tip2": "⚡ Bei Stufe II raus aus dem Wasser – und hilf, auch andere zu warnen, wenn sie nicht auf die Signale achten.",
"storm.balatongo.tip3": "👀 Schau nicht nur in den Himmel: Wenn das Blinken schneller wird, ist das ein klares Warnzeichen.",

"btn.ok": "OK",
"trail.title": "Wanderweg-Markierungen",
"trail.intro": "Beim Wandern oder Radfahren rund um den Balaton triffst du häufig auf farbige Wanderweg-Markierungen. Diese zeigen, wohin der Weg führt, welches Ziel erreicht wird und welche Route du sicher nutzen kannst. Die Markierungen sind farbige Formen auf weißem Grund – genauso wie an Bäumen im Wald.",

"trail.colors.title": "Bedeutung der Farben",
"trail.colors.text": "Die Farben zeigen nicht den Schwierigkeitsgrad, sondern die Rolle und Bedeutung der Route.",

"trail.color.blue.title": "Blau – Hauptfernroute",
"trail.color.blue.text": "Lange, wichtige Hauptrouten. Beispiel: Abschnitte der Nationalen Blauen Route am Balaton.",

"trail.color.red.title": "Rot – wichtige Route",
"trail.color.red.text": "Wichtige regionale Wege, die landschaftliche Punkte und Orte verbinden.",

"trail.color.green.title": "Grün – lokale Wanderung",
"trail.color.green.text": "Kürzere lokale Routen zu Aussichtspunkten, Lehrpfaden und leichteren Touren.",

"trail.color.yellow.title": "Gelb – Verbindungsweg",
"trail.color.yellow.text": "Verbindende, abzweigende oder thematische Nebenwege und Lehrpfade.",

"trail.forms.title": "Formen der Markierungen",
"trail.forms.text": "Die Kombination aus Farbe und Form zeigt, welche Route du gehst und welches Ziel sie hat.",

"trail.form.sav.title": "Streifen",
"trail.form.sav.text": "Durchgehender Hauptwanderweg. Längere, gut markierte Hauptroute.",

"trail.form.cross.title": "Kreuz",
"trail.form.cross.text": "Verbindungs- oder Abkürzungsweg zwischen zwei markierten Routen.",

"trail.form.triangle.title": "Dreieck",
"trail.form.triangle.text": "Weg zu Aussichtspunkt, Gipfel oder Panorama.",

"trail.form.square.title": "Quadrat",
"trail.form.square.text": "Weg zu Unterkunft, Hütte oder Schutzhütte.",

"trail.form.circle.title": "Kreis",
"trail.form.circle.text": "Weg zu Quelle, Brunnen oder Trinkwasserstelle.",

"trail.form.omega.title": "Omega",
"trail.form.omega.text": "Weg zu einer Höhle.",

"trail.form.ruin.title": "Ruinensymbol",
"trail.form.ruin.text": "Weg zu Burgruinen, Ruinen oder historischen Orten.",

"trail.form.loop.title": "Rundweg / Lehrpfad",
"trail.form.loop.text": "Markierter Rundweg, der zum Ausgangspunkt zurückführt.",

"trail.read.title": "Wie liest man die Markierungen?",
"trail.read.1": "Jede Markierung ist eine farbige Form auf weißem Grund – wie an Bäumen im Wald.",
"trail.read.2": "Die Farbe zeigt die Rolle der Route, die Form das Ziel.",
"trail.read.3": "Mehrere Markierungen nebeneinander zeigen Abzweigungen oder gemeinsame Strecken.",
"trail.read.4": "Richtungsänderungen werden durch versetzte Markierungen oder pfeilartige Zeichen angezeigt.",
"trail.read.5": "Wenn du längere Zeit keine Markierung siehst, gehe zur letzten sicheren Markierung zurück.",
"trail.read.6": "Suche immer die nächste Markierung, bevor du den Weg verlässt!",

"trail.tips.title": "BalatonGo-Tipps für Wanderer",
"trail.tip.1": "🌿 Bleib auf markierten Wegen – besonders wichtig in Weinbergen, an Privatgrundstücken und in Schutzgebieten.",
"trail.tip.2": "🧭 Wenn Markierungen verschwinden, gehe zur letzten sicheren zurück – nicht quer durch den Wald.",
"trail.tip.3": "💧 Im Sommer immer ausreichend Wasser mitnehmen. Quellen helfen, aber Trinkbarkeit vor Ort prüfen.",
"trail.tip.4": "⚡ Bei Gewitter Höhen, Aussichtspunkte und einzelne Bäume meiden – in geschützte Bereiche gehen.",
"trail.tip.5": "📱 BalatonGo hilft, Kartenrouten mit Markierungen im Gelände zu verbinden.",
"contact.name.placeholder": "Name (optional)",
"contact.email.placeholder": "E-Mail-Adresse (empfohlen)",
"contact.message.placeholder": "Deine Nachricht...",
"contact.title": "Kontakt",
"contact.intro": "Hast du eine Frage, Anmerkung oder einen Vorschlag zu BalatonGo? Schreib uns.",
"btn.cancel": "Abbrechen",
"contact.submit": "Nachricht senden",
"menu.legal.note": "Rechtliche Links öffnen sich auf einer separaten offiziellen Website.",

    "home.subtitle": "Entdecke die versteckten Schönheiten des Balaton",
    "home.card.weather": "🌅 Wetter",
    "home.card.schedule": "🚢 Schiffsfahrplan",
    "home.card.tours": "🚴 Touren & Ausflüge",

    "weather.title": "Wettersuche",
    "weather.placeholder": "Wohin wandern wir heute?",
    "weather.go": "Los geht’s! 🚲",
    "weather.start": "Gib den Stadtnamen ein!",
    "weather.back": "← Zurück",

    "weather.placeholder.enter_city": "Gib eine Stadt ein!",
    "weather.placeholder.idle": "Gib den Stadtnamen ein!",
    "weather.fetching": "Wetterdaten werden abgerufen...",
    "weather.no_forecast": "Für diesen Ort wurde keine Vorhersage gefunden.",
    "weather.error_fetch": "Die Wetterdaten konnten nicht abgerufen werden.",
    "weather.next_hours_title": "Vorhersage für die nächsten Stunden:",
    "weather.storm_warning":
      "⛈️ Achtung, in den nächsten Stunden kann es zu Gewittern kommen. Bitte prüfe vor der Abfahrt die aktuellen Warnungen!",
    "weather.label.wind": "Wind",
    "weather.label.rain_chance": "Regenwahrscheinlichkeit",
"weather.desc.clear": "klarer Himmel",
"weather.desc.clouds": "bewölkt",
"weather.desc.rain": "Regen",
"weather.desc.drizzle": "Nieselregen",
"weather.desc.snow": "Schnee",
"weather.desc.thunderstorm": "Gewitter",
    "weather.wind.N": "N",
    "weather.wind.NE": "NO",
    "weather.wind.E": "O",
    "weather.wind.SE": "SO",
    "weather.wind.S": "S",
    "weather.wind.SW": "SW",
    "weather.wind.W": "W",
    "weather.wind.NW": "NW",

    "schedule.title": "Fahrplansuche",
    "schedule.label.from": "Von:",
    "schedule.label.to": "Nach:",
    "schedule.label.date": "Datum:",
    "schedule.today": "Heute",
    "schedule.tomorrow": "Morgen",
    "schedule.search": "🔎 Suchen",
    "schedule.hint":
      "ℹ️ Bei Rundfahrten ist Abfahrts- und Ankunftshafen derselbe.",
    "schedule.selectFrom": "Wähle den Abfahrtshafen",
    "schedule.selectTo": "Wähle den Zielhafen",
    "schedule.missingInputs":
      "Bitte wähle Abfahrtshafen und Datum – ich helfe dir, die nächste Verbindung zu finden.",
    "schedule.noResults": "Für diese Strecke wurde keine Verbindung gefunden.",
    "schedule.type.regular": "Linien-Schiff",
    "schedule.type.cruise": "Rundfahrt / Ausflugsschiff",
    "schedule.loading": "Wird geladen…",
    "schedule.error_load": "Die Fahrplandaten konnten nicht geladen werden.",
    "schedule.minutes": "Minuten",
    "schedule.hours": "Stunden",
    "schedule.source":
      "Die Daten stammen aus dem offiziellen Dienst der Bahart AG.",
"schedule.seasonal": "ℹ️ Der Schiffsfahrplan ist saisonabhängig. In den Wintermonaten gibt es in der Regel keinen Linienverkehr auf dem Balaton.",

    "generic.back": "Zurück",
    "footer.copy": "© 2025 BalatonGo",

    "title_home": "Touren",
    "tours.search.placeholder": "Ort oder Routennamen eingeben…",
    "tours.search.hint": "Tipp: „Zamárdi“, „Sankt-Georgs-Berg“ – filtert sofort 🤸‍♀️",
    "tours.list.details": "Details",

    "tours.search.aria": "Suche",
    "tours.search.title": "Suche",
"tours.home.srtitle": "Startseite",
"tours.home.lead": "Wähle, wie du starten möchtest:",
"tours.detail.intro": "Beschreibung",
"tours.home.card.search.title": "Suche",
"tours.home.card.search.desc": "Ort oder Routennamen eingeben",
"tours.unknown_place": "Unbekannter Ort",
"chip.poi": "POI",
"chip.romvar": "Burg/Ruine",
"chip.szoboremlekhely": "Statue/Denkmal",
"chip.forras": "Quelle",
"chip.parksétany": "Park/Promenade",
"chip.muzeum": "Museum",
"chip.kilato": "Aussichtspunkt",
"chip.barlang": "Höhle",
"chip.arboretum": "Arboretum",
"chip.szikla": "Felsen",
"chip.tanosveny": "Lehrpfad",
"chip.hid": "Brücke",
"chip.kilatopont": "Aussichtspunkt",
 "chip.parksétany": "Park / Promenade",
  "chip.parksétány": "Park / Promenade",
"tours.home.card.map.title": "Auf der Karte",
"tours.home.card.map.desc": "Punkte auf der Karte anzeigen",
"tours.map.filter.placeholder": "Auf der Karte filtern (z. B. Ort, Name)…",
"tours.map.popup.details": "Details",
"tours.map.popup.fav": "Favorit",
    "tours.detail.opening": "Öffnungszeiten",
"tours.detail.ticket": "Ticketinfo",
"tours.home.card.nearby.title": "In der Nähe",
"tours.home.card.nearby.desc": "Nahegelegene Orte anzeigen",
"tours.map.counter": "{n} Punkte",
"tours.nearby.ask": "Standortzugriff erlauben",
"tours.nearby.refresh": "Standort aktualisieren",
"tours.nearby.live": "Live-Tracking",
"chip.belepos": "Eintritt",
"chip.poi": "POI",
"chip.tura": "Tour",

    "sub_home": "",
    "title_search": "Suche",
    "sub_search": "",
    "sub_map": "",
    "sub_nearby": "",
    "title_map": "Auf der Karte",
    "tours.map.srtitle": "Kartenansicht",
    "title_nearby": "In der Nähe",
    "tours.nearby.radius": "Radius:",
"units.km": "km",
"tours.nearby.counter": "{n} Punkte",
"tours.nearby.need_permission": "Tippe auf „Standortzugriff erlauben“, um Orte in der Nähe zu sehen.",
"tours.nearby.counter": "{n} Punkte",
"tours.nearby.no_points": "Innerhalb des gewählten Radius gibt es keine Orte mit Koordinaten.",
"tours.nearby.walk": "Zu Fuß",
"tours.nearby.bike": "Mit dem Fahrrad",
"menu.storm": "Unwetterwarnungs-Leitfaden",
"menu.trail": "Wanderweg-Markierungen",
"menu.legal": "Rechtliches",

  },
};

// =========================
// NYELVVÁLASZTÓ LOGIKA (EGYETLEN IGAZI NYELV: window.currentLang)
// =========================
const langBtns = document.querySelectorAll(".lang-btn");

// Biztosítsuk, hogy legyen globális nyelv
if (!window.currentLang) window.currentLang = "hu";

// t() mindig a window.currentLang-ot használja
function t(key) {
  const all = window.translations || {};
  const lang = window.currentLang || "hu";
  const dict = all[lang] || all.hu || {};

  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  if (all.hu && Object.prototype.hasOwnProperty.call(all.hu, key)) return all.hu[key];
  return key;
}
window.t = t;

function setActiveLang(lang) {
  // 1) validálás
  if (!window.translations || !window.translations[lang]) {
    lang = "hu";
  }

  // 2) EZ A LÉNYEG: a globális nyelvet állítjuk
  window.currentLang = lang;

  // 3) Aktív gomb jelölése
  langBtns.forEach((btn) => {
    const isActive = btn.dataset.lang === window.currentLang;
    btn.classList.toggle("active", isActive);
  });

  // 4) Nyelv mentése
  try {
    localStorage.setItem("balatongo_lang", window.currentLang);
  } catch (err) {}

  // 5) Statikus UI szövegek frissítése
  if (typeof window.applyTranslationsToDom === "function") {
    window.applyTranslationsToDom();
  }

  // 6) Kedvencek: frissítés, hogy ne ragadjon be
  try {
    if (typeof window.refreshFavoritesI18n === "function") window.refreshFavoritesI18n();
  } catch (e) {}

  // 7) Aktuális nézet újrarender (amit eddig is csináltál)
  try {
    try {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (e) {
      window.dispatchEvent(new Event("hashchange"));
    }
    window.dispatchEvent(new Event("popstate"));
  } catch (e) {
    console.warn("Route refresh nyelvváltáskor nem futott:", e);
  }

  // 8) Időjárás: ha az oldalon vagyunk, frissítsük a szöveget is
  try {
    const weatherView = document.querySelector('[data-route="weather"]');
    const isWeatherActive = weatherView && weatherView.classList.contains("active");
    if (isWeatherActive) {
      const input = document.getElementById("cityInput");
      const city = input ? (input.value || "").trim() : "";
      if (city && typeof window.getWeather === "function") window.getWeather();
    }
  } catch (e) {
    console.warn("Weather refresh on lang change failed:", e);
  }

  // 9) Menetrend select-ek frissítése (ha van)
  try {
    if (
      typeof GTFS !== "undefined" &&
      Array.isArray(GTFS.stops) &&
      GTFS.stops.length > 0 &&
      typeof fillStopSelects === "function"
    ) {
      fillStopSelects();
    }
  } catch (e) {}
}

// Gombokra kattintás
langBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.lang;
    if (!lang) return;
    setActiveLang(lang);
  });
});

// Kezdő nyelv betöltése
(function initLanguage() {
  let stored = null;
  try {
    stored = localStorage.getItem("balatongo_lang");
  } catch (err) {
    stored = null;
  }

  if (stored && window.translations && window.translations[stored]) {
    window.currentLang = stored;
  } else {
    window.currentLang = "hu";
  }

  setActiveLang(window.currentLang);
})();

    /* =========================
     MENÜ + MODÁLOK
     ========================= */
  const sideMenu = document.getElementById("sideMenu");
  const openMenuBtn = document.getElementById("openMenuBtn");
  const closeMenuBtn = document.getElementById("closeMenuBtn");
  const modals = document.querySelectorAll(".modal");

  function openMenu() {
    if (!sideMenu) return;

    // Mindig legyen nyitáskor friss a felhasználói menü címkéje
    try {
      if (typeof updateLoginMenuLabel === "function" && typeof auth !== "undefined") {
        const u = auth.currentUser || null;
        updateLoginMenuLabel(u);
      }
    } catch (e) {
      console.warn("Login menü címke frissítés hiba:", e);
    }

    // Biztos, ami biztos: a felhasználói menüpont mindig kattintható
    const loginMenuButton = document.querySelector('.menu-link[data-modal="loginModal"]');
    if (loginMenuButton) {
      loginMenuButton.disabled = false;
      loginMenuButton.classList.remove("disabled");
      loginMenuButton.style.pointerEvents = "auto";
    }

    sideMenu.classList.add("open");
    sideMenu.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    if (!sideMenu) return;
    sideMenu.classList.remove("open");
    sideMenu.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  if (openMenuBtn) {
    openMenuBtn.addEventListener("click", openMenu);
  }
  if (closeMenuBtn) {
    closeMenuBtn.addEventListener("click", closeMenu);
  }

  function closeAllModals() {
    modals.forEach((m) => {
      m.classList.remove("active");
      m.setAttribute("aria-hidden", "true");
    });
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    closeAllModals();
    closeMenu();
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }

  // *** Egységes, delegált menükezelés ***
  // Bármely .menu-link[data-modal] gombra kattintasz, mindig megnyitja a megfelelő modált.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-link[data-modal]");
    if (!btn) return;
    e.preventDefault();
    const targetId = btn.getAttribute("data-modal");
    if (!targetId) return;
    openModal(targetId);
  });

  const closeButtons = document.querySelectorAll("[data-close]");
  closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      closeAllModals();
    });
  });

  modals.forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeAllModals();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
      closeMenu();
    }
  });

 

  /* =========================
     FELHASZNÁLÓI BELÉPÉS / PROFIL
     ========================= */
  const loginStatusText = document.getElementById("loginStatusText");
  const loginFormSection = document.getElementById("loginFormSection");
  const loginProfileSection = document.getElementById("loginProfileSection");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const loginDisplayName = document.getElementById("loginDisplayName");
  const loginAccept = document.getElementById("loginAccept");
  const loginBtn = document.getElementById("loginBtn");
  const loginErrorMsg = document.getElementById("loginErrorMsg");
  const loginLogoutBtn = document.getElementById("loginLogoutBtn");
  const loginProfileNameDisplay = document.getElementById(
    "loginProfileNameDisplay"
  );
    
  const loginProfileEmail = document.getElementById("loginProfileEmail");
  const loginAvatarEmoji = document.getElementById("loginAvatarEmoji");
  const loginFavoritesBtn = document.getElementById("loginFavoritesBtn");
  const loginSettingsBtn = document.getElementById("loginSettingsBtn");
  const loginSettingsPanel = document.getElementById("loginSettingsPanel");
  const avatarChoices = document.querySelectorAll(".avatar-choice");

  // MENÜ felső felhasználói sáv elemei
  const menuLoginBtn = document.querySelector(
    '.menu-link[data-modal="loginModal"]'
  );
  const menuUserBox = document.getElementById("menuUserBox");
  const menuUserName = document.getElementById("menuUserName");
  const menuUserAvatar = document.getElementById("menuUserAvatar");
  const menuLogoutBtn = document.getElementById("menuLogoutBtn");
// A felső "Szonja" felhasználói sáv kattintható legyen:
  // kattintásra nyissa meg a profil / belépés modált.
  if (menuUserBox) {
    menuUserBox.addEventListener("click", () => {
      if (typeof openModal === "function") {
        openModal("loginModal");
      }
    });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function updateLoginButtonEnabled() {
    if (!loginBtn) return;
    const emailVal = loginEmail ? loginEmail.value.trim() : "";
    const emailOk = loginEmail && emailRegex.test(emailVal);
    const passOk =
      loginPassword && loginPassword.value.trim().length >= 6;
    const accepted = loginAccept && loginAccept.checked;

    const enabled = emailOk && passOk && accepted;
    loginBtn.disabled = !enabled;
    loginBtn.classList.toggle("disabled", !enabled);
  }

  if (loginAccept) {
    loginAccept.addEventListener("change", updateLoginButtonEnabled);
  }
  if (loginEmail) {
    loginEmail.addEventListener("input", updateLoginButtonEnabled);
  }
  if (loginPassword) {
    loginPassword.addEventListener("input", updateLoginButtonEnabled);
  }
/* =========================
   Elfelejtett jelszó – UI + valódi Firebase reset e-mail
   (beszúrás: login input listenerek után)
   ========================= */
{
  const forgotLinkBtn = document.getElementById("forgotPasswordBtn");
  const forgotPanel = document.getElementById("forgotPasswordPanel");
  const forgotEmail = document.getElementById("forgotEmail");
  const forgotMsg = document.getElementById("forgotMsg");
  const forgotSendBtn = document.getElementById("forgotSendBtn");
  const forgotBackBtn = document.getElementById("forgotBackBtn");

  if (forgotLinkBtn && forgotPanel && forgotEmail && forgotSendBtn && forgotBackBtn) {
    const acceptLabel = loginAccept ? loginAccept.closest("label.checkbox") : null;
    const loginActions = loginBtn ? loginBtn.closest(".modal-actions") : null;

    const emailRegexLocal = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Fordítás helper: ha a t() visszaadja a kulcsot (hiányzó fordítás),
    // akkor kulturált fallback szöveget írunk ki, ne kulcsot.
    function tr(key, fallback) {
      try {
        if (typeof t === "function") {
          const out = t(key);
          if (out && out !== key) return out;
        }
      } catch (e) {}
      return fallback;
    }

    function setForgotMsg(text) {
      if (!forgotMsg) return;
      forgotMsg.textContent = text || "";
    }

    function showForgotPanel() {
      if (loginFormSection) loginFormSection.classList.add("hidden");
      if (acceptLabel) acceptLabel.classList.add("hidden");
      if (loginErrorMsg) loginErrorMsg.classList.add("hidden");
      if (loginActions) loginActions.classList.add("hidden");

      forgotPanel.classList.remove("hidden");
      forgotPanel.setAttribute("aria-hidden", "false");

      const prefill = (loginEmail && loginEmail.value) ? loginEmail.value.trim() : "";
      forgotEmail.value = prefill;
      setForgotMsg("");
      forgotEmail.focus();
    }

    function hideForgotPanel() {
      forgotPanel.classList.add("hidden");
      forgotPanel.setAttribute("aria-hidden", "true");
      setForgotMsg("");

      if (loginFormSection) loginFormSection.classList.remove("hidden");
      if (acceptLabel) acceptLabel.classList.remove("hidden");
      if (loginErrorMsg) loginErrorMsg.classList.remove("hidden");
      if (loginActions) loginActions.classList.remove("hidden");

      if (typeof updateLoginButtonEnabled === "function") updateLoginButtonEnabled();
    }

    forgotLinkBtn.addEventListener("click", () => {
      showForgotPanel();
    });

    forgotBackBtn.addEventListener("click", () => {
      hideForgotPanel();
    });

    forgotSendBtn.addEventListener("click", async () => {
      const email = (forgotEmail.value || "").trim();

      if (!email) {
        setForgotMsg(tr("login.forgot.error.empty", "Kérlek add meg az e-mail címed."));
        return;
      }
      if (!emailRegexLocal.test(email)) {
        setForgotMsg(tr("login.forgot.error.invalid", "Kérlek érvényes e-mail címet adj meg."));
        return;
      }
      if (!auth || typeof auth.sendPasswordResetEmail !== "function") {
        setForgotMsg("Hiba: a jelszó-visszaállítás nincs bekötve (auth hiányzik).");
        return;
      }

      forgotSendBtn.disabled = true;
      forgotSendBtn.classList.add("disabled");
      const oldText = forgotSendBtn.textContent;
      forgotSendBtn.textContent = tr("login.forgot.sending", "Küldöm...");

      try {
        await auth.sendPasswordResetEmail(email);

        // Siker üzenet NE kulcs legyen
        setForgotMsg(
          tr(
            "login.forgot.success",
            "Küldtünk egy jelszó-visszaállító e-mailt. Nézd meg a bejövőt (és a spam mappát is)."
          )
        );

        // Siker után automatikusan visszalépünk a login nézetre,
        // hogy ne olvadjon össze a belépéssel
        setTimeout(() => {
          hideForgotPanel();
        }, 5000);
      } catch (err) {
        console.error(err);

        let msg = tr("login.forgot.error.generic", "Nem sikerült elküldeni. Próbáld meg később.");
        if (err && err.code === "auth/user-not-found") {
          msg = tr("login.forgot.error.user_not_found", "Ehhez az e-mailhez nincs fiók.");
        } else if (err && err.code === "auth/invalid-email") {
          msg = tr("login.forgot.error.invalid", "Kérlek érvényes e-mail címet adj meg.");
        } else if (err && err.code === "auth/too-many-requests") {
          msg = tr("login.forgot.error.too_many", "Túl sok próbálkozás. Várj egy kicsit, és próbáld újra.");
        }

        setForgotMsg(msg);
      } finally {
        forgotSendBtn.disabled = false;
        forgotSendBtn.classList.remove("disabled");
        forgotSendBtn.textContent = oldText;
      }
    });
  }
}


  // >>> Itt állítjuk be, mit mutasson a MENÜ felül
  function updateLoginMenuLabel(user) {
    if (!menuLoginBtn || !menuUserBox || !menuUserName || !menuUserAvatar) {
      return;
    }

    if (!user) {
      // NINCS bejelentkezve
      menuLoginBtn.style.display = "flex";   // régi "Felhasználói belépés"
      menuUserBox.style.display = "none";    // felhasználói sáv elrejt
      if (menuLogoutBtn) menuLogoutBtn.style.display = "none";
      return;
    }

    // BE VAN jelentkezve
    const niceName =
      user.displayName ||
      (user.email ? user.email.split("@")[0] : "Felhasználó");

    // avatar ugyanaz, mint a profil-modálban
    let avatar = "👤";
    try {
      const stored = localStorage.getItem(`balatongo_avatar_${user.uid}`);
      if (stored) avatar = stored;
    } catch (err) {}

    menuLoginBtn.style.display = "none";
    menuUserBox.style.display = "flex";
    menuUserName.textContent = niceName;
    menuUserAvatar.textContent = avatar;
    if (menuLogoutBtn) menuLogoutBtn.style.display = "inline-flex";
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      if (!auth) return;

      const email = loginEmail.value.trim();
      const password = loginPassword.value.trim();
      const displayNameInput = loginDisplayName.value.trim();

      loginErrorMsg.textContent = "";

      if (!loginAccept.checked) {
        loginErrorMsg.textContent = t("login.error.accept_terms");
        return;
      }
      if (!emailRegex.test(email) || password.length < 6) {
        loginErrorMsg.textContent = t(
          "login.error.invalid_credentials"
        );
        return;
      }

      loginBtn.disabled = true;
      loginBtn.classList.add("disabled");
      loginBtn.textContent = "Dolgozom...";

      try {
        let credential;
        try {
          credential = await auth.signInWithEmailAndPassword(
            email,
            password
          );
        } catch (err) {
          if (err.code === "auth/user-not-found") {
            credential = await auth.createUserWithEmailAndPassword(
              email,
              password
            );
          } else {
            throw err;
          }
        }

        const user = credential.user;

        if (user && displayNameInput) {
          await user.updateProfile({
            displayName: displayNameInput,
          });
        }

        loginPassword.value = "";
      } catch (err) {
        console.error(err);
        let msg = t("login.error.generic");
        if (err.code === "auth/wrong-password") {
          msg = t("login.error.wrong_password");
        } else if (err.code === "auth/invalid-email") {
          msg = t("login.error.invalid_email");
        } else if (err.code === "auth/email-already-in-use") {
          msg = t("login.error.email_in_use");
        }
        loginErrorMsg.textContent = msg;
      } finally {
        loginBtn.disabled = false;
        loginBtn.classList.remove("disabled");
        loginBtn.textContent = "Belépek / Regisztrálok";
        updateLoginButtonEnabled();
      }
    });
  }

  // Profil-modálban lévő kijelentkezés gomb
  if (loginLogoutBtn) {
    loginLogoutBtn.addEventListener("click", async () => {
      try {
        await auth.signOut();
        closeAllModals();
        closeMenu();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // MENÜ-beli kijelentkezés gomb
  if (menuLogoutBtn) {
    menuLogoutBtn.addEventListener("click", async () => {
      try {
        await auth.signOut();
        closeAllModals();
        closeMenu();
      } catch (err) {
        console.error(err);
      }
    });
  }


  /* =========================
     KEDVENCEK
     ========================= */
  const favoritesInfoText = document.getElementById("favoritesInfoText");
  const favoritesContent = document.getElementById("favoritesContent");
  const favoriteNameInput = document.getElementById("favoriteNameInput");
  const addFavoriteBtn = document.getElementById("addFavoriteBtn");
  const favoritesList = document.getElementById("favoritesList");

  // A kedvencek mezőt ne lehessen kézzel szerkeszteni –
  // csak a csillag gombok töltsék be automatikusan.
  if (favoriteNameInput) {
    favoriteNameInput.readOnly = true;
  favoriteNameInput.placeholder = t("favorites.hint");
  }
window.refreshFavoritesI18n = function () {
  // placeholder frissítés nyelvváltáskor
  if (favoriteNameInput) {
    favoriteNameInput.placeholder = t("favorites.hint");
  }

  // felső infó (be/ki jelentkezve)
  if (favoritesInfoText) {
    favoritesInfoText.textContent = currentUser
      ? t("favorites.info.logged_in")
      : t("favorites.info.logged_out");
  }

  // üres lista szövege is frissüljön
  try {
    renderFavorites();
  } catch (e) {}
};

  // A "Hozzáadás a kedvencekhez" gombot elrejtjük,
  // de programból továbbra is hívható marad (ha kellene).
  if (addFavoriteBtn) {
    addFavoriteBtn.style.display = "none";
  }

  let currentUser = null;
  let currentFavoritesKey = null;
  let favorites = [];

  function loadFavoritesForUser(uid) {
    favorites = [];
    currentFavoritesKey = null;
    if (favoritesList) favoritesList.innerHTML = "";

    if (!uid) {
      if (favoritesInfoText) {
        favoritesInfoText.textContent = t(
          "favorites.info.logged_out"
        );
      }
      if (favoritesContent) {
        favoritesContent.style.display = "none";
      }
      if (typeof window.updateFavoriteStars === "function") {
        window.updateFavoriteStars();
      }
      return;
    }

    currentFavoritesKey = `balatongo_favorites_${uid}`;

    try {
      const raw = localStorage.getItem(currentFavoritesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          favorites = parsed;
        } else {
          favorites = [];
        }
      }
    } catch (err) {
      favorites = [];
    }

    if (favoritesInfoText) {
      favoritesInfoText.textContent = t("favorites.info.logged_in");
    }
    if (favoritesContent) {
      favoritesContent.style.display = "block";
    }

    renderFavorites();
    if (typeof window.updateFavoriteStars === "function") {
      window.updateFavoriteStars();
    }
  }

  function saveFavorites() {
    if (!currentFavoritesKey) return;
    try {
      localStorage.setItem(
        currentFavoritesKey,
        JSON.stringify(favorites)
      );
    } catch (err) {
      console.error(err);
    }
  }

  function renderFavorites() {
    if (!favoritesList) return;
    favoritesList.innerHTML = "";

    if (!favorites || favorites.length === 0) {
      const li = document.createElement("li");
      li.textContent = t("favorites.empty");
      li.style.opacity = "0.8";
      favoritesList.appendChild(li);
      return;
    }

    favorites.forEach((item, index) => {
      const name =
        typeof item === "string"
          ? item
          : (item && item.name) || String(item);

      const li = document.createElement("li");
      li.classList.add("favorite-item");

      const span = document.createElement("span");
      span.textContent = name;

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.classList.add("favorite-delete-btn");
      delBtn.addEventListener("click", () => {
        favorites.splice(index, 1);
        saveFavorites();
        renderFavorites();
        if (typeof window.updateFavoriteStars === "function") {
          window.updateFavoriteStars();
        }
      });

      li.appendChild(span);
      li.appendChild(delBtn);
      favoritesList.appendChild(li);
    });
  }

  // Csillagok frissítése – minden olyan gombnál, amin van data-fav-label
  function updateFavoriteStars() {
    const favNorms = favorites.map((n) =>
      String(n || "").trim().toLowerCase()
    );
    const btns = document.querySelectorAll("[data-fav-label]");
    btns.forEach((btn) => {
      const encoded = btn.getAttribute("data-fav-label") || "";
      let label;
      try {
        label = decodeURIComponent(encoded);
      } catch {
        label = encoded;
      }
      const isFav = favNorms.includes(
        String(label || "").trim().toLowerCase()
      );

      btn.classList.toggle("is-fav", isFav);
      // ikon frissítése
      if (btn.tagName === "BUTTON") {
        btn.textContent = isFav ? "⭐" : "☆";
      }
    });
  }
  window.updateFavoriteStars = updateFavoriteStars;

  // Központi függvény: kedvenc kapcsolása (be/ki kapcsolás)
  function addFavorite(rawName) {
    if (!currentUser) {
      alert(t("favorites.alert.must_login"));
      return;
    }
    const name = (rawName || "").trim();
    if (!name) return;

    const idx = favorites.findIndex((item) => {
      const n =
        typeof item === "string"
          ? item
          : (item && item.name) || String(item || "");
      return n.trim().toLowerCase() === name.toLowerCase();
    });

    if (idx !== -1) {
      // már benne van → töröljük (toggle OFF)
      favorites.splice(idx, 1);
    } else {
      // még nincs → hozzáadjuk (toggle ON)
      favorites.push(name);
    }

    saveFavorites();
    renderFavorites();
    updateFavoriteStars();
  }
  window.addFavorite = addFavorite;

  if (addFavoriteBtn) {
    addFavoriteBtn.addEventListener("click", () => {
      const name = favoriteNameInput.value.trim();
      if (!name) return;
      addFavorite(name);
      favoriteNameInput.value = "";
    });
  }

  /* =========================
     AVATAR / BEÁLLÍTÁSOK
     ========================= */
  if (loginSettingsBtn && loginSettingsPanel) {
    loginSettingsBtn.addEventListener("click", () => {
      loginSettingsPanel.classList.toggle("hidden");
    });
  }

  function loadAvatarForUser(user) {
    if (!user || !loginAvatarEmoji) return;
    const key = `balatongo_avatar_${user.uid}`;
    let avatar = "👤";
    try {
      const stored = localStorage.getItem(key);
      if (stored) avatar = stored;
    } catch (err) {}
    loginAvatarEmoji.textContent = avatar;

    avatarChoices.forEach((btn) => {
      const val = btn.dataset.avatar;
      btn.classList.toggle("active", val === avatar);
    });
  }

  avatarChoices.forEach((btn) => {
    btn.addEventListener("click", () => {
      const avatar = btn.dataset.avatar;
      if (!avatar || !loginAvatarEmoji) return;
      loginAvatarEmoji.textContent = avatar;

      avatarChoices.forEach((b) => {
        b.classList.toggle("active", b === btn);
      });

      if (currentUser) {
        const key = `balatongo_avatar_${currentUser.uid}`;
        try {
          localStorage.setItem(key, avatar);
        } catch (err) {
          console.error(err);
        }
      }
    });
  });

  if (loginFavoritesBtn) {
    loginFavoritesBtn.addEventListener("click", () => {
      openModal("favoritesModal");
      updateFavoriteStars();
    });
  }

  /* =========================
     AUTH ÁLLAPOT FIGYELÉSE
     ========================= */
auth.onAuthStateChanged((user) => {
  currentUser = user || null;

  if (!loginFormSection || !loginProfileSection) return;

  if (user) {
    loginFormSection.style.display = "none";
    loginProfileSection.classList.remove("hidden");

    // ✅ Fordítás: ne textContent-et írjunk, hanem data-i18n kulcsot
    if (loginStatusText) {
      loginStatusText.setAttribute("data-i18n", "login.status.logged_in");
    }

    const niceName =
      user.displayName ||
      (user.email ? user.email.split("@")[0] : "Felhasználó");

    // ezek adatok, maradhatnak textContent-ként
    if (loginProfileNameDisplay) {
      loginProfileNameDisplay.textContent = niceName;
    }
    if (loginProfileEmail) {
      loginProfileEmail.textContent = user.email || "";
    }

    loadAvatarForUser(user);
    loadFavoritesForUser(user.uid);
  } else {
    loginFormSection.style.display = "block";
    loginProfileSection.classList.add("hidden");

    // ✅ Fordítás: ne textContent-et írjunk, hanem data-i18n kulcsot
    if (loginStatusText) {
      loginStatusText.setAttribute("data-i18n", "login.status.logged_out");
    }

    // ezek adatok/placeholderek, maradhatnak
    if (loginProfileNameDisplay) {
      loginProfileNameDisplay.textContent = "Felhasználó";
    }
    if (loginProfileEmail) {
      loginProfileEmail.textContent = "email@example.com";
    }
    if (loginAvatarEmoji) {
      loginAvatarEmoji.textContent = "👤";
    }

    loadFavoritesForUser(null);
  }

  updateLoginButtonEnabled();
  updateLoginMenuLabel(user || null);

  // ✅ most fogja a data-i18n kulcsokat tényleges nyelvre cserélni
  if (typeof applyTranslationsToDom === "function") {
    applyTranslationsToDom();
  }
});


  /* =========================
     KAPCSOLAT ŰRLAP + EmailJS
     ========================= */
  const contactNameInput = document.getElementById("contactName");
  const contactEmailInput = document.getElementById("contactEmail");
  const contactMessageInput = document.getElementById("contactMessage");
  const contactSubmitBtn = document.getElementById("contactSubmitBtn");
  const contactStatus = document.getElementById("contactStatus");

  async function handleContactSubmit() {
    const name = contactNameInput ? contactNameInput.value.trim() : "";
    const email = contactEmailInput ? contactEmailInput.value.trim() : "";
    const message = contactMessageInput
      ? contactMessageInput.value.trim()
      : "";

    console.log("Kapcsolat űrlap submit:", { name, email, message });

    if (!message || message.length < 5) {
      if (contactStatus) {
        contactStatus.textContent = t(
          "contact.validation.short_message"
        );
        contactStatus.style.color = "#f97373";
      }
      return;
    }

    contactSubmitBtn.disabled = true;
    const oldLabel = contactSubmitBtn.textContent;
    contactSubmitBtn.textContent = "Küldés...";
    if (contactStatus) {
      contactStatus.textContent = "";
    }

    try {
      if (db) {
        const user = currentUser;
        await db.collection("contactMessages").add({
          name,
          email,
          message,
          uid: user ? user.uid : null,
          userEmail: user ? user.email : null,
          createdAt:
            firebase.firestore.FieldValue.serverTimestamp(),
          source: "balatongo-app",
        });
        console.log("Üzenet elmentve Firestore-ba.");
      } else {
        console.warn("Firestore db nem elérhető, mentést kihagyom.");
      }
    } catch (err) {
      console.error("Firestore mentési hiba:", err);
    }

    try {
      if (!window.emailjs) {
        console.error(
          "EmailJS nem elérhető (window.emailjs undefined)."
        );
        throw new Error("EmailJS SDK nem töltődött be.");
      }

      const templateParams = {
        from_name: name || "(nem adott meg nevet)",
        reply_to: email || "nincs megadott e-mail",
        message: message,
        sent_from: "BalatonGo kapcsolat űrlap",
        sent_time: new Date().toLocaleString("hu-HU"),
      };

      console.log("EmailJS küldés indul:", {
        service: EMAILJS_SERVICE_ID,
        template: EMAILJS_TEMPLATE_ID,
        templateParams,
      });

      const result = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams
      );

      console.log("EmailJS siker:", result);

      if (contactStatus) {
        contactStatus.textContent = t("contact.success");
        contactStatus.style.color = "#4ade80";
      }

      if (contactNameInput) contactNameInput.value = "";
      if (contactEmailInput) contactEmailInput.value = "";
      if (contactMessageInput) contactMessageInput.value = "";
    } catch (err) {
      console.error("EmailJS küldési hiba:", err);
      if (contactStatus) {
        contactStatus.textContent = t("contact.error.email");
        contactStatus.style.color = "#f97373";
      }
    } finally {
      contactSubmitBtn.disabled = false;
      contactSubmitBtn.textContent = oldLabel;
    }
  }

  if (contactSubmitBtn && contactMessageInput) {
    contactSubmitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleContactSubmit();
    });
  }

  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!contactSubmitBtn.disabled) {
        handleContactSubmit();
      }
    });
  }

  applyTranslationsToDom();
});
// ========================

// LOGIN MENÜ FELIRAT – FELÜLÍRÓ VÁLTOZAT

// (Tedd a script.js LEG-LEGVÉGÉRE)

// ========================

function updateLoginMenuLabel(user) {

  const loginMenuButton = document.querySelector(

    '.menu-link[data-modal="loginModal"]'

  );

  if (!loginMenuButton) return;

  const textSpan = loginMenuButton.querySelector("span:last-child");

  if (!textSpan) return;

  if (user) {

    // Bejelentkezve: mutassuk, hogy ez már profil

    textSpan.textContent = "Profilom";

  } else {

    // Kijelentkezve: sima belépés

    textSpan.textContent = t("menu.login");

  }

  // Mindig kattintható legyen

  loginMenuButton.disabled = false;

  loginMenuButton.classList.remove("disabled");

  loginMenuButton.style.pointerEvents = "auto";

}
// ==============================

// MENÜ & PROFIL – GOLYÓÁLLÓ PATCH

// (Illeszd a script.js legvégére)

// ==============================

// 1) Delegált kattintás: bármi, amin van data-modal, nyissa a modált.

document.addEventListener("click", (e) => {

  const btn = e.target.closest('.menu-link[data-modal]');

  if (!btn) return;

  e.preventDefault();

  const targetId = btn.getAttribute('data-modal');

  if (targetId && typeof openModal === 'function') {

    openModal(targetId);

  }

});

// 2) Menü megnyitásakor frissítsük a "Profilom" / "Belépés" címkét

//    és biztosítsuk, hogy kattintható legyen.

(function ensureLoginMenuHealth() {

  const openBtn = document.getElementById('openMenuBtn');

  if (!openBtn) return;

  openBtn.addEventListener('click', () => {

    // Felirat frissítése aktuális auth állapot alapján

    try {

      const u = (typeof firebase !== 'undefined' && firebase.auth)

        ? firebase.auth().currentUser

        : null;

      if (typeof updateLoginMenuLabel === 'function') {

        updateLoginMenuLabel(u || null);

      }

    } catch {}

          // Soha ne legyen letiltva a menüpont

const loginMenuButton = document.querySelector('.menu-link[data-modal="loginModal"]');

if (loginMenuButton) {
  loginMenuButton.disabled = false;
  loginMenuButton.classList.remove('disabled');
  loginMenuButton.style.pointerEvents = 'auto';
}

// Fordítás lefuttatása, de csak ha létezik a függvény (különben ne omoljon össze)
if (typeof applyTranslationsToDom === "function") {
  applyTranslationsToDom();
}

});

})();

