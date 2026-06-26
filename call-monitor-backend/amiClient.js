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
