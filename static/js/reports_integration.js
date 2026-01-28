// static/js/reports_integration.js
// --------------------------------------------------------------------
// Integração entre o viewer (mapa/plantas) e o módulo de relatórios.
// - Não chama loadReportForPlant se a planta não mudou
// - Ao voltar, apenas pausa o pooling (mantém histórico)
// - Ao abrir, retoma pooling se for a mesma planta
// --------------------------------------------------------------------
(() => {
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

  // planta atualmente carregada nos relatórios
  window._reportPlantKey = window._reportPlantKey || null;

  function ensureReportsForCurrent(){
    const key  = window.currentPlantSlug || window.currentPlantId;
    const name = window.currentPlantName;
    if (!key) return;

    if (window._reportPlantKey !== key) {
      window._reportPlantKey = key;
      if (typeof window.loadReportForPlant === "function") {
        window.loadReportForPlant(key, name);
      }
    } else if (typeof window.resumeReport === "function") {
      window.resumeReport();
    }
  }

  if (btnReports) {
    btnReports.addEventListener("click", () => {
      showReportsPane();
      ensureReportsForCurrent();
    });
  }

  if (btnBack) {
    btnBack.addEventListener("click", () => {
      showDefaultPane();
      if (typeof window.pauseReport === "function") window.pauseReport();
    });
  }

  // Quando o nome da planta mudar no header, tentamos sincronizar os relatórios
  const nameEl = document.getElementById("rel-plant-name");
  if (nameEl && window.MutationObserver) {
    const mo = new MutationObserver(() => ensureReportsForCurrent());
    mo.observe(nameEl, { childList: true, characterData: true, subtree: true });
  }
})();
