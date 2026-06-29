// ---------------- Constantes globales ----------------
const HOST = window.location.hostname;
const BACKEND_URL = `https://${HOST}:4000`;

// ---------------- Utilidades de formato ----------------
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---------------- Pestañas ----------------
const TAB_IDS = { dashboard: "tabDashboard", phone: "tabPhone", history: "tabHistory", team: "tabTeam", admin: "tabAdmin", users: "tabUsers", recordings: "tabRecordings", parking: "tabParking", audit: "tabAudit" };
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(TAB_IDS[btn.dataset.tab]).classList.remove("hidden");
    if (btn.dataset.tab === "team") loadTeam(localStorage.getItem("cc_token"));
  });
});

// ---------------- Tabla paginada reutilizable ----------------
const PAGE_SIZE = 10;
const paginationState = {};

function renderCallRows(tbodyId, calls, adminMode) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";
  calls.forEach((call) => {
    const tr = document.createElement("tr");
    const duration = call.duration_seconds > 0 ? formatDuration(call.duration_seconds) : "No contestada";
    if (adminMode) {
      tr.innerHTML = `
        <td class="mono">${formatTime(call.ended_at)}</td>
        <td class="mono">${call.other_party}</td>
        <td class="mono">${duration}</td>
      `;
    } else {
      tr.innerHTML = `
        <td class="mono">${formatTime(call.ended_at)}</td>
        <td class="mono">${call.other_party}</td>
        <td><span class="dir-badge dir-${call.direction}">${call.direction}</span></td>
        <td class="mono">${duration}</td>
      `;
    }
    tbody.appendChild(tr);
  });
}

function renderPaginationControls(tbodyId, paginationId) {
  const state = paginationState[tbodyId];
  const totalPages = Math.max(1, Math.ceil(state.calls.length / PAGE_SIZE));
  const el = document.getElementById(paginationId);
  el.innerHTML = `
    <button id="${paginationId}-prev">&lt;</button>
    <span class="page-info">${state.page} de ${totalPages}</span>
    <button id="${paginationId}-next">&gt;</button>
  `;
  document.getElementById(`${paginationId}-prev`).disabled = state.page <= 1;
  document.getElementById(`${paginationId}-next`).disabled = state.page >= totalPages;
  document.getElementById(`${paginationId}-prev`).onclick = () => {
    if (state.page > 1) { state.page--; renderPageFor(tbodyId, paginationId, state.noMsgId); }
  };
  document.getElementById(`${paginationId}-next`).onclick = () => {
    if (state.page < totalPages) { state.page++; renderPageFor(tbodyId, paginationId, state.noMsgId); }
  };
}

function renderPageFor(tbodyId, paginationId, noMsgId) {
  const state = paginationState[tbodyId];
  if (state.calls.length === 0) {
    document.getElementById(noMsgId).classList.remove("hidden");
    document.getElementById(tbodyId).innerHTML = "";
    document.getElementById(paginationId).innerHTML = "";
    return;
  }
  document.getElementById(noMsgId).classList.add("hidden");
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = state.calls.slice(start, start + PAGE_SIZE);
  renderCallRows(tbodyId, pageItems, state.adminMode);
  renderPaginationControls(tbodyId, paginationId);
}

function fillCallsTable(tbodyId, calls, noMsgId, paginationId, adminMode) {
  paginationState[tbodyId] = { calls, page: 1, noMsgId, adminMode: !!adminMode };
  renderPageFor(tbodyId, paginationId, noMsgId);
}

function setTableHeader(tbodyId, columns) {
  const tbody = document.getElementById(tbodyId);
  const thead = tbody.closest("table").querySelector("thead tr");
  thead.innerHTML = columns.map((c) => `<th>${c}</th>`).join("");
}
