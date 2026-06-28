const db = require("./db");
const ami = require("./amiClient");
const { setCodecAllow } = require("./provisionPjsip");

const TIERS = [
  { name: "FULL", maxCalls: 9, allow: "ulaw,alaw", numeric: 0 },
  { name: "MIXED", maxCalls: 19, allow: "gsm,ulaw", numeric: 1 },
  { name: "DOWNGRADED", maxCalls: Infinity, allow: "gsm", numeric: 2 },
];

let currentTier = null;
let lastActiveCalls = 0;

function decideTier(activeCalls) {
  return TIERS.find((t) => activeCalls <= t.maxCalls);
}

function getActiveCallsFromAsterisk() {
  return new Promise((resolve) => {
    ami.action({ Action: "Command", Command: "core show channels count" }, (err, res) => {
      if (err || !res) return resolve(0);
      const text = res.output ? res.output.join("\n") : (res.message || res.response || "");
      const match = String(text).match(/(\d+)\s+active calls/i);
      resolve(match ? parseInt(match[1], 10) : 0);
    });
  });
}

async function evaluateAndApply() {
  try {
    lastActiveCalls = await getActiveCallsFromAsterisk();
    const newTier = decideTier(lastActiveCalls);

    if (!currentTier || newTier.name !== currentTier.name) {
      console.log(`[shaper] Cambiando de tier ${currentTier ? currentTier.name : "(inicial)"} -> ${newTier.name} (llamadas activas=${lastActiveCalls}, allow=${newTier.allow})`);
      setCodecAllow(newTier.allow);
      await ami.reloadPjsip();
      currentTier = newTier;
    }
  } catch (err) {
    console.error("[shaper] Error:", err.message);
  }
}

function getCurrentTierInfo() {
  return {
    tier: currentTier ? currentTier.name : "DESCONOCIDO",
    numeric: currentTier ? currentTier.numeric : -1,
    allow: currentTier ? currentTier.allow : "",
    activeCalls: lastActiveCalls,
  };
}

function startShaper() {
  console.log("[shaper] Iniciado, evaluando carga cada 15s");
  evaluateAndApply();
  setInterval(evaluateAndApply, 15000);
}

module.exports = { startShaper, getCurrentTierInfo, decideTier, TIERS };
