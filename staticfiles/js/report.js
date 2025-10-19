// reports.js — Gráficos de histórico MQTT
(() => {
  const btn = document.getElementById("btn-relatorios");
  const pane = document.getElementById("pane-relatorios");
  if (!btn || !pane) return;

  btn.addEventListener("click", () => pane.classList.toggle("hidden"));

  const mkChart = (ctx, label, unit) =>
    new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{ label: `${label} (${unit})`, data: [] }] },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: { legend: { display: true } },
        scales: { x: { type: "time", time: { unit: "minute" } } },
      },
    });

  const charts = {
    V: mkChart(document.getElementById("chart-voltage"), "Tensão", "V"),
    C: mkChart(document.getElementById("chart-current"), "Corrente", "A"),
    PA: mkChart(document.getElementById("chart-power"), "Potência", "W"),
  };

  async function carregarRelatorio(plantSlug) {
    try {
      const resp = await fetch(`/api/reports/${plantSlug}/`);
      if (!resp.ok) return console.warn("Erro ao buscar relatório:", resp.status);
      const data = await resp.json();

      for (const [metric, series] of Object.entries(data)) {
        const chart = charts[metric];
        if (!chart) continue;
        chart.data.labels = series.map(p => new Date(p[0]));
        chart.data.datasets[0].data = series.map(p => p[1]);
        chart.update();
      }
    } catch (e) {
      console.error("Erro relatório:", e);
    }
  }

  window.loadReportForPlant = (slug) => {
    carregarRelatorio(slug);
    clearInterval(window._reportTimer);
    window._reportTimer = setInterval(() => carregarRelatorio(slug), 30000);
  };
})();
