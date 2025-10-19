// reports.js — Gráficos de histórico MQTT
(() => {
  const pane = document.getElementById("pane-relatorios");
  if (!pane) return;

  let charts = null;

  function mkChart(ctx, label, unit) {
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

  function ensureCharts() {
    if (charts) return charts;
    charts = {
      V: mkChart(document.getElementById("chart-voltage"), "Tensão", "V"),
      C: mkChart(document.getElementById("chart-current"), "Corrente", "A"),
      PA: mkChart(document.getElementById("chart-power"), "Potência", "W")
    };
    return charts;
  }

  async function carregarRelatorio(plantSlug) {
    try {
      const resp = await fetch(`/api/reports/${plantSlug}/`);
      const url = `/api/reports/${plantSlug}/`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn("Erro /api/reports:", resp.status);
        return;
      }
      const data = await resp.json();
      const hasAny = Object.values(data).some(arr => Array.isArray(arr) && arr.length);

      // cria charts quando o pane está visível, melhora layout do canvas
      ensureCharts();
      // atualiza dados
      for (const [metric, series] of Object.entries(data)) {
        const ch = charts[metric];
        if (!ch) continue;
        ch.data.labels = series.map(p => new Date(p[0]));
        ch.data.datasets[0].data = series.map(p => p[1]);
        ch.update();
      }

      // feedback "sem dados"
      const empty = document.getElementById("rel-empty");
      empty.style.display = hasAny ? "none" : "block";

      // força resize quando mostrarelatórios (caso canvas tenha sido criado oculto)
      setTimeout(() => {
        Object.values(charts).forEach(ch => ch.resize());
      }, 50);

    } catch (e) {
      console.error("Erro relatório:", e);
    }
  }

  // API global usada por viewer.js
  window.loadReportForPlant = (slug, plantName) => {
    const labelEl = document.getElementById("rel-plant-name");
    if (labelEl && plantName) labelEl.textContent = plantName;
    carregarRelatorio(slug);
    clearInterval(window._reportTimer);
    window._reportTimer = setInterval(() => carregarRelatorio(slug), 30000);
  };
})();
