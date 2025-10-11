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

// --- Mapa Leaflet ---
const map = L.map('map',{zoomControl:true}).setView([-23.55,-46.63], 10);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);

const tagClasses = ["tag-yellow","tag-green","tag-red","tag-blue"];
const tagForIndex = (i)=> tagClasses[i % tagClasses.length];

function plantTag(label, cls){
  return L.divIcon({
    className: "",
    html: `<div class="plant-tag ${cls}" title="${label}">${label}</div>`,
    iconSize:[10,10], iconAnchor:[10,10], popupAnchor:[0,-8]
  });
}

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

function startMqttPolling(plant) {
  const access = localStorage.getItem('access');
  if (!access || !plant?.id) return;

  const url = `/api/plants/${plant.id}/mqtt/latest/`;
  const headers = { Authorization: `Bearer ${access}` };

  const render = (data) => {
    // TODO: atualize aqui a caixinha “Tempo real (MQTT)”
    // exemplo: document.querySelector('#mqtt-box').textContent = JSON.stringify(data.values);
  };

  const tick = () => {
    fetch(url, { headers })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(render)
      .catch(err => console.error('MQTT latest error:', err));
  };

  tick(); // chama já na primeira vez
  if (window._mqttTimer) clearInterval(window._mqttTimer);
  window._mqttTimer = setInterval(tick, 2000);
}

// Depois que renderizar os dados da planta no card/detalhe:
renderPlant(plant);
startMqttPolling(plant);

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

// --- Carrega plantas e plota ---
async function loadPlants(){
  const res = await fetch("/api/plants/", { headers:{ Authorization:"Bearer "+access }});
  const items = await res.json();
  if (!Array.isArray(items) || items.length===0){ console.warn("Sem plantas para exibir"); return; }

  const bounds = [];
  items.forEach((p, idx)=>{
    const label = p.name || `Planta ${idx+1}`;
    const cls = tagForIndex(idx);
    const lat = parseFloat(p.latitude), lon = parseFloat(p.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lon)){
      const marker = L.marker([lat,lon], { icon: plantTag(label, cls) }).addTo(map);

      marker.on("click", ()=>{
        // Painel direito
        document.getElementById("p-title").textContent = label;
        document.getElementById("p-sub").textContent = (p.client_name||"Cliente") + " • APS URN: " + (p.aps_urn || "—");
        document.getElementById("k-ativos").textContent = "—";
        document.getElementById("k-sensores").textContent = "—";
        document.getElementById("k-gw").textContent = "—";
        document.getElementById("events-list").innerHTML = `
          <div class="event"><span class="dot danger"></span><div><b>${label}</b>: Limite de vibração excedido.</div></div>
          <div class="event"><span class="dot warn"></span><div><b>${label}</b>: Temperatura acima do ideal.</div></div>
          <div class="event"><span class="dot ok"></span><div><b>${label}</b>: Inspeção concluída.</div></div>
          <div style="padding:10px 0">
            <button onclick="openApsViewer('${(p.aps_urn||"").replace(/'/g, "\\'")}')"
                    style="background:#38bdf8;color:#0f172a;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700">
              Abrir 3D no Viewer
            </button>
          </div>
        `;
        // Abrir automaticamente ao clicar no pin:
        openApsViewer(p.aps_urn);
      });

      bounds.push([lat,lon]);
    }
  });

  if (bounds.length>0){ map.fitBounds(bounds, { padding:[30,30] }); }
}

loadPlants().catch(err=>console.error(err));

let mqttSource = null;   // EventSource atual

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

  let html = "";
  for (const [label, val] of Object.entries(values)) {
    const n = typeof val === "number" ? val.toFixed(2) : val;
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

// dentro do handler do marcador (já existe), substitua / acrescente:
marker.on("click", ()=>{
  // --- dentro do marker.on("click", ()=>{ ... }) ---

// 1) fecha stream anterior, se existir
if (window._mqttTimer) { clearInterval(window._mqttTimer); window._mqttTimer = null; }

// 2) função para desenhar a caixa de valores
function renderMqttBox(payload) {
  const box = document.getElementById("mqtt-list");
  const values = (payload && payload.values) || {};
  const ts = (payload && payload.ts) || 0;
  const when = ts ? new Date(ts * 1000).toLocaleTimeString() : "—";

  if (!Object.keys(values).length) {
    box.innerHTML = `
      <div class="event"><span class="dot warn"></span><div>Sem dados MQTT disponíveis.</div></div>
      <div class="muted" style="padding:6px 0">Atualizado: ${when}</div>
    `;
    return;
  }

  const rows = Object.entries(values).map(([k,v])=>{
    const n = (typeof v === "number") ? v.toFixed(2) : String(v);
    return `
      <div class="event" style="justify-content:space-between;align-items:center">
        <div style="flex:1;display:flex;align-items:center;gap:8px">
          <span class="dot ok"></span><b>${k}</b>
        </div>
        <div style="font-weight:600;color:#38bdf8">${n}</div>
      </div>`;
  }).join("");

  document.getElementById("mqtt-list").innerHTML =
    rows + `<div class="muted" style="padding:6px 0">Atualizado: ${when}</div>`;
}

// 3) polling a cada 2s (envia Authorization corretamente)
async function fetchLatest() {
  try {
    const r = await fetch(`/api/plants/${p.id}/mqtt/latest/`, {
      headers: { Authorization: "Bearer " + access }
    });
    if (!r.ok) return;
    const data = await r.json();
    renderMqttBox(data);
  } catch (e) { /* ignora */ }
}
fetchLatest();
window._mqttTimer = setInterval(fetchLatest, 2000);
});
