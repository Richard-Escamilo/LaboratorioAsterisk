function setLoginStatus(text, cls) {
  const el = document.getElementById("loginStatus");
  el.textContent = text;
  el.className = cls || "";
  el.classList.remove("hidden");
}

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
      // Tiene telefono: Agente o Supervisor
      document.getElementById("phoneTabBtn").classList.remove("hidden");
      document.getElementById("softphoneBox").classList.remove("hidden");
      document.getElementById("noPhoneBox").classList.add("hidden");
      registerSip(data.extension, password);
      loadMyCalls(data.token);
      loadParkedCalls();

      document.getElementById("userExtInfo").classList.remove("hidden");
      document.getElementById("userExtValue").textContent = data.extension;

      if (data.supervisor) {
        document.getElementById("userSupervisorInfo").classList.remove("hidden");
        document.getElementById("userSupervisorValue").textContent = data.supervisor;
      }
    } else {
      // No tiene telefono (Admin): ocultamos la pestaña por completo
      document.getElementById("phoneTabBtn").classList.add("hidden");
    }

    if (data.role === "Supervisor") {
      document.getElementById("teamTabBtn").classList.remove("hidden");
    }

    if (data.role === "Admin") {
      document.getElementById("adminTabBtn").classList.remove("hidden");
      document.getElementById("usersTabBtn").classList.remove("hidden");
      loadSupervisorsDropdown();
      loadAllUsers(data.token);
      loadAdminHistory(data.token);
      document.getElementById("recordingsTabBtn").classList.remove("hidden");
      document.getElementById("parkingTabBtn").classList.remove("hidden");
      loadRecordingsSummary(data.token);
      loadAdminDashboard(data.token);
    }
  } catch (err) {
    setLoginStatus("No se pudo conectar al backend: " + err.message, "err");
  }
};

document.getElementById("btnLogout").onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem("cc_token");
  if (typeof ua !== "undefined" && ua) ua.stop();
  location.reload();
};

// Refresco automatico cada 5s: historico/dashboard se actualizan
// sin necesidad de recargar la pagina manualmente.
setInterval(() => {
  const token = localStorage.getItem("cc_token");
  if (!token) return;
  const appVisible = !document.getElementById("appScreen").classList.contains("hidden");
  if (!appVisible) return;

  const role = document.getElementById("roleBadge").textContent;
  const hasPhone = !document.getElementById("phoneTabBtn").classList.contains("hidden");

  if (role === "Admin") {
    loadAdminHistory(token);
    loadAllUsers(token);
    loadAdminDashboard(token);
  } else if (hasPhone) {
    loadMyCalls(token);
    loadParkedCalls();
  }
}, 5000);
