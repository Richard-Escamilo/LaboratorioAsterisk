const HOST = window.location.hostname;
const BACKEND_URL = `https://${HOST}:4000`;
let ua = null;
let session = null;
let hourlyChart = null;

function setStatus(text, cls) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = cls || "";
}

function setLoginStatus(text, cls) {
  const el = document.getElementById("loginStatus");
  el.textContent = text;
  el.className = cls || "";
  el.classList.remove("hidden");
}

function registerSip(extension, password) {
  const socket = new JsSIP.WebSocketInterface(`wss://${HOST}:8089/ws`);
  ua = new JsSIP.UA({
    sockets: [socket],
    uri: `sip:${extension}@${HOST}`,
    password: password,
    display_name: extension,
    session_timers: false,
  });

  ua.on("registered", () => setStatus(`Registrado como ${extension}`, "ok"));
  ua.on("unregistered", () => setStatus("Sin registrar"));
  ua.on("registrationFailed", (e) => setStatus("Error al registrar: " + e.cause, "err"));

  ua.on("newRTCSession", (data) => {
    session = data.session;
    if (session.direction === "incoming") {
      setStatus("Llamada entrante de " + data.request.from.uri.user, "ok");
      session.answer({ mediaConstraints: { audio: true, video: false } });
    }
    session.on("accepted", () => setStatus("En llamada", "ok"));
    session.on("ended", () => setStatus("Llamada finalizada"));
    session.on("failed", (e) => setStatus("Llamada falló: " + e.cause, "err"));
    session.connection.addEventListener("addstream", (e) => {
      document.getElementById("remoteAudio").srcObject = e.stream;
    });
  });

  ua.start();
}

// ---------------- Pestañas ----------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab === "phone" ? "tabPhone" : "tabMetrics").classList.remove("hidden");
  });
});

// ---------------- Métricas / gráfico ----------------
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function renderHourlyChart(hourly) {
  const ctx = document.getElementById("hourlyChart");
  if (hourlyChart) hourlyChart.destroy();
  hourlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: hourly.map((_, h) => h.toString().padStart(2, "0") + "h"),
      datasets: [{ data: hourly, backgroundColor: "#1C2333", borderRadius: 2 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
        x: { ticks: { font: { size: 9 } } },
      },
    },
  });
}

async function loadMyCalls(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/me/calls`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    document.getElementById("statTotal").textContent = data.stats.total_calls || 0;
    document.getElementById("statAnswered").textContent = data.stats.answered_calls || 0;
    document.getElementById("statTmo").textContent = formatDuration(Math.round(data.stats.avg_duration_seconds) || 0);

    renderHourlyChart(data.hourly || Array(24).fill(0));

    const tbody = document.getElementById("callsTableBody");
    tbody.innerHTML = "";

    if (data.calls.length === 0) {
      document.getElementById("noCallsMsg").classList.remove("hidden");
      return;
    }
    document.getElementById("noCallsMsg").classList.add("hidden");

    data.calls.forEach((call) => {
      const tr = document.createElement("tr");
      const duration = call.duration_seconds > 0 ? formatDuration(call.duration_seconds) : "No contestada";
      tr.innerHTML = `
        <td class="mono">${formatTime(call.ended_at)}</td>
        <td class="mono">${call.other_party}</td>
        <td><span class="dir-badge dir-${call.direction}">${call.direction}</span></td>
        <td class="mono">${duration}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error cargando llamadas:", err);
  }
}

// ---------------- Login ----------------
document.getElementById("btnLogin").onclick = async () => {
  const username = document.getElementById("loginUser").value;
  const password = document.getElementById("loginPass").value;
  setLoginStatus("Conectando...", "");

  try {
    const res = await fetch(`${BACKEND_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginStatus(data.error || "Error al iniciar sesión", "err");
      return;
    }

    localStorage.setItem("cc_token", data.token);

    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("appScreen").classList.remove("hidden");
    document.getElementById("welcomeUser").textContent = data.username;

    const badge = document.getElementById("roleBadge");
    badge.textContent = data.role;
    badge.className = "badge role-" + data.role;

    if (data.extension) {
      document.getElementById("softphoneBox").classList.remove("hidden");
      document.getElementById("noPhoneBox").classList.add("hidden");
      document.getElementById("tabsRow").classList.remove("hidden");
      registerSip(data.extension, password);
      loadMyCalls(data.token);
    } else {
      document.getElementById("softphoneBox").classList.add("hidden");
      document.getElementById("noPhoneBox").classList.remove("hidden");
      document.getElementById("tabsRow").classList.add("hidden");
    }
  } catch (err) {
    setLoginStatus("No se pudo conectar al backend: " + err.message, "err");
  }
};

document.getElementById("btnCall").onclick = () => {
  const target = document.getElementById("target").value;
  if (!ua) return setStatus("Aún no estás registrado", "err");
  ua.call(`sip:${target}@${HOST}`, { mediaConstraints: { audio: true, video: false } });
};

document.getElementById("btnHangup").onclick = () => {
  if (session) session.terminate();
};

document.getElementById("btnLogout").onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem("cc_token");
  if (ua) ua.stop();
  location.reload();
};
