// =====================
//  Auth guard (JWT)
// =====================
const access = localStorage.getItem("access");
if (!access) { location.href = "/login/"; }

fetch("/api/me/", { headers: { Authorization: "Bearer " + access } })
  .then(r => r.json())
  .then(d => {
    const name = d.user || d.username || "Usuário";
    const who = document.getElementById("who");
    if (who) who.textContent = name;
  })
  .catch(() => {});

const btnLogout = document.getElementById("logout");
if (btnLogout) {
  btnLogout.onclick = () => { localStorage.clear(); location.href = "/login/"; };
}

// =====================
//  Helpers / UI
// =====================
const tagClasses = ["tag-yellow", "tag-green", "tag-red", "tag-blue"];
const tagForIndex = (i) => tagClasses[i % tagClasses.length];
const toNum = (x) => Number(String(x ?? "").replace(",", "."));

function renderTagsBadges(tags) {
  if (!Array.isArray(tags) || !tags.length) return "";
  return `
    <div id="p-tags" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
      ${tags.map(t => `
        <span class="plant-tag ${t?.className || ""}"
              style="display:inline-flex;align-items:center;gap:6px;
                     padding:2px 8px;border-radius:12px;
                     background:${t?.color || '#e5e7eb'}; color:#0b0b0b; font-size:12px;">
          ${t?.icon ? `<i class="lni lni-${t.icon}"></i>` : ""}${t?.name || ""}
        </span>
      `).join("")}
    </div>`;
}

function plantTag(label, cls) {
  return L.divIcon({
    className: "",
    html: `<div class="plant-tag ${cls}" title="${label}">${label}</div>`,
    iconSize: [10, 10], iconAnchor: [10, 10], popupAnchor: [0, -8]
  });
}

// =====================
//  Leaflet map
// =====================
const map = L.map('map', { zoomControl: true }).setView([-23.55, -46.63], 10);
L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: '© OpenStreetMap' }
).addTo(map);

// =====================
//  APS Viewer helpers
// =====================
let _apsViewer = null;

async function getApsToken() {
  const r = await fetch("/api/aps/token/");
  if (!r.ok) throw new Error("Falha ao obter token APS");
  const j = await r.json();
  return { access_token: j.access_token, expires_in: j.expires_in };
}

async function openApsViewer(urn) {
  if (!urn) { alert("Esta planta não possui APS URN configurada."); return; }
  const overlay = document.getElementById("aps-overlay");
  if (overlay) overlay.style.display = "block";

  const opts = {
    env: "AutodeskProduction",
    getAccessToken: async (onTokenReady) => {
      const t = await getApsToken();
      onTokenReady(t.access_token, t.expires_in);
    }
  };

  if (!_apsViewer) {
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

const apsClose = document.getElementById("aps-close");
if (apsClose) {
  apsClose.onclick = () => {
    const overlay = document.getElementById("aps-overlay");
    if (overlay) overlay.style.display = "none";
    if (_apsViewer && _apsViewer.model) { _apsViewer.unloadModel(_apsViewer.model); }
  };
}

// =====================
//  MQTT (render + polling)
// =====================
function renderMqttBox(payload) {
  const box = document.getElementById("mqtt-list");
  if (!box) return;

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

// =====================
//  Painel da planta (direita)
// =====================
function renderPlantPanel(p, label) {
  const title = document.getElementById("p-title");
  const sub = document.getElementById("p-sub");
  if (title) title.textContent = label;

  const clientTxt = (p.client_name || "Cliente");
  const apsTxt = " • APS URN: " + (p.aps_urn || "—");
  const tagsHtml = renderTagsBadges(p.tags);
  if (sub) sub.innerHTML = clientTxt + apsTxt + tagsHtml;

  const kAtivos = document.getElementById("k-ativos");
  const kSens   = document.getElementById("k-sensores");
  const kGw     = document.getElementById("k-gw");
  if (kAtivos) kAtivos.textContent = "—";
  if (kSens)   kSens.textContent   = "—";
  if (kGw)     kGw.textContent     = "—";

  const events = document.getElementById("events-list");
  if (events) {
    events.innerHTML = `
      <div class="event"><span class="dot danger"></span><div><b>${label}</b>: Limite de vibração excedido.</div></div>
      <div class="event"><span class="dot warn"></span><div><b>${label}</b>: Temperatura acima do ideal.</div></div>
      <div class="event"><span class="dot ok"></span><div><b>${label}</b>: Inspeção concluída.</div></div>
      <div style="padding:10px 0">
        <button onclick="openApsViewer('${(p.aps_urn || "").replace(/'/g, "\\'")}')"
                style="background:#38bdf8;color:#0f172a;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700">
          Abrir 3D no Viewer
        </button>
      </div>
    `;
  }
}

// =====================
//  Alternância de painéis (direita)
// =====================
const paneDefault = document.getElementById("pane-default");
const paneReports = document.getElementById("pane-relatorios");
const btnReports  = document.getElementById("btn-relatorios");
const btnBack     = document.getElementById("relatorios-voltar");

function showDefaultPane() {
  if (paneReports) paneReports.classList.add("hidden");
  if (paneDefault) paneDefault.classList.remove("hidden");
}
function showReportsPane() {
  if (paneDefault) paneDefault.classList.add("hidden");
  if (paneReports) paneReports.classList.remove("hidden");
}

// =====================
//  Estado global da planta selecionada
// =====================
window.currentPlantSlug = null;
window.currentPlantId   = null;
window.currentPlantName = null;
window._firstPlantCache = null;

// Helper: chama loadReportForPlant quando reports.js estiver pronto
function callReportsWhenReady(slugOrId, name, tries = 0) {
  if (typeof window.loadReportForPlant === "function") {
    window.loadReportForPlant(slugOrId, name);
  } else {
    if (tries > 20) { // ~3s com 150ms
      console.warn("loadReportForPlant não disponível.");
      return;
    }
    setTimeout(() => callReportsWhenReady(slugOrId, name, tries + 1), 150);
  }
}

// Botão da barra lateral abre Relatórios
if (btnReports) btnReports.addEventListener("click", () => {
  // Se nenhuma planta foi selecionada ainda, usa a primeira válida carregada
  if (!window.currentPlantId && window._firstPlantCache) {
    const { p, label } = window._firstPlantCache;
    renderPlantPanel(p, label);
    startMqttPolling(p);
    window.currentPlantSlug = p.slug || null;
    window.currentPlantId   = p.id;
    window.currentPlantName = p.name || label;
    const el = document.getElementById("rel-plant-name");
    if (el) el.textContent = window.currentPlantName;
  }

  showReportsPane();

  const slug = window.currentPlantSlug;
  const name = window.currentPlantName;
  const id   = window.currentPlantId;

  if (slug || id) {
    // chama a função de relatórios (slug prioritário, id como fallback)
    callReportsWhenReady(slug || id, name);
  } else {
    alert("Selecione uma planta no mapa primeiro.");
  }
});

// Botão Voltar
if (btnBack) btnBack.addEventListener("click", showDefaultPane);

// =====================
//  Carrega plantas e plota
// =====================
async function loadPlants() {
  const res = await fetch("/api/plants/", { headers: { Authorization: "Bearer " + access } });
  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) { console.warn("Sem plantas para exibir"); return; }

  const bounds = [];
  let first = null;

  items.forEach((p, idx) => {
    const label = p.name || `Planta ${idx + 1}`;
    const cls = tagForIndex(idx);
    const lat = toNum(p.latitude), lon = toNum(p.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const marker = L.marker([lat, lon], { icon: plantTag(label, cls) }).addTo(map);

      marker.on("click", () => {
        renderPlantPanel(p, label);
        startMqttPolling(p);

        // guarda seleção atual para Relatórios
        window.currentPlantSlug = p.slug || null;
        window.currentPlantId   = p.id;
        window.currentPlantName = p.name || label;
        const el = document.getElementById("rel-plant-name");
        if (el) el.textContent = window.currentPlantName;

        // pré-carrega dados (o painel abre quando clicar no botão)
        callReportsWhenReady(p.slug || p.id, window.currentPlantName);
      });

      // primeira planta válida para seleção automática
      if (!first) first = { p, label };
      bounds.push([lat, lon]);
    }
  });

  // guarda para fallback do botão
  window._firstPlantCache = first || null;

  const FIT_MAX_ZOOM = 12;
  const SINGLE_ZOOM = 12;
  if (bounds.length > 0) {
    if (bounds.length === 1) map.setView(bounds[0], SINGLE_ZOOM);
    else map.fitBounds(bounds, { padding: [30, 30], maxZoom: FIT_MAX_ZOOM });
  }

  // Seleciona automaticamente a primeira planta (preenche currentPlant*)
  if (first) {
    const { p, label } = first;
    renderPlantPanel(p, label);
    startMqttPolling(p);
    window.currentPlantSlug = p.slug || null;
    window.currentPlantId   = p.id;
    window.currentPlantName = p.name || label;
    const el = document.getElementById("rel-plant-name");
    if (el) el.textContent = window.currentPlantName;
    callReportsWhenReady(p.slug || p.id, window.currentPlantName);
  }
}

loadPlants().catch(err => console.error(err));
