require("dotenv").config();
const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const { Server } = require("socket.io");
const { startMidpointPoller } = require("./midpointPoller");
const { startShaper } = require("./shaper");
const db = require("./db");
const { appendExtension } = require("./provisionPjsip");
const onlineStatus = require("./onlineStatus");
const { createUserInMidpoint, updateUserInMidpoint } = require("./midpointAdmin");
const { updateExtensionPassword } = require("./provisionPjsip");
const path = require("path");
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";
const metrics = require("./metrics");
const { generateParkingMessage } = require("./tts");
const { provisionUserWithKnownPassword } = require("./provisioning");

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

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "https://98.95.202.225:8443",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
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

      case "UnParkedCall": {
        const callerExt = evt.retrievercalleridnum;
        const calleeExt = evt.parkeecalleridnum;
        await db.startCallSession({ channelId: evt.retrieveruniqueid, callerExt, calleeExt });
        await db.markBridged(evt.retrieveruniqueid);
        io.emit("call:bridged", { callId: evt.retrieveruniqueid });
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

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesion. Intenta de nuevo en unos minutos." },
});

app.post("/api/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!username || !password) {
    return res.status(400).json({ error: "username y password son requeridos" });
  }
  const user = await db.getUserByUsername(username);
  if (!user || !user.password_hash) {
    await db.logLoginAttempt(username, null, ip, false);
    return res.status(401).json({ error: "Credenciales invalidas" });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await db.logLoginAttempt(username, user.role, ip, false);
    return res.status(401).json({ error: "Credenciales invalidas" });
  }
  await db.logLoginAttempt(username, user.role, ip, true);
  const token = jwt.sign(
    { username: user.username, extension: user.extension, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  let supervisor = null;
  if (user.role === "AgenteCallCenter") {
    supervisor = await db.getSupervisorOfAgent(user.username);
  }
  res.json({ token, username: user.username, extension: user.extension, role: user.role, supervisor });
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
  const directionBreakdown = await db.getDirectionBreakdown(req.user.extension);
  res.json({ calls, callsToday, stats, hourly, totalStats, dailyTrend, directionBreakdown });
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

    const provisionResult = await provisionUserWithKnownPassword(username, password, role);

    if (role === "AgenteCallCenter" && supervisorUsername) {
      await db.assignAgentToSupervisor(supervisorUsername, username);
    }

    res.json({
      status: "creado",
      username,
      role,
      extension: provisionResult.extension || null,
      note: provisionResult.extension
        ? `Extension SIP ${provisionResult.extension} creada de inmediato con la contrasena que ingresaste.`
        : "Usuario creado (este rol no requiere extension SIP).",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/supervisors", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const supervisors = await db.getUsersByRole("Supervisor");
  res.json({ supervisors });
});

app.get("/api/admin/all-users", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const users = await db.getAllUsersWithDetails();
  const active = await db.getActiveSessions();
  const enriched = users.map((u) => ({
    ...u,
    online: u.extension ? onlineStatus.isOnline(u.extension) : false,
    inCall: u.extension ? active.some((s) => s.caller_ext === u.extension || s.callee_ext === u.extension) : false,
  }));
  res.json({ users: enriched });
});

app.get("/api/admin/all-calls", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const calls = await db.getAllCallsAdmin(100);
  const withParties = calls.map((c) => ({
    ...c,
    other_party: `${c.caller_ext} -> ${c.callee_ext}`,
    direction: "—",
  }));
  res.json({ calls: withParties });
});

app.put("/api/admin/users/:username", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const { username } = req.params;
  const { newRole, newSupervisor, newPassword } = req.body;

  const current = await db.getUserExtensionRow(username);
  if (!current) return res.status(404).json({ error: "Usuario no encontrado" });

  try {
    await updateUserInMidpoint({
      username,
      oldRole: current.role,
      newRole: newRole || current.role,
      newPassword: newPassword || null,
    });

    if (newRole && newRole !== current.role) {
      await db.updateUserRole(username, newRole);
    }

    if (newSupervisor !== undefined) {
      await db.reassignSupervisor(username, newSupervisor || null);
    }

    if (newPassword) {
      const hash = await bcrypt.hash(newPassword, 10);
      await db.updateUserPasswordHash(username, hash);
      if (current.extension) {
        updateExtensionPassword(current.extension, newPassword);
        await ami.reloadPjsip();
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    res.json({ status: "actualizado", username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/recordings-summary", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const summary = await db.getRecordingsSummaryByUser();
  res.json({ summary });
});

app.get("/api/admin/recordings/:username", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const user = await db.getUserByUsername(req.params.username);
  if (!user || !user.extension) return res.status(404).json({ error: "Usuario sin extension" });
  const calls = await db.getRecordedCallsByExtension(user.extension);
  res.json({ username: req.params.username, extension: user.extension, calls });
});

app.get("/api/admin/recordings/file/:channelId", authMiddleware, (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const { channelId } = req.params;
  if (!/^[\w.\-]+$/.test(channelId)) return res.status(400).json({ error: "ID invalido" });
  const filePath = path.join(RECORDINGS_DIR, `${channelId}.wav`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Grabacion no encontrada" });
  res.setHeader("Content-Type", "audio/wav");
  fs.createReadStream(filePath).pipe(res);
});

app.get("/api/admin/global-stats", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const stats = await db.getGlobalDailyStats();
  const totalStats = await db.getGlobalTotalStats();
  const hourly = await db.getGlobalHourlyStats();
  const dailyTrend = await db.getGlobalDailyTrend();
  const ranking = await db.getAgentRanking(10);
  const allUsersWithExt = await db.getAvailabilityCount();
  const onlineCount = allUsersWithExt.filter((u) => onlineStatus.isOnline(u.extension)).length;
  res.json({ stats, totalStats, hourly, dailyTrend, ranking, availability: { online: onlineCount, total: allUsersWithExt.length } });
});

app.get("/metrics", async (req, res) => {
  try {
    await metrics.refreshMetrics();
    res.set("Content-Type", metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/api/admin/parking-message", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "El texto no puede estar vacio" });
  }
  try {
    await generateParkingMessage(text.trim());
    res.json({ status: "actualizado", text: text.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/parked-calls", authMiddleware, async (req, res) => {
  const parked = await ami.getParkedCalls();
  res.json({ parked });
});

app.post("/api/park-call", authMiddleware, async (req, res) => {
  if (!req.user.extension) return res.status(400).json({ error: "Tu rol no tiene extension" });
  try {
    await ami.parkRemoteParty(req.user.extension);
    res.json({ status: "aparcado" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/admin/login-audit", authMiddleware, async (req, res) => {
  if (req.user.role !== "Admin") return res.status(403).json({ error: "No autorizado" });
  const audit = await db.getLoginAudit(100);
  res.json({ audit });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/calls/active", async (req, res) => res.json(await db.getActiveSessions()));
app.get("/api/calls/history", async (req, res) => res.json(await db.getHistory(Number(req.query.limit) || 50)));

io.on("connection", (socket) => console.log("[socket.io] cliente conectado:", socket.id));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`[call-monitor-backend] escuchando en :${PORT}`));

startMidpointPoller();
startShaper();
