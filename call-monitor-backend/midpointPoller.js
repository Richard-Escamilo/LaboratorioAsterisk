const { appendExtension, extensionExists } = require("./provisionPjsip");
const db = require("./db");
const ami = require("./amiClient");

const MIDPOINT_BASE_URL = process.env.MIDPOINT_BASE_URL;
const MIDPOINT_USER = process.env.MIDPOINT_USER;
const MIDPOINT_PASSWORD = process.env.MIDPOINT_PASSWORD;
const AGENTE_ROLE_OID = process.env.AGENTE_ROLE_OID;
const POLL_INTERVAL_MS = 20000;

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

async function pollOnce() {
  if (!AGENTE_ROLE_OID || !MIDPOINT_PASSWORD) {
    console.warn("[midpoint-poller] Faltan variables de entorno, omito ciclo");
    return;
  }
  try {
    const users = await fetchUsersFromMidpoint();
    for (const user of users) {
      if (!userHasRole(user, AGENTE_ROLE_OID)) continue;
      const username = extractUsername(user);
      if (!username) continue;

      const exists = await db.userExtensionExists(username);
      if (exists) continue;

      const extension = await db.getNextAvailableExtension();
      const password = generatePassword();

      if (extensionExists(String(extension))) continue;

      appendExtension(String(extension), password);
      await db.addUserExtensionWithPassword(username, String(extension), "AgenteCallCenter", password);

      ami.action({ Action: "Command", Command: "module reload res_pjsip.so" }, () => {});

      console.log(`[midpoint-poller] APROVISIONADO usuario=${username} extension=${extension} password=${password}`);
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
