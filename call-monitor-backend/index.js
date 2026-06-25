require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const AmiClient = require("asterisk-manager");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const ami = new AmiClient(5038, process.env.ASTERISK_HOST || "asterisk",
  process.env.AMI_USER || "call-monitor", process.env.AMI_PASSWORD, true);
ami.keepConnected();

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

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/calls/active", async (req, res) => res.json(await db.getActiveSessions()));
app.get("/api/calls/history", async (req, res) => res.json(await db.getHistory(Number(req.query.limit) || 50)));

io.on("connection", (socket) => console.log("[socket.io] cliente conectado:", socket.id));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`[call-monitor-backend] escuchando en :${PORT}`));
