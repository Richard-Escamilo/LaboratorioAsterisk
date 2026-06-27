let hourlyChart = null;
let dailyCountChart = null;
let dailyDurationChart = null;
let directionChart = null;

function renderHourlyChart(hourly) {
  const ctx = document.getElementById("hourlyChart");
  if (hourlyChart) hourlyChart.destroy();
  hourlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: hourly.map((_, h) => h.toString().padStart(2, "0") + "h"),
      datasets: [{ data: hourly, backgroundColor: "#1C2333", borderRadius: 2 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } }, x: { ticks: { font: { size: 9 } } } },
    },
  });
}

function renderDailyCharts(dailyTrend) {
  const labels = dailyTrend.map((d) => {
    const dt = new Date(d.day);
    return dt.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
  });
  const counts = dailyTrend.map((d) => d.count);
  const durationsMin = dailyTrend.map((d) => Math.round(d.total_duration / 60));

  const ctxCount = document.getElementById("dailyCountChart");
  if (dailyCountChart) dailyCountChart.destroy();
  dailyCountChart = new Chart(ctxCount, {
    type: "bar",
    data: { labels, datasets: [{ data: counts, backgroundColor: "#1C7293", borderRadius: 2 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } }, x: { ticks: { font: { size: 9 } } } },
    },
  });

  const ctxDur = document.getElementById("dailyDurationChart");
  if (dailyDurationChart) dailyDurationChart.destroy();
  dailyDurationChart = new Chart(ctxDur, {
    type: "bar",
    data: { labels, datasets: [{ data: durationsMin, backgroundColor: "#E8910C", borderRadius: 2 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 9 } } } },
    },
  });
}

function calcRate(total, answered) {
  if (!total) return "0%";
  return Math.round((answered / total) * 100) + "%";
}

function renderDirectionChart(breakdown) {
  const entrante = Number(breakdown.entrante) || 0;
  const saliente = Number(breakdown.saliente) || 0;
  if (entrante + saliente === 0) return;

  document.getElementById("directionChartBox").classList.remove("hidden");
  const ctx = document.getElementById("directionChart");
  if (directionChart) directionChart.destroy();
  directionChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Entrante", "Saliente"],
      datasets: [{ data: [entrante, saliente], backgroundColor: ["#E8910C", "#1C7293"] }],
    },
    options: { plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } } },
  });
}

async function loadMyCalls(token) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/me/calls`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    document.getElementById("statTotal").textContent = data.stats.total_calls || 0;
    document.getElementById("statAnswered").textContent = data.stats.answered_calls || 0;
    document.getElementById("statRateToday").textContent = calcRate(data.stats.total_calls, data.stats.answered_calls);
    document.getElementById("statTmo").textContent = formatDuration(Math.round(data.stats.avg_duration_seconds) || 0);

    document.getElementById("statTotalAll").textContent = data.totalStats.total_calls || 0;
    document.getElementById("statAnsweredAll").textContent = data.totalStats.answered_calls || 0;
    document.getElementById("statRateAll").textContent = calcRate(data.totalStats.total_calls, data.totalStats.answered_calls);
    document.getElementById("statTmoAll").textContent = formatDuration(Math.round(data.totalStats.avg_duration_seconds) || 0);

    renderHourlyChart(data.hourly || Array(24).fill(0));
    renderDailyCharts(data.dailyTrend || []);
    if (data.directionBreakdown) renderDirectionChart(data.directionBreakdown);

    fillCallsTable("callsTodayTableBody", data.callsToday || [], "noCallsTodayMsg", "todayPagination");
    fillCallsTable("callsTableBody", data.calls || [], "noCallsMsg", "historyPagination");
  } catch (err) {
    console.error("Error cargando llamadas:", err);
  }
}
