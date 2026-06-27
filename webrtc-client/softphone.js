let ua = null;
let session = null;

function setStatus(text, cls) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = cls || "";
}

function showIncomingCall(fromUser) {
  document.getElementById("incomingCallFrom").textContent = fromUser;
  document.getElementById("incomingCallBox").classList.remove("hidden");
}

function hideIncomingCall() {
  document.getElementById("incomingCallBox").classList.add("hidden");
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
      showIncomingCall(data.request.from.uri.user);
    }

    session.on("accepted", () => { hideIncomingCall(); setStatus("En llamada", "ok"); });
    session.on("ended", () => { hideIncomingCall(); setStatus("Llamada finalizada"); });
    session.on("failed", (e) => { hideIncomingCall(); setStatus("Llamada falló: " + e.cause, "err"); });

    session.connection.addEventListener("addstream", (e) => {
      document.getElementById("remoteAudio").srcObject = e.stream;
    });
  });

  ua.start();
}

document.getElementById("btnCall").onclick = () => {
  const target = document.getElementById("target").value;
  if (!ua) return setStatus("Aún no estás registrado", "err");
  ua.call(`sip:${target}@${HOST}`, { mediaConstraints: { audio: true, video: false } });
};

document.getElementById("btnHangup").onclick = () => {
  if (session) session.terminate();
};

document.getElementById("btnAnswer").onclick = () => {
  if (session) session.answer({ mediaConstraints: { audio: true, video: false } });
  hideIncomingCall();
};

document.getElementById("btnReject").onclick = () => {
  if (session) session.terminate();
  hideIncomingCall();
};
