require("dotenv").config();
const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const { Server } = require("socket.io");
const { startMidpointPoller } = require("./midpointPoller");
const db = require("./db");
const { appendExtension } = require("./provisionPjsip");
const onlineStatus = require("./onlineStatus");
const { createUserInMidpoint } = require("./midpointAdmin");

const ALLOWED_ROLES = ["AgenteCallCenter"];
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token requerido" });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalido o expirado" });
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const httpsOptions = {
  cert: fs.readFileSync("/asterisk-config/keys/asterisk.pem"),
  key: fs.readFileSync("/asterisk-config/keys/asterisk.key"),
};
const server = https.createServer(httpsOptions, app);
const io = new Server(server, { cors: { origin: "*" } });

const ami = require("./amiClient");

function extToFromChannel(channel) {
  if (!channel) return null;
  const match = channel.match(/PJSIP\/(\w+)-/);
  return match ? match[1] : channel;
}

ami.on("connect", () => console.log("[AMI] Conectado a Asterisk"));
ami.on("error", (err) => console.error("[AMI] Error:", err.message));

ami.on("managerevent", async (evt) => {
  try {
    switch (evt.event) {
      case "DialBegin": {
        const caller = extToFromChannel(evt.channel);
        const callee = extToFromChannel(evt.destchannel) || evt.dialstring;
        await db.startCallSession({ channelId: evt.linkedid, callerExt: caller, calleeExt: callee });
        io.emit("call:ringing", { callId: evt.linkedid, caller, callee });
        break;
      }
      case "BridgeEnter": {
        await db.markBridged(evt.linkedid);
        io.emit("call:bridged", { callId: evt.linkedid });
        break;
      }
      case "Hangup": {
        const session = await db.endCallSession(evt.linkedid, evt["cause-txt"] || evt.cause);
        if (session) io.emit("call:ended", { callId: evt.linkedid, cause: evt["cause-txt"] });
        break;
      }
      case "ContactStatus": {
        const reachable = ["Reachable", "Created", "NonQualified"].includes(evt.contactstatus);
        if (evt.aor) onlineStatus.setStatus(evt.aor, reachable);
        break;
      }

      default: break;
    }
  } catch (err) {
    console.error("[AMI handler] Error:", evt.event, err.message);
  }
});

app.post("/api/provision", async (req, res) => {
  const { username, extension, password, role } = req.body;
  if (!username || !extension || !password || !role) {
    return res.status(400).json({ error: "username, extension, password y role son requeridos" });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(403).json({ error: `Rol '${role}' no autorizado para provisionar extension SIP` });
  }
  try {
    appendExtension(extension, password);
    await db.addUserExtension(username, extension, role);
    ami.action({ Action: "Command", Command: "module reload res_pjsip.so" }, (err) => {
      if (err) console.error("[AMI] Error al recargar pjsip:", err.message);
    });
    res.json({ status: "provisioned", username, extension });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username y password son requeridos" });
  }
  const user = await db.getUserByUsername(username);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: "Credenciales invalidas" });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Credenciales invalidas" });
  }
  const token = jwt.sign(
    { username: user.username, extension: user.extension, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.json({ token, username: user.username, extension: user.extension, role: user.role });
});

app.get("/api/me/calls", authMiddleware, async (req, res) => {
  if (!req.user.extension) {
    return res.json({ calls: [], stats: { total_calls: 0, answered_calls: 0, avg_duration_seconds: 0 } });
  }
  const calls = await db.getCallsByExtension(req.user.extension, 50);
  const callsToday = await db.getCallsByExtensionToday(req.user.extension, 30);
  const stats = await db.getDailyStats(req.user.extension);
  const hourly = await db.getHourlyStats(req.user.extension);
  const totalStats = await db.getTotalStats(req.user.extension);
  const dailyTrend = await db.getDailyTrend(req.user.extension);
  res.json({ calls, callsToday, stats, hourly, totalStats, dailyTrend });
});

app.get("/api/supervisor/team", authMiddleware, async (req, res) => {
  if (req.user.role !== "Supervisor" && req.user.role !== "Admin") {
    return res.status(403).json({ error: "Solo supervisores pueden ver esta informacion" });
  }
  const agents = await db.getTeamAgents(req.user.username);
  const active = await db.getActiveSessions();

  const team = [];
  let totalCalls = 0;
  let totalAnsweredWeighted = 0;
  let totalAnswered = 0;

  for (const agent of agents) {
    const stats = await db.getDailyStats(agent.extension);
    const inCall = active.some(
      (s) => s.caller_ext === agent.extension || s.callee_ext === agent.extension
    );
    const answered = Number(stats.answered_calls) || 0;
    const avgDur = Number(stats.avg_duration_seconds) || 0;

    team.push({
      username: agent.username,
      extension: agent.extension,
      online: onlineStatus.isOnline(agent.extension),
      inCall,
      totalCalls: Number(stats.total_calls) || 0,
      answeredCalls: answered,
      avgDurationSeconds: avgDur,
    });

    totalCalls += Number(stats.total_calls) || 0;
    totalAnswered += answered;
    totalAnsweredWeighted += avgDur * answered;
  }

  res.json({
    team,
    totals: {
      totalCalls,
      totalAnswered,
      avgDurationSeconds: totalAnswered > 0 ? totalAnsweredWeighted / totalAnswered : 0,
    },
  });
});

app.get("/api/supervisor/agent/:username/calls", authMiddleware, async (req, res) => {
  if (req.user.role !== "Supervisor" && req.user.role !== "Admin") {
    return res.status(403).json({ error: "No autorizado" });
  }
  const { username } = req.params;

  if (req.user.role === "Supervisor") {
    const belongs = await db.isAgentOfSupervisor(req.user.username, username);
    if (!belongs) return res.status(403).json({ error: "Ese agente no es parte de tu equipo" });
  }

  const agent = await db.getUserByUsername(username);
  if (!agent) return res.status(404).json({ error: "Agente no encontrado" });

  const calls = await db.getCallsByExtension(agent.extension, 15);
  const stats = await db.getDailyStats(agent.extension);
  res.json({ username, extension: agent.extension, calls, stats });
});

app.post("/api/admin/users", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") {
    return res.status(403).json({ error: "Solo el Admin puede crear usuarios" });
  }
  const { username, fullName, password, role, supervisorUsername } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password y role son requeridos" });
  }
  if (!["AgenteCallCenter", "Supervisor", "Admin"].includes(role)) {
    return res.status(400).json({ error: "Rol invalido" });
  }
  try {
    await createUserInMidpoint({ username, fullName, password, role });

    if (role === "AgenteCallCenter" && supervisorUsername) {
      await db.assignAgentToSupervisor(supervisorUsername, username);
    }

    res.json({ status: "creado", username, role, note: "El aprovisionamiento SIP se completa automaticamente en hasta 20s" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/supervisors", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const supervisors = await db.getUsersByRole("Supervisor");
  res.json({ supervisors });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/calls/active", async (req, res) => res.json(await db.getActiveSessions()));
app.get("/api/calls/history", async (req, res) => res.json(await db.getHistory(Number(req.query.limit) || 50)));

io.on("connection", (socket) => console.log("[socket.io] cliente conectado:", socket.id));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`[call-monitor-backend] escuchando en :${PORT}`));

startMidpointPoller();
