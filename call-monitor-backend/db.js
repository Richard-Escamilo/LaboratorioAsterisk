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
  // Ignoramos sesiones "atascadas" de mas de 2 horas: si nunca recibieron
  // su evento Hangup correspondiente, no deben seguir contando como activas.
  const [rows] = await pool.execute(
    `SELECT * FROM call_sessions WHERE started_at > NOW() - INTERVAL 2 HOUR ORDER BY started_at DESC`
  );
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
     WHERE (caller_ext = ? OR callee_ext = ?) AND DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))`,
    [extension, extension]
  );
  return rows[0];
}

module.exports.getCallsByExtension = getCallsByExtension;
module.exports.getDailyStats = getDailyStats;

async function getHourlyStats(extension) {
  const [rows] = await pool.execute(
    `SELECT HOUR(DATE_SUB(started_at, INTERVAL 5 HOUR)) AS hour, COUNT(*) AS count
     FROM call_history
     WHERE (caller_ext = ? OR callee_ext = ?) AND DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
     GROUP BY HOUR(DATE_SUB(started_at, INTERVAL 5 HOUR))`,
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

async function getTotalStats(extension) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_calls,
       SUM(CASE WHEN bridged_at IS NOT NULL THEN 1 ELSE 0 END) AS answered_calls,
       AVG(CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) END) AS avg_duration_seconds
     FROM call_history
     WHERE caller_ext = ? OR callee_ext = ?`,
    [extension, extension]
  );
  return rows[0];
}

module.exports.getTotalStats = getTotalStats;

async function getDailyTrend(extension, days = 14) {
  const [rows] = await pool.execute(
    `SELECT
       DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) AS day,
       COUNT(*) AS count,
       SUM(CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) ELSE 0 END) AS total_duration
     FROM call_history
     WHERE (caller_ext = ? OR callee_ext = ?)
       AND started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY day
     ORDER BY day ASC`,
    [extension, extension, days]
  );
  return rows;
}

module.exports.getDailyTrend = getDailyTrend;

async function getCallsByExtensionToday(extension, limit = 20) {
  const [rows] = await pool.execute(
    `SELECT *,
       CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) ELSE 0 END AS duration_seconds,
       CASE WHEN caller_ext = ? THEN callee_ext ELSE caller_ext END AS other_party,
       CASE WHEN caller_ext = ? THEN 'saliente' ELSE 'entrante' END AS direction
     FROM call_history
     WHERE (caller_ext = ? OR callee_ext = ?)
       AND DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
     ORDER BY ended_at DESC
     LIMIT ?`,
    [extension, extension, extension, extension, limit]
  );
  return rows;
}

module.exports.getCallsByExtensionToday = getCallsByExtensionToday;

async function assignAgentToSupervisor(supervisorUsername, agentUsername) {
  await pool.execute(
    `INSERT IGNORE INTO supervisor_agents (supervisor_username, agent_username) VALUES (?, ?)`,
    [supervisorUsername, agentUsername]
  );
}

module.exports.assignAgentToSupervisor = assignAgentToSupervisor;

async function getUsersByRole(role) {
  const [rows] = await pool.execute(`SELECT username FROM user_extensions WHERE role = ?`, [role]);
  return rows.map((r) => r.username);
}

module.exports.getUsersByRole = getUsersByRole;

async function getUserExtensionRow(username) {
  const [rows] = await pool.execute(`SELECT * FROM user_extensions WHERE username = ?`, [username]);
  return rows[0] || null;
}

async function updateUserRole(username, newRole) {
  await pool.execute(`UPDATE user_extensions SET role = ? WHERE username = ?`, [newRole, username]);
}

async function updateUserPasswordHash(username, passwordHash) {
  await pool.execute(`UPDATE user_extensions SET password_hash = ? WHERE username = ?`, [passwordHash, username]);
}

async function reassignSupervisor(agentUsername, newSupervisorUsername) {
  await pool.execute(`DELETE FROM supervisor_agents WHERE agent_username = ?`, [agentUsername]);
  if (newSupervisorUsername) {
    await pool.execute(
      `INSERT IGNORE INTO supervisor_agents (supervisor_username, agent_username) VALUES (?, ?)`,
      [newSupervisorUsername, agentUsername]
    );
  }
}

async function getAllUsersWithDetails() {
  const [rows] = await pool.execute(`
    SELECT ue.username, ue.extension, ue.role, sa.supervisor_username
    FROM user_extensions ue
    LEFT JOIN supervisor_agents sa ON sa.agent_username = ue.username
    ORDER BY ue.role, ue.username
  `);
  return rows;
}

async function getAllCallsAdmin(limit = 100) {
  const [rows] = await pool.execute(
    `SELECT *,
       CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) ELSE 0 END AS duration_seconds
     FROM call_history
     ORDER BY ended_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

module.exports.getUserExtensionRow = getUserExtensionRow;
module.exports.updateUserRole = updateUserRole;
module.exports.updateUserPasswordHash = updateUserPasswordHash;
module.exports.reassignSupervisor = reassignSupervisor;
module.exports.getAllUsersWithDetails = getAllUsersWithDetails;
module.exports.getAllCallsAdmin = getAllCallsAdmin;

async function getRecordingsSummaryByUser() {
  const [rows] = await pool.execute(`
    SELECT ue.username, ue.extension,
      COUNT(ch.id) AS recorded_count
    FROM user_extensions ue
    LEFT JOIN call_history ch
      ON (ch.caller_ext = ue.extension OR ch.callee_ext = ue.extension) AND ch.bridged_at IS NOT NULL
    WHERE ue.extension IS NOT NULL
    GROUP BY ue.username, ue.extension
    ORDER BY ue.username
  `);
  return rows;
}

async function getRecordedCallsByExtension(extension) {
  const [rows] = await pool.execute(`
    SELECT *,
      CASE WHEN caller_ext = ? THEN callee_ext ELSE caller_ext END AS other_party,
      CASE WHEN caller_ext = ? THEN 'saliente' ELSE 'entrante' END AS direction,
      TIMESTAMPDIFF(SECOND, bridged_at, ended_at) AS duration_seconds
    FROM call_history
    WHERE (caller_ext = ? OR callee_ext = ?) AND bridged_at IS NOT NULL
    ORDER BY ended_at DESC
  `, [extension, extension, extension, extension]);
  return rows;
}

module.exports.getRecordingsSummaryByUser = getRecordingsSummaryByUser;
module.exports.getRecordedCallsByExtension = getRecordedCallsByExtension;

async function getGlobalDailyStats() {
  const [rows] = await pool.execute(`
    SELECT COUNT(*) AS total_calls,
      SUM(CASE WHEN bridged_at IS NOT NULL THEN 1 ELSE 0 END) AS answered_calls,
      AVG(CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) END) AS avg_duration_seconds
    FROM call_history
    WHERE DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
  `);
  return rows[0];
}

async function getGlobalTotalStats() {
  const [rows] = await pool.execute(`
    SELECT COUNT(*) AS total_calls,
      SUM(CASE WHEN bridged_at IS NOT NULL THEN 1 ELSE 0 END) AS answered_calls,
      AVG(CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) END) AS avg_duration_seconds
    FROM call_history
  `);
  return rows[0];
}

async function getGlobalHourlyStats() {
  const [rows] = await pool.execute(`
    SELECT HOUR(DATE_SUB(started_at, INTERVAL 5 HOUR)) AS hour, COUNT(*) AS count
    FROM call_history
    WHERE DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
    GROUP BY HOUR(DATE_SUB(started_at, INTERVAL 5 HOUR))
  `);
  const hourly = Array(24).fill(0);
  rows.forEach((r) => { hourly[r.hour] = r.count; });
  return hourly;
}

async function getGlobalDailyTrend(days = 14) {
  const [rows] = await pool.execute(`
    SELECT DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) AS day,
      COUNT(*) AS count,
      SUM(CASE WHEN bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, bridged_at, ended_at) ELSE 0 END) AS total_duration
    FROM call_history
    WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    GROUP BY day ORDER BY day ASC
  `, [days]);
  return rows;
}

module.exports.getGlobalDailyStats = getGlobalDailyStats;
module.exports.getGlobalTotalStats = getGlobalTotalStats;
module.exports.getGlobalHourlyStats = getGlobalHourlyStats;
module.exports.getGlobalDailyTrend = getGlobalDailyTrend;

async function getDirectionBreakdown(extension) {
  const [rows] = await pool.execute(`
    SELECT
      SUM(CASE WHEN caller_ext = ? THEN 1 ELSE 0 END) AS saliente,
      SUM(CASE WHEN callee_ext = ? THEN 1 ELSE 0 END) AS entrante
    FROM call_history
    WHERE caller_ext = ? OR callee_ext = ?
  `, [extension, extension, extension, extension]);
  return rows[0];
}

async function getAgentRanking(limit = 10) {
  const [rows] = await pool.execute(`
    SELECT ue.username, ue.extension,
      COUNT(ch.id) AS total_calls,
      AVG(CASE WHEN ch.bridged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, ch.bridged_at, ch.ended_at) END) AS avg_duration_seconds
    FROM user_extensions ue
    LEFT JOIN call_history ch
      ON (ch.caller_ext = ue.extension OR ch.callee_ext = ue.extension)
      AND DATE(DATE_SUB(ch.started_at, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
    WHERE ue.role IN ('AgenteCallCenter', 'Supervisor')
    GROUP BY ue.username, ue.extension
    ORDER BY total_calls DESC
    LIMIT ?
  `, [limit]);
  return rows;
}

async function getAvailabilityCount() {
  const [rows] = await pool.execute(
    `SELECT username, extension FROM user_extensions WHERE extension IS NOT NULL`
  );
  return rows;
}

module.exports.getDirectionBreakdown = getDirectionBreakdown;
module.exports.getAgentRanking = getAgentRanking;
module.exports.getAvailabilityCount = getAvailabilityCount;

async function getSupervisorOfAgent(agentUsername) {
  const [rows] = await pool.execute(
    `SELECT supervisor_username FROM supervisor_agents WHERE agent_username = ?`,
    [agentUsername]
  );
  return rows[0] ? rows[0].supervisor_username : null;
}

module.exports.getSupervisorOfAgent = getSupervisorOfAgent;
