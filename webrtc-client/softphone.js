let ua = null;
let session = null;

function setStatus(text, cls) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = cls || "";
}

function showFloatingWidget({ label, from, status, incoming }) {
  document.getElementById("fcLabel").textContent = label;
  document.getElementById("fcFrom").textContent = from;
  document.getElementById("fcStatus").textContent = status;
  document.getElementById("fcIncomingActions").classList.toggle("hidden", !incoming);
  document.getElementById("fcInCallActions").classList.toggle("hidden", incoming);
  document.getElementById("floatingCallWidget").classList.remove("hidden");
}

function hideFloatingWidget() {
  document.getElementById("floatingCallWidget").classList.add("hidden");
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

  ua.on("registered", () => setStatus("Conectado", "ok"));
  ua.on("unregistered", () => setStatus("Sin registrar"));
  ua.on("registrationFailed", (e) => setStatus("Error al registrar: " + e.cause, "err"));

  ua.on("newRTCSession", (data) => {
    session = data.session;
    const otherParty = session.direction === "incoming"
      ? data.request.from.uri.user
      : document.getElementById("target").value;

    if (session.direction === "incoming") {
      showFloatingWidget({ label: "Llamada entrante", from: otherParty, status: "Sonando...", incoming: true });
    } else {
      showFloatingWidget({ label: "Llamando a", from: otherParty, status: "Marcando...", incoming: false });
    }

    session.on("accepted", () => {
      setStatus("En llamada", "ok");
      showFloatingWidget({ label: session.direction === "incoming" ? "Llamada de" : "Llamando a", from: otherParty, status: "En llamada", incoming: false });
    });
    session.on("ended", () => { hideFloatingWidget(); setStatus("Llamada finalizada"); });
    session.on("failed", (e) => { hideFloatingWidget(); setStatus("Llamada falló: " + e.cause, "err"); });

    session.on("peerconnection", (e) => {
      e.peerconnection.addEventListener("track", (event) => {
        document.getElementById("remoteAudio").srcObject = event.streams[0];
      });
    });
  });

  ua.start();
}

document.getElementById("btnCall").onclick = () => {
  const target = document.getElementById("target").value;
  if (!ua) return setStatus("Aún no estás registrado", "err");
  ua.call(`sip:${target}@${HOST}`, { mediaConstraints: { audio: true, video: false } });
};

document.getElementById("btnAnswerFloat").onclick = () => {
  if (session) session.answer({ mediaConstraints: { audio: true, video: false } });
};

document.getElementById("btnRejectFloat").onclick = () => {
  if (session) session.terminate();
  hideFloatingWidget();
};

document.getElementById("btnHangupFloat").onclick = () => {
  if (session) session.terminate();
  hideFloatingWidget();
};

document.getElementById("btnParkFloat").onclick = async () => {
  if (!session) return;
  const token = localStorage.getItem("cc_token");
  try {
    const res = await fetch(`${BACKEND_URL}/api/park-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo aparcar la llamada");
      return;
    }
    try { session.terminate(); } catch (e) { /* la sesion ya pudo haberse cerrado sola */ }
    hideFloatingWidget();
    setStatus("Llamada aparcada", "ok");
    setTimeout(() => loadParkedCalls(), 1500);
  } catch (err) {
    alert("Error de conexion: " + err.message);
  }
};
