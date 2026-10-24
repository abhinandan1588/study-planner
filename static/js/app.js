"use strict";

/* ==================================================================
   Smart Study Planner - app.js
   Vanilla JS single-page app: state -> API -> render cycle.
   ================================================================== */

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function fmtMinutes(total) {
  const m = Math.round(total || 0);
  if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h ${r}m` : `${r}m`;
}

function toLocalInput(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtClockTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  award: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13l1.5 9-5-3-5 3 1.5-9"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

const PRIORITY = {
  1: { label: "High", cls: "badge-high" },
  2: { label: "Medium", cls: "badge-medium" },
  3: { label: "Low", cls: "badge-low" },
};

const QUOTES = [
  "The secret of getting ahead is getting started.",
  "Focus on being productive instead of busy.",
  "Small daily improvements over time lead to stunning results.",
  "You do not have to be great to start, but you have to start to be great.",
  "Discipline is choosing between what you want now and what you want most.",
  "It always seems impossible until it is done.",
  "The expert in anything was once a beginner.",
  "Motivation gets you going, but discipline keeps you growing.",
  "Study while others are sleeping; work while others are loafing.",
  "A little progress each day adds up to big results.",
];

const COLOR_PALETTE = [
  "#0d9488", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#84cc16", "#f97316", "#64748b",
];

/* ---------------- state ---------------- */
const state = {
  view: "dashboard",
  subjects: [],
  tasks: [],
  plan: null,
  stats: null,
  sessionsToday: [],
  week: null,
  weekOffset: 0,
  filters: { search: "", subject: "", status: "all", sort: "smart" },
  editingTaskId: null,
  editingSubjectId: null,
  selectedColor: COLOR_PALETTE[0],
  confirmAction: null,
};

/* ---------------- API ---------------- */
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------- toast ---------------- */
function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `${ICONS[type === "success" ? "check" : type === "error" ? "x" : "info"]}<span>${escapeHtml(message)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 320);
  }, 3400);
}

/* ---------------- modals ---------------- */
function openModal(id) {
  $("#" + id).classList.add("show");
  document.body.classList.add("modal-open");
}
function closeModal(id) {
  $("#" + id).classList.remove("show");
  document.body.classList.remove("modal-open");
}

function openConfirm({ title, message, okLabel = "Delete", onOk }) {
  $("#confirm-title").textContent = title;
  $("#confirm-msg").textContent = message;
  $("#confirm-ok").textContent = okLabel;
  state.confirmAction = onOk;
  openModal("modal-confirm");
}

/* ---------------- theme ---------------- */
function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark", dark);
  $("#theme-label").textContent = dark ? "Light mode" : "Dark mode";
  $("#theme-icon").innerHTML = dark ? ICONS.sun : ICONS.moon;
  localStorage.setItem("sp-theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("sp-theme");
  applyTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
}

/* ---------------- clock & greeting ---------------- */
function initClock() {
  const tick = () => {
    const now = new Date();
    $("#clock").textContent =
      now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      "  ·  " + fmtClockTime(now);
    const h = now.getHours();
    $("#hero-greeting").textContent =
      h < 5 ? "Burning the midnight oil" :
      h < 12 ? "Good morning, scholar" :
      h < 17 ? "Good afternoon, scholar" : "Good evening, scholar";
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------------- navigation ---------------- */
const VIEW_TITLES = {
  dashboard: "Dashboard",
  tasks: "Tasks",
  timer: "Focus Timer",
  schedule: "Schedule",
  stats: "Statistics",
  subjects: "Subjects",
};

function switchView(name) {
  state.view = name;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  $("#view-title").textContent = VIEW_TITLES[name] || name;
  closeSidebar();
  if (name === "schedule" && !state.week) loadWeek();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-backdrop").classList.remove("show");
}

/* ---------------- data refresh ---------------- */
async function refreshAll() {
  try {
    const [subjects, tasks, plan, stats, sessions] = await Promise.all([
      api("/api/subjects"),
      api("/api/tasks"),
      api("/api/plan"),
      api("/api/stats"),
      api("/api/sessions?days=2&limit=100"),
    ]);
    Object.assign(state, {
      subjects, tasks, plan, stats,
      sessionsToday: sessions.filter(s => s.started_at.slice(0, 10) === new Date().toISOString().slice(0, 10)),
    });
    renderAll();
    if (state.week) loadWeek(true);
  } catch (err) {
    toast(err.message || "Failed to load data.", "error");
  }
}

function renderAll() {
  renderDashboard();
  renderTasks();
  renderFilterSelects();
  renderTimerSide();
  renderStats();
  renderSubjects();
  renderNavBadge();
  if (state.week) renderWeek();
}

function renderNavBadge() {
  const pending = state.tasks.filter(t => t.status === "pending").length;
  const badge = $("#nav-tasks-badge");
  badge.hidden = pending === 0;
  badge.textContent = pending;
}

/* ---------------- dashboard ---------------- */
function statCard(icon, tint, value, label) {
  return `<div class="stat-card">
    <div class="stat-icon ${tint}">${icon}</div>
    <div class="stat-body">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  </div>`;
}

function renderDashboard() {
  // Hero
  const now = new Date();
  $("#hero-quote").textContent = QUOTES[Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5) % QUOTES.length];
  $("#hero-date").textContent = now.toLocaleDateString(undefined,
    { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Stats
  const pending = state.tasks.filter(t => t.status === "pending");
  const dueToday = pending.filter(t => t.days_left !== null && t.days_left >= 0 && t.days_left <= 1).length;
  const overdue = pending.filter(t => t.days_left !== null && t.days_left < 0).length;
  const weekAgo = Date.now() - 7 * 864e5;
  const doneWeek = state.tasks.filter(t =>
    t.status === "completed" && t.completed_at && new Date(t.completed_at).getTime() >= weekAgo).length;
  const focusWeek = state.stats ? state.stats.totals.study_minutes_week : 0;

  $("#dash-stats").innerHTML =
    statCard(ICONS.calendar, "tint-warning", dueToday, "Due within 24 hours") +
    statCard(ICONS.alert, overdue ? "tint-danger" : "tint-primary", overdue, "Overdue tasks") +
    statCard(ICONS.check, "tint-success", doneWeek, "Completed this week") +
    statCard(ICONS.clock, "tint-primary", fmtMinutes(focusWeek), "Focus time this week");

  // Smart plan
  const plan = state.plan;
  $("#plan-total").textContent = plan ? `${fmtMinutes(plan.planned_minutes)} planned` : "";
  if (plan && plan.sessions.length) {
    $("#smart-plan").innerHTML = plan.sessions.map((s, i) => `
      <div class="plan-item">
        <div class="plan-rank">${i + 1}</div>
        <div class="plan-main">
          <div class="plan-title">${escapeHtml(s.title)}</div>
          <div class="plan-meta">
            <span class="subject-chip"><span class="dot" style="background:${s.subject_color}"></span>${escapeHtml(s.subject_name)}</span>
            <span class="badge ${PRIORITY[s.priority].cls}">${PRIORITY[s.priority].label}</span>
          </div>
          <div class="plan-reason">${escapeHtml(s.reason)}</div>
        </div>
        <div class="plan-right">
          <div class="plan-minutes">${fmtMinutes(s.minutes)}</div>
          <button class="btn btn-soft btn-sm" data-action="start-plan" data-id="${s.task_id}">Focus</button>
        </div>
      </div>`).join("");
  } else {
    $("#smart-plan").innerHTML = emptyState(ICONS.zap, "Nothing to plan yet",
      "Add a task with a deadline and the planner will build today's plan for you.", "Add a task", "new-task");
  }

  // Upcoming deadlines
  const upcoming = pending
    .filter(t => t.days_left !== null)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 6);
  if (upcoming.length) {
    $("#upcoming-list").innerHTML = `<div class="mini-list">${upcoming.map(t => {
      const dl = deadlineInfo(t);
      return `<div class="mini-item">
        <span class="dot" style="background:${t.subject_color || "#94a3b8"}"></span>
        <div class="mini-main">
          <div class="mini-title">${escapeHtml(t.title)}</div>
          <div class="mini-sub">${escapeHtml(t.subject_name || "No subject")}</div>
        </div>
        <span class="deadline-chip ${dl.cls}">${dl.label}</span>
      </div>`;
    }).join("")}</div>`;
  } else {
    $("#upcoming-list").innerHTML = emptyState(ICONS.calendar, "No deadlines ahead",
      "Your schedule is clear. Add tasks to start planning.", "Add a task", "new-task");
  }

  // Alerts
  const alerts = plan ? plan.alerts : [];
  $("#dash-alerts-panel").style.display = alerts.length ? "" : "none";
  if (alerts.length) {
    $("#dash-alerts").innerHTML = alerts.map(a =>
      `<div class="alert-item">${ICONS.alert}<span>${escapeHtml(a)}</span></div>`).join("");
  }
}

function deadlineInfo(task) {
  const d = new Date(task.deadline);
  const diffH = (d - new Date()) / 3.6e6;
  const dateStr = d.toLocaleString(undefined,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (task.status === "completed") return { label: dateStr, cls: "done" };
  if (diffH < 0) return { label: `Overdue · ${dateStr}`, cls: "overdue" };
  if (diffH <= 24) {
    const h = diffH < 1 ? `${Math.max(1, Math.round(diffH * 60))}m` : `${Math.round(diffH)}h`;
    return { label: `Due in ${h} · ${dateStr}`, cls: "today" };
  }
  if (diffH <= 72) return { label: `Due in ${Math.round(diffH / 24)}d · ${dateStr}`, cls: "soon" };
  return { label: dateStr, cls: "later" };
}

function emptyState(icon, title, text, actionLabel, action) {
  return `<div class="empty">${icon}
    <div class="empty-title">${escapeHtml(title)}</div>
    <p>${escapeHtml(text)}</p>
    ${actionLabel ? `<button class="btn btn-soft btn-sm" data-action="${action}">${escapeHtml(actionLabel)}</button>` : ""}
  </div>`;
}

/* ---------------- tasks view ---------------- */
function getFilteredTasks() {
  const f = state.filters;
  let list = [...state.tasks];
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) || (t.subject_name || "").toLowerCase().includes(q));
  }
  if (f.subject) list = list.filter(t => String(t.subject_id) === f.subject);
  if (f.status === "pending") list = list.filter(t => t.status === "pending");
  if (f.status === "completed") list = list.filter(t => t.status === "completed");
  if (f.status === "overdue") list = list.filter(t =>
    t.status === "pending" && t.days_left !== null && t.days_left < 0);

  switch (f.sort) {
    case "smart": list.sort((a, b) => b.urgency - a.urgency); break;
    case "deadline": list.sort((a, b) => (a.days_left ?? 1e9) - (b.days_left ?? 1e9)); break;
    case "priority": list.sort((a, b) => a.priority - b.priority); break;
    case "created": list.sort((a, b) => b.id - a.id); break;
  }
  return list;
}

function renderTasks() {
  const list = getFilteredTasks();
  if (!list.length) {
    $("#task-list").innerHTML = emptyState(ICONS.book,
      "No tasks found", "Try changing the filters, or add a new task to get started.",
      "Add a task", "new-task");
    return;
  }
  $("#task-list").innerHTML = list.map(t => {
    const done = t.status === "completed";
    const dl = deadlineInfo(t);
    const pr = PRIORITY[t.priority];
    const showProgress = t.logged_minutes > 0 && !done;
    return `<div class="task-row ${done ? "completed" : ""}">
      <div class="task-check ${done ? "checked" : ""}" role="checkbox" aria-checked="${done}"
           tabindex="0" data-action="toggle-task" data-id="${t.id}" title="Mark ${done ? "pending" : "complete"}">
        ${ICONS.check}
      </div>
      <div class="task-main">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          ${t.subject_name
            ? `<span class="subject-chip"><span class="dot" style="background:${t.subject_color}"></span>${escapeHtml(t.subject_name)}</span>`
            : `<span class="subject-chip">No subject</span>`}
          <span class="badge ${pr.cls}">${pr.label}</span>
          <span class="deadline-chip ${dl.cls}">${dl.label}</span>
        </div>
        ${showProgress ? `<div class="task-progress">
          <div class="progress-track"><div class="progress-fill" style="width:${t.progress_pct}%"></div></div>
          <span>${fmtMinutes(t.logged_minutes)} of ${fmtMinutes(t.estimated_minutes)} logged</span>
        </div>` : ""}
      </div>
      <div class="task-actions">
        ${!done ? `<button class="icon-btn" data-action="focus-task" data-id="${t.id}" title="Focus on this task">${ICONS.play}</button>` : ""}
        <button class="icon-btn" data-action="edit-task" data-id="${t.id}" title="Edit">${ICONS.pencil}</button>
        <button class="icon-btn danger" data-action="delete-task" data-id="${t.id}" title="Delete">${ICONS.trash}</button>
      </div>
    </div>`;
  }).join("");
}

/* ---------------- timer ---------------- */
const RING_C = 2 * Math.PI * 115; // r = 115

const timer = {
  mode: "focus",
  running: false,
  lengths: { focus: 25, short: 5, long: 15 },
  remaining: 25 * 60,
  total: 25 * 60,
  completedFocus: 0,
  intervalId: null,
};

function timerModeMeta(mode) {
  return mode === "focus"
    ? { label: "Focus session", isBreak: false }
    : mode === "short"
      ? { label: "Short break", isBreak: true }
      : { label: "Long break", isBreak: true };
}

function updateTimerUI() {
  const m = Math.floor(timer.remaining / 60), s = timer.remaining % 60;
  $("#timer-time").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const frac = timer.total > 0 ? timer.remaining / timer.total : 0;
  $("#ring-fg").style.strokeDashoffset = String(RING_C * (1 - frac));
}

function setTimerMode(mode) {
  stopTimer();
  timer.mode = mode;
  timer.total = timer.lengths[mode] * 60;
  timer.remaining = timer.total;
  $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  const meta = timerModeMeta(mode);
  $("#timer-label").textContent = meta.label;
  document.body.classList.toggle("timer-break", meta.isBreak);
  setTimerButton("start");
  updateTimerUI();
}

function setTimerButton(kind) {
  const text = $("#btn-timer-text");
  const icon = $("#btn-timer-icon");
  if (kind === "start") { text.textContent = "Start"; icon.outerHTML = ICONS.play.replace("<svg", '<svg id="btn-timer-icon"'); }
  if (kind === "pause") { text.textContent = "Pause"; icon.outerHTML = ICONS.pause.replace("<svg", '<svg id="btn-timer-icon"'); }
  if (kind === "resume") { text.textContent = "Resume"; icon.outerHTML = ICONS.play.replace("<svg", '<svg id="btn-timer-icon"'); }
}

function startTimer() {
  if (timer.running) return;
  timer.running = true;
  setTimerButton("pause");
  timer.intervalId = setInterval(() => {
    timer.remaining -= 1;
    updateTimerUI();
    if (timer.remaining <= 0) completeTimerCycle();
  }, 1000);
}

function stopTimer() {
  timer.running = false;
  if (timer.intervalId) { clearInterval(timer.intervalId); timer.intervalId = null; }
}

function resetTimer() {
  stopTimer();
  timer.remaining = timer.total;
  setTimerButton("start");
  updateTimerUI();
}

async function completeTimerCycle() {
  stopTimer();
  try { beep(3); } catch (e) { /* audio not available */ }
  const wasFocus = timer.mode === "focus";
  if (wasFocus) {
    timer.completedFocus += 1;
    await logSession(timer.lengths.focus);
    toast("Focus session complete - time for a break!", "success");
    setTimerMode(timer.completedFocus % 4 === 0 ? "long" : "short");
  } else {
    toast("Break finished - ready for the next round?", "info");
    setTimerMode("focus");
  }
}

async function logSession(minutes, taskId = null, subjectId = null) {
  try {
    await api("/api/sessions", {
      method: "POST",
      body: {
        duration_minutes: minutes,
        subject_id: subjectId !== null ? subjectId : ($("#timer-subject").value ? +$("#timer-subject").value : null),
        task_id: taskId !== null ? taskId : ($("#timer-task").value ? +$("#timer-task").value : null),
      },
    });
    await refreshAll();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* Web Audio chime - no external files needed */
function beep(times = 1) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880 - i * 120;
    const t = ctx.currentTime + i * 0.42;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

function populateSelect(sel, options, placeholder, selectedValue) {
  const prev = selectedValue !== undefined ? selectedValue : sel.value;
  sel.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
    options.map(o => `<option value="${o.value}"${String(o.value) === String(prev) ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
  if (prev && ![...sel.options].some(o => String(o.value) === String(prev))) sel.value = "";
}

function renderTimerSide() {
  populateSelect($("#timer-subject"),
    state.subjects.map(s => ({ value: s.id, label: s.name })),
    "No subject");
  const pending = state.tasks
    .filter(t => t.status === "pending")
    .sort((a, b) => b.urgency - a.urgency)
    .map(t => ({ value: t.id, label: `${t.title}${t.subject_name ? ` (${t.subject_name})` : ""}` }));
  populateSelect($("#timer-task"), pending, "No specific task");

  const today = state.sessionsToday;
  const totalMin = today.reduce((a, s) => a + s.duration_minutes, 0);
  $("#today-minutes").textContent = today.length ? fmtMinutes(totalMin) : "0m";
  if (today.length) {
    $("#today-sessions").innerHTML = today.map(s => `
      <div class="session-item">
        <span class="dot" style="background:${s.subject_color || "#94a3b8"}"></span>
        <div class="session-main">
          <div class="session-title">${escapeHtml(s.task_title || s.subject_name || "General study")}</div>
          <div class="session-sub">${escapeHtml(fmtClockTime(new Date(s.started_at)))}${s.subject_name && s.task_title ? " · " + escapeHtml(s.subject_name) : ""}</div>
        </div>
        <span class="session-min">${fmtMinutes(s.duration_minutes)}</span>
        <button class="icon-btn danger" style="width:28px;height:28px;border:none;background:transparent" data-action="delete-session" data-id="${s.id}" title="Delete session">${ICONS.trash}</button>
      </div>`).join("");
  } else {
    $("#today-sessions").innerHTML = emptyState(ICONS.clock, "No sessions yet today",
      "Hit Start on a focus session - it will be logged here automatically.");
  }
}

function focusTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  switchView("timer");
  if (task.subject_id) $("#timer-subject").value = String(task.subject_id);
  $("#timer-task").value = String(taskId);
  if (timer.running) { stopTimer(); setTimerButton("start"); }
  toast(`Timer loaded with "${task.title}"`, "info");
}

/* ---------------- schedule ---------------- */
async function loadWeek(silent = false) {
  try {
    state.week = await api(`/api/week?offset=${state.weekOffset}`);
    renderWeek();
  } catch (err) {
    if (!silent) toast(err.message, "error");
  }
}

function renderWeek() {
  const w = state.week;
  if (!w) return;
  const start = new Date(w.week_start + "T00:00:00");
  const end = new Date(start.getTime() + 6 * 864e5);
  const fmt = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  $("#week-label").textContent = start.getMonth() === end.getMonth()
    ? `${fmt(start)} - ${end.getDate()}, ${end.getFullYear()}`
    : `${fmt(start)} - ${fmt(end)}, ${end.getFullYear()}`;

  $("#week-grid").innerHTML = w.days.map(day => `
    <div class="day-col ${day.is_today ? "today" : ""}">
      <div class="day-head">
        <span class="day-name">${day.label}</span>
        <span class="day-num">${day.day_num}</span>
        ${day.minutes ? `<span class="day-min">${fmtMinutes(day.minutes)}</span>` : ""}
      </div>
      <div class="day-tasks">
        ${day.tasks.map(t => `
          <div class="day-task ${t.status === "completed" ? "completed" : ""}"
               style="--dc:${t.subject_color || "#94a3b8"}" title="${escapeHtml(t.title)}">
            ${escapeHtml(t.title)}
            <span class="day-task-sub">${escapeHtml(t.subject_name || "No subject")}</span>
          </div>`).join("")}
      </div>
    </div>`).join("");

  renderBars($("#week-bars"), w.days.map(d => ({
    label: d.label,
    value: d.minutes,
    title: `${d.date} · ${fmtMinutes(d.minutes)} focused`,
    today: d.is_today,
  })));
}

/* ---------------- charts ---------------- */
function renderBars(container, items) {
  if (!container) return;
  if (!items.length) { container.innerHTML = ""; return; }
  const max = Math.max(1, ...items.map(i => i.value));
  container.innerHTML = items.map(i => {
    const pct = Math.round((i.value / max) * 100);
    return `<div class="bar-col ${i.today ? "today-bar" : ""}" title="${escapeHtml(i.title || "")}">
      <div class="bar-track"><div class="bar-fill" style="height:${pct}%"></div></div>
      <span class="bar-x">${escapeHtml(i.label)}</span>
    </div>`;
  }).join("");
}

/* ---------------- stats ---------------- */
function renderStats() {
  const s = state.stats;
  if (!s) return;
  const t = s.totals;

  $("#stats-cards").innerHTML =
    statCard(ICONS.clock, "tint-primary", fmtMinutes(t.study_minutes_total), "Total focus time") +
    statCard(ICONS.target, "tint-success", `${t.completion_rate}%`, "Completion rate") +
    statCard(ICONS.flame, "tint-warning", `${t.streak_days} ${t.streak_days === 1 ? "day" : "days"}`, "Current streak") +
    statCard(ICONS.award, "tint-danger", fmtMinutes(t.avg_session_minutes), "Avg session length");

  // Donut: focus time by subject
  const withTime = s.by_subject.filter(x => x.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const total = withTime.reduce((a, x) => a + x.minutes, 0);
  if (total > 0) {
    let acc = 0;
    const stops = withTime.map(x => {
      const from = (acc / total) * 360;
      acc += x.minutes;
      return `${x.color} ${from}deg ${(acc / total) * 360}deg`;
    });
    $("#subject-donut").parentElement.style.display = "";
    $("#subject-donut").style.background = `conic-gradient(${stops.join(",")})`;
    $("#donut-total").textContent = fmtMinutes(total);
    $("#donut-legend").innerHTML = withTime.map(x => `
      <div class="legend-item">
        <span class="dot" style="background:${x.color}"></span>
        <span class="legend-name">${escapeHtml(x.name)}</span>
        <span class="legend-val">${fmtMinutes(x.minutes)} · ${Math.round((x.minutes / total) * 100)}%</span>
      </div>`).join("");
  } else {
    $("#subject-donut").parentElement.style.display = "none";
    $("#donut-legend").innerHTML = emptyState(ICONS.zap, "No focus time yet",
      "Complete a focus session to see your subject balance.");
  }

  renderBars($("#daily-bars"), s.daily.map(d => ({
    label: String(d.day_num),
    value: d.minutes,
    title: `${d.date} · ${fmtMinutes(d.minutes)} · ${d.tasks_completed} task(s) done`,
    today: d.date === new Date().toISOString().slice(0, 10),
  })));

  // Subject breakdown table
  const rows = s.by_subject.filter(x => x.tasks_completed > 0 || x.tasks_pending > 0 || x.minutes > 0);
  const maxMin = Math.max(1, ...s.by_subject.map(x => x.minutes));
  if (rows.length) {
    $("#subject-table").innerHTML = `<table class="stable">
      <thead><tr><th>Subject</th><th>Pending</th><th>Done</th><th>Focus</th><th>Share of max</th></tr></thead>
      <tbody>${rows.map(x => `
        <tr>
          <td><span class="subj"><span class="dot" style="background:${x.color}"></span>${escapeHtml(x.name)}</span></td>
          <td class="num">${x.tasks_pending}</td>
          <td class="num">${x.tasks_completed}</td>
          <td class="num">${fmtMinutes(x.minutes)}</td>
          <td><div class="share-track"><div class="share-fill" style="width:${Math.round((x.minutes / maxMin) * 100)}%;background:${x.color}"></div></div></td>
        </tr>`).join("")}</tbody>
    </table>`;
  } else {
    $("#subject-table").innerHTML = emptyState(ICONS.book, "No data yet",
      "Add tasks and log focus sessions to build your statistics.");
  }
}

/* ---------------- subjects ---------------- */
function renderSubjects() {
  const cards = state.subjects.map(s => `
    <div class="subject-card">
      <div class="subject-color-bar" style="background:${s.color}"></div>
      <div class="subject-body">
        <div class="subject-name"><span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)}</div>
        <div class="subject-stats">
          <div class="subject-stat"><b>${s.pending_tasks}</b><span>pending</span></div>
          <div class="subject-stat"><b>${s.completed_tasks}</b><span>done</span></div>
          <div class="subject-stat"><b>${fmtMinutes(s.total_minutes)}</b><span>focus</span></div>
        </div>
        <div class="subject-actions">
          <button class="icon-btn" data-action="edit-subject" data-id="${s.id}" title="Edit">${ICONS.pencil}</button>
          <button class="icon-btn danger" data-action="delete-subject" data-id="${s.id}" title="Delete">${ICONS.trash}</button>
        </div>
      </div>
    </div>`).join("");
  $("#subjects-grid").innerHTML = cards + `
    <button class="add-subject-card" data-action="new-subject">
      ${ICONS.plus}<span>Add subject</span>
    </button>`;
}

function renderFilterSelects() {
  const sel = $("#filter-subject");
  const prev = sel.value;
  sel.innerHTML = `<option value="">All subjects</option>` +
    state.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

/* ---------------- task modal ---------------- */
function openTaskModal(taskId = null) {
  state.editingTaskId = taskId;
  const task = taskId ? state.tasks.find(t => t.id === taskId) : null;
  $("#task-modal-title").textContent = task ? "Edit Task" : "New Task";
  $("#task-save").textContent = task ? "Save changes" : "Add task";
  populateSelect($("#task-subject"),
    state.subjects.map(s => ({ value: s.id, label: s.name })),
    "No subject", task ? (task.subject_id || "") : "");
  $("#task-title").value = task ? task.title : "";
  $("#task-priority").value = task ? String(task.priority) : "2";
  $("#task-hours").value = task ? task.estimated_hours : 1;
  if (task) {
    $("#task-deadline").value = toLocalInput(new Date(task.deadline));
  } else {
    const dl = new Date();
    dl.setDate(dl.getDate() + 1);
    dl.setHours(18, 0, 0, 0);
    $("#task-deadline").value = toLocalInput(dl);
  }
  openModal("modal-task");
  setTimeout(() => $("#task-title").focus(), 60);
}

/* ---------------- subject modal ---------------- */
function openSubjectModal(subjectId = null) {
  state.editingSubjectId = subjectId;
  const s = subjectId ? state.subjects.find(x => x.id === subjectId) : null;
  $("#subject-modal-title").textContent = s ? "Edit Subject" : "New Subject";
  $("#subject-save").textContent = s ? "Save changes" : "Add subject";
  $("#subject-name").value = s ? s.name : "";
  state.selectedColor = s ? s.color : COLOR_PALETTE[0];
  renderSwatches();
  openModal("modal-subject");
  setTimeout(() => $("#subject-name").focus(), 60);
}

function renderSwatches() {
  $("#color-swatches").innerHTML = COLOR_PALETTE.map(c =>
    `<button type="button" class="swatch ${c === state.selectedColor ? "selected" : ""}"
      style="background:${c}" data-color="${c}" aria-label="Colour ${c}"></button>`).join("");
}

/* ---------------- CRUD actions ---------------- */
async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const next = t.status === "completed" ? "pending" : "completed";
  try {
    await api(`/api/tasks/${id}`, { method: "PUT", body: { status: next } });
    if (next === "completed") toast("Task completed - nice work!");
    refreshAll();
  } catch (err) { toast(err.message, "error"); }
}

function deleteTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  openConfirm({
    title: "Delete task?",
    message: `"${t.title}" will be permanently removed. Focus time already logged stays in your statistics.`,
    onOk: async () => {
      try { await api(`/api/tasks/${id}`, { method: "DELETE" }); toast("Task deleted."); refreshAll(); }
      catch (err) { toast(err.message, "error"); }
    },
  });
}

function deleteSubject(id) {
  const s = state.subjects.find(x => x.id === id);
  if (!s) return;
  openConfirm({
    title: "Delete subject?",
    message: `"${s.name}" will be removed. Its tasks and sessions are kept, but show without a subject.`,
    onOk: async () => {
      try { await api(`/api/subjects/${id}`, { method: "DELETE" }); toast("Subject deleted."); refreshAll(); }
      catch (err) { toast(err.message, "error"); }
    },
  });
}

async function deleteSession(id) {
  try { await api(`/api/sessions/${id}`, { method: "DELETE" }); toast("Session removed."); refreshAll(); }
  catch (err) { toast(err.message, "error"); }
}

/* ---------------- event bindings ---------------- */
function bindEvents() {
  // navigation
  $$(".nav-item").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  $("#btn-menu").addEventListener("click", () => {
    $("#sidebar").classList.add("open");
    $("#sidebar-backdrop").classList.add("show");
  });
  $("#sidebar-backdrop").addEventListener("click", closeSidebar);
  $("#btn-theme").addEventListener("click", () =>
    applyTheme(document.body.classList.contains("dark") ? "light" : "dark"));
  $("#btn-new-task").addEventListener("click", () => openTaskModal());

  // global click delegation
  document.addEventListener("click", (e) => {
    const goto = e.target.closest("[data-goto]");
    if (goto) { switchView(goto.dataset.goto); return; }
    const closer = e.target.closest("[data-close]");
    if (closer) { closeModal(closer.dataset.close); return; }
    if (e.target.classList && e.target.classList.contains("modal-backdrop")) {
      closeModal(e.target.id);
      return;
    }
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const id = Number(el.dataset.id);
    switch (el.dataset.action) {
      case "new-task": openTaskModal(); break;
      case "toggle-task": toggleTask(id); break;
      case "edit-task": openTaskModal(id); break;
      case "delete-task": deleteTask(id); break;
      case "focus-task":
      case "start-plan": focusTask(id); break;
      case "new-subject": openSubjectModal(); break;
      case "edit-subject": openSubjectModal(id); break;
      case "delete-subject": deleteSubject(id); break;
      case "delete-session": deleteSession(id); break;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modal-backdrop.show").forEach(m => closeModal(m.id));
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("task-check")) {
      e.target.click();
    }
  });

  // task form
  $("#form-task").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: $("#task-title").value.trim(),
      subject_id: $("#task-subject").value ? +$("#task-subject").value : null,
      deadline: $("#task-deadline").value,
      priority: +$("#task-priority").value,
      estimated_hours: +$("#task-hours").value || 1,
    };
    if (!body.title) return toast("Please give the task a title.", "error");
    if (!body.deadline) return toast("Please set a deadline.", "error");
    try {
      if (state.editingTaskId) {
        await api(`/api/tasks/${state.editingTaskId}`, { method: "PUT", body });
        toast("Task updated.");
      } else {
        await api("/api/tasks", { method: "POST", body });
        toast("Task added.");
      }
      closeModal("modal-task");
      refreshAll();
    } catch (err) { toast(err.message, "error"); }
  });

  // subject form
  $("#form-subject").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#subject-name").value.trim();
    if (!name) return toast("Please give the subject a name.", "error");
    const body = { name, color: state.selectedColor };
    try {
      if (state.editingSubjectId) {
        await api(`/api/subjects/${state.editingSubjectId}`, { method: "PUT", body });
        toast("Subject updated.");
      } else {
        await api("/api/subjects", { method: "POST", body });
        toast("Subject added.");
      }
      closeModal("modal-subject");
      refreshAll();
    } catch (err) { toast(err.message, "error"); }
  });

  $("#color-swatches").addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (!sw) return;
    state.selectedColor = sw.dataset.color;
    $$(".swatch").forEach(x => x.classList.toggle("selected", x === sw));
  });

  // confirm modal
  $("#confirm-ok").addEventListener("click", async () => {
    const action = state.confirmAction;
    state.confirmAction = null;
    closeModal("modal-confirm");
    if (action) await action();
  });

  // filters & sorting
  $("#task-search").addEventListener("input", (e) => {
    state.filters.search = e.target.value.trim();
    renderTasks();
  });
  $("#filter-subject").addEventListener("change", (e) => { state.filters.subject = e.target.value; renderTasks(); });
  $("#filter-status").addEventListener("change", (e) => { state.filters.status = e.target.value; renderTasks(); });
  $("#sort-by").addEventListener("change", (e) => { state.filters.sort = e.target.value; renderTasks(); });

  // timer
  $("#btn-timer-start").addEventListener("click", () => {
    if (timer.running) { stopTimer(); setTimerButton("resume"); }
    else startTimer();
  });
  $("#btn-timer-reset").addEventListener("click", resetTimer);
  $$(".mode-btn").forEach(b => b.addEventListener("click", () => setTimerMode(b.dataset.mode)));
  [["cfg-focus", "focus"], ["cfg-short", "short"], ["cfg-long", "long"]].forEach(([selId, key]) => {
    $("#" + selId).addEventListener("change", (e) => {
      const v = Math.max(1, Math.min(180, +e.target.value || timer.lengths[key]));
      e.target.value = v;
      timer.lengths[key] = v;
      if (!timer.running && timer.mode === key) {
        timer.total = v * 60;
        timer.remaining = v * 60;
        updateTimerUI();
      }
    });
  });

  // schedule week navigation
  $("#week-prev").addEventListener("click", () => { state.weekOffset -= 1; loadWeek(); });
  $("#week-next").addEventListener("click", () => { state.weekOffset += 1; loadWeek(); });
  $("#week-today").addEventListener("click", () => { state.weekOffset = 0; loadWeek(); });

  // data management
  $("#btn-reset-demo").addEventListener("click", () => {
    openConfirm({
      title: "Load sample data?",
      message: "All current tasks, subjects and sessions will be replaced with a fresh sample dataset.",
      okLabel: "Load sample",
      onOk: async () => {
        try { await api("/api/reset", { method: "POST", body: { seed: true } }); toast("Sample data loaded."); state.weekOffset = 0; refreshAll(); loadWeek(true); }
        catch (err) { toast(err.message, "error"); }
      },
    });
  });
  $("#btn-reset-empty").addEventListener("click", () => {
    openConfirm({
      title: "Clear all data?",
      message: "Everything (tasks, subjects, sessions and statistics) will be wiped. Default subjects are re-created.",
      okLabel: "Clear everything",
      onOk: async () => {
        try { await api("/api/reset", { method: "POST", body: { seed: false } }); toast("All data cleared."); state.weekOffset = 0; refreshAll(); loadWeek(true); }
        catch (err) { toast(err.message, "error"); }
      },
    });
  });
}

/* ---------------- init ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initClock();
  bindEvents();
  setTimerMode("focus");
  refreshAll();
});
