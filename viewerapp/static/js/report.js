// reports.js — gráficos em tempo real usando /api/plants/<id>/mqtt/latest/
// substitui totalmente o arquivo

(() => {
  const pane = document.getElementById("pane-relatorios");
  if (!pane) return;

  const lblPlant = document.getElementById("rel-plant-name");
  const emptyMsg = document.getElementById("rel-empty");

  let charts = null;
  let timer = null;
  const MAX_POINTS = 240; // ~8 minutos a 2s

  function log(...a){ console.log("[reports]", ...a); }
  function warn(...a){ console.warn("[reports]", ...a); }

  function requireCanvas(id){
    const el = document.getElementById(id);
    if (!el) warn(`Canvas #${id} não encontrado`);
    return el;
  }

  function mkChart(ctx, label, unit){
    if (!window.Chart){
      warn("Chart.js não carregado. Confira a ordem dos scripts no viewer.html.");
      return null;
    }
    return new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{ label: `${label} (${unit})`, data: [] }] },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: { legend: { display: true } },
        scales: {
          x: { type: "time", time: { unit: "minute", tooltipFormat: "HH:mm:ss" } },
          y: { beginAtZero: false }
        }
      }
    });
  }

  function ensureCharts(){
    if (charts) return charts;

    const cV  = requireCanvas("chart-voltage");
    const cC  = requireCanvas("chart-current");
    const cPA = requireCanvas("chart-power");

    charts = {
      tensao:   mkChart(cV,  "Tensão",          "V"),
      corrente: mkChart(cC,  "Corrente",        "A"),
      potencia: mkChart(cPA, "Potência Ativa",  "W"),
    };

    // força um primeiro resize (canvas recém-visualizado)
    setTimeout(() => {
      Object.values(charts).forEach(ch => ch && ch.resize());
    }, 50);

    return charts;
  }

  function resetCharts(){
    if (!charts) return;
    Object.values(charts).forEach(ch => {
      if (!ch) return;
      ch.data.labels = [];
      ch.data.datasets[0].data = [];
      ch.update();
    });
  }

  function pushPoint(chart, x, y){
    if (!chart) return;
    chart.data.labels.push(x);
    chart.data.datasets[0].data.push(y);
    if (chart.data.labels.length > MAX_POINTS) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  }

  function firstNum(obj, keys){
    for (const k of keys){
      for (const kk of Object.keys(obj)){
        if (kk.toLowerCase() === String(k).toLowerCase()){
          const n = Number(obj[kk]);
          if (!Number.isNaN(n)) return n;
        }
      }
    }
    return NaN;
  }

  async function tick(plantId){
    const access = localStorage.getItem('access');
    if (!access || !plantId) { warn("Sem access token ou plantId"); return; }

    try {
      const r = await fetch(`/api/plants/${plantId}/mqtt/latest/`, {
        headers: { Authorization: `Bearer ${access}` }
      });
      if (!r.ok){
        warn("HTTP", r.status, "em /mqtt/latest/");
        return;
      }

      const data = await r.json();
      const now = data?.ts ? new Date(data.ts * 1000) : new Date();
      const values = data?.values || {};

      const v  = firstNum(values, ["V","tensao","Tensão"]);
      const c  = firstNum(values, ["C","corrente","Corrente"]);
      const pa = firstNum(values, ["PA","potencia","Potência Ativa","Potência"]);

      let any = false;
      if (isFinite(v))  { pushPoint(charts.tensao,   now, v);  any = true; }
      if (isFinite(c))  { pushPoint(charts.corrente, now, c);  any = true; }
      if (isFinite(pa)) { pushPoint(charts.potencia, now, pa); any = true; }

      if (emptyMsg) emptyMsg.style.display = any ? "none" : "block";
    } catch (e) {
      warn("tick error:", e);
    }
  }

  // === API global chamada pelo viewer.js ===
  window.loadReportForPlant = (slugOrId, plantName) => {
    if (lblPlant && plantName) lblPlant.textContent = plantName;

    const pid = window.currentPlantId || (Number.isInteger(slugOrId) ? slugOrId : null);
    if (!pid){
      warn("Sem plantId; clique no marcador da planta.");
      if (emptyMsg) emptyMsg.style.display = "block";
      return;
    }

    ensureCharts();
    resetCharts();

    // exibe “aguardando dados” até chegar algo
    if (emptyMsg) emptyMsg.style.display = "block";

    if (timer) clearInterval(timer);
    tick(pid);
    timer = setInterval(() => tick(pid), 2000);
  };
})();
