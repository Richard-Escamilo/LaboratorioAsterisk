async function loadParkedCalls() {
  const token = localStorage.getItem("cc_token");
  if (!token) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/parked-calls`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const listEl = document.getElementById("parkedCallsList");
    const noMsgEl = document.getElementById("noParkedMsg");
    if (!listEl || !noMsgEl) return;

    if (!data.parked || data.parked.length === 0) {
      listEl.innerHTML = "";
      noMsgEl.classList.remove("hidden");
      return;
    }
    noMsgEl.classList.add("hidden");
    listEl.innerHTML = "";
    data.parked.forEach((p) => {
      const div = document.createElement("div");
      div.className = "parked-call-item";
      div.innerHTML = `
        <div class="pc-info">
          Espacio <span class="pc-space">${p.space}</span> · de ${p.callerIdNum || "desconocido"} ·
          esperando ${p.parkingDuration || 0}s
        </div>
        <button class="btn-call" style="width:auto;padding:6px 14px;">Recoger</button>
      `;
      div.querySelector("button").addEventListener("click", () => {
        if (!ua) return alert("Aún no estás registrado");
        ua.call(`sip:${p.space}@${HOST}`, { mediaConstraints: { audio: true, video: false } });
      });
      listEl.appendChild(div);
    });
  } catch (err) {
    console.error("Error cargando llamadas aparcadas:", err);
  }
}

function setParkingMsgStatus(text, cls) {
  const el = document.getElementById("parkingMsgStatus");
  el.textContent = text;
  el.className = cls || "";
  el.classList.remove("hidden");
}

const btnSaveParkingMessage = document.getElementById("btnSaveParkingMessage");
if (btnSaveParkingMessage) {
  btnSaveParkingMessage.onclick = async () => {
    const token = localStorage.getItem("cc_token");
    const text = document.getElementById("parkingMessageText").value.trim();
    if (!text) return setParkingMsgStatus("Escribe un texto primero", "err");

    setParkingMsgStatus("Generando mensaje de voz...", "");
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/parking-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParkingMsgStatus(data.error || "Error al guardar", "err");
        return;
      }
      setParkingMsgStatus("Mensaje actualizado correctamente.", "ok");
    } catch (err) {
      setParkingMsgStatus("No se pudo conectar: " + err.message, "err");
    }
  };
}
