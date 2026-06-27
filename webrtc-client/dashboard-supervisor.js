async function loadTeam(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/supervisor/team`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return;

    document.getElementById("teamTotalCalls").textContent = data.totals.totalCalls;
    document.getElementById("teamTotalAnswered").textContent = data.totals.totalAnswered;
    document.getElementById("teamTmo").textContent = formatDuration(Math.round(data.totals.avgDurationSeconds));

    const tbody = document.getElementById("teamTableBody");
    tbody.innerHTML = "";
    data.team.forEach((agent) => {
      const tr = document.createElement("tr");
      const statusHtml = agent.inCall
        ? '<span class="incall-pill">En llamada</span>'
        : `<span class="online-dot ${agent.online ? "yes" : ""}"></span>${agent.online ? "En línea" : "Desconectado"}`;
      tr.className = "row-clickable";
      tr.innerHTML = `
        <td class="mono">${agent.username}</td>
        <td class="mono">${agent.extension}</td>
        <td>${statusHtml}</td>
        <td class="mono">${agent.totalCalls}</td>
        <td class="mono">${formatDuration(Math.round(agent.avgDurationSeconds))}</td>
      `;
      tr.addEventListener("click", () => openAgentModal(agent.username));
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error cargando equipo:", err);
  }
}

async function openAgentModal(username) {
  const token = localStorage.getItem("cc_token");
  try {
    const res = await fetch(`${BACKEND_URL}/api/supervisor/agent/${username}/calls`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Error al cargar el agente");

    document.getElementById("modalAgentTitle").textContent = `${data.username} · ext. ${data.extension}`;
    document.getElementById("modalTotal").textContent = data.stats.total_calls || 0;
    document.getElementById("modalAnswered").textContent = data.stats.answered_calls || 0;
    document.getElementById("modalTmo").textContent = formatDuration(Math.round(data.stats.avg_duration_seconds) || 0);

    renderCallRows("modalCallsBody", data.calls || []);
    document.getElementById("agentModal").classList.remove("hidden");
  } catch (err) {
    console.error("Error abriendo modal:", err);
  }
}

document.getElementById("modalClose").onclick = () => {
  document.getElementById("agentModal").classList.add("hidden");
};
document.getElementById("agentModal").addEventListener("click", (e) => {
  if (e.target.id === "agentModal") e.target.classList.add("hidden");
});
