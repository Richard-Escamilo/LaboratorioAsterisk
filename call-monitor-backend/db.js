const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

async function startCallSession({ channelId, callerExt, calleeExt }) {
  await pool.execute(
    `INSERT INTO call_sessions (channel_id, caller_ext, callee_ext, status, started_at)
     VALUES (?, ?, ?, 'ringing', NOW())`,
    [channelId, callerExt, calleeExt]
  );
}

async function markBridged(channelId) {
  await pool.execute(
    `UPDATE call_sessions SET status='in_progress', bridged_at=NOW() WHERE channel_id=?`,
    [channelId]
  );
}

async function endCallSession(channelId, cause) {
  const [rows] = await pool.execute(`SELECT * FROM call_sessions WHERE channel_id=?`, [channelId]);
  if (rows.length === 0) return null;
  const session = rows[0];
  await pool.execute(
    `INSERT IGNORE INTO call_history (channel_id, caller_ext, callee_ext, started_at, bridged_at, ended_at, hangup_cause)
     VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
    [session.channel_id, session.caller_ext, session.callee_ext, session.started_at, session.bridged_at, cause]
  );
  await pool.execute(`DELETE FROM call_sessions WHERE channel_id=?`, [channelId]);
  return session;
}

async function getActiveSessions() {
  const [rows] = await pool.execute(`SELECT * FROM call_sessions ORDER BY started_at DESC`);
  return rows;
}

async function getHistory(limit = 50) {
  const [rows] = await pool.execute(`SELECT * FROM call_history ORDER BY ended_at DESC LIMIT ?`, [limit]);
  return rows;
}

module.exports = { startCallSession, markBridged, endCallSession, getActiveSessions, getHistory };

async function addUserExtension(username, extension, role) {
  await pool.execute(
    `INSERT INTO user_extensions (username, extension, role) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE username=VALUES(username), role=VALUES(role)`,
    [username, extension, role]
  );
}

module.exports.addUserExtension = addUserExtension;

const bcrypt = require("bcryptjs");

async function userExtensionExists(username) {
  const [rows] = await pool.execute(`SELECT 1 FROM user_extensions WHERE username=?`, [username]);
  return rows.length > 0;
}

async function getNextAvailableExtension() {
  const [rows] = await pool.execute(
    `SELECT MAX(CAST(extension AS UNSIGNED)) as maxExt FROM user_extensions WHERE CAST(extension AS UNSIGNED) >= 2000`
  );
  const max = rows[0].maxExt;
  return max ? max + 1 : 2000;
}

async function addUserExtensionWithPassword(username, extension, role, plainPassword) {
  const hash = await bcrypt.hash(plainPassword, 10);
  await pool.execute(
    `INSERT INTO user_extensions (username, extension, role, password_hash) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role=VALUES(role), password_hash=VALUES(password_hash)`,
    [username, extension, role, hash]
  );
}

module.exports.userExtensionExists = userExtensionExists;
module.exports.getNextAvailableExtension = getNextAvailableExtension;
module.exports.addUserExtensionWithPassword = addUserExtensionWithPassword;

async function getUserByUsername(username) {
  const [rows] = await pool.execute(`SELECT * FROM user_extensions WHERE username=?`, [username]);
  return rows[0] || null;
}

module.exports.getUserByUsername = getUserByUsername;

async function getCallsByExtension(extension, limit = 10) {
  const [rows] = await pool.execute(
    `SELECT *,
       CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) ELSE 0 END AS duration_seconds,
       CASE WHEN caller_ext = ? THEN callee_ext ELSE caller_ext END AS other_party,
       CASE WHEN caller_ext = ? THEN 'saliente' ELSE 'entrante' END AS direction
     FROM call_history
     WHERE caller_ext = ? OR callee_ext = ?
     ORDER BY ended_at DESC
     LIMIT ?`,
    [extension, extension, extension, extension, limit]
  );
  return rows;
}

async function getDailyStats(extension) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_calls,
       SUM(CASE WHEN bridged_at IS NOT NULL THEN 1 ELSE 0 END) AS answered_calls,
       AVG(CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) END) AS avg_duration_seconds
     FROM call_history
     WHERE (caller_ext = ? OR callee_ext = ?) AND DATE(started_at) = CURDATE()`,
    [extension, extension]
  );
  return rows[0];
}

module.exports.getCallsByExtension = getCallsByExtension;
module.exports.getDailyStats = getDailyStats;

async function getHourlyStats(extension) {
  const [rows] = await pool.execute(
    `SELECT HOUR(started_at) AS hour, COUNT(*) AS count
     FROM call_history
     WHERE (caller_ext = ? OR callee_ext = ?) AND DATE(started_at) = CURDATE()
     GROUP BY HOUR(started_at)`,
    [extension, extension]
  );
  const hourly = Array(24).fill(0);
  rows.forEach((r) => { hourly[r.hour] = r.count; });
  return hourly;
}

module.exports.getHourlyStats = getHourlyStats;

async function getTeamAgents(supervisorUsername) {
  const [rows] = await pool.execute(
    `SELECT ue.username, ue.extension
     FROM supervisor_agents sa
     JOIN user_extensions ue ON ue.username = sa.agent_username
     WHERE sa.supervisor_username = ?`,
    [supervisorUsername]
  );
  return rows;
}

module.exports.getTeamAgents = getTeamAgents;

async function isAgentOfSupervisor(supervisorUsername, agentUsername) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM supervisor_agents WHERE supervisor_username = ? AND agent_username = ?`,
    [supervisorUsername, agentUsername]
  );
  return rows.length > 0;
}

module.exports.isAgentOfSupervisor = isAgentOfSupervisor;
