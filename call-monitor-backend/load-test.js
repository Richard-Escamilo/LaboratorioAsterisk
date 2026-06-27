const AmiClient = require("asterisk-manager");

const N = parseInt(process.argv[2]) || 10;
const DURATION = parseInt(process.argv[3]) || 60;

const ami = new AmiClient(
  5038,
  process.env.ASTERISK_HOST || "host.docker.internal",
  process.env.AMI_USER || "call-monitor",
  process.env.AMI_PASSWORD,
  true
);
ami.keepConnected();

ami.on("connect", () => {
  console.log(`[load-test] Conectado a AMI. Generando ${N} llamadas de prueba (duracion ~${DURATION}s cada una)...`);
  let launched = 0;
  for (let i = 0; i < N; i++) {
    ami.action(
      {
        Action: "Originate",
        Channel: "Local/9999@internal",
        Application: "Wait",
        Data: String(DURATION),
        Async: "true",
      },
      (err) => {
        if (err) console.error(`[load-test] Llamada ${i + 1} fallo:`, err.message || JSON.stringify(err));
      }
    );
    launched++;
  }
  console.log(`[load-test] ${launched} llamadas disparadas. Observa Grafana ahora.`);
  setTimeout(() => process.exit(0), (DURATION + 8) * 1000);
});

ami.on("error", (err) => console.error("[load-test] Error AMI:", err.message));
