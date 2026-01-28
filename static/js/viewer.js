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
//  APS Viewer helpers (overlay modal + IconMarkupExtension)
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
      try {
        const t = await getApsToken();
        onTokenReady(t.access_token, t.expires_in);
      } catch (e) {
        console.error("Erro token APS:", e);
      }
    }
  };

  if (!_apsViewer) {
    await new Promise(res => Autodesk.Viewing.Initializer(opts, res));
    const el = document.getElementById("aps-viewer");
    _apsViewer = new Autodesk.Viewing.GuiViewer3D(el, { extensions: [] });
    const started = _apsViewer.start();
    if (started > 0) {
      console.error("Não foi possível iniciar o viewer");
      alert("Erro ao iniciar o viewer 3D.");
      return;
    }
  }

  if (_apsViewer.model) {
    try { _apsViewer.unloadModel(_apsViewer.model); } catch (_) {}
  }

  const docUrn = urn.startsWith("urn:") ? urn : ("urn:" + urn);
  Autodesk.Viewing.Document.load(docUrn,
    (doc) => {
      const defaultModel = doc.getRoot().getDefaultGeometry();
      _apsViewer.loadDocumentNode(doc, defaultModel)
        .then(() => onApsModelLoaded())
        .catch((e) => {
          console.error("Erro ao carregar nó do documento:", e);
          alert("Erro ao carregar o modelo 3D.");
        });
    },
    (err) => {
      console.error("Erro ao carregar documento:", err);
      alert("Erro ao carregar o modelo 3D.");
    }
  );
}

// =====================
//  ÍCONES DINÂMICOS (Admin + MQTT → IconMarkupExtension)
// =====================
const ICON_EXT_ID = "IconMarkupExtension";
let _iconMapping = [];             // itens do admin para a planta atual
let _lastMqttPayload = null;       // payload completo do MQTT (values e/ou topics)
let _pendingIcons = null;          // ícones aguardando o modelo abrir
let _iconExtInstance = null;       // instância atual da extensão
let _lastIconsSignature = "";      // assinatura dos ícones aplicados
let _reloadTimer = null;           // debounce do reload
const RELOAD_DEBOUNCE_MS = 350;    // ajuste fino para evitar “piscar”
const DEBUG_ICONS = false;         // mude para true para logs

async function loadIconMappingForPlant(plantId) {
  try {
    const access = localStorage.getItem('access');
    const url = `/api/plants/${plantId}/icons/`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
    if (!r.ok) {
      const txt = await r.text().catch(()=> "");
      console.error("Icon mapping fetch failed:", r.status, r.statusText, txt);
      throw new Error("Falha ao buscar mapping de ícones");
    }
    _iconMapping = await r.json() || [];
    updateIconOverlay();
  } catch (e) {
    console.error("Icon mapping error:", e);
    _iconMapping = [];
    updateIconOverlay();
  }
}

// Resolve valor na ordem:
// 1) topics[topic][field_path]
// 2) values[key] (aninhado OU flat com chave pontuada)
// 3) values[field_path] (aninhado OU flat)
function resolveValueFromPayload(payload, mapping) {
  if (!payload || !mapping) return undefined;

  // 1) por tópico
  if (mapping.topic && mapping.field_path) {
    const topics = payload.topics || {};
    const topicObj = topics?.[mapping.topic];
    if (topicObj) {
      const v1 = getNestedValue(topicObj, mapping.field_path);
      if (v1 !== undefined) return v1;
    }
  }

  const values = payload.values || {};

  // 2) por key em values
  if (mapping.key) {
    let v2 = getNestedValue(values, mapping.key);
    if (v2 === undefined && Object.prototype.hasOwnProperty.call(values, mapping.key)) {
      v2 = values[mapping.key];
    }
    if (v2 !== undefined) return v2;
  }

  // 3) por field_path em values (fallback)
  if (mapping.field_path) {
    let v3 = getNestedValue(values, mapping.field_path);
    if (v3 === undefined && Object.prototype.hasOwnProperty.call(values, mapping.field_path)) {
      v3 = values[mapping.field_path];
    }
    if (v3 !== undefined) return v3;
  }

  return undefined;
}

function getNestedValue(obj, dottedKey) {
  try {
    if (!obj || !dottedKey) return undefined;
    return dottedKey.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
  } catch { return undefined; }
}

function normalizeNumber(x) {
  const n = Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : x; // preserva string/undefined
}

function formatLabel(template, value, raw) {
  if (value === undefined || value === null) {
    return template ? String(template).replaceAll("{value}", "—") : "—";
  }
  const shown = (typeof value === "number") ? value.toFixed(2) : (raw ?? "");
  if (!template) return String(shown);
  return String(template).replaceAll("{value}", shown);
}

function buildIconsFromData(mappingList, payload) {
  if (!Array.isArray(mappingList) || mappingList.length === 0) return [];
  const icons = mappingList.map(m => {
    const raw = resolveValueFromPayload(payload, m);
    const v = normalizeNumber(raw);
    return {
      dbId: Number(m.dbId),
      label: formatLabel(m.labelTemplate, v, raw),
      css: String(m.css || "fas fa-map-marker-alt")
    };
  });
  if (DEBUG_ICONS) {
    console.debug("[Icones] mapping:", mappingList);
    console.debug("[Icones] payload:", payload);
    console.debug("[Icones] icons:", icons);
  }
  return icons;
}

// Estado do botão (true = ativo/visível, false = oculto)
function isIconToolbarActive() {
  try {
    const btn = _iconExtInstance?._button;
    if (!btn) return true; // assume visível
    const s = btn.getState?.();
    // v7: ACTIVE costuma ser 0
    return (s === Autodesk.Viewing.UI.Button.State?.ACTIVE) || (s === 0) || (s === undefined);
  } catch { return true; }
}

// Limpa camada DOM da extensão (força reconstrução dos labels)
function clearIconDomLayer() {
  try {
    const layer = _apsViewer?.container?.querySelector?.(".iconMarkup");
    if (layer) layer.innerHTML = "";
  } catch {}
}

// Recarrega a extensão preservando o estado do botão (ligado/desligado)
function reloadIconExtension(icons) {
  if (!_apsViewer?.model) return;

  const wasActive = isIconToolbarActive();

  try {
    if (_iconExtInstance) {
      _apsViewer.unloadExtension(ICON_EXT_ID);
      _iconExtInstance = null;
    }
  } catch {}

  _apsViewer.loadExtension(ICON_EXT_ID, {
    button: { icon: "fa-thermometer-half", tooltip: "Sensores" },
    icons,
    onClick: (id) => {
      _apsViewer.select([id]);
      _apsViewer.utilities.fitToView([id]);
      console.log("Clique no dbId:", id);
    }
  })
  .then(inst => {
    _iconExtInstance = inst;

    // aplica ícones explicitamente
    if (typeof inst.setIcons === "function") {
      inst.setIcons(icons);
    }

    // restaura estado do botão
    const btn = inst._button;
    if (btn && typeof btn.setState === "function" && Autodesk.Viewing.UI.Button.State) {
      btn.setState(wasActive ? Autodesk.Viewing.UI.Button.State.ACTIVE
                             : Autodesk.Viewing.UI.Button.State.INACTIVE);
    }

    // se estava ativo, força re-render agora
    if (wasActive) {
      clearIconDomLayer();
      if (typeof inst.showIcons === "function") {
        inst.showIcons(icons);
      }
    }
  })
  .catch(err => console.error("Falha ao carregar IconMarkupExtension:", err));
}

// Atualiza a UI dos ícones com debounce
function ensureIconExtension(icons) {
  if (!_apsViewer?.model) { _pendingIcons = icons; return; }

  const sig = JSON.stringify(icons);
  if (sig === _lastIconsSignature) return; // nada mudou
  _lastIconsSignature = sig;

  if (_reloadTimer) clearTimeout(_reloadTimer);
  _reloadTimer = setTimeout(() => reloadIconExtension(icons), RELOAD_DEBOUNCE_MS);
}

function updateIconOverlay() {
  const icons = buildIconsFromData(_iconMapping, _lastMqttPayload || { values: {} });
  ensureIconExtension(icons);
}

// Chamado quando o modelo termina de abrir
function onApsModelLoaded() {
  console.log("Modelo carregado.");
  if (_pendingIcons) {
    ensureIconExtension(_pendingIcons);
    _pendingIcons = null;
  } else {
    updateIconOverlay();
  }
}




// Botão fechar do overlay 3D
const apsClose = document.getElementById("aps-close");
if (apsClose) {
  apsClose.onclick = () => {
    const overlay = document.getElementById("aps-overlay");
    if (overlay) overlay.style.display = "none";
    if (_apsViewer && _apsViewer.model) {
      try { _apsViewer.unloadModel(_apsViewer.model); } catch (_) {}
    }
  };
}

// =====================
//  MQTT (render + polling)
// =====================
function renderMqttBox(payload) {
  const box = document.getElementById("mqtt-list");
  if (!box) return;

  // guarda payload completo e atualiza os ícones dinâmicos
  _lastMqttPayload = payload || { values: {} };
  updateIconOverlay();

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
    if (tries > 20) {
      console.warn("loadReportForPlant não disponível.");
      return;
    }
    setTimeout(() => callReportsWhenReady(slugOrId, name, tries + 1), 150);
  }
}

// Botão da barra lateral abre Relatórios
if (btnReports) btnReports.addEventListener("click", () => {
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
  if (!Array.isArray(items) || items.length === 0) {
    console.warn("Sem plantas para exibir");
    return;
  }

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
        window.currentPlantSlug = p.slug || null;
        window.currentPlantId   = p.id;
        window.currentPlantName = p.name || label;
        const el = document.getElementById("rel-plant-name");
        if (el) el.textContent = window.currentPlantName;

        // carrega mapping para esta planta
        loadIconMappingForPlant(p.id);

        callReportsWhenReady(p.slug || p.id, window.currentPlantName);
      });

      if (!first) first = { p, label };
      bounds.push([lat, lon]);
    }
  });

  window._firstPlantCache = first || null;

  const FIT_MAX_ZOOM = 12;
  const SINGLE_ZOOM = 12;
  if (bounds.length > 0) {
    if (bounds.length === 1) map.setView(bounds[0], SINGLE_ZOOM);
    else map.fitBounds(bounds, { padding: [30, 30], maxZoom: FIT_MAX_ZOOM });
  }

  if (first) {
    const { p, label } = first;
    renderPlantPanel(p, label);
    startMqttPolling(p);
    window.currentPlantSlug = p.slug || null;
    window.currentPlantId   = p.id;
    window.currentPlantName = p.name || label;
    const el = document.getElementById("rel-plant-name");
    if (el) el.textContent = window.currentPlantName;

    // mapping da primeira planta
    loadIconMappingForPlant(p.id);

    callReportsWhenReady(p.slug || p.id, window.currentPlantName);
  }
}

loadPlants().catch(err => console.error(err));
