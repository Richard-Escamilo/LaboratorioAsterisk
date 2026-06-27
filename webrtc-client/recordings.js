async function loadRecordingsSummary(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/recordings-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const tbody = document.getElementById("recordingsSummaryBody");
    tbody.innerHTML = "";
    (data.summary || []).forEach((u) => {
      const tr = document.createElement("tr");
      tr.className = "row-clickable";
      tr.innerHTML = `
        <td class="mono">${u.username}</td>
        <td class="mono">${u.extension}</td>
        <td class="mono">${u.recorded_count}</td>
        <td>${u.recorded_count > 0 ? '<button class="view-recordings-btn">Ver</button>' : ""}</td>
      `;
      if (u.recorded_count > 0) {
        tr.querySelector(".view-recordings-btn").addEventListener("click", () => openRecordingsModal(u.username));
      }
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error cargando resumen de grabaciones:", err);
  }
}

async function openRecordingsModal(username) {
  const token = localStorage.getItem("cc_token");
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/recordings/${username}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Error al cargar grabaciones");

    document.getElementById("recordingsModalTitle").textContent = `Grabaciones de ${username} (ext. ${data.extension})`;
    const player = document.getElementById("recordingPlayer");
    player.removeAttribute("src");

    const tbody = document.getElementById("recordingsListBody");
    tbody.innerHTML = "";
    data.calls.forEach((call) => {
      const tr = document.createElement("tr");
      const dt = new Date(call.ended_at);
      const dateLabel = dt.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const duration = call.duration_seconds > 0 ? formatDuration(call.duration_seconds) : "—";
      tr.innerHTML = `
        <td class="mono">${dateLabel}</td>
        <td class="mono">${call.other_party}</td>
        <td><span class="dir-badge dir-${call.direction}">${call.direction}</span></td>
        <td class="mono">${duration}</td>
        <td><button class="play-recording-btn">Reproducir</button></td>
      `;
      tr.querySelector(".play-recording-btn").addEventListener("click", () => playRecording(call.channel_id));
      tbody.appendChild(tr);
    });

    document.getElementById("recordingsModal").classList.remove("hidden");
  } catch (err) {
    console.error("Error abriendo grabaciones:", err);
  }
}

async function playRecording(channelId) {
  const token = localStorage.getItem("cc_token");
  const player = document.getElementById("recordingPlayer");
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/recordings/file/${encodeURIComponent(channelId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return alert("No se encontro el archivo de audio");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    player.src = url;
    player.play();
  } catch (err) {
    console.error("Error reproduciendo grabacion:", err);
  }
}

document.getElementById("recordingsModalClose").onclick = () => {
  document.getElementById("recordingsModal").classList.add("hidden");
  document.getElementById("recordingPlayer").pause();
};
document.getElementById("recordingsModal").addEventListener("click", (e) => {
  if (e.target.id === "recordingsModal") {
    e.target.classList.add("hidden");
    document.getElementById("recordingPlayer").pause();
  }
});

async function loadAdminDashboard(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/global-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    document.getElementById("statTotal").textContent = data.stats.total_calls || 0;
    document.getElementById("statAnswered").textContent = data.stats.answered_calls || 0;
    document.getElementById("statRateToday").textContent = calcRate(data.stats.total_calls, data.stats.answered_calls);
    document.getElementById("statTmo").textContent = formatDuration(Math.round(data.stats.avg_duration_seconds) || 0);

    document.getElementById("statTotalAll").textContent = data.totalStats.total_calls || 0;
    document.getElementById("statAnsweredAll").textContent = data.totalStats.answered_calls || 0;
    document.getElementById("statRateAll").textContent = calcRate(data.totalStats.total_calls, data.totalStats.answered_calls);
    document.getElementById("statTmoAll").textContent = formatDuration(Math.round(data.totalStats.avg_duration_seconds) || 0);

    renderHourlyChart(data.hourly || Array(24).fill(0));
    renderDailyCharts(data.dailyTrend || []);

    if (data.availability) {
      document.getElementById("availabilityBox").classList.remove("hidden");
      document.getElementById("availabilityCount").textContent = `${data.availability.online} / ${data.availability.total}`;
    }

    if (data.ranking && data.ranking.length > 0) {
      document.getElementById("rankingBox").classList.remove("hidden");
      const tbody = document.getElementById("rankingTableBody");
      tbody.innerHTML = "";
      data.ranking.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono">${r.username}</td>
          <td class="mono">${r.extension}</td>
          <td class="mono">${r.total_calls || 0}</td>
          <td class="mono">${formatDuration(Math.round(r.avg_duration_seconds) || 0)}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("Error cargando dashboard admin:", err);
  }
}
