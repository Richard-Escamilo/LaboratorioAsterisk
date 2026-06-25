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
    `INSERT INTO call_history (channel_id, caller_ext, callee_ext, started_at, bridged_at, ended_at, hangup_cause)
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
