require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { startMidpointPoller } = require("./midpointPoller");
const db = require("./db");
const { appendExtension } = require("./provisionPjsip");

const ALLOWED_ROLES = ["AgenteCallCenter"];

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
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

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/calls/active", async (req, res) => res.json(await db.getActiveSessions()));
app.get("/api/calls/history", async (req, res) => res.json(await db.getHistory(Number(req.query.limit) || 50)));

io.on("connection", (socket) => console.log("[socket.io] cliente conectado:", socket.id));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`[call-monitor-backend] escuchando en :${PORT}`));

startMidpointPoller();
