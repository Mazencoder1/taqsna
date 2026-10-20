/* app.js — واجهة تطبيق طقسنا */
(() => {
  const $ = (s) => document.querySelector(s);
  const LS_CITY = "taqsna.city.v1";
  const LS_THEME = "taqsna.theme.v1";

  const num = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });
  const deg = (n) => `${num.format(n)}°`;
  const dayFmt = new Intl.DateTimeFormat("ar-SA", { weekday: "long" });
  const hourFmt = new Intl.DateTimeFormat("ar-SA", { hour: "numeric" });
  const hijriFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const statusEl = $("#status");
  let requestId = 0; // نتجاهل الردود القديمة لو المستخدم غيّر المدينة بسرعة

  function setStatus(text, isError = false) {
    statusEl.hidden = !text;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("error", isError);
  }

  // ---- الثيم ----
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("#themeBtn").textContent = theme === "dark" ? "☀️" : "🌙";
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(LS_THEME); } catch {}
  applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(LS_THEME, next); } catch {}
  });

  // ---- مدن سريعة ----
  $("#chips").replaceChildren(
    ...SAUDI_CITIES.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = c.name;
      b.addEventListener("click", () => loadCity(c));
      return b;
    })
  );

  // ---- العرض ----
  function show(city, data) {
    const cur = data.current;
    const info = describeCode(cur.weather_code, cur.is_day);

    $("#place").textContent = city.region ? `${city.name} — ${city.region}` : city.name;
    $("#desc").textContent = info.text;
    $("#icon").textContent = info.icon;
    $("#temp").textContent = deg(cur.temperature_2m);
    $("#feels").textContent = deg(cur.apparent_temperature);
    $("#humidity").textContent = `${num.format(cur.relative_humidity_2m)}٪`;
    $("#wind").textContent = `${num.format(cur.wind_speed_10m)} كم/س · ${windNote(cur.wind_speed_10m)}`;
    $("#advice").textContent = adviceFor({
      temp: cur.temperature_2m,
      code: cur.weather_code,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
    });
    $("#current").hidden = false;

    // الساعات: من الوقت الحالي، 12 ساعة
    const nowIso = cur.time;
    const start = Math.max(0, data.hourly.time.findIndex((t) => t >= nowIso));
    const hours = data.hourly.time.slice(start, start + 12).map((t, i) => {
      const idx = start + i;
      const d = describeCode(data.hourly.weather_code[idx], data.hourly.is_day[idx]);
      const el = document.createElement("div");
      el.className = "hour";
      const h = document.createElement("small");
      h.textContent = hourFmt.format(new Date(t));
      const ic = document.createElement("span");
      ic.textContent = d.icon;
      const tp = document.createElement("b");
      tp.textContent = deg(data.hourly.temperature_2m[idx]);
      el.append(h, ic, tp);
      return el;
    });
    $("#hourly").replaceChildren(...hours);
    $("#hourlyWrap").hidden = false;

    // الأسبوع
    const days = data.daily.time.map((t, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "dname";
      name.textContent = i === 0 ? "اليوم" : dayFmt.format(new Date(t + "T12:00:00"));
      const ic = document.createElement("span");
      ic.textContent = describeCode(data.daily.weather_code[i]).icon;
      const rain = document.createElement("small");
      const p = data.daily.precipitation_probability_max[i];
      rain.textContent = p ? `💧 ${num.format(p)}٪` : "";
      const range = document.createElement("b");
      range.textContent = `${deg(data.daily.temperature_2m_max[i])} / ${deg(data.daily.temperature_2m_min[i])}`;
      li.append(name, ic, rain, range);
      return li;
    });
    $("#daily").replaceChildren(...days);
    $("#dailyWrap").hidden = false;
  }

  async function loadCity(city) {
    const id = ++requestId;
    setStatus("لحظة، أجيب لك الجو... ⏳");
    try {
      const data = await getWeather(city.lat, city.lon);
      if (id !== requestId) return;
      show(city, data);
      setStatus("");
      try { localStorage.setItem(LS_CITY, JSON.stringify(city)); } catch {}
    } catch (err) {
      if (id !== requestId) return;
      const offline = !navigator.onLine;
      setStatus(
        offline
          ? "ما فيه نت عندك، تأكد من الاتصال وجرب مرة ثانية 📶"
          : "صار خلل وما قدرت أجيب الجو. جرب بعد شوي.",
        true
      );
    }
  }

  // ---- البحث ----
  const suggest = $("#suggest");
  $("#searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("#cityInput").value.trim();
    if (!q) return;
    suggest.hidden = true;
    setStatus("أدوّر على المدينة... 🔎");
    try {
      const results = await searchCity(q);
      if (!results.length) {
        setStatus("ما لقيت هالمدينة، تأكد من الاسم وجرب ثاني.", true);
        return;
      }
      if (results.length === 1) {
        loadCity(results[0]);
        return;
      }
      setStatus("");
      suggest.replaceChildren(
        ...results.map((r) => {
          const li = document.createElement("li");
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = r.region ? `${r.name} — ${r.region}` : r.name;
          b.addEventListener("click", () => {
            suggest.hidden = true;
            loadCity(r);
          });
          li.append(b);
          return li;
        })
      );
      suggest.hidden = false;
    } catch {
      setStatus("تعذر البحث الحين، جرب مرة ثانية.", true);
    }
  });

  $("#locBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("متصفحك ما يدعم تحديد الموقع.", true);
      return;
    }
    setStatus("أحدد موقعك... 📍");
    navigator.geolocation.getCurrentPosition(
      (pos) => loadCity({ name: "موقعك الحالي", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setStatus("ما قدرت أحدد موقعك. فعّل الإذن أو اختر مدينتك.", true),
      { timeout: 10000 }
    );
  });

  // ---- البداية ----
  $("#today").textContent = hijriFmt.format(new Date());
  let start = SAUDI_CITIES[0];
  try {
    const saved = JSON.parse(localStorage.getItem(LS_CITY));
    if (saved && typeof saved.lat === "number" && typeof saved.lon === "number") start = saved;
  } catch {}
  loadCity(start);
})();
