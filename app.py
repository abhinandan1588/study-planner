"""
Smart Study Planner - Flask + HTML + CSS + JavaScript
------------------------------------------------------
A local-first study planner featuring:
  * Smart daily plan that ranks pending tasks by urgency (deadline
    pressure, priority and remaining work) and allocates focus blocks
  * Pomodoro focus timer that auto-logs study sessions
  * Weekly schedule view with deadline pressure indicators
  * Statistics: streaks, focus time per subject, daily charts
  * Subject management with colour coding

Run:
    pip install -r requirements.txt
    python app.py
Then open http://localhost:3000
"""

import os
import re
import sqlite3
from datetime import date, datetime, timedelta

from flask import Flask, jsonify, render_template, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "study_planner.db")

# Assumed focused-study capacity per day (4 x ~50-minute blocks).
DAILY_CAPACITY_MINUTES = 240

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS subjects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    subject_id      INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    deadline        TEXT NOT NULL,
    priority        INTEGER NOT NULL DEFAULT 2,      -- 1 high, 2 medium, 3 low
    estimated_hours REAL NOT NULL DEFAULT 1.0,
    status          TEXT NOT NULL DEFAULT 'pending', -- pending | completed
    completed_at    TEXT,
    created_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id       INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    task_id          INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    duration_minutes INTEGER NOT NULL,
    started_at       TEXT NOT NULL,
    created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(started_at);
"""

DEFAULT_SUBJECTS = [
    ("Mathematics", "#7c3aed"),
    ("Physics", "#0ea5e9"),
    ("Chemistry", "#10b981"),
    ("Biology", "#f59e0b"),
    ("History", "#ef4444"),
    ("Literature", "#ec4899"),
]

DEMO_TASKS = [
    # title, subject, day_offset, priority, estimated_hours
    ("Calculus - problem set 6", "Mathematics", 2, 1, 3.0),
    ("Organic chemistry quiz prep", "Chemistry", 0, 1, 1.5),
    ("Physics lab report", "Physics", 5, 2, 2.0),
    ("History timeline revision", "History", -1, 2, 1.0),
    ("Literature essay - first draft", "Literature", 7, 3, 4.0),
]

DEMO_SESSIONS = [
    # subject, minutes, days_ago, link_to_task_title
    ("Mathematics", 50, 1, "Calculus - problem set 6"),
    ("Physics", 25, 2, None),
    ("Mathematics", 30, 3, "Calculus - problem set 6"),
    ("Chemistry", 45, 4, None),
    ("Literature", 60, 6, None),
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def iso_now():
    return datetime.now().isoformat(timespec="seconds")


def parse_dt(value):
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def seed_demo_data(conn):
    """Insert a small set of realistic demo tasks + sessions (first run only)."""
    now = datetime.now()
    subjects = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM subjects")}
    task_ids = {}
    for title, subj, day_off, prio, hours in DEMO_TASKS:
        deadline = (now + timedelta(days=day_off)).replace(
            hour=18, minute=0, second=0, microsecond=0)
        cur = conn.execute(
            "INSERT INTO tasks (title, subject_id, deadline, priority, "
            "estimated_hours, status, created_at) VALUES (?,?,?,?,?,'pending',?)",
            (title, subjects.get(subj), deadline.isoformat(timespec="minutes"),
             prio, hours, iso_now()))
        task_ids[title] = cur.lastrowid
    for subj, minutes, days_ago, task_title in DEMO_SESSIONS:
        start = (now - timedelta(days=days_ago)).replace(
            hour=16, minute=30, second=0, microsecond=0)
        conn.execute(
            "INSERT INTO sessions (subject_id, task_id, duration_minutes, "
            "started_at, created_at) VALUES (?,?,?,?,?)",
            (subjects.get(subj), task_ids.get(task_title), minutes,
             start.isoformat(timespec="seconds"), start.isoformat(timespec="seconds")))


def init_db(seed_demo=True):
    conn = get_db()
    conn.executescript(SCHEMA)
    if conn.execute("SELECT COUNT(*) FROM subjects").fetchone()[0] == 0:
        for name, color in DEFAULT_SUBJECTS:
            conn.execute(
                "INSERT INTO subjects (name, color, created_at) VALUES (?,?,?)",
                (name, color, iso_now()))
    if seed_demo and conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0:
        seed_demo_data(conn)
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Domain logic: urgency scoring + smart plan
# ---------------------------------------------------------------------------

TASK_SELECT = """
SELECT t.*, s.name AS subject_name, s.color AS subject_color,
       COALESCE((SELECT SUM(se.duration_minutes) FROM sessions se
                 WHERE se.task_id = t.id), 0) AS logged_minutes
FROM tasks t
LEFT JOIN subjects s ON s.id = t.subject_id
"""


def compute_urgency(task, now=None):
    """Score a pending task 0-100+ (overdue tasks exceed 100).

    Blends deadline pressure (remaining work vs. days left), priority
    weight and an overdue boost so the most critical work floats up.
    """
    now = now or datetime.now()
    if task["status"] == "completed":
        return 0.0
    deadline = parse_dt(task["deadline"])
    if deadline is None:
        return 10.0
    days_left = (deadline - now).total_seconds() / 86400.0
    minutes_left = max(0.0, task["estimated_minutes"] - task["logged_minutes"])

    if days_left < 0:
        # Overdue: the further past, the higher the boost (capped).
        return 100.0 + min(50.0, -days_left * 5.0)
    if minutes_left == 0:
        # Everything logged but still pending - light nudge to close it out.
        return 15.0 + max(0.0, 10.0 - days_left)

    # Pressure = how many "days of full capacity" the remaining work needs.
    pressure = minutes_left / max(days_left, 0.25) / DAILY_CAPACITY_MINUTES
    base = 30.0 + min(55.0, pressure * 40.0)
    prio_boost = {1: 15.0, 2: 7.0, 3: 0.0}.get(task["priority"], 7.0)
    return min(100.0, base + prio_boost)


def row_to_task(row):
    t = dict(row)
    deadline = parse_dt(t["deadline"])
    now = datetime.now()
    t["days_left"] = round((deadline - now).total_seconds() / 86400.0, 3) if deadline else None
    t["estimated_minutes"] = int(round((t.get("estimated_hours") or 0) * 60))
    est = t["estimated_minutes"]
    t["progress_pct"] = int(min(100, round(t["logged_minutes"] / est * 100))) if est > 0 else 0
    t["urgency"] = round(compute_urgency(t, now), 1)
    return t


def fmt_hours(minutes):
    minutes = int(round(minutes))
    if minutes >= 60 and minutes % 60 == 0:
        return f"{minutes // 60}h"
    h, m = divmod(minutes, 60)
    return f"{h}h {m}m" if h else f"{m}m"


def plan_reason(days_left, minutes_left):
    left = fmt_hours(minutes_left)
    if days_left is None:
        return f"About {left} of work remaining."
    if days_left < 0:
        return f"Overdue - roughly {left} of work left. Clear this first."
    if days_left <= 0.125:
        return f"Due within hours - {left} of work left. Sprint now."
    if days_left <= 1:
        return f"Due within a day - about {left} of work left."
    if days_left <= 3:
        return f"Due in {round(days_left)} days - {left} of work left."
    return f"Due in {round(days_left)} days - {left} left, steady pace works."


def build_plan():
    """Build today's smart study plan."""
    conn = get_db()
    rows = conn.execute(TASK_SELECT + " WHERE t.status = 'pending'").fetchall()
    conn.close()

    tasks = sorted((row_to_task(r) for r in rows), key=lambda t: -t["urgency"])

    sessions, alerts = [], []
    capacity_left = DAILY_CAPACITY_MINUTES

    for t in tasks:
        days_left = t["days_left"]
        minutes_left = max(0, t["estimated_minutes"] - t["logged_minutes"])

        # Alerts --------------------------------------------------------
        if days_left is not None and days_left < 0:
            alerts.append(f"'{t['title']}' is overdue - it goes first in line today.")
        elif (days_left is not None and 0 < days_left < 14
              and minutes_left > days_left * DAILY_CAPACITY_MINUTES):
            alerts.append(
                f"'{t['title']}' needs about {fmt_hours(minutes_left)} but only "
                f"~{fmt_hours(days_left * DAILY_CAPACITY_MINUTES)} fits before its "
                f"deadline - start earlier or trim scope.")

        # Allocation ----------------------------------------------------
        if minutes_left > 0 and capacity_left >= 25:
            chunk = min(minutes_left, capacity_left, 90)
            chunk = max(25, 5 * round(chunk / 5))   # snap to 5-min steps
            chunk = min(chunk, capacity_left)
            sessions.append({
                "task_id": t["id"],
                "title": t["title"],
                "subject_name": t["subject_name"] or "General",
                "subject_color": t["subject_color"] or "#94a3b8",
                "priority": t["priority"],
                "minutes": chunk,
                "minutes_left": minutes_left,
                "urgency": t["urgency"],
                "reason": plan_reason(days_left, minutes_left),
            })
            capacity_left -= chunk

    due_soon = [t for t in tasks if t["days_left"] is not None and 0 <= t["days_left"] <= 1]
    if due_soon:
        alerts.append(f"{len(due_soon)} task(s) due within 24 hours - protect that time.")
    if not sessions:
        alerts.append("Nothing urgent on the radar - great time to review or get ahead.")

    focus = sessions[0] if sessions else None
    return {
        "capacity_minutes": DAILY_CAPACITY_MINUTES,
        "planned_minutes": DAILY_CAPACITY_MINUTES - capacity_left,
        "sessions": sessions,
        "alerts": alerts[:5],
        "focus_subject": focus["subject_name"] if focus else None,
    }


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def bad_request(message):
    return jsonify({"error": message}), 400


def valid_priority(value):
    try:
        return isinstance(value, int) and 1 <= value <= 3
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Routes: page
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Routes: subjects
# ---------------------------------------------------------------------------

@app.get("/api/subjects")
def list_subjects():
    conn = get_db()
    rows = conn.execute("""
        SELECT s.*,
               (SELECT COUNT(*) FROM tasks t
                 WHERE t.subject_id = s.id AND t.status = 'pending')   AS pending_tasks,
               (SELECT COUNT(*) FROM tasks t
                 WHERE t.subject_id = s.id AND t.status = 'completed') AS completed_tasks,
               COALESCE((SELECT SUM(se.duration_minutes) FROM sessions se
                          WHERE se.subject_id = s.id), 0)              AS total_minutes
        FROM subjects s
        ORDER BY s.name COLLATE NOCASE
    """).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["total_hours"] = round(d["total_minutes"] / 60, 1)
        result.append(d)
    return jsonify(result)


@app.post("/api/subjects")
def create_subject():
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()
    color = str(body.get("color", "#6366f1")).strip()
    if not name:
        return bad_request("Subject name is required.")
    if len(name) > 40:
        return bad_request("Subject name is too long (max 40 characters).")
    if not HEX_COLOR_RE.match(color):
        return bad_request("Color must be a hex value like #6366f1.")
    conn = get_db()
    if conn.execute("SELECT 1 FROM subjects WHERE name = ? COLLATE NOCASE", (name,)).fetchone():
        conn.close()
        return bad_request("That subject already exists.")
    cur = conn.execute(
        "INSERT INTO subjects (name, color, created_at) VALUES (?,?,?)",
        (name, color, iso_now()))
    conn.commit()
    row = conn.execute("SELECT * FROM subjects WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.put("/api/subjects/<int:subject_id>")
def update_subject(subject_id):
    body = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Subject not found."}), 404
    updates, params = [], []
    if "name" in body:
        name = str(body["name"]).strip()
        if not name:
            conn.close()
            return bad_request("Subject name cannot be empty.")
        dup = conn.execute(
            "SELECT 1 FROM subjects WHERE name = ? COLLATE NOCASE AND id != ?",
            (name, subject_id)).fetchone()
        if dup:
            conn.close()
            return bad_request("Another subject with that name already exists.")
        updates.append("name = ?")
        params.append(name)
    if "color" in body:
        color = str(body["color"]).strip()
        if not HEX_COLOR_RE.match(color):
            conn.close()
            return bad_request("Color must be a hex value like #6366f1.")
        updates.append("color = ?")
        params.append(color)
    if updates:
        params.append(subject_id)
        conn.execute(f"UPDATE subjects SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    row = conn.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.delete("/api/subjects/<int:subject_id>")
def delete_subject(subject_id):
    conn = get_db()
    row = conn.execute("SELECT name FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Subject not found."}), 404
    # Tasks/sessions keep existing with subject_id = NULL (ON DELETE SET NULL).
    conn.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": subject_id, "name": row["name"]})


# ---------------------------------------------------------------------------
# Routes: tasks
# ---------------------------------------------------------------------------

@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    conn = get_db()
    q, params = TASK_SELECT, []
    if status in ("pending", "completed"):
        q += " WHERE t.status = ?"
        params.append(status)
    q += " ORDER BY t.deadline ASC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return jsonify([row_to_task(r) for r in rows])


@app.post("/api/tasks")
def create_task():
    body = request.get_json(silent=True) or {}
    title = str(body.get("title", "")).strip()
    deadline_raw = str(body.get("deadline", "")).strip()
    if not title:
        return bad_request("Task title is required.")
    if len(title) > 160:
        return bad_request("Task title is too long (max 160 characters).")
    if not parse_dt(deadline_raw):
        return bad_request("A valid deadline is required.")
    priority = body.get("priority", 2)
    if not valid_priority(priority):
        return bad_request("Priority must be 1 (high), 2 (medium) or 3 (low).")
    try:
        hours = float(body.get("estimated_hours", 1))
    except (TypeError, ValueError):
        return bad_request("Estimated hours must be a number.")
    if not 0.25 <= hours <= 500:
        return bad_request("Estimated hours must be between 0.25 and 500.")

    subject_id = body.get("subject_id")
    conn = get_db()
    if subject_id is not None:
        if not conn.execute("SELECT 1 FROM subjects WHERE id = ?", (subject_id,)).fetchone():
            conn.close()
            return bad_request("Subject not found.")
    cur = conn.execute(
        "INSERT INTO tasks (title, subject_id, deadline, priority, "
        "estimated_hours, status, created_at) VALUES (?,?,?,?,?,'pending',?)",
        (title, subject_id, deadline_raw, priority, hours, iso_now()))
    conn.commit()
    row = conn.execute(TASK_SELECT + " WHERE t.id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(row_to_task(row)), 201


@app.put("/api/tasks/<int:task_id>")
def update_task(task_id):
    body = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Task not found."}), 404

    updates, params = [], []
    if "title" in body:
        title = str(body["title"]).strip()
        if not title:
            conn.close()
            return bad_request("Task title cannot be empty.")
        updates.append("title = ?")
        params.append(title[:160])
    if "subject_id" in body:
        sid = body["subject_id"]
        if sid is not None and not conn.execute(
                "SELECT 1 FROM subjects WHERE id = ?", (sid,)).fetchone():
            conn.close()
            return bad_request("Subject not found.")
        updates.append("subject_id = ?")
        params.append(sid)
    if "deadline" in body:
        if not parse_dt(str(body["deadline"])):
            conn.close()
            return bad_request("A valid deadline is required.")
        updates.append("deadline = ?")
        params.append(str(body["deadline"]))
    if "priority" in body:
        if not valid_priority(body["priority"]):
            conn.close()
            return bad_request("Priority must be 1, 2 or 3.")
        updates.append("priority = ?")
        params.append(body["priority"])
    if "estimated_hours" in body:
        try:
            hours = float(body["estimated_hours"])
        except (TypeError, ValueError):
            conn.close()
            return bad_request("Estimated hours must be a number.")
        if not 0.25 <= hours <= 500:
            conn.close()
            return bad_request("Estimated hours must be between 0.25 and 500.")
        updates.append("estimated_hours = ?")
        params.append(hours)
    if "status" in body:
        if body["status"] not in ("pending", "completed"):
            conn.close()
            return bad_request("Status must be 'pending' or 'completed'.")
        updates.append("status = ?")
        params.append(body["status"])
        updates.append("completed_at = ?")
        params.append(iso_now() if body["status"] == "completed" else None)

    if updates:
        params.append(task_id)
        conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    row = conn.execute(TASK_SELECT + " WHERE t.id = ?", (task_id,)).fetchone()
    conn.close()
    return jsonify(row_to_task(row))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    conn = get_db()
    row = conn.execute("SELECT title FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Task not found."}), 404
    conn.execute("UPDATE sessions SET task_id = NULL WHERE task_id = ?", (task_id,))
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": task_id, "title": row["title"]})


# ---------------------------------------------------------------------------
# Routes: study sessions
# ---------------------------------------------------------------------------

@app.get("/api/sessions")
def list_sessions():
    days = max(0, request.args.get("days", 7, type=int))
    limit = min(max(1, request.args.get("limit", 100, type=int)), 500)
    since = (datetime.now() - timedelta(days=days)).isoformat(timespec="seconds")
    conn = get_db()
    rows = conn.execute("""
        SELECT se.*, s.name AS subject_name, s.color AS subject_color, t.title AS task_title
        FROM sessions se
        LEFT JOIN subjects s ON s.id = se.subject_id
        LEFT JOIN tasks t   ON t.id = se.task_id
        WHERE se.started_at >= ?
        ORDER BY se.started_at DESC
        LIMIT ?
    """, (since, limit)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post("/api/sessions")
def create_session():
    body = request.get_json(silent=True) or {}
    minutes = body.get("duration_minutes")
    if not isinstance(minutes, (int, float)) or isinstance(minutes, bool) \
            or not 1 <= minutes <= 1440:
        return bad_request("duration_minutes must be a number between 1 and 1440.")

    subject_id = body.get("subject_id")
    task_id = body.get("task_id")
    conn = get_db()
    if subject_id is not None and not conn.execute(
            "SELECT 1 FROM subjects WHERE id = ?", (subject_id,)).fetchone():
        conn.close()
        return bad_request("Subject not found.")
    if task_id is not None and not conn.execute(
            "SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
        conn.close()
        return bad_request("Task not found.")

    started_raw = body.get("started_at")
    started_at = parse_dt(started_raw) if started_raw else datetime.now()
    conn.execute(
        "INSERT INTO sessions (subject_id, task_id, duration_minutes, started_at, created_at) "
        "VALUES (?,?,?,?,?)",
        (subject_id, task_id, int(round(minutes)),
         started_at.isoformat(timespec="seconds"), iso_now()))
    conn.commit()
    conn.close()
    return jsonify({"logged": True, "minutes": int(round(minutes))}), 201


@app.delete("/api/sessions/<int:session_id>")
def delete_session(session_id):
    conn = get_db()
    if not conn.execute("SELECT 1 FROM sessions WHERE id = ?", (session_id,)).fetchone():
        conn.close()
        return jsonify({"error": "Session not found."}), 404
    conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": session_id})


# ---------------------------------------------------------------------------
# Routes: smart plan, week, stats, reset
# ---------------------------------------------------------------------------

@app.get("/api/plan")
def get_plan():
    return jsonify(build_plan())


@app.get("/api/week")
def get_week():
    offset = request.args.get("offset", 0, type=int) or 0
    today = date.today()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    conn = get_db()
    days = []
    for i in range(7):
        d = monday + timedelta(days=i)
        rows = conn.execute(
            TASK_SELECT + " WHERE date(t.deadline) = ? ORDER BY t.deadline",
            (d.isoformat(),)).fetchall()
        minutes = conn.execute(
            "SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM sessions "
            "WHERE date(started_at) = ?", (d.isoformat(),)).fetchone()["m"]
        days.append({
            "date": d.isoformat(),
            "label": d.strftime("%a"),
            "day_num": d.day,
            "is_today": d == today,
            "minutes": minutes,
            "tasks": [row_to_task(r) for r in rows],
        })
    conn.close()
    return jsonify({"week_start": monday.isoformat(), "days": days})


@app.get("/api/stats")
def get_stats():
    conn = get_db()
    now = datetime.now()
    today = date.today()

    tasks = [row_to_task(r) for r in conn.execute(TASK_SELECT).fetchall()]
    pending = [t for t in tasks if t["status"] == "pending"]
    completed = [t for t in tasks if t["status"] == "completed"]
    overdue = [t for t in pending if t["days_left"] is not None and t["days_left"] < 0]

    week_ago = (now - timedelta(days=7)).isoformat(timespec="seconds")
    total_minutes = conn.execute(
        "SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM sessions").fetchone()["m"]
    week_minutes = conn.execute(
        "SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM sessions "
        "WHERE started_at >= ?", (week_ago,)).fetchone()["m"]
    agg = conn.execute(
        "SELECT COUNT(*) AS c, COALESCE(AVG(duration_minutes), 0) AS a FROM sessions"
    ).fetchone()

    daily = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        s = conn.execute(
            "SELECT COALESCE(SUM(duration_minutes), 0) AS m, COUNT(*) AS c "
            "FROM sessions WHERE date(started_at) = ?", (d.isoformat(),)).fetchone()
        done = conn.execute(
            "SELECT COUNT(*) AS c FROM tasks WHERE status = 'completed' "
            "AND date(completed_at) = ?", (d.isoformat(),)).fetchone()["c"]
        daily.append({
            "date": d.isoformat(), "label": d.strftime("%a"), "day_num": d.day,
            "minutes": s["m"], "sessions": s["c"], "tasks_completed": done,
        })

    by_subject = []
    for r in conn.execute("SELECT id, name, color FROM subjects ORDER BY name COLLATE NOCASE"):
        mins = conn.execute(
            "SELECT COALESCE(SUM(duration_minutes), 0) AS m FROM sessions "
            "WHERE subject_id = ?", (r["id"],)).fetchone()["m"]
        done = conn.execute(
            "SELECT COUNT(*) AS c FROM tasks WHERE subject_id = ? AND status = 'completed'",
            (r["id"],)).fetchone()["c"]
        pend = conn.execute(
            "SELECT COUNT(*) AS c FROM tasks WHERE subject_id = ? AND status = 'pending'",
            (r["id"],)).fetchone()["c"]
        by_subject.append({"id": r["id"], "name": r["name"], "color": r["color"],
                           "minutes": mins, "tasks_completed": done, "tasks_pending": pend})

    # Study streak: consecutive days (ending today or yesterday) with sessions.
    active_dates = {r[0] for r in conn.execute(
        "SELECT DISTINCT date(started_at) FROM sessions")}
    streak = 0
    d = today
    if d.isoformat() not in active_dates:
        d -= timedelta(days=1)
    while d.isoformat() in active_dates:
        streak += 1
        d -= timedelta(days=1)

    conn.close()

    best = max(by_subject, key=lambda s: s["minutes"]) if by_subject else None
    return jsonify({
        "totals": {
            "tasks_total": len(tasks),
            "tasks_completed": len(completed),
            "tasks_pending": len(pending),
            "overdue": len(overdue),
            "completion_rate": round(len(completed) / len(tasks) * 100) if tasks else 0,
            "study_minutes_total": total_minutes,
            "study_minutes_week": week_minutes,
            "sessions_total": agg["c"],
            "avg_session_minutes": round(agg["a"]),
            "streak_days": streak,
            "best_subject": best["name"] if best and best["minutes"] > 0 else None,
        },
        "daily": daily,
        "by_subject": by_subject,
    })


@app.post("/api/reset")
def reset_data():
    body = request.get_json(silent=True) or {}
    seed = bool(body.get("seed", True))
    conn = get_db()
    conn.execute("DELETE FROM sessions")
    conn.execute("DELETE FROM tasks")
    conn.execute("DELETE FROM subjects")
    conn.commit()
    conn.close()
    init_db(seed_demo=seed)
    return jsonify({"reset": True, "seeded": seed})


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(500)
def server_error(_e):
    return jsonify({"error": "Internal server error."}), 500


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
