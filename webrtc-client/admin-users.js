const ROLE_LABELS = { AgenteCallCenter: "Agente", Supervisor: "Supervisor", Admin: "Admin" };

async function loadAllUsers(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/all-users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const tbody = document.getElementById("usersTableBody");
    tbody.innerHTML = "";
    (data.users || []).forEach((u) => {
      const tr = document.createElement("tr");
      const statusHtml = !u.extension
        ? '<span class="mono" style="color:var(--muted)">—</span>'
        : u.inCall
          ? '<span class="incall-pill">En llamada</span>'
          : `<span class="online-dot ${u.online ? "yes" : ""}"></span>${u.online ? "En línea" : "Desconectado"}`;
      tr.innerHTML = `
        <td class="mono">${u.username}</td>
        <td class="mono">${u.extension || "—"}</td>
        <td>${ROLE_LABELS[u.role] || u.role}</td>
        <td class="mono">${u.supervisor_username || "—"}</td>
        <td>${statusHtml}</td>
        <td><button class="edit-user-btn" data-username="${u.username}" data-role="${u.role}" data-supervisor="${u.supervisor_username || ""}">Editar</button></td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll(".edit-user-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openEditUserModal(btn.dataset.username, btn.dataset.role, btn.dataset.supervisor);
      });
    });
  } catch (err) {
    console.error("Error cargando usuarios:", err);
  }
}

async function loadAdminHistory(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/all-calls`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    fillCallsTable("callsTableBody", data.calls || [], "noCallsMsg", "historyPagination");
  } catch (err) {
    console.error("Error cargando historico admin:", err);
  }
}

let editingUsername = null;

function openEditUserModal(username, role, supervisor) {
  editingUsername = username;
  document.getElementById("editUserTitle").textContent = `Editar: ${username}`;
  document.getElementById("editRole").value = role;
  document.getElementById("editSupervisor").value = supervisor || "";
  document.getElementById("editPassword").value = "";
  document.getElementById("editSupervisorBox").classList.toggle("hidden", role !== "AgenteCallCenter");
  document.getElementById("editUserMsg").classList.add("hidden");
  document.getElementById("editUserModal").classList.remove("hidden");
}

document.getElementById("editRole").addEventListener("change", (e) => {
  document.getElementById("editSupervisorBox").classList.toggle("hidden", e.target.value !== "AgenteCallCenter");
});

document.getElementById("editUserClose").onclick = () => {
  document.getElementById("editUserModal").classList.add("hidden");
};
document.getElementById("editUserModal").addEventListener("click", (e) => {
  if (e.target.id === "editUserModal") e.target.classList.add("hidden");
});

document.getElementById("btnSaveEditUser").onclick = async () => {
  const token = localStorage.getItem("cc_token");
  const newRole = document.getElementById("editRole").value;
  const newSupervisor = document.getElementById("editSupervisor").value || null;
  const newPassword = document.getElementById("editPassword").value;
  const msgEl = document.getElementById("editUserMsg");

  msgEl.textContent = "Guardando...";
  msgEl.className = "";
  msgEl.classList.remove("hidden");

  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/users/${editingUsername}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newRole, newSupervisor, newPassword: newPassword || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      msgEl.textContent = data.error || "Error al guardar";
      msgEl.className = "err";
      return;
    }
    msgEl.textContent = "Guardado correctamente.";
    msgEl.className = "ok";
    loadAllUsers(token);
  } catch (err) {
    msgEl.textContent = "No se pudo conectar: " + err.message;
    msgEl.className = "err";
  }
};
