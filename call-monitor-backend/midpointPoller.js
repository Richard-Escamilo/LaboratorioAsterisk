const { appendExtension, extensionExists } = require("./provisionPjsip");
const db = require("./db");
const ami = require("./amiClient");

const MIDPOINT_BASE_URL = process.env.MIDPOINT_BASE_URL;
const MIDPOINT_USER = process.env.MIDPOINT_USER;
const MIDPOINT_PASSWORD = process.env.MIDPOINT_PASSWORD;
const POLL_INTERVAL_MS = 20000;

// Roles que reconocemos. needsExtension=true => se le crea extension SIP.
const ROLE_MAP = [
  { oid: process.env.AGENTE_ROLE_OID, role: "AgenteCallCenter", needsExtension: true },
  { oid: process.env.SUPERVISOR_ROLE_OID, role: "Supervisor", needsExtension: true },
  { oid: process.env.ADMIN_ROLE_OID, role: "Admin", needsExtension: false },
];

function basicAuthHeader() {
  const token = Buffer.from(`${MIDPOINT_USER}:${MIDPOINT_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

function generatePassword() {
  return Math.random().toString(36).slice(-10) + "Aa1!";
}

async function fetchUsersFromMidpoint() {
  const res = await fetch(`${MIDPOINT_BASE_URL}/ws/rest/users`, {
    headers: { Authorization: basicAuthHeader(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`midPoint respondio ${res.status}`);
  const data = await res.json();
  const users = (data.object && data.object.object) || [];
  return Array.isArray(users) ? users : [users];
}

function userHasRole(user, roleOid) {
  const list = Array.isArray(user.assignment) ? user.assignment : (user.assignment ? [user.assignment] : []);
  return list.some((a) => a.targetRef && a.targetRef.oid === roleOid);
}

function extractUsername(user) {
  if (!user.name) return null;
  return typeof user.name === "string" ? user.name : user.name["#text"];
}

async function provisionUser(username, roleConfig) {
  const exists = await db.userExtensionExists(username);
  if (exists) return;

  const password = generatePassword();

  if (roleConfig.needsExtension) {
    const extension = await db.getNextAvailableExtension();
    if (extensionExists(String(extension))) return;
    appendExtension(String(extension), password);
    await db.addUserExtensionWithPassword(username, String(extension), roleConfig.role, password);
    await ami.reloadPjsip();
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`[midpoint-poller] APROVISIONADO (SIP) usuario=${username} rol=${roleConfig.role} extension=${extension} password=${password}`);
  } else {
    await db.addUserExtensionWithPassword(username, null, roleConfig.role, password);
    console.log(`[midpoint-poller] APROVISIONADO (login) usuario=${username} rol=${roleConfig.role} password=${password}`);
  }
}

let isPolling = false;

async function pollOnce() {
  if (isPolling) {
    console.log("[midpoint-poller] Ciclo anterior aun en curso, omito este tick");
    return;
  }
  isPolling = true;
  try {
    await pollOnceInner();
  } finally {
    isPolling = false;
  }
}

async function pollOnceInner() {
  if (!MIDPOINT_PASSWORD) {
    console.warn("[midpoint-poller] Falta MIDPOINT_PASSWORD, omito ciclo");
    return;
  }
  try {
    const users = await fetchUsersFromMidpoint();
    for (const user of users) {
      const username = extractUsername(user);
      if (!username) continue;

      for (const roleConfig of ROLE_MAP) {
        if (!roleConfig.oid) continue;
        if (userHasRole(user, roleConfig.oid)) {
          await provisionUser(username, roleConfig);
        }
      }
    }
  } catch (err) {
    console.error("[midpoint-poller] Error:", err.message);
  }
}

function startMidpointPoller() {
  console.log(`[midpoint-poller] Iniciado, consultando midPoint cada ${POLL_INTERVAL_MS / 1000}s`);
  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);
}

module.exports = { startMidpointPoller };
