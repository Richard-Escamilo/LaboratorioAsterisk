function setAdminMsg(text, cls) {
  const el = document.getElementById("adminMsg");
  el.textContent = text;
  el.className = cls || "";
  el.classList.remove("hidden");
}

document.getElementById("adminRole").addEventListener("change", (e) => {
  document.getElementById("adminSupervisorBox").classList.toggle("hidden", e.target.value !== "AgenteCallCenter");
});

async function loadSupervisorsDropdown() {
  const token = localStorage.getItem("cc_token");
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/supervisors`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const select = document.getElementById("adminSupervisor");
    select.innerHTML = "";
    (data.supervisors || []).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando supervisores:", err);
  }
}

document.getElementById("btnCreateUser").onclick = async () => {
  const token = localStorage.getItem("cc_token");
  const username = document.getElementById("adminUsername").value.trim();
  const fullName = document.getElementById("adminFullName").value.trim();
  const password = document.getElementById("adminPassword").value;
  const role = document.getElementById("adminRole").value;
  const supervisorUsername = document.getElementById("adminSupervisor").value;

  if (!username || !password) {
    return setAdminMsg("Usuario y contraseña son obligatorios", "err");
  }

  setAdminMsg("Creando usuario...", "");

  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, fullName, password, role, supervisorUsername }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAdminMsg(data.error || "Error al crear el usuario", "err");
      return;
    }
    setAdminMsg(`Usuario "${username}" creado con rol ${role}. ${data.note}`, "ok");
    document.getElementById("adminUsername").value = "";
    document.getElementById("adminFullName").value = "";
    document.getElementById("adminPassword").value = "";
  } catch (err) {
    setAdminMsg("No se pudo conectar al backend: " + err.message, "err");
  }
};
