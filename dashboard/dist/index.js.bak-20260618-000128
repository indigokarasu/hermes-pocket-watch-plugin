/**
 * Pocket Watch Dashboard Plugin — JS bundle.
 *
 * Provides a dashboard panel showing:
 * - Overview stats (total jobs, by type, health)
 * - Daily timeline view (24-hour grid)
 * - Weekly timeline view (7-day grid)
 * - Monthly timeline view (31-day grid)
 * - Health dashboard (sorted by health score)
 * - Job detail cards with type badges, status indicators
 */

(function () {
  var SDK = window.__HERMES_PLUGIN_SDK__;
  var PLUGINS = window.__HERMES_PLUGINS__;

  if (!SDK || !PLUGINS) {
    console.error("[pocket-watch] Hermes plugin SDK not available.");
    return;
  }

  var React = SDK.React;
  var hooks = SDK.hooks;
  var fetchJSON = SDK.fetchJSON;
  var components = SDK.components;
  var utils = SDK.utils;

  var useState = hooks.useState;
  var useEffect = hooks.useEffect;
  var useCallback = hooks.useCallback;
  var useMemo = hooks.useMemo;

  var Card = components.Card;
  var CardHeader = components.CardHeader;
  var CardTitle = components.CardTitle;
  var CardContent = components.CardContent;
  var Badge = components.Badge;
  var Button = components.Button;
  var Spinner = components.Spinner || function (props) {
    return React.createElement("span", { className: (props.className || "") + " animate-pulse" }, "…");
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  var STATUS_COLORS = {
    ok: "success",
    error: "destructive",
    paused: "secondary",
    never_run: "outline",
    unknown: "outline",
  };

  var STATUS_LABELS = {
    ok: "OK",
    error: "Error",
    paused: "Paused",
    never_run: "Never Run",
    unknown: "Unknown",
  };

  var TYPE_ICONS = {
    llm: "🧠",
    script: "📜",
    hybrid: "⚡",
  };

  function statusTone(status) {
    return STATUS_COLORS[status] || "outline";
  }

  function formatTime(isoStr) {
    if (!isoStr) return "—";
    try {
      var d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch (e) {
      return isoStr;
    }
  }

  function healthColor(score) {
    if (score >= 80) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  }

  function healthBg(score) {
    if (score >= 80) return "bg-green-500/10";
    if (score >= 40) return "bg-yellow-500/10";
    return "bg-red-500/10";
  }

  // ---------------------------------------------------------------------------
  // Job Badge Component
  // ---------------------------------------------------------------------------

  function JobBadge(job) {
    var typeIcon = TYPE_ICONS[job.type] || "❓";
    return React.createElement(
      "div",
      { className: "inline-flex items-center gap-1.5 text-xs" },
      React.createElement("span", null, typeIcon),
      React.createElement(Badge, { tone: statusTone(job.status) }, STATUS_LABELS[job.status] || job.status)
    );
  }

  // ---------------------------------------------------------------------------
  // Overview Panel
  // ---------------------------------------------------------------------------

  function OverviewPanel() {
    var state = useState(null);
    var data = state[0];
    var setData = state[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var fetchData = useCallback(function () {
      setLoading(true);
      fetchJSON("/api/plugins/pocket-watch/status")
        .then(function (d) { setData(d); setLoading(false); })
        .catch(function () { setLoading(false); });
    }, []);

    useEffect(function () { fetchData(); }, [fetchData]);

    if (loading) {
      return React.createElement("div", { className: "flex items-center gap-2 p-4 text-sm text-muted-foreground" },
        React.createElement(Spinner, { className: "h-4 w-4" }), "Loading...");
    }
    if (!data) return null;

    var jobs = data.jobs || {};
    var byType = jobs.by_type || {};
    var health = data.health || {};

    return React.createElement("div", { className: "grid gap-3" },
      React.createElement("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-4" },
        React.createElement(StatCard, { label: "Total Jobs", value: String(jobs.total || 0) }),
        React.createElement(StatCard, { label: "Enabled", value: String(jobs.enabled || 0) }),
        React.createElement(StatCard, { label: "Errors", value: String(jobs.error || 0), alert: jobs.error > 0 }),
        React.createElement(StatCard, { label: "Avg Health", value: (health.average || 0) + "%" })
      ),
      React.createElement("div", { className: "grid grid-cols-3 gap-3" },
        React.createElement(TypeCard, { icon: "🧠", label: "LLM", count: byType.llm || 0 }),
        React.createElement(TypeCard, { icon: "📜", label: "Script", count: byType.script || 0 }),
        React.createElement(TypeCard, { icon: "⚡", label: "Hybrid", count: byType.hybrid || 0 })
      )
    );
  }

  function StatCard(props) {
    return React.createElement("div", { className: "flex flex-col gap-1" },
      React.createElement("span", { className: "text-xs text-muted-foreground" }, props.label),
      React.createElement("span", {
        className: "text-lg font-semibold" + (props.alert ? " text-red-500" : "")
      }, props.value)
    );
  }

  function TypeCard(props) {
    return React.createElement("div", { className: "flex items-center gap-2 rounded-md border p-2" },
      React.createElement("span", { className: "text-lg" }, props.icon),
      React.createElement("div", { className: "flex flex-col" },
        React.createElement("span", { className: "text-xs text-muted-foreground" }, props.label),
        React.createElement("span", { className: "text-sm font-medium" }, props.count)
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Daily Timeline
  // ---------------------------------------------------------------------------

  function DailyTimeline() {
    var state = useState(null);
    var data = state[0];
    var setData = state[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    useEffect(function () {
      fetchJSON("/api/plugins/pocket-watch/timeline/daily")
        .then(function (d) { setData(d); setLoading(false); })
        .catch(function () { setLoading(false); });
    }, []);

    if (loading) {
      return React.createElement("div", { className: "flex items-center gap-2 p-4 text-sm text-muted-foreground" },
        React.createElement(Spinner, { className: "h-4 w-4" }), "Loading daily timeline...");
    }
    if (!data) return null;

    var hours = data.hours || [];

    return React.createElement("div", { className: "flex flex-col gap-1" },
      React.createElement("h3", { className: "text-sm font-medium mb-2" }, "Daily Schedule"),
      React.createElement("div", { className: "max-h-96 overflow-y-auto" },
        hours.map(function (h) {
          var hasJobs = h.jobs && h.jobs.length > 0;
          return React.createElement(
            "div",
            {
              key: h.hour,
              className: "flex items-start gap-2 py-1 border-b border-border/50" +
                (hasJobs ? "" : " opacity-40")
            },
            React.createElement("span", {
              className: "w-12 shrink-0 text-xs font-mono text-muted-foreground pt-0.5"
            }, String(h.hour).padStart(2, "0") + ":00"),
            React.createElement("div", { className: "flex flex-wrap gap-1" },
              hasJobs
                ? h.jobs.map(function (j, idx) {
                    return React.createElement(
                      "span",
                      {
                        key: j.id + "-" + idx,
                        className: "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs cursor-default" +
                          (j.status === "error" ? " bg-red-500/15 text-red-400" :
                           j.status === "ok" ? " bg-green-500/10 text-green-400" :
                           " bg-muted text-muted-foreground"),
                        title: j.name + " @ " + String(j.minute).padStart(2, "0") + "min"
                      },
                      React.createElement("span", null, TYPE_ICONS[j.type] || "?"),
                      React.createElement("span", null, j.name.length > 20 ? j.name.slice(0, 18) + "…" : j.name)
                    );
                  })
                : React.createElement("span", { className: "text-xs text-muted-foreground italic" }, "—")
            )
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Weekly Timeline
  // ---------------------------------------------------------------------------

  function WeeklyTimeline() {
    var state = useState(null);
    var data = state[0];
    var setData = state[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    useEffect(function () {
      fetchJSON("/api/plugins/pocket-watch/timeline/weekly")
        .then(function (d) { setData(d); setLoading(false); })
        .catch(function () { setLoading(false); });
    }, []);

    if (loading) {
      return React.createElement("div", { className: "flex items-center gap-2 p-4 text-sm text-muted-foreground" },
        React.createElement(Spinner, { className: "h-4 w-4" }), "Loading weekly timeline...");
    }
    if (!data) return null;

    var days = data.days || [];

    return React.createElement("div", { className: "flex flex-col gap-1" },
      React.createElement("h3", { className: "text-sm font-medium mb-2" }, "Weekly Schedule"),
      React.createElement("div", { className: "grid grid-cols-7 gap-1" },
        days.map(function (d) {
          var hasJobs = d.jobs && d.jobs.length > 0;
          return React.createElement(
            "div",
            { key: d.day, className: "flex flex-col gap-1 rounded-md border p-1.5 min-h-[4rem]" },
            React.createElement("span", { className: "text-xs font-medium text-center" }, d.day),
            hasJobs
              ? d.jobs.map(function (j, idx) {
                  return React.createElement(
                    "span",
                    {
                      key: j.id + "-" + idx,
                      className: "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-tight" +
                        (j.status === "error" ? " bg-red-500/15 text-red-400" :
                         j.status === "ok" ? " bg-green-500/10 text-green-400" :
                         " bg-muted text-muted-foreground"),
                      title: j.name + (j.time ? " @ " + j.time : "")
                    },
                    React.createElement("span", null, TYPE_ICONS[j.type] || "?"),
                    React.createElement("span", { className: "truncate" }, j.name.length > 12 ? j.name.slice(0, 10) + "…" : j.name)
                  );
                })
              : React.createElement("span", { className: "text-[10px] text-muted-foreground text-center" }, "—")
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Monthly Timeline
  // ---------------------------------------------------------------------------

  function MonthlyTimeline() {
    var state = useState(null);
    var data = state[0];
    var setData = state[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    useEffect(function () {
      fetchJSON("/api/plugins/pocket-watch/timeline/monthly")
        .then(function (d) { setData(d); setLoading(false); })
        .catch(function () { setLoading(false); });
    }, []);

    if (loading) {
      return React.createElement("div", { className: "flex items-center gap-2 p-4 text-sm text-muted-foreground" },
        React.createElement(Spinner, { className: "h-4 w-4" }), "Loading monthly timeline...");
    }
    if (!data) return null;

    var days = data.days || [];

    return React.createElement("div", { className: "flex flex-col gap-1" },
      React.createElement("h3", { className: "text-sm font-medium mb-2" }, "Monthly Schedule"),
      React.createElement("div", { className: "grid grid-cols-7 gap-1" },
        days.map(function (d) {
          var hasJobs = d.jobs && d.jobs.length > 0;
          return React.createElement(
            "div",
            {
              key: d.day,
              className: "flex flex-col gap-0.5 rounded border p-1 min-h-[2.5rem]" +
                (hasJobs ? "" : " opacity-40")
            },
            React.createElement("span", { className: "text-[10px] font-mono text-muted-foreground text-center" }, d.day),
            hasJobs
              ? d.jobs.map(function (j, idx) {
                  return React.createElement(
                    "span",
                    {
                      key: j.id + "-" + idx,
                      className: "inline-block rounded px-0.5 py-0 text-[9px] leading-tight truncate" +
                        (j.status === "error" ? " bg-red-500/15 text-red-400" :
                         j.status === "ok" ? " bg-green-500/10 text-green-400" :
                         " bg-muted text-muted-foreground"),
                      title: j.name + (j.time ? " @ " + j.time : "")
                    },
                    j.name.length > 10 ? j.name.slice(0, 9) + "…" : j.name
                  );
                })
              : null
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Health Dashboard
  // ---------------------------------------------------------------------------

  function HealthDashboard() {
    var state = useState(null);
    var data = state[0];
    var setData = state[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    useEffect(function () {
      fetchJSON("/api/plugins/pocket-watch/health")
        .then(function (d) { setData(d); setLoading(false); })
        .catch(function () { setLoading(false); });
    }, []);

    if (loading) {
      return React.createElement("div", { className: "flex items-center gap-2 p-4 text-sm text-muted-foreground" },
        React.createElement(Spinner, { className: "h-4 w-4" }), "Loading health data...");
    }
    if (!data) return null;

    var jobs = data.jobs || [];
    var summary = data.summary || [];

    return React.createElement("div", { className: "flex flex-col gap-2" },
      React.createElement("h3", { className: "text-sm font-medium" }, "Health Dashboard"),
      React.createElement("div", { className: "grid grid-cols-3 gap-2 mb-2" },
        React.createElement("div", { className: "rounded-md border p-2 text-center" },
          React.createElement("div", { className: "text-lg font-semibold text-green-500" }, summary.healthy || 0),
          React.createElement("div", { className: "text-xs text-muted-foreground" }, "Healthy")
        ),
        React.createElement("div", { className: "rounded-md border p-2 text-center" },
          React.createElement("div", { className: "text-lg font-semibold text-yellow-500" }, summary.degraded || 0),
          React.createElement("div", { className: "text-xs text-muted-foreground" }, "Degraded")
        ),
        React.createElement("div", { className: "rounded-md border p-2 text-center" },
          React.createElement("div", { className: "text-lg font-semibold text-red-500" }, summary.critical || 0),
          React.createElement("div", { className: "text-xs text-muted-foreground" }, "Critical")
        )
      ),
      React.createElement("div", { className: "max-h-64 overflow-y-auto" },
        jobs.map(function (j) {
          return React.createElement(
            "div",
            { key: j.id, className: "flex items-center gap-2 py-1.5 border-b border-border/50" },
            React.createElement("div", {
              className: "w-10 text-right text-xs font-mono " + healthColor(j.score)
            }, j.score + "%"),
            React.createElement("div", { className: "flex-1 min-w-0" },
              React.createElement("div", { className: "text-xs font-medium truncate" }, j.name),
              React.createElement("div", { className: "text-[10px] text-muted-foreground" },
                j.last_status ? "Last: " + j.last_status : "Never run",
                j.consecutive_failures > 0 ? " · " + j.consecutive_failures + " fails" : ""
              )
            ),
            React.createElement(Badge, { tone: statusTone(j.status) }, STATUS_LABELS[j.status] || j.status)
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Job List
  // ---------------------------------------------------------------------------

  function JobList() {
    var state = useState(null);
    var data = state[0];
    var setData = state[1];
    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var filterState = useState("all");
    var filter = filterState[0];
    var setFilter = filterState[1];

    useEffect(function () {
      fetchJSON("/api/plugins/pocket-watch/jobs")
        .then(function (d) { setData(d); setLoading(false); })
        .catch(function () { setLoading(false); });
    }, []);

    var filteredJobs = useMemo(function () {
      if (!data || !data.jobs) return [];
      if (filter === "all") return data.jobs;
      return data.jobs.filter(function (j) { return j.status === filter; });
    }, [data, filter]);

    if (loading) {
      return React.createElement("div", { className: "flex items-center gap-2 p-4 text-sm text-muted-foreground" },
        React.createElement(Spinner, { className: "h-4 w-4" }), "Loading jobs...");
    }
    if (!data) return null;

    var filters = ["all", "ok", "error", "paused", "never_run"];

    return React.createElement("div", { className: "flex flex-col gap-2" },
      React.createElement("div", { className: "flex items-center justify-between" },
        React.createElement("h3", { className: "text-sm font-medium" }, "All Jobs (", data.total, ")"),
        React.createElement("div", { className: "flex gap-1" },
          filters.map(function (f) {
            return React.createElement(
              Button,
              {
                key: f,
                size: "sm",
                ghost: filter !== f,
                outlined: filter === f,
                onClick: function () { setFilter(f); }
              },
              f === "all" ? "All" : STATUS_LABELS[f] || f
            );
          })
        )
      ),
      React.createElement("div", { className: "max-h-80 overflow-y-auto" },
        filteredJobs.map(function (j) {
          return React.createElement(
            "div",
            { key: j.id, className: "flex items-center gap-2 py-2 border-b border-border/50" },
            React.createElement("span", { className: "text-sm" }, TYPE_ICONS[j.type] || "?"),
            React.createElement("div", { className: "flex-1 min-w-0" },
              React.createElement("div", { className: "text-xs font-medium truncate" }, j.name),
              React.createElement("div", { className: "text-[10px] text-muted-foreground" },
                j.schedule && j.schedule.display ? j.schedule.display : "—",
                " · Runs: " + (j.completed || 0)
              )
            ),
            React.createElement("span", { className: "text-xs font-mono " + healthColor(j.health_score) }, j.health_score + "%"),
            React.createElement(Badge, { tone: statusTone(j.status) }, STATUS_LABELS[j.status] || j.status)
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Main Tab Component
  // ---------------------------------------------------------------------------

  function PocketWatchTab() {
    var viewState = useState("overview");
    var view = viewState[0];
    var setView = viewState[1];

    var tabs = [
      { id: "overview", label: "Overview" },
      { id: "daily", label: "Daily" },
      { id: "weekly", label: "Weekly" },
      { id: "monthly", label: "Monthly" },
      { id: "health", label: "Health" },
      { id: "jobs", label: "Jobs" },
    ];

    return React.createElement("div", { className: "flex flex-col gap-4 p-4" },
      React.createElement("div", { className: "flex items-center gap-2" },
        React.createElement("h2", { className: "text-lg font-semibold" }, "⏱ Pocket Watch"),
        React.createElement("span", { className: "text-xs text-muted-foreground" }, "Cron Monitor")
      ),
      React.createElement("div", { className: "flex gap-1 border-b border-border pb-2" },
        tabs.map(function (t) {
          return React.createElement(
            Button,
            {
              key: t.id,
              size: "sm",
              ghost: view !== t.id,
              outlined: view === t.id,
              onClick: function () { setView(t.id); }
            },
            t.label
          );
        })
      ),
      view === "overview" ? React.createElement(OverviewPanel) : null,
      view === "daily" ? React.createElement(DailyTimeline) : null,
      view === "weekly" ? React.createElement(WeeklyTimeline) : null,
      view === "monthly" ? React.createElement(MonthlyTimeline) : null,
      view === "health" ? React.createElement(HealthDashboard) : null,
      view === "jobs" ? React.createElement(JobList) : null
    );
  }

  // ---------------------------------------------------------------------------
  // Register with Hermes plugin system
  // ---------------------------------------------------------------------------

  PLUGINS.register("pocket-watch", PocketWatchTab);

  console.log("[pocket-watch] Plugin registered successfully.");
})();
