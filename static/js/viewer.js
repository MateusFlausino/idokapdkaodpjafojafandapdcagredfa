// --- Auth guard (JWT) ---
const access = localStorage.getItem("access");
if (!access) { location.href = "/login/"; }

fetch("/api/me/", { headers:{ Authorization:"Bearer "+access }})
  .then(r=>r.json())
  .then(d => {
    const name = d.user || d.username || "Usuário";
    document.getElementById("who").textContent = name;
  })
  .catch(()=>{});

document.getElementById("logout").onclick = () => {
  localStorage.clear(); location.href = "/login/";
};

// --- Helpers de tags e números ---
const tagClasses = ["tag-yellow","tag-green","tag-red","tag-blue"];
const tagForIndex = (i)=> tagClasses[i % tagClasses.length];

// normalizador p/ números (suporta vírgula como separador decimal)
function toNum(x){ return Number(String(x ?? "").replace(",", ".")); }

// badges de tags (usa fields {name,color,icon} da API)
function renderTagsBadges(tags){
  if (!Array.isArray(tags) || !tags.length) return "";
  return `
    <div id="p-tags" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
      ${tags.map(t => `
        <span class="plant-tag ${t?.className||""}"
              style="display:inline-flex;align-items:center;gap:6px;
                     padding:2px 8px;border-radius:12px;
                     background:${t?.color || '#e5e7eb'}; color:#0b0b0b; font-size:12px;">
          ${t?.icon ? `<i class="lni lni-${t.icon}"></i>` : ""}${t?.name || ""}
        </span>
      `).join("")}
    </div>`;
}

function plantTag(label, cls){
  return L.divIcon({
    className: "",
    html: `<div class="plant-tag ${cls}" title="${label}">${label}</div>`,
    iconSize:[10,10], iconAnchor:[10,10], popupAnchor:[0,-8]
  });
}

// --- Mapa Leaflet ---
const map = L.map('map',{zoomControl:true}).setView([-23.55,-46.63], 10);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/Services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);

// --- APS Viewer helpers ---
let _apsViewer = null;

async function getApsToken(){
  const r = await fetch("/api/aps/token/");
  if (!r.ok) {
    const txt = await r.text();
    console.error("APS token error:", r.status, txt);
    throw new Error("Falha ao obter token APS");
  }
  const j = await r.json();
  return { access_token: j.access_token, expires_in: j.expires_in };
}

async function openApsViewer(urn){
  if (!urn){ alert("Esta planta não possui APS URN configurada."); return; }
  document.getElementById("aps-overlay").style.display = "block";

  const opts = {
    env: "AutodeskProduction",
    getAccessToken: async (onTokenReady) => {
      try {
        const t = await getApsToken();
        onTokenReady(t.access_token, t.expires_in);
      } catch(e) {
        console.error(e); alert("Não foi possível autenticar no APS.");
      }
    }
  };

  if (!_apsViewer){
    await new Promise(res => Autodesk.Viewing.Initializer(opts, res));
    const el = document.getElementById("aps-viewer");
    _apsViewer = new Autodesk.Viewing.GuiViewer3D(el, { extensions: [] });
    _apsViewer.start();
  }

  const docUrn = urn.startsWith("urn:") ? urn : ("urn:" + urn);

  Autodesk.Viewing.Document.load(docUrn, (doc) => {
    const defaultModel = doc.getRoot().getDefaultGeometry();
    _apsViewer.loadDocumentNode(doc, defaultModel);
  }, (err) => {
    console.error(err);
    alert("Erro ao carregar o modelo 3D.");
  });
}

document.getElementById("aps-close").onclick = () => {
  document.getElementById("aps-overlay").style.display = "none";
  if (_apsViewer && _apsViewer.model){ _apsViewer.unloadModel(_apsViewer.model); }
};

// ================== GRAFANA: habilitar botão somente se houver dashboard ==================
function grafanaBaseUrl() {
  return (window.GRAFANA_URL || localStorage.getItem('grafana_url') || "").replace(/\/+$/,"");
}
function enableGrafanaButton(url) {
  const btn = document.getElementById("btn-grafana");
  if (!btn) return;
  if (url) {
    btn.classList.remove("disabled");
    btn.onclick = () => window.open(url, "_blank");
  } else {
    btn.classList.add("disabled");
    btn.onclick = null;
  }
}

// ================== EVENTOS RECENTES (somente disparos A/B/C) ==================

// Estado de fases para detectar transição normal -> disparo
const phasePrev = { A: false, B: false, C: false };

// Store de eventos (últimos 30)
const recentEvents = []; // { dot, text, ts }
const MAX_EVENTS = 30;

// Beep simples via WebAudio (sem arquivo externo)
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;         // pitch
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.26);
  } catch (e) {
    console.warn("AudioContext não disponível", e);
  }
}

function pushEvent(dot, text) {
  recentEvents.unshift({ dot, text, ts: new Date() });
  if (recentEvents.length > MAX_EVENTS) recentEvents.pop();
  renderEventsList();
}

function renderEventsList() {
  const el = document.getElementById("events-list");
  if (!el) return;

  if (recentEvents.length === 0) {
    el.innerHTML = `<div class="event"><span class="dot warn"></span><div>Sem eventos.</div></div>`;
    return;
  }

  el.innerHTML = recentEvents
    .map(ev => {
      const hh = ev.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<div class="event">
        <span class="dot ${ev.dot}"></span>
        <div><strong>${hh}</strong> — ${ev.text}</div>
      </div>`;
    })
    .join("");
}

// Cooldown para não tocar muitos beeps seguidos
const lastBeep = { A: 0, B: 0, C: 0 };
const BEEP_COOLDOWN_MS = 10000;

// Detecta disparos e gera eventos sonoros/visuais
function detectTripsAndNotify(values) {
  const phaseOn = (label) => {
    const v = values[label];
    if (v === undefined || v === null) return false;
    const s = String(v).trim().toLowerCase();
    if (["on","true","1"].includes(s)) return true;
    const n = Number(v);
    return !Number.isNaN(n) && n > 0;
  };

  const aNow = phaseOn("Disparo na Fase A") || phaseOn("POWER1") || phaseOn("Power1") || phaseOn("power1");
  const bNow = phaseOn("Disparo na Fase B") || phaseOn("POWER2") || phaseOn("Power2") || phaseOn("power2");
  const cNow = phaseOn("Disparo na Fase C") || phaseOn("POWER3") || phaseOn("Power3") || phaseOn("power3");

  const now = Date.now();

  if (aNow && !phasePrev.A) {
    pushEvent("bad", "Delta Sucroenergia - Unidade Conquista de Minas: Disparo na Fase A.");
    if (now - lastBeep.A > BEEP_COOLDOWN_MS) { playBeep(); lastBeep.A = now; }
  }
  if (bNow && !phasePrev.B) {
    pushEvent("bad", "Delta Sucroenergia - Unidade Conquista de Minas: Disparo na Fase B.");
    if (now - lastBeep.B > BEEP_COOLDOWN_MS) { playBeep(); lastBeep.B = now; }
  }
  if (cNow && !phasePrev.C) {
    pushEvent("bad", "Delta Sucroenergia - Unidade Conquista de Minas: Disparo na Fase C.");
    if (now - lastBeep.C > BEEP_COOLDOWN_MS) { playBeep(); lastBeep.C = now; }
  }

  // (Opcional) registrar normalização:
  // if (!aNow && phasePrev.A) pushEvent("ok", "Fase A normalizada.");
  // if (!bNow && phasePrev.B) pushEvent("ok", "Fase B normalizada.");
  // if (!cNow && phasePrev.C) pushEvent("ok", "Fase C normalizada.");

  phasePrev.A = aNow;
  phasePrev.B = bNow;
  phasePrev.C = cNow;
}

// ================== MQTT (render + polling) ==================
function renderMqttBox(payload) {
  const box = document.getElementById("mqtt-list");
  const values = payload?.values || {};
  const ts = payload?.ts || 0;
  const when = ts ? new Date(ts * 1000).toLocaleTimeString() : "—";

  if (!Object.keys(values).length) {
    box.innerHTML = `
      <div class="event"><span class="dot warn"></span><div>Sem dados MQTT disponíveis.</div></div>
      <div class="muted" style="padding:6px 0">Atualizado: ${when}</div>
    `;
    return;
  }

  // Render só do "Tempo real (MQTT)" — sem interferir nos "Eventos recentes"
  let html = "";
  for (const [label, val] of Object.entries(values)) {
    const n = typeof val === "number" ? val.toFixed(2) : String(val);
    html += `
      <div class="event" style="justify-content:space-between;align-items:center">
        <div style="flex:1;display:flex;align-items:center;gap:8px">
          <span class="dot ok"></span><b>${label}</b>
        </div>
        <div style="font-weight:600;color:#38bdf8">${n}</div>
      </div>
    `;
  }

  box.innerHTML = html + `
    <div class="muted" style="padding:6px 0">Atualizado: ${when}</div>
  `;

  // 🔔 Disparos A/B/C → eventos + beep
  detectTripsAndNotify(values);
}

function startMqttPolling(plant) {
  const access = localStorage.getItem('access');
  if (!access || !plant?.id) return;

  const url = `/api/plants/${plant.id}/mqtt/latest/`;
  const headers = { Authorization: `Bearer ${access}` };

  async function tick() {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) return;
      const data = await r.json();
      renderMqttBox(data);
    } catch (e) {
      console.error('MQTT latest error:', e);
    }
  }

  if (window._mqttTimer) clearInterval(window._mqttTimer);
  tick();
  window._mqttTimer = setInterval(tick, 2000);
}

// ================== Render da planta (painel lateral) ==================
function renderPlantPanel(p, label){
  document.getElementById("p-title").textContent = label;

  const clientTxt = (p.client_name || "Cliente");
  const apsTxt = " • APS URN: " + (p.aps_urn || "—");
  const tagsHtml = renderTagsBadges(p.tags);
  document.getElementById("p-sub").innerHTML = clientTxt + apsTxt + tagsHtml;

  // KPIs
  document.getElementById("k-ativos").textContent   = "—";
  document.getElementById("k-sensores").textContent = "—";
  document.getElementById("k-gw").textContent       = "—";

  // Limpa eventos fixos e mostra placeholder
  document.getElementById("events-list").innerHTML = `
    <div class="event"><span class="dot warn"></span><div>Sem eventos.</div></div>
    <div style="padding:10px 0">
      <button onclick="openApsViewer('${(p.aps_urn||"").replace(/'/g, "\\'")}')"
              style="background:#38bdf8;color:#0f172a;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700">
        Abrir 3D no Viewer
      </button>
    </div>
  `;

  // ----- GRAFANA: habilitar botão se houver base + UID -----
  const gBase = grafanaBaseUrl();
  const dash  = p.grafana_uid || p.grafana_dashboard_uid || p.grafana; // ajuste ao seu schema
  let gUrl = "";
  if (gBase && dash) {
    // Passe variáveis que desejar (ex.: id da planta)
    gUrl = `${gBase}/d/${dash}?orgId=1&var-plant=${encodeURIComponent(p.id)}&kiosk=tv`;
  }
  enableGrafanaButton(gUrl);
}

// ================== Carrega plantas e plota ==================
async function loadPlants(){
  const res = await fetch("/api/plants/", { headers:{ Authorization:"Bearer "+access }});
  const items = await res.json();
  if (!Array.isArray(items) || items.length===0){ console.warn("Sem plantas para exibir"); return; }

  const bounds = [];
  items.forEach((p, idx)=>{
    const label = p.name || `Planta ${idx+1}`;
    const cls = tagForIndex(idx);
    const lat = toNum(p.latitude), lon = toNum(p.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lon)){
      const marker = L.marker([lat,lon], { icon: plantTag(label, cls) }).addTo(map);

      marker.on("click", ()=>{
        renderPlantPanel(p, label);
        startMqttPolling(p);
        // openApsViewer(p.aps_urn); // se quiser abrir automaticamente
      });

      bounds.push([lat,lon]);
    }
  });

  const FIT_MAX_ZOOM = 12;
  const SINGLE_ZOOM  = 12;

  if (bounds.length > 0) {
    if (bounds.length === 1) {
      map.setView(bounds[0], SINGLE_ZOOM);
    } else {
      map.fitBounds(bounds, { padding:[30,30], maxZoom: FIT_MAX_ZOOM });
    }
  }
}

loadPlants().catch(err=>console.error(err));
