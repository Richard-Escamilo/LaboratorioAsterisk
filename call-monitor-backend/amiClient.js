const AmiClient = require("asterisk-manager");

const ami = new AmiClient(
  5038,
  process.env.ASTERISK_HOST || "asterisk",
  process.env.AMI_USER || "call-monitor",
  process.env.AMI_PASSWORD,
  true
);
ami.keepConnected();
ami.on("connect", () => console.log("[AMI] Conectado a Asterisk"));
ami.on("error", (err) => console.error("[AMI] Error:", err.message));

module.exports = ami;

function reloadPjsip() {
  return new Promise((resolve) => {
    ami.action({ Action: "Command", Command: "module reload res_pjsip.so" }, () => resolve());
  });
}

module.exports.reloadPjsip = reloadPjsip;

function getParkedCalls() {
  return new Promise((resolve) => {
    const parked = [];
    const onEvent = (evt) => {
      if (evt.event === "ParkedCall") {
        parked.push({
          space: evt.parkingspace,
          callerIdNum: evt.parkeecalleridnum,
          parkingDuration: evt.parkingduration,
          channel: evt.parkeechannel,
        });
      } else if (evt.event === "ParkedCallsComplete") {
        ami.removeListener("managerevent", onEvent);
        resolve(parked);
      }
    };
    ami.on("managerevent", onEvent);
    ami.action({ Action: "ParkedCalls" }, () => {});
    setTimeout(() => {
      ami.removeListener("managerevent", onEvent);
      resolve(parked);
    }, 2000);
  });
}

module.exports.getParkedCalls = getParkedCalls;

function getAllChannelsWithBridge() {
  return new Promise((resolve) => {
    const channels = [];
    const onEvent = (evt) => {
      if (evt.event === "CoreShowChannel") {
        channels.push({ channel: evt.channel, bridgeId: evt.bridgeid });
      } else if (evt.event === "CoreShowChannelsComplete") {
        ami.removeListener("managerevent", onEvent);
        resolve(channels);
      }
    };
    ami.on("managerevent", onEvent);
    ami.action({ Action: "CoreShowChannels" }, () => {});
    setTimeout(() => {
      ami.removeListener("managerevent", onEvent);
      resolve(channels);
    }, 2000);
  });
}

async function parkRemoteParty(agentExtension) {
  const channels = await getAllChannelsWithBridge();
  const agentChannel = channels.find((c) => c.channel.startsWith(`PJSIP/${agentExtension}-`));
  if (!agentChannel || !agentChannel.bridgeId) {
    throw new Error("No se encontro una llamada activa para este agente");
  }
  const remoteChannel = channels.find(
    (c) => c.bridgeId === agentChannel.bridgeId && c.channel !== agentChannel.channel
  );
  if (!remoteChannel) {
    throw new Error("No se encontro al otro participante de la llamada");
  }
  return new Promise((resolve, reject) => {
    ami.action(
      {
        Action: "Redirect",
        Channel: remoteChannel.channel,
        Context: "internal",
        Exten: "700",
        Priority: "1",
      },
      (err, res) => {
        if (err) return reject(new Error(err.message || "Error al aparcar la llamada"));
        resolve(res);
      }
    );
  });
}

module.exports.parkRemoteParty = parkRemoteParty;
