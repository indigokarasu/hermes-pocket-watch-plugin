/**
 * Pocket Watch Dashboard Plugin — real Hermes dashboard plugin (SDK / React IIFE).
 *
 * Renders live cron-monitor data from:
 *   /api/plugins/pocket-watch/status  → jobs{total,enabled,paused,ok,error,never_run,by_type}, health{average}
 *   /api/plugins/pocket-watch/health  → jobs[]{id,name,score,status,consecutive_failures,last_status,...}, summary{total,healthy,degraded,critical}
 *   /api/plugins/pocket-watch/jobs    → jobs[]{id,name,type,status,enabled,schedule,next_run_at,...}, total
 *   /api/plugins/pocket-watch/timeline/daily → hours[]{hour,jobs[]}  (24 entries)
 *
 * Theme-native: dashboard tokens (var(--color-*)) + Tailwind classes + SDK components.
 * Principles: grid-first, real data only (no fabricated "running now"/cycle counts), triage lives in the table.
 */
(function () {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  var PLUGINS = window.__HERMES_PLUGINS__;
  if (!SDK || !PLUGINS) { console.error("[pocket-watch] Hermes plugin SDK not available."); return; }

  var React = SDK.React;
  var h = React.createElement;
  var useState = SDK.hooks.useState;
  var useEffect = SDK.hooks.useEffect;
  var useCallback = SDK.hooks.useCallback;
  var fetchJSON = SDK.fetchJSON;
  var C = SDK.components;
  var Card = C.Card, CardHeader = C.CardHeader, CardTitle = C.CardTitle, CardContent = C.CardContent;
  var Badge = C.Badge, Button = C.Button;
  var Spinner = C.Spinner || function (p) { return h("span", { className: (p.className || "") + " animate-pulse" }, "…"); };
  var cn = (SDK.utils && SDK.utils.cn) || function () { return Array.prototype.filter.call(arguments, Boolean).join(" "); };

  var HEALTHY = "#4fd6a6";
  var DEGRADED = "#f0b54e";
  var CRITICAL = "#f0706e";

  var STATUS_TONE = { ok: "success", error: "destructive", paused: "secondary", never_run: "outline", unknown: "outline" };
  var STATUS_LABEL = { ok: "OK", error: "Error", paused: "Paused", never_run: "Never run", unknown: "Unknown" };

  // --- one-time scoped CSS injection (unique id pw-css) ---
  function injectCSS() {
    if (document.getElementById("pw-css")) return;
    var s = document.createElement("style");
    s.id = "pw-css";
    s.textContent = [
      ".pw{display:flex;flex-direction:column;gap:1rem}",
      ".pw-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem}",
      ".pw-kpi-l{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--color-muted-foreground);min-height:2.4em;line-height:1.3}",
      ".pw-kpi-v{font-size:1.6rem;font-weight:300;line-height:1;margin-top:.35rem;display:flex;align-items:baseline;gap:.2rem}",
      ".pw-kpi-u{font-size:.8rem;font-weight:400;color:var(--color-muted-foreground)}",
      ".pw-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start}",
      ".pw-row{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;font-size:.8rem;padding:.15rem 0}",
      ".pw-tick{display:flex;align-items:center;gap:.5rem;font-size:.8rem;padding:.18rem 0}",
      ".pw-dot{width:.5rem;height:.5rem;border-radius:9999px;flex:0 0 auto}",
      // donut
      ".pw-donut{position:relative;width:140px;height:140px;flex:none}",
      ".pw-donut::before{content:\"\";position:absolute;inset:0;border-radius:50%;background:var(--g);-webkit-mask:radial-gradient(circle farthest-side,#0000 calc(100% - 20px),#000 calc(100% - 20px));mask:radial-gradient(circle farthest-side,#0000 calc(100% - 20px),#000 calc(100% - 20px))}",
      ".pw-donut .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}",
      ".pw-donut-wrap{display:flex;align-items:center;gap:1.25rem}",
      ".pw-legend{display:flex;flex-direction:column;gap:.5rem;flex:1 1 auto;min-width:0}",
      ".pw-leg-row{display:flex;align-items:center;gap:.5rem;font-size:.82rem}",
      // health table
      ".pw-tbl{width:100%;border-collapse:collapse;font-size:.8rem}",
      ".pw-tbl th{text-align:left;font-weight:500;color:var(--color-muted-foreground);font-size:.68rem;letter-spacing:.05em;text-transform:uppercase;padding:.25rem .5rem;border-bottom:1px solid var(--color-border)}",
      ".pw-tbl td{padding:.4rem .5rem;border-bottom:1px solid var(--color-border);vertical-align:middle}",
      ".pw-tbl td.num,.pw-tbl th.num{text-align:right;font-variant-numeric:tabular-nums}",
      // schedule heat-strip
      ".pw-strip{display:flex;align-items:flex-end;gap:2px;height:88px}",
      ".pw-bar{flex:1 1 0;min-width:0;background:var(--color-muted-foreground);border-radius:2px 2px 0 0;opacity:.85;transition:height .2s}",
      ".pw-axis{display:flex;justify-content:space-between;font-size:.65rem;color:var(--color-muted-foreground);margin-top:.35rem;font-variant-numeric:tabular-nums}",
      // by-type segmented bar
      ".pw-seg{display:flex;height:.6rem;border-radius:9999px;overflow:hidden;background:var(--color-border)}",
      ".pw-seg-i{height:100%}",
      ".pw-type-row{display:flex;align-items:center;justify-content:space-between;gap:.5rem;font-size:.8rem;padding:.15rem 0}",
      "@media(max-width:1000px){.pw-grid{grid-template-columns:1fr}}",
      "@media(max-width:760px){.pw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    ].join("");
    document.head.appendChild(s);
  }

  // --- helpers ---
  function relTime(iso) {
    if (!iso) return "never";
    try {
      var diff = Date.now() - new Date(iso).getTime();
      var m = Math.floor(diff / 60000);
      if (m < 0) {
        var fm = -m;
        if (fm < 60) return "in " + fm + "m";
        var fhr = Math.floor(fm / 60);
        if (fhr < 24) return "in " + fhr + "h";
        return "in " + Math.floor(fhr / 24) + "d";
      }
      if (m < 1) return "just now";
      if (m < 60) return m + "m ago";
      var hr = Math.floor(m / 60);
      if (hr < 24) return hr + "h ago";
      return Math.floor(hr / 24) + "d ago";
    } catch (e) { return iso; }
  }
  function clockTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso; }
  }
  function statusTone(s) { return STATUS_TONE[s] || "outline"; }
  function statusLabel(s) { return STATUS_LABEL[s] || s; }
  function healthColor(score) {
    if (score == null) return "";
    if (score >= 80) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  }

  // --- KPI tile ---
  function Kpi(label, value, color, unit) {
    return h("div", { className: "pw-kpi", key: label },
      h("div", { className: "pw-kpi-l" }, label),
      h("div", { className: "pw-kpi-v", style: color ? { color: color } : null },
        h("span", null, value),
        unit ? h("span", { className: "pw-kpi-u" }, unit) : null
      )
    );
  }

  // --- conic-gradient builder for the donut ---
  function buildConic(seg) {
    // seg: [{value,color}]; renders proportional segments, falls back to border color when empty
    var total = 0, i;
    for (i = 0; i < seg.length; i++) total += (seg[i].value || 0);
    if (!total) return "var(--color-border)";
    var stops = [], acc = 0;
    for (i = 0; i < seg.length; i++) {
      var v = seg[i].value || 0;
      if (v <= 0) continue;
      var start = (acc / total) * 100;
      acc += v;
      var end = (acc / total) * 100;
      stops.push(seg[i].color + " " + start.toFixed(2) + "% " + end.toFixed(2) + "%");
    }
    return "conic-gradient(" + stops.join(",") + ")";
  }

  function PocketWatch() {
    var s0 = useState(null), status = s0[0], setStatus = s0[1];
    var s1 = useState(null), health = s1[0], setHealth = s1[1];
    var s2 = useState(null), jobsData = s2[0], setJobsData = s2[1];
    var s3 = useState(null), timeline = s3[0], setTimeline = s3[1];
    var ls = useState(true), loading = ls[0], setLoading = ls[1];
    var es = useState(null), err = es[0], setErr = es[1];

    var load = useCallback(function () {
      Promise.all([
        fetchJSON("/api/plugins/pocket-watch/status"),
        fetchJSON("/api/plugins/pocket-watch/health"),
        fetchJSON("/api/plugins/pocket-watch/jobs"),
        fetchJSON("/api/plugins/pocket-watch/timeline/daily")
      ]).then(function (r) {
        setStatus(r[0]); setHealth(r[1]); setJobsData(r[2]); setTimeline(r[3]);
        setErr(null); setLoading(false);
      }).catch(function (e) {
        setErr((e && e.message) || "Failed to load"); setLoading(false);
      });
    }, []);

    useEffect(function () {
      injectCSS(); load();
      var iv = setInterval(load, 60000);
      return function () { clearInterval(iv); };
    }, [load]);

    if (loading && !status) {
      return h("div", { className: "flex items-center gap-2 p-8 text-sm text-muted-foreground" },
        h(Spinner, { className: "h-4 w-4" }), "Loading Pocket Watch…");
    }
    if (err && !status) {
      return h("div", { className: "p-4 text-sm text-destructive", role: "alert" },
        "Error: " + err, h(Button, { size: "sm", variant: "outline", className: "ml-2", onClick: load }, "Retry"));
    }
    if (!status) return null;

    var jobsAgg = (status.jobs) || {};
    var byType = jobsAgg.by_type || {};
    var statusHealth = status.health || {};
    var summary = (health && health.summary) || {};
    var healthJobs = (health && health.health && health.health.jobs) || (health && health.jobs) || [];
    var jobList = (jobsData && jobsData.jobs) || [];

    // index jobs by id for joins (schedule display etc.)
    var jobById = {};
    jobList.forEach(function (j) { jobById[j.id] = j; });

    // ---- KPI strip ----
    var avg = statusHealth.average;
    var kpis = h("div", { className: "pw-kpis" },
      Kpi("Enabled jobs", jobsAgg.enabled != null ? jobsAgg.enabled : 0),
      Kpi("Healthy", summary.healthy != null ? summary.healthy : 0, (summary.healthy ? HEALTHY : null)),
      Kpi("Degraded", summary.degraded != null ? summary.degraded : 0, (summary.degraded ? DEGRADED : null)),
      Kpi("Critical", summary.critical != null ? summary.critical : 0, (summary.critical ? CRITICAL : null)),
      Kpi("Avg health", avg != null ? avg : "—", null, avg != null ? "/100" : null)
    );

    // ---- Health distribution: donut left + legend right ----
    var donutSeg = [
      { value: summary.healthy || 0, color: HEALTHY, label: "Healthy" },
      { value: summary.degraded || 0, color: DEGRADED, label: "Degraded" },
      { value: summary.critical || 0, color: CRITICAL, label: "Critical" }
    ];
    var distTotal = summary.total != null ? summary.total
      : (donutSeg[0].value + donutSeg[1].value + donutSeg[2].value);
    var distCard = h(Card, null,
      h(CardHeader, { className: "pb-2" }, h(CardTitle, { className: "text-sm" }, "Health distribution")),
      h(CardContent, null,
        h("div", { className: "pw-donut-wrap" },
          h("div", { className: "pw-donut", style: { "--g": buildConic(donutSeg) } },
            h("div", { className: "ctr" },
              h("span", { className: "text-2xl font-light leading-none" }, distTotal),
              h("span", { className: "text-xs text-muted-foreground mt-1" }, "jobs")
            )
          ),
          h("div", { className: "pw-legend" },
            donutSeg.map(function (sg) {
              return h("div", { className: "pw-leg-row", key: sg.label },
                h("span", { className: "pw-dot", style: { background: sg.color } }),
                h("span", { className: "flex-1" }, sg.label),
                h("span", { className: "font-medium", style: { fontVariantNumeric: "tabular-nums" } }, sg.value)
              );
            })
          )
        )
      )
    );

    // ---- Next to fire: enabled job with soonest non-null next_run_at ----
    var nextJob = null, nextTs = Infinity;
    jobList.forEach(function (j) {
      if (j.enabled === false) return;
      if (!j.next_run_at) return;
      var t;
      try { t = new Date(j.next_run_at).getTime(); } catch (e) { return; }
      if (isNaN(t)) return;
      if (t < nextTs) { nextTs = t; nextJob = j; }
    });
    var nextCard = h(Card, null,
      h(CardHeader, { className: "pb-2" }, h(CardTitle, { className: "text-sm" }, "Next to fire")),
      h(CardContent, null,
        nextJob
          ? h("div", { className: "flex flex-col gap-1" },
              h("div", { className: "flex items-center gap-2" },
                h("span", { className: "pw-dot", style: { background: HEALTHY } }),
                h("span", { className: "text-base font-medium truncate" }, nextJob.name)
              ),
              h("div", { className: "text-sm" }, clockTime(nextJob.next_run_at),
                h("span", { className: "text-muted-foreground" }, " · " + relTime(nextJob.next_run_at))),
              nextJob.schedule && nextJob.schedule.display
                ? h("div", { className: "text-xs text-muted-foreground" }, nextJob.schedule.display)
                : null
            )
          : h("span", { className: "text-sm text-muted-foreground" }, "No upcoming runs scheduled.")
      )
    );

    // ---- Needs attention: failing & degraded jobs (score<80 OR status error/never_run) ----
    var attention = healthJobs.filter(function (j) {
      return (j.score != null && j.score < 80) || j.status === "error" || j.status === "never_run";
    });
    var attentionCard = h(Card, null,
      h(CardHeader, { className: "pb-2" },
        h(CardTitle, { className: "text-sm" }, "Needs attention — failing & degraded jobs")),
      h(CardContent, null,
        attention.length === 0
          ? h("span", { className: "text-sm text-muted-foreground" }, "All jobs healthy. Nothing needs attention.")
          : h("table", { className: "pw-tbl" },
              h("thead", null, h("tr", null,
                h("th", null, "Job"),
                h("th", null, "Status"),
                h("th", { className: "num" }, "Fails"),
                h("th", { className: "num" }, "Health")
              )),
              h("tbody", null, attention.map(function (j) {
                var joined = jobById[j.id];
                var sched = joined && joined.schedule && joined.schedule.display;
                return h("tr", { key: j.id },
                  h("td", null,
                    h("div", { className: "flex flex-col" },
                      h("span", { className: "font-medium truncate" }, j.name),
                      sched ? h("span", { className: "text-xs text-muted-foreground" }, sched) : null
                    )
                  ),
                  h("td", null, h(Badge, { tone: statusTone(j.status) }, statusLabel(j.status))),
                  h("td", { className: "num" }, j.consecutive_failures || 0),
                  h("td", { className: cn("num font-mono", healthColor(j.score)) },
                    j.score != null ? j.score : "—")
                );
              }))
            )
      )
    );

    // ---- Never run: list by name ----
    var neverRun = [];
    jobList.forEach(function (j) { if (j.status === "never_run") neverRun.push(j.name); });
    if (!neverRun.length) {
      healthJobs.forEach(function (j) { if (j.status === "never_run") neverRun.push(j.name); });
    }
    var neverCard = neverRun.length
      ? h(Card, null,
          h(CardHeader, { className: "pb-2" },
            h(CardTitle, { className: "text-sm" }, "Never run (" + neverRun.length + ")")),
          h(CardContent, null,
            h("div", { className: "flex flex-col" }, neverRun.map(function (name, i) {
              return h("div", { className: "pw-tick", key: i },
                h("span", { className: "pw-dot", style: { background: "var(--color-muted-foreground)" } }),
                h("span", { className: "truncate" }, name)
              );
            }))
          )
        )
      : null;

    // ---- Schedule — runs per hour (today): 24-bar heat strip ----
    var hours = (timeline && timeline.hours) || [];
    var counts = [];
    for (var hr = 0; hr < 24; hr++) counts.push(0);
    hours.forEach(function (entry) {
      var idx = entry.hour;
      if (idx != null && idx >= 0 && idx < 24) {
        counts[idx] = (entry.jobs && entry.jobs.length) || 0;
      }
    });
    var maxCount = counts.reduce(function (m, c) { return c > m ? c : m; }, 0);
    var totalRuns = counts.reduce(function (a, b) { return a + b; }, 0);
    var scheduleCard = h(Card, null,
      h(CardHeader, { className: "pb-2" },
        h("div", { className: "flex items-baseline justify-between" },
          h(CardTitle, { className: "text-sm" }, "Schedule — runs per hour (today)"),
          h("span", { className: "text-xs text-muted-foreground" }, totalRuns + " runs"))),
      h(CardContent, null,
        h("div", { className: "pw-strip" },
          counts.map(function (c, i) {
            var pct = maxCount ? Math.max(c > 0 ? 8 : 0, Math.round((c / maxCount) * 100)) : 0;
            return h("div", {
              key: i,
              className: "pw-bar",
              style: {
                height: pct + "%",
                background: c > 0 ? "var(--color-primary, " + HEALTHY + ")" : "var(--color-border)",
                opacity: c > 0 ? 0.85 : 0.4
              },
              title: String(i).padStart(2, "0") + ":00 · " + c + (c === 1 ? " job" : " jobs")
            });
          })
        ),
        h("div", { className: "pw-axis" },
          h("span", null, "0"), h("span", null, "6"), h("span", null, "12"),
          h("span", null, "18"), h("span", null, "23")
        )
      )
    );

    // ---- By type: segmented bar + counts ----
    var typeSeg = [
      { key: "llm", label: "LLM", value: byType.llm || 0, color: HEALTHY },
      { key: "script", label: "Script", value: byType.script || 0, color: DEGRADED },
      { key: "hybrid", label: "Hybrid", value: byType.hybrid || 0, color: "var(--color-primary,#7c8cff)" }
    ];
    var typeTotal = typeSeg.reduce(function (a, t) { return a + t.value; }, 0);
    var typeCard = h(Card, null,
      h(CardHeader, { className: "pb-2" }, h(CardTitle, { className: "text-sm" }, "By type")),
      h(CardContent, null,
        h("div", { className: "pw-seg" },
          typeSeg.map(function (t) {
            if (!t.value) return null;
            return h("div", {
              key: t.key, className: "pw-seg-i",
              style: { width: (typeTotal ? (t.value / typeTotal) * 100 : 0) + "%", background: t.color },
              title: t.label + ": " + t.value
            });
          })
        ),
        h("div", { className: "flex flex-col mt-2" },
          typeSeg.map(function (t) {
            return h("div", { className: "pw-type-row", key: t.key },
              h("span", { className: "flex items-center gap-2" },
                h("span", { className: "pw-dot", style: { background: t.color } }),
                h("span", null, t.label)),
              h("span", { className: "font-medium", style: { fontVariantNumeric: "tabular-nums" } }, t.value)
            );
          })
        )
      )
    );

    // ---- layout ----
    var leftCol = h("div", { className: "flex flex-col gap-4" }, attentionCard, scheduleCard);
    var rightColChildren = [distCard, nextCard, typeCard];
    if (neverCard) rightColChildren.push(neverCard);
    var rightCol = h("div", { className: "flex flex-col gap-4" }, rightColChildren);

    return h("div", { className: "pw p-4" },
      kpis,
      h("div", { className: "pw-grid" }, leftCol, rightCol)
    );
  }

  PLUGINS.register("pocket-watch", PocketWatch);
})();
