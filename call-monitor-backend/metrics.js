const client = require("prom-client");
const db = require("./db");
const onlineStatus = require("./onlineStatus");
const shaper = require("./shaper");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const activeCalls = new client.Gauge({
  name: "callcenter_active_calls",
  help: "Llamadas activas en este momento",
  registers: [register],
});

const totalCallsToday = new client.Gauge({
  name: "callcenter_calls_today_total",
  help: "Total de llamadas registradas hoy",
  registers: [register],
});

const answeredCallsToday = new client.Gauge({
  name: "callcenter_calls_today_answered",
  help: "Llamadas contestadas hoy",
  registers: [register],
});

const avgDurationToday = new client.Gauge({
  name: "callcenter_avg_duration_seconds_today",
  help: "Duracion promedio de llamadas contestadas hoy (segundos)",
  registers: [register],
});

const agentsOnline = new client.Gauge({
  name: "callcenter_agents_online",
  help: "Cantidad de agentes/supervisores actualmente en linea",
  registers: [register],
});

const agentsTotal = new client.Gauge({
  name: "callcenter_agents_total",
  help: "Cantidad total de usuarios con extension SIP",
  registers: [register],
});

const shaperTier = new client.Gauge({
  name: "callcenter_shaper_tier",
  help: "Tier actual del shaper de codec: 0=FULL, 1=MIXED, 2=DOWNGRADED",
  registers: [register],
});

const shaperInfo = new client.Gauge({
  name: "callcenter_shaper_info",
  help: "Info del shaper actual (tier y codec activo como labels)",
  labelNames: ["tier", "allow"],
  registers: [register],
});

const shaperActiveCalls = new client.Gauge({
  name: "callcenter_shaper_active_calls",
  help: "Llamadas activas reales en Asterisk (incluye pruebas de carga), usadas por el shaper",
  registers: [register],
});

async function refreshMetrics() {
  const active = await db.getActiveSessions();
  activeCalls.set(active.length);

  const stats = await db.getGlobalDailyStats();
  totalCallsToday.set(Number(stats.total_calls) || 0);
  answeredCallsToday.set(Number(stats.answered_calls) || 0);
  avgDurationToday.set(Number(stats.avg_duration_seconds) || 0);

  const users = await db.getAvailabilityCount();
  agentsTotal.set(users.length);
  agentsOnline.set(users.filter((u) => onlineStatus.isOnline(u.extension)).length);

  const shaperState = shaper.getCurrentTierInfo();
  shaperTier.set(shaperState.numeric);
  shaperInfo.reset();
  shaperInfo.set({ tier: shaperState.tier, allow: shaperState.allow }, 1);
  shaperActiveCalls.set(shaperState.activeCalls);
}

module.exports = { register, refreshMetrics };
