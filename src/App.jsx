import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Dumbbell, TrendingUp, UtensilsCrossed, Plus, X,
  ChevronLeft, ChevronRight, Trash2, Settings, Check, Loader2, ChevronDown,
  ChevronUp, Pencil, Mountain, Footprints, Timer, Trophy, Calculator,
  Bookmark, LayoutTemplate, Repeat, Flame, Target, Link2, Ruler
} from "lucide-react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { loadKey, saveKey, deleteKey } from "./lib/storage";
import { SignOutButton } from "./components/AuthGate";

// ---------- Constants ----------

const MUSCLE_TAXONOMY = {
  Chest: ["Upper Chest", "Mid Chest", "Lower Chest"],
  Back: ["Lats", "Upper Back/Traps", "Lower Back"],
  Shoulders: ["Front Delts", "Side Delts", "Rear Delts"],
  Arms: [
    "Biceps (Long Head)",
    "Biceps (Short Head)",
    "Brachialis",
    "Triceps (Long Head)",
    "Triceps (Lateral Head)",
    "Triceps (Medial Head)",
    "Forearms",
  ],
  Legs: ["Quads", "Hamstrings", "Glutes", "Calves"],
  Core: ["Abs", "Obliques"],
};

const GROUP_COLORS = {
  Chest: "#fb923c",
  Back: "#38bdf8",
  Shoulders: "#a78bfa",
  Arms: "#f472b6",
  Legs: "#34d399",
  Core: "#facc15",
};

const MEASUREMENT_TYPES = ["Chest", "Waist", "Hips", "Arms", "Thighs", "Calves"];

const TABS = [
  { id: "workouts", label: "Workouts", icon: Dumbbell, accent: "#22d3ee", gradient: "linear-gradient(135deg, #38bdf8, #22d3ee)" },
  { id: "progress", label: "Progress", icon: TrendingUp, accent: "#3b82f6", gradient: "linear-gradient(135deg, #2563eb, #3b82f6)" },
  { id: "cardio", label: "Cardio", icon: Mountain, accent: "#fb923c", gradient: "linear-gradient(135deg, #fb923c, #ea580c)" },
  { id: "food", label: "Food", icon: UtensilsCrossed, accent: "#fbbf24", gradient: "linear-gradient(135deg, #fbbf24, #fb923c)" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function fmtDate(d) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatWorkoutDuration(sec) {
  const mins = Math.round(sec / 60);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function matchesHistoryQuery(session, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((session.name || "").toLowerCase().includes(q)) return true;
  if (fmtDate(session.date).toLowerCase().includes(q)) return true;
  return session.exercises.some((ex) => ex.exerciseName.toLowerCase().includes(q));
}

// ---------- Personal records ----------

function getBestWeightForExercise(sessions, exerciseId, excludeSessionId) {
  let best = 0;
  sessions.forEach((s) => {
    if (s.id === excludeSessionId) return;
    s.exercises.forEach((e) => {
      if (e.exerciseId !== exerciseId) return;
      e.sets.forEach((st) => {
        if (st.warmup) return;
        const w = Number(st.weight) || 0;
        if (w > best) best = w;
      });
    });
  });
  return best;
}

function getPreviousLog(sessions, exerciseId, excludeSessionId) {
  let latest = null;
  sessions.forEach((s) => {
    if (s.id === excludeSessionId) return;
    const match = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (!match) return;
    const isOlderOrSame =
      latest && (s.date < latest.date || (s.date === latest.date && (s.createdAt || 0) <= (latest.createdAt || 0)));
    if (isOlderOrSame) return;
    latest = { date: s.date, createdAt: s.createdAt || 0, sets: match.sets };
  });
  return latest;
}

function estimate1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

// ---------- Workout streak / heatmap ----------

function computeStreak(sessions) {
  const days = new Set(sessions.map((s) => s.date));
  if (days.size === 0) return 0;
  const cursor = new Date(todayStr() + "T00:00:00");
  if (!days.has(todayStr())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function buildHeatmapDays(sessions, weeks) {
  const counts = {};
  sessions.forEach((s) => { counts[s.date] = (counts[s.date] || 0) + 1; });
  const today = new Date(todayStr() + "T00:00:00");
  const totalDays = weeks * 7;
  const cells = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    cells.push({ date: dateStr, count: counts[dateStr] || 0 });
  }
  return cells;
}

// ---------- Muscle group volume ----------

function computeMuscleVolume(sessions, exercises, days) {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const cutoff = Date.now() - days * 86400000;
  const totals = {};
  sessions.forEach((s) => {
    if (new Date(s.date + "T00:00:00").getTime() < cutoff) return;
    s.exercises.forEach((ex) => {
      const def = exerciseById.get(ex.exerciseId);
      if (!def || !def.muscles || def.muscles.length === 0) return;
      const workingSets = ex.sets.filter((st) => !st.warmup).length;
      const groups = new Set(def.muscles.map((m) => m.group));
      groups.forEach((g) => { totals[g] = (totals[g] || 0) + workingSets; });
    });
  });
  return totals;
}

// ---------- Cardio PRs ----------

function getCardioBests(cardioLog, type, excludeId) {
  let bestPace = null;
  let bestDistance = 0;
  let bestElevation = 0;
  cardioLog.forEach((a) => {
    if (a.id === excludeId || a.type !== type) return;
    const p = paceSecPerMile(a.duration, a.distance);
    if (p !== null && (bestPace === null || p < bestPace)) bestPace = p;
    const dist = Number(a.distance) || 0;
    if (dist > bestDistance) bestDistance = dist;
    const elev = Number(a.elevationGain) || 0;
    if (elev > bestElevation) bestElevation = elev;
  });
  return { bestPace, bestDistance, bestElevation };
}

// ---------- Plate calculator ----------

const PLATE_WEIGHTS = [45, 35, 25, 10, 5, 2.5];
const BAR_WEIGHTS = [45, 35, 15];

function calcPlates(targetWeight, barWeight) {
  let perSide = Math.max(0, (Number(targetWeight) - Number(barWeight)) / 2);
  const plates = [];
  for (const p of PLATE_WEIGHTS) {
    while (perSide >= p - 0.001) {
      plates.push(p);
      perSide -= p;
    }
  }
  return { plates, remainder: Math.round(perSide * 100) / 100 };
}

function exportBackup(data) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workout-tracker-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("backup export failed", e);
  }
}



export default function WorkoutFoodApp() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("workouts");
  const [exercises, setExercises] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [foodLog, setFoodLog] = useState([]);
  const [targets, setTargets] = useState({ calories: 2400, protein: 180, carbs: 250, fat: 70 });
  const [cardioLog, setCardioLog] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [bodyWeightLog, setBodyWeightLog] = useState([]);
  const [exerciseGoals, setExerciseGoals] = useState({});
  const [bodyMeasurementsLog, setBodyMeasurementsLog] = useState([]);

  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      const [ex, se, fl, tg, cl, tp, bw, gl, bm] = await Promise.all([
        loadKey("exercises", []),
        loadKey("sessions", []),
        loadKey("food-log", []),
        loadKey("daily-targets", { calories: 2400, protein: 180, carbs: 250, fat: 70 }),
        loadKey("cardio-log", []),
        loadKey("workout-templates", []),
        loadKey("body-weight-log", []),
        loadKey("exercise-goals", {}),
        loadKey("body-measurements-log", []),
      ]);
      if (cancelled) return;
      setExercises(ex.value);
      setSessions(se.value);
      setFoodLog(fl.value);
      setTargets(tg.value);
      setCardioLog(cl.value);
      setTemplates(tp.value);
      setBodyWeightLog(bw.value);
      setExerciseGoals(gl.value);
      setBodyMeasurementsLog(bm.value);
      setLoadFailed([ex, se, fl, tg, cl, tp, bw, gl, bm].some((r) => r.failed));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const [saveError, setSaveError] = useState(false);

  const [undoState, setUndoState] = useState(null); // { message, onUndo } | null
  const undoTimerRef = useRef(null);
  const showUndo = (message, onUndo) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ message, onUndo });
    undoTimerRef.current = setTimeout(() => setUndoState(null), 6000);
  };
  const dismissUndo = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState(null);
  };

  const persistAndSave = async (setter, key, value) => {
    setter(value);
    try {
      const result = await saveKey(key, value);
      if (result === false) {
        setSaveError(true);
      } else {
        setSaveError(false);
      }
    } catch {
      setSaveError(true);
    }
  };

  const persist = {
    exercises: (v) => persistAndSave(setExercises, "exercises", v),
    sessions: (v) => persistAndSave(setSessions, "sessions", v),
    foodLog: (v) => persistAndSave(setFoodLog, "food-log", v),
    targets: (v) => persistAndSave(setTargets, "daily-targets", v),
    cardioLog: (v) => persistAndSave(setCardioLog, "cardio-log", v),
    templates: (v) => persistAndSave(setTemplates, "workout-templates", v),
    bodyWeightLog: (v) => persistAndSave(setBodyWeightLog, "body-weight-log", v),
    exerciseGoals: (v) => persistAndSave(setExerciseGoals, "exercise-goals", v),
    bodyMeasurementsLog: (v) => persistAndSave(setBodyMeasurementsLog, "body-measurements-log", v),
  };

  const activeTabDef = TABS.find((t) => t.id === activeTab) || TABS[0];
  const activeAccent = activeTabDef.accent;

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-cyan-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col max-w-md mx-auto relative overflow-hidden">
      <div
        className="fixed -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-500"
        style={{ background: activeAccent }}
      />
      <div
        className="fixed -bottom-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-10 pointer-events-none transition-colors duration-500"
        style={{ background: activeAccent }}
      />
      <header
        className="px-4 pb-3 sticky top-0 bg-slate-950/80 backdrop-blur-xl z-20 border-b border-white/10"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center justify-between">
          <h1
            className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent"
            style={{ backgroundImage: activeTabDef.gradient }}
          >
            {activeTabDef.label}
          </h1>
          <div className="flex gap-1.5">
            <button
              onClick={() => setLoadAttempt((n) => n + 1)}
              className="text-[11px] text-slate-500 border border-white/10 rounded-full px-2.5 py-1 active:text-slate-300"
            >
              Reload
            </button>
            <button
              onClick={() => exportBackup({ exercises, sessions, foodLog, targets, cardioLog, templates, bodyWeightLog, exerciseGoals, bodyMeasurementsLog })}
              className="text-[11px] text-slate-500 border border-white/10 rounded-full px-2.5 py-1 active:text-slate-300"
            >
              Backup
            </button>
            <SignOutButton />
          </div>
        </div>
        {loadFailed && (
          <p className="text-xs text-amber-400 mt-2">
            Some data may not have loaded — this may not be everything you've saved. Try Reload above before adding anything new.
          </p>
        )}
        {saveError && (
          <p className="text-xs text-red-400 mt-2">
            Your last change didn't save. Check your connection, then use Backup above to save a copy just in case.
          </p>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 pt-3" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))" }}>
        {activeTab === "workouts" && (
          <WorkoutsTab
            exercises={exercises}
            setExercises={persist.exercises}
            sessions={sessions}
            setSessions={persist.sessions}
            templates={templates}
            setTemplates={persist.templates}
            showUndo={showUndo}
          />
        )}
        {activeTab === "progress" && (
          <ProgressTab
            exercises={exercises}
            sessions={sessions}
            bodyWeightLog={bodyWeightLog}
            setBodyWeightLog={persist.bodyWeightLog}
            exerciseGoals={exerciseGoals}
            setExerciseGoals={persist.exerciseGoals}
            bodyMeasurementsLog={bodyMeasurementsLog}
            setBodyMeasurementsLog={persist.bodyMeasurementsLog}
            showUndo={showUndo}
          />
        )}
        {activeTab === "cardio" && <CardioTab cardioLog={cardioLog} setCardioLog={persist.cardioLog} showUndo={showUndo} />}
        {activeTab === "food" && (
          <FoodTab foodLog={foodLog} setFoodLog={persist.foodLog} targets={targets} setTargets={persist.targets} showUndo={showUndo} />
        )}
      </main>

      {undoState && (
        <div
          className="fixed left-4 right-4 z-40 max-w-md mx-auto"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="bg-slate-800 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-2xl">
            <p className="text-sm text-slate-200">{undoState.message}</p>
            <button
              onClick={() => { undoState.onUndo(); dismissUndo(); }}
              className="text-sm font-semibold text-cyan-400 shrink-0"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900/90 backdrop-blur-xl border-t border-white/10 flex z-30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 active:opacity-70"
            >
              <Icon
                size={22}
                color={active ? t.accent : "#64748b"}
                strokeWidth={active ? 2.5 : 2}
                style={active ? { filter: `drop-shadow(0 0 6px ${t.accent}99)` } : undefined}
              />
              <span className="text-[11px] font-medium" style={{ color: active ? t.accent : "#64748b" }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ---------- Workouts Tab ----------

function emptyDraft() {
  return { id: uid(), date: todayStr(), createdAt: Date.now(), startedAt: Date.now(), name: "", exercises: [] };
}

function WorkoutsTab({ exercises, setExercises, sessions, setSessions, templates, setTemplates, showUndo }) {
  const [draft, setDraft] = useState(null); // null = not editing
  const [editingOriginalId, setEditingOriginalId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const draftLoadedRef = useRef(false);

  // Restore any in-progress workout draft on mount, so leaving mid-workout never loses it.
  useEffect(() => {
    (async () => {
      const saved = await loadKey("draft-session", null);
      if (saved && saved.draft) {
        setDraft(saved.draft);
        setEditingOriginalId(saved.editingOriginalId || null);
        setDraftRestored(true);
      }
      draftLoadedRef.current = true;
    })();
  }, []);

  // Autosave the draft on every change, so adding a set/exercise is never lost.
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (draft) {
      saveKey("draft-session", { draft, editingOriginalId });
    } else {
      deleteKey("draft-session").catch(() => {});
    }
  }, [draft, editingOriginalId]);

  const startNew = () => { setDraft(emptyDraft()); setEditingOriginalId(null); setDraftRestored(false); };
  const startEdit = (session) => { setDraft(JSON.parse(JSON.stringify(session))); setEditingOriginalId(session.id); setExpandedId(null); setDraftRestored(false); };
  const cancelDraft = () => { setDraft(null); setEditingOriginalId(null); setDraftRestored(false); };

  const repeatLastWorkout = () => {
    const last = sessions.reduce((latest, s) => {
      if (!latest) return s;
      if (s.date !== latest.date) return s.date > latest.date ? s : latest;
      return (s.createdAt || 0) > (latest.createdAt || 0) ? s : latest;
    }, null);
    if (!last) return;
    setDraft({
      id: uid(),
      date: todayStr(),
      createdAt: Date.now(),
      startedAt: Date.now(),
      name: last.name,
      exercises: last.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        supersetGroup: e.supersetGroup || null,
        sets: e.sets.map((st) => ({ weight: String(st.weight ?? ""), reps: String(st.reps ?? ""), warmup: !!st.warmup, dropset: !!st.dropset })),
      })),
    });
    setEditingOriginalId(null);
    setDraftRestored(false);
  };

  const startFromTemplate = (template) => {
    setDraft({
      id: uid(),
      date: todayStr(),
      createdAt: Date.now(),
      startedAt: Date.now(),
      name: template.name,
      exercises: template.exercises.map((e) => {
        const previousLog = getPreviousLog(sessions, e.exerciseId, null);
        const sets = previousLog
          ? previousLog.sets.map((st) => ({ weight: String(st.weight ?? ""), reps: String(st.reps ?? ""), warmup: !!st.warmup, dropset: !!st.dropset }))
          : [{ weight: "", reps: "" }];
        return { exerciseId: e.exerciseId, exerciseName: e.exerciseName, supersetGroup: e.supersetGroup || null, sets };
      }),
    });
    setEditingOriginalId(null);
    setDraftRestored(false);
    setTemplatePickerOpen(false);
  };

  const saveTemplate = (name, exercisesList) => {
    const template = {
      id: uid(),
      name,
      exercises: exercisesList.map((e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, supersetGroup: e.supersetGroup || null })),
    };
    setTemplates([...templates, template]);
  };

  const deleteTemplate = (id) => {
    const prev = templates;
    const deleted = templates.find((t) => t.id === id);
    setTemplates(templates.filter((t) => t.id !== id));
    if (deleted) showUndo(`Template "${deleted.name}" deleted.`, () => setTemplates(prev));
  };

  const saveDraft = () => {
    const { startedAt, ...draftRest } = draft;
    const cleaned = { ...draftRest, exercises: draft.exercises.filter((e) => e.sets.length > 0) };
    if (cleaned.exercises.length === 0) return;
    if (!editingOriginalId && startedAt) {
      cleaned.durationSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    }
    let next;
    if (editingOriginalId) {
      next = sessions.map((s) => (s.id === editingOriginalId ? cleaned : s));
    } else {
      next = [cleaned, ...sessions];
    }
    next.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.createdAt || 0) - (a.createdAt || 0)));
    setSessions(next);
    setDraft(null);
    setEditingOriginalId(null);
    setDraftRestored(false);
  };

  const deleteSession = (id) => {
    const prev = sessions;
    setSessions(sessions.filter((s) => s.id !== id));
    setConfirmDeleteId(null);
    showUndo("Workout deleted.", () => setSessions(prev));
  };

  const grouped = {};
  sessions.forEach((s) => { (grouped[s.date] = grouped[s.date] || []).push(s); });
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  const [importFile, setImportFile] = useState(null); // {exercises, sessions} preview
  const [importError, setImportError] = useState("");
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmClearExercises, setConfirmClearExercises] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const importInputRef = useRef(null);

  const onImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.exercises) || !Array.isArray(parsed.sessions)) {
        throw new Error("bad shape");
      }
      setImportFile(parsed);
    } catch (err) {
      setImportError("Couldn't read that file — make sure it's a JSON export in the app's format.");
    }
  };

  const confirmImport = () => {
    if (!importFile) return;
    const existingExIds = new Set(exercises.map((e) => e.id));
    const newExercises = importFile.exercises.filter((e) => !existingExIds.has(e.id));
    const existingSessionIds = new Set(sessions.map((s) => s.id));
    const newSessions = importFile.sessions.filter((s) => !existingSessionIds.has(s.id));

    const mergedExercises = [...exercises, ...newExercises];
    const mergedSessions = [...sessions, ...newSessions].sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.createdAt || 0) - (a.createdAt || 0)
    );
    setExercises(mergedExercises);
    setSessions(mergedSessions);
    setImportFile(null);
  };

  if (draft) {
    return (
      <div className="space-y-3">
        {draftRestored && (
          <div className="bg-cyan-400/10 border border-cyan-400/30 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <p className="text-xs text-cyan-400">Picked up where you left off — this workout was autosaved.</p>
            <button onClick={() => setDraftRestored(false)} className="text-cyan-400 p-1"><X size={14} /></button>
          </div>
        )}
        <SessionEditor
          draft={draft}
          setDraft={setDraft}
          exercises={exercises}
          setExercises={setExercises}
          sessions={sessions}
          editingOriginalId={editingOriginalId}
          onCancel={cancelDraft}
          onSave={saveDraft}
          onSaveTemplate={saveTemplate}
          isEditing={!!editingOriginalId}
        />
      </div>
    );
  }

  const streak = computeStreak(sessions);
  const heatmapCells = buildHeatmapDays(sessions, 10);

  return (
    <div className="space-y-4">
      {sessions.length > 0 && (
        <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Flame size={16} className={streak > 0 ? "text-amber-400" : "text-slate-600"} />
              <p className="text-sm font-medium text-slate-100">
                {streak > 0 ? `${streak} day streak` : "No active streak"}
              </p>
            </div>
            <p className="text-[11px] text-slate-500">Last 10 weeks</p>
          </div>
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateRows: "repeat(7, 1fr)", gridAutoFlow: "column", gridAutoColumns: "10px" }}
          >
            {heatmapCells.map((c) => (
              <div
                key={c.date}
                title={`${c.date}: ${c.count} workout${c.count === 1 ? "" : "s"}`}
                className="rounded-[2px]"
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: c.count === 0 ? "#1e293b" : c.count === 1 ? "#22d3ee80" : "#22d3ee",
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={startNew}
          className="flex-1 py-3.5 rounded-2xl bg-gradient-to-br from-cyan-600 to-cyan-400 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition"
        >
          <Plus size={20} strokeWidth={2.5} /> New Workout
        </button>
        <button
          onClick={() => importInputRef.current?.click()}
          className="px-4 rounded-2xl bg-slate-900 border border-white/10 text-slate-300 font-medium text-sm active:scale-[0.98] transition"
        >
          Import
        </button>
        <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={onImportFileChange} />
      </div>

      {sessions.length > 0 && (
        <button
          onClick={repeatLastWorkout}
          className="w-full py-2.5 rounded-xl border border-dashed border-white/15 text-slate-500 text-sm font-medium flex items-center justify-center gap-1.5 active:bg-slate-900"
        >
          <Repeat size={16} /> Repeat Last Workout
        </button>
      )}

      {templates.length > 0 && (
        <button
          onClick={() => setTemplatePickerOpen(true)}
          className="w-full py-2.5 rounded-xl border border-dashed border-white/15 text-slate-500 text-sm font-medium flex items-center justify-center gap-1.5 active:bg-slate-900"
        >
          <LayoutTemplate size={16} /> Start from Template
        </button>
      )}

      {templatePickerOpen && (
        <TemplatePickerSheet
          templates={templates}
          onPick={startFromTemplate}
          onDelete={deleteTemplate}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      {((sessions.length > 0 && !confirmClearAll) || (exercises.length > 0 && !confirmClearExercises)) && (
        <div className="flex gap-3">
          {sessions.length > 0 && !confirmClearAll && (
            <button onClick={() => setConfirmClearAll(true)} className="text-xs text-slate-500 active:text-red-400">
              Clear all workouts
            </button>
          )}
          {exercises.length > 0 && !confirmClearExercises && (
            <button onClick={() => setConfirmClearExercises(true)} className="text-xs text-slate-500 active:text-red-400">
              Clear exercise library
            </button>
          )}
        </div>
      )}
      {confirmClearAll && (
        <div className="bg-slate-900 border border-red-500/30 rounded-xl p-3.5 space-y-2.5">
          <p className="text-sm text-slate-100">
            Delete all {sessions.length} workout sessions? Your exercise library stays intact — only history is removed. You'll get a brief chance to undo right after.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmClearAll(false)} className="flex-1 py-2.5 rounded-lg bg-white/5 text-slate-300 text-sm font-medium">
              Cancel
            </button>
            <button
              onClick={() => {
                const prev = sessions;
                setSessions([]);
                setConfirmClearAll(false);
                showUndo(`${prev.length} workouts deleted.`, () => setSessions(prev));
              }}
              className="flex-1 py-2.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-semibold"
            >
              Delete All
            </button>
          </div>
        </div>
      )}

      {confirmClearExercises && (
        <div className="bg-slate-900 border border-red-500/30 rounded-xl p-3.5 space-y-2.5">
          <p className="text-sm text-slate-100">
            Delete all {exercises.length} exercises from your library? Logged workout history keeps its exercise
            names, but until you re-add them, these exercises won't appear in Progress charts, the muscle-group
            breakdown, or previous-log/PR lookups. You'll get a brief chance to undo right after.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmClearExercises(false)} className="flex-1 py-2.5 rounded-lg bg-white/5 text-slate-300 text-sm font-medium">
              Cancel
            </button>
            <button
              onClick={() => {
                const prev = exercises;
                setExercises([]);
                setConfirmClearExercises(false);
                showUndo(`${prev.length} exercises deleted.`, () => setExercises(prev));
              }}
              className="flex-1 py-2.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-semibold"
            >
              Delete All
            </button>
          </div>
        </div>
      )}

      {importError && <p className="text-xs text-red-400">{importError}</p>}

      {importFile && (
        <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
          <p className="font-medium text-sm text-white">Import Preview</p>
          <p className="text-xs text-slate-400">
            {importFile.exercises.length} exercises · {importFile.sessions.length} workout sessions found in this file.
          </p>
          <p className="text-xs text-slate-500">Anything already in your library or history (matched by id) will be skipped, so it's safe to import the same file twice.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setImportFile(null)} className="flex-1 py-2.5 rounded-lg bg-white/5 text-slate-300 text-sm font-medium">
              Cancel
            </button>
            <button onClick={confirmImport} className="flex-1 py-2.5 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 text-white text-sm font-semibold">
              Import
            </button>
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <p className="text-slate-500 text-sm text-center pt-10">No workouts logged yet. Start one above.</p>
      )}

      {sessions.length > 0 && (
        <input
          value={historyQuery}
          onChange={(e) => setHistoryQuery(e.target.value)}
          placeholder="Search history by workout, exercise, or date"
          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm placeholder-slate-600 outline-none focus:border-cyan-400"
        />
      )}

      {sessions.length > 0 && historyQuery.trim() && sessions.every((s) => !matchesHistoryQuery(s, historyQuery)) && (
        <p className="text-slate-500 text-sm text-center pt-6">No workouts match "{historyQuery.trim()}".</p>
      )}

      {dates.map((date) => {
        const daySessions = grouped[date].filter((s) => matchesHistoryQuery(s, historyQuery));
        if (daySessions.length === 0) return null;
        return (
        <div key={date}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{fmtDate(date)}</p>
          <div className="space-y-2">
            {daySessions.map((s) => {
              const isOpen = expandedId === s.id;
              const totalSets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
              return (
                <div key={s.id} className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : s.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                  >
                    <div>
                      <p className="font-medium text-white">{s.name || "Workout"}</p>
                      <p className="text-xs text-slate-500">
                        {s.exercises.length} exercises · {totalSets} sets{s.durationSec ? ` · ${formatWorkoutDuration(s.durationSec)}` : ""}
                      </p>
                    </div>
                    {isOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-white/10 pt-3 space-y-2.5">
                      {s.exercises.map((ex, i) => (
                        <div key={i} className="bg-white/5 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-slate-100">{ex.exerciseName}</p>
                            <p className="text-[11px] text-slate-500">{ex.sets.length} set{ex.sets.length === 1 ? "" : "s"}</p>
                          </div>
                          {ex.supersetGroup && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fuchsia-400 bg-fuchsia-400/15 px-1.5 py-0.5 rounded mb-1.5">
                              <Link2 size={10} /> Superset
                            </span>
                          )}
                          <div className="space-y-1">
                            {ex.sets.map((st, j) => (
                              <div key={j} className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 w-3.5">{j + 1}</span>
                                <span className="text-sm text-slate-200">
                                  {st.weight} <span className="text-slate-500">lbs ×</span> {st.reps}
                                </span>
                                {st.warmup && (
                                  <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded">W</span>
                                )}
                                {st.dropset && (
                                  <span className="text-[9px] font-semibold text-violet-400 bg-violet-400/15 px-1.5 py-0.5 rounded">D</span>
                                )}
                              </div>
                            ))}
                          </div>
                          {ex.notes && (
                            <p className="text-xs text-slate-400 italic mt-2 pt-2 border-t border-white/10">{ex.notes}</p>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => startEdit(s)}
                          className="flex-1 py-2 rounded-lg bg-white/5 text-slate-100 text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        {confirmDeleteId === s.id ? (
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium"
                          >
                            Confirm delete
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="flex-1 py-2 rounded-lg bg-white/5 text-red-400 text-sm font-medium flex items-center justify-center gap-1.5"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function TemplatePickerSheet({ templates, onPick, onDelete, onClose }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 border-t border-white/10 rounded-t-2xl w-full max-w-md p-4 space-y-3 max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Start from Template</p>
          <button onClick={onClose} className="p-1 text-slate-500"><X size={20} /></button>
        </div>
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-white/5 rounded-xl p-3 flex items-center justify-between gap-2">
              <button onClick={() => onPick(t)} className="flex-1 text-left">
                <p className="font-medium text-sm text-white">{t.name}</p>
                <p className="text-xs text-slate-400">{t.exercises.length} exercises</p>
              </button>
              {confirmDeleteId === t.id ? (
                <button
                  onClick={() => { onDelete(t.id); setConfirmDeleteId(null); }}
                  className="text-xs text-red-400 font-medium px-2 py-1 shrink-0"
                >
                  Confirm
                </button>
              ) : (
                <button onClick={() => setConfirmDeleteId(t.id)} className="p-1.5 text-slate-500 active:text-red-400 shrink-0">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionEditor({ draft, setDraft, exercises, setExercises, sessions, editingOriginalId, onCancel, onSave, onSaveTemplate, isEditing }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [restSeconds, setRestSeconds] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [plateCalcFor, setPlateCalcFor] = useState(null); // { exerciseName, weight } | null
  const [groupingMode, setGroupingMode] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState([]); // exercise indices
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (restSeconds === null || restSeconds <= 0) return;
    const t = setTimeout(() => setRestSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [restSeconds]);

  // Ticks the live elapsed-time display without needing per-second precision.
  useEffect(() => {
    if (!draft.startedAt) return;
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [draft.startedAt]);

  const addExerciseToSession = (exDef) => {
    const previousLog = getPreviousLog(sessions, exDef.id, editingOriginalId);
    const sets = previousLog
      ? previousLog.sets.map((st) => ({ weight: String(st.weight ?? ""), reps: String(st.reps ?? ""), warmup: !!st.warmup, dropset: !!st.dropset }))
      : [{ weight: "", reps: "" }];
    setDraft({
      ...draft,
      exercises: [...draft.exercises, { exerciseId: exDef.id, exerciseName: exDef.name, supersetGroup: null, sets }],
    });
    setPickerOpen(false);
  };

  const removeExercise = (idx) => {
    setDraft({ ...draft, exercises: draft.exercises.filter((_, i) => i !== idx) });
  };

  const updateSet = (exIdx, setIdx, field, value) => {
    const next = [...draft.exercises];
    next[exIdx] = { ...next[exIdx], sets: next[exIdx].sets.map((st, i) => (i === setIdx ? { ...st, [field]: value } : st)) };
    setDraft({ ...draft, exercises: next });
  };

  const isLastInSupersetGroup = (exIdx) => {
    const group = draft.exercises[exIdx].supersetGroup;
    if (!group) return true;
    const groupIndices = draft.exercises.map((e, i) => (e.supersetGroup === group ? i : -1)).filter((i) => i >= 0);
    return exIdx === groupIndices[groupIndices.length - 1];
  };

  const addSet = (exIdx) => {
    const next = [...draft.exercises];
    const last = next[exIdx].sets[next[exIdx].sets.length - 1];
    next[exIdx] = { ...next[exIdx], sets: [...next[exIdx].sets, { weight: last?.weight || "", reps: last?.reps || "", warmup: false, dropset: false }] };
    setDraft({ ...draft, exercises: next });
    if (isLastInSupersetGroup(exIdx)) setRestSeconds(90);
  };

  const removeSet = (exIdx, setIdx) => {
    const next = [...draft.exercises];
    next[exIdx] = { ...next[exIdx], sets: next[exIdx].sets.filter((_, i) => i !== setIdx) };
    setDraft({ ...draft, exercises: next });
  };

  const adjustSet = (exIdx, setIdx, field, delta) => {
    const next = [...draft.exercises];
    next[exIdx] = {
      ...next[exIdx],
      sets: next[exIdx].sets.map((st, i) => {
        if (i !== setIdx) return st;
        const current = Number(st[field]) || 0;
        return { ...st, [field]: String(Math.max(0, current + delta)) };
      }),
    };
    setDraft({ ...draft, exercises: next });
  };

  const cycleSetType = (exIdx, setIdx) => {
    const next = [...draft.exercises];
    next[exIdx] = {
      ...next[exIdx],
      sets: next[exIdx].sets.map((st, i) => {
        if (i !== setIdx) return st;
        if (st.warmup) return { ...st, warmup: false, dropset: true };
        if (st.dropset) return { ...st, warmup: false, dropset: false };
        return { ...st, warmup: true, dropset: false };
      }),
    };
    setDraft({ ...draft, exercises: next });
  };

  const updateExerciseNotes = (exIdx, notes) => {
    const next = [...draft.exercises];
    next[exIdx] = { ...next[exIdx], notes };
    setDraft({ ...draft, exercises: next });
  };

  const toggleSelectedForGroup = (exIdx) => {
    setSelectedForGroup((prev) => (prev.includes(exIdx) ? prev.filter((i) => i !== exIdx) : [...prev, exIdx]));
  };

  const confirmGrouping = () => {
    if (selectedForGroup.length < 2) return;
    const groupId = uid();
    const next = draft.exercises.map((e, i) => (selectedForGroup.includes(i) ? { ...e, supersetGroup: groupId } : e));
    setDraft({ ...draft, exercises: next });
    setGroupingMode(false);
    setSelectedForGroup([]);
  };

  const ungroupExercises = (groupId) => {
    const next = draft.exercises.map((e) => (e.supersetGroup === groupId ? { ...e, supersetGroup: null } : e));
    setDraft({ ...draft, exercises: next });
  };

  const confirmSaveTemplate = () => {
    if (!templateName.trim()) return;
    onSaveTemplate(templateName.trim(), draft.exercises);
    setSavingTemplate(false);
    setTemplateName("");
  };

  return (
    <div className="space-y-4 pb-4">
      {restSeconds !== null && (
        <RestTimerBar seconds={restSeconds} onAdjust={(d) => setRestSeconds((s) => Math.max(0, (s ?? 0) + d))} onDismiss={() => setRestSeconds(null)} />
      )}

      <div className="flex gap-2">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Workout name (optional)"
          className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm placeholder-slate-600 outline-none focus:border-cyan-400"
        />
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          className="bg-slate-900 border border-white/10 rounded-xl px-2 py-2.5 text-sm text-slate-300 outline-none focus:border-cyan-400"
        />
      </div>

      {draft.startedAt && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5 -mt-2">
          <Timer size={12} /> {formatWorkoutDuration(Math.round((Date.now() - draft.startedAt) / 1000))} elapsed
        </p>
      )}

      {draft.exercises.length >= 2 && (
        groupingMode ? (
          <div className="flex gap-2">
            <button
              onClick={() => { setGroupingMode(false); setSelectedForGroup([]); }}
              className="flex-1 py-2 rounded-lg bg-white/5 text-slate-300 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={confirmGrouping}
              disabled={selectedForGroup.length < 2}
              className="flex-1 py-2 rounded-lg bg-gradient-to-br from-fuchsia-600 to-fuchsia-400 text-white text-sm font-semibold disabled:opacity-40"
            >
              Group Selected ({selectedForGroup.length})
            </button>
          </div>
        ) : (
          <button
            onClick={() => setGroupingMode(true)}
            className="w-full py-2 rounded-lg border border-dashed border-white/15 text-slate-500 text-sm font-medium flex items-center justify-center gap-1.5 active:bg-slate-900"
          >
            <Link2 size={15} /> Group as Superset
          </button>
        )
      )}

      {draft.exercises.map((ex, exIdx) => {
        const priorBest = getBestWeightForExercise(sessions, ex.exerciseId, editingOriginalId);
        const previousLog = getPreviousLog(sessions, ex.exerciseId, editingOriginalId);
        const lastWeight = ex.sets[ex.sets.length - 1]?.weight;
        const suggestIncreaseFromLastTime =
          previousLog && previousLog.sets.some((st) => !st.warmup && !st.dropset && (Number(st.reps) || 0) >= 9);
        return (
          <div key={exIdx} className="bg-slate-900 border border-white/10 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                {groupingMode && (
                  <input
                    type="checkbox"
                    checked={selectedForGroup.includes(exIdx)}
                    onChange={() => toggleSelectedForGroup(exIdx)}
                    className="w-4 h-4 shrink-0 accent-fuchsia-500"
                  />
                )}
                <p className="font-medium text-white truncate">{ex.exerciseName}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setPlateCalcFor({ exerciseName: ex.exerciseName, weight: lastWeight || "" })}
                  className="p-1 text-slate-500 active:text-slate-300"
                  title="Plate calculator"
                >
                  <Calculator size={17} />
                </button>
                <button onClick={() => removeExercise(exIdx)} className="p-1 text-slate-500 active:text-red-400">
                  <X size={18} />
                </button>
              </div>
            </div>
            {ex.supersetGroup && !groupingMode && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold text-fuchsia-400 bg-fuchsia-400/15 px-1.5 py-0.5 rounded">
                  <Link2 size={10} /> Superset
                </span>
                <button onClick={() => ungroupExercises(ex.supersetGroup)} className="text-[10px] text-slate-500">
                  Ungroup
                </button>
              </div>
            )}
            {previousLog && (
              <p className="text-xs text-slate-500 mb-2.5">
                Last time ({fmtDate(previousLog.date)}): {previousLog.sets.map((st, i) => `${st.weight}×${st.reps}`).join(", ")}
              </p>
            )}
            {suggestIncreaseFromLastTime && (
              <p className="text-xs text-blue-400 -mt-1.5 mb-2.5 flex items-center gap-1">
                <TrendingUp size={12} /> Hit 9+ reps last time — try more weight today
              </p>
            )}
            <input
              value={ex.notes || ""}
              onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
              placeholder="Add a note (optional)"
              className="w-full bg-transparent text-xs text-slate-400 placeholder-slate-600 outline-none mb-2.5 border-b border-white/5 focus:border-white/20 pb-1.5"
            />
            <div className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-2 mb-1.5 px-1">
              <span className="text-[11px] text-slate-500 uppercase">Set</span>
              <span></span>
              <span className="text-[11px] text-slate-500 uppercase">Lbs</span>
              <span className="text-[11px] text-slate-500 uppercase">Reps</span>
              <span></span>
            </div>
            {ex.sets.map((st, setIdx) => {
              const isPR = !st.warmup && priorBest > 0 && (Number(st.weight) || 0) > priorBest;
              const shouldIncreaseWeight = !st.warmup && !st.dropset && (Number(st.reps) || 0) >= 9;
              return (
                <div key={setIdx} className="mb-2.5">
                  <div className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-2 items-center">
                    <span className="text-sm text-slate-400 pl-1 w-3.5">{setIdx + 1}</span>
                    <button
                      onClick={() => cycleSetType(exIdx, setIdx)}
                      title={
                        st.warmup
                          ? "Warm-up set (excluded from PRs and progress) — tap for drop set"
                          : st.dropset
                          ? "Drop set — tap to clear"
                          : "Tap to mark as warm-up, tap again for drop set"
                      }
                      className={`text-[10px] font-semibold px-1.5 py-2 rounded-lg border ${
                        st.warmup
                          ? "bg-amber-400/15 border-amber-400/40 text-amber-400"
                          : st.dropset
                          ? "bg-violet-400/15 border-violet-400/40 text-violet-400"
                          : "bg-white/5 border-white/10 text-slate-600"
                      }`}
                    >
                      {st.warmup ? "W" : st.dropset ? "D" : "•"}
                    </button>
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={st.weight}
                        onChange={(e) => updateSet(exIdx, setIdx, "weight", e.target.value)}
                        className={`w-full bg-white/5 rounded-lg px-2 py-2.5 text-center text-base outline-none focus:ring-1 focus:ring-cyan-400 ${isPR ? "ring-2 ring-amber-500" : ""}`}
                      />
                      {isPR && (
                        <span className="absolute -top-2 -right-1.5 bg-amber-500 text-white rounded-full p-0.5" title={`PR! Previous best ${priorBest} lbs`}>
                          <Trophy size={11} />
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={st.reps}
                        onChange={(e) => updateSet(exIdx, setIdx, "reps", e.target.value)}
                        className={`w-full bg-white/5 rounded-lg px-2 py-2.5 text-center text-base outline-none focus:ring-1 focus:ring-cyan-400 ${shouldIncreaseWeight ? "ring-2 ring-blue-500" : ""}`}
                      />
                      {shouldIncreaseWeight && (
                        <span className="absolute -top-2 -right-1.5 bg-blue-500 text-white rounded-full p-0.5" title="9+ reps — go up in weight next time">
                          <TrendingUp size={11} />
                        </span>
                      )}
                    </div>
                    <button onClick={() => removeSet(exIdx, setIdx)} className="p-2 text-slate-500 active:text-red-400">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-[auto_auto_1fr_1fr_auto] gap-2 mt-1">
                    <span />
                    <span />
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => adjustSet(exIdx, setIdx, "weight", -5)} className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-white/5 active:bg-white/10 active:text-slate-300">-5</button>
                      <button onClick={() => adjustSet(exIdx, setIdx, "weight", 5)} className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-white/5 active:bg-white/10 active:text-slate-300">+5</button>
                    </div>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => adjustSet(exIdx, setIdx, "reps", -1)} className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-white/5 active:bg-white/10 active:text-slate-300">-1</button>
                      <button onClick={() => adjustSet(exIdx, setIdx, "reps", 1)} className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-white/5 active:bg-white/10 active:text-slate-300">+1</button>
                    </div>
                    <span />
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => addSet(exIdx)}
              className="w-full mt-1 py-2 rounded-lg bg-white/5 text-cyan-400 text-sm font-medium flex items-center justify-center gap-1.5"
            >
              <Plus size={15} /> Add Set
            </button>
          </div>
        );
      })}

      {!pickerOpen ? (
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 text-slate-400 font-medium flex items-center justify-center gap-2 active:bg-slate-900"
        >
          <Plus size={18} /> Add Exercise
        </button>
      ) : (
        <ExercisePicker
          exercises={exercises}
          setExercises={setExercises}
          sessions={sessions}
          onPick={addExerciseToSession}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {draft.exercises.length > 0 && (
        savingTemplate ? (
          <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
            <p className="text-sm font-medium text-white">Save as Template</p>
            <input
              autoFocus
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Push Day"
              className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-cyan-400"
            />
            <div className="flex gap-2">
              <button onClick={() => { setSavingTemplate(false); setTemplateName(""); }} className="flex-1 py-2.5 rounded-lg bg-white/5 text-slate-300 text-sm font-medium">
                Cancel
              </button>
              <button onClick={confirmSaveTemplate} disabled={!templateName.trim()} className="flex-1 py-2.5 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 text-white text-sm font-semibold disabled:opacity-40">
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setTemplateName(draft.name || ""); setSavingTemplate(true); }}
            className="w-full py-2 text-sm text-slate-400 font-medium flex items-center justify-center gap-1.5"
          >
            <Bookmark size={15} /> Save as Template
          </button>
        )
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-white/5 text-slate-300 font-medium">
          Cancel
        </button>
        <button
          onClick={onSave}
          className="flex-1 py-3 rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-400 text-white font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/30"
        >
          <Check size={18} /> {isEditing ? "Save Changes" : "Finish Workout"}
        </button>
      </div>

      {plateCalcFor && <PlateCalculatorSheet initial={plateCalcFor} onClose={() => setPlateCalcFor(null)} />}
    </div>
  );
}

function RestTimerBar({ seconds, onAdjust, onDismiss }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const done = seconds <= 0;
  return (
    <div
      className={`sticky top-0 z-10 rounded-xl px-3.5 py-2.5 flex items-center justify-between border ${
        done
          ? "bg-gradient-to-r from-cyan-600 to-cyan-400 border-cyan-400/50 shadow-lg shadow-cyan-500/30"
          : "bg-slate-900/90 backdrop-blur border-white/10"
      }`}
    >
      <div className="flex items-center gap-2 text-white">
        <Timer size={16} />
        <span className="text-sm font-medium">{done ? "Rest done!" : "Resting"}</span>
        <span className="text-lg font-bold tabular-nums">{mins}:{String(secs).padStart(2, "0")}</span>
      </div>
      <div className="flex items-center gap-1">
        {!done && (
          <>
            <button onClick={() => onAdjust(-15)} className="text-white/80 text-xs font-medium px-2 py-1 active:text-white">-15s</button>
            <button onClick={() => onAdjust(15)} className="text-white/80 text-xs font-medium px-2 py-1 active:text-white">+15s</button>
          </>
        )}
        <button onClick={onDismiss} className="text-white/80 p-1 active:text-white"><X size={16} /></button>
      </div>
    </div>
  );
}

function PlateCalculatorSheet({ initial, onClose }) {
  const [barWeight, setBarWeight] = useState(45);
  const [weight, setWeight] = useState(initial.weight || "");

  const { plates, remainder } = calcPlates(weight, barWeight);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 border-t border-white/10 rounded-t-2xl w-full max-w-md p-4 space-y-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Plate Calculator</p>
          <button onClick={onClose} className="p-1 text-slate-500"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500">{initial.exerciseName}</p>

        <div className="flex gap-2">
          <div className="flex-1">
            <p className="text-[11px] text-slate-500 mb-1">Target weight (lbs)</p>
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-center text-base outline-none focus:ring-1 focus:ring-cyan-400"
            />
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-slate-500 mb-1">Bar weight (lbs)</p>
            <div className="flex gap-1">
              {BAR_WEIGHTS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBarWeight(b)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${barWeight === b ? "bg-cyan-400 text-white border-cyan-400" : "bg-white/5 border-white/10 text-slate-400"}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 space-y-2">
          <p className="text-[11px] text-slate-500 uppercase">Per side</p>
          {plates.length === 0 ? (
            <p className="text-sm text-slate-400">Just the bar — no plates needed.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {plates.map((p, i) => (
                <span key={i} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-sm font-semibold text-slate-100">
                  {p}
                </span>
              ))}
            </div>
          )}
          {remainder > 0.05 && (
            <p className="text-xs text-amber-400">+{remainder} lbs/side can't be made with standard plates.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExercisePicker({ exercises, setExercises, sessions, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [pendingMuscles, setPendingMuscles] = useState(null); // {name, muscles}

  const lastUsed = new Map();
  (sessions || []).forEach((s) => {
    s.exercises.forEach((e) => {
      const cur = lastUsed.get(e.exerciseId);
      if (!cur || s.date > cur) lastUsed.set(e.exerciseId, s.date);
    });
  });

  const filtered = exercises
    .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const aUsed = lastUsed.get(a.id);
      const bUsed = lastUsed.get(b.id);
      if (aUsed && bUsed) return aUsed === bUsed ? 0 : aUsed > bUsed ? -1 : 1;
      if (aUsed) return -1;
      if (bUsed) return 1;
      return a.name.localeCompare(b.name);
    });

  const openForm = () => {
    setEditingId(null);
    setNewName(query.trim());
    setShowForm(true);
  };

  const startEditExercise = (e) => {
    setEditingId(e.id);
    setNewName(e.name);
    setShowForm(true);
  };

  const exactMatch = !editingId && newName.trim()
    ? exercises.find((e) => e.name.toLowerCase() === newName.trim().toLowerCase())
    : null;

  const handleAddNew = () => {
    const name = newName.trim();
    if (!name) return;

    if (exactMatch) {
      onPick(exactMatch);
      setShowForm(false);
      setQuery("");
      return;
    }

    const current = editingId ? exercises.find((e) => e.id === editingId) : null;
    setPendingMuscles({ name, muscles: current?.muscles || [] });
  };

  const confirmSaveExercise = () => {
    const { name, muscles } = pendingMuscles;
    if (editingId) {
      setExercises(exercises.map((e) => (e.id === editingId ? { ...e, name, muscles } : e)));
    } else {
      const newEx = { id: uid(), name, muscles };
      setExercises([...exercises, newEx]);
      onPick(newEx);
    }
    setPendingMuscles(null);
    setShowForm(false);
    setEditingId(null);
    setQuery("");
  };

  const toggleMuscle = (group, region) => {
    setPendingMuscles((pm) => {
      const exists = pm.muscles.some((m) => m.group === group && m.region === region);
      const muscles = exists
        ? pm.muscles.filter((m) => !(m.group === group && m.region === region))
        : [...pm.muscles, { group, region }];
      return { ...pm, muscles };
    });
  };

  if (pendingMuscles) {
    return (
      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-3">
        <p className="font-medium text-white">"{pendingMuscles.name}" targets:</p>
        <div className="space-y-2">
          {Object.entries(MUSCLE_TAXONOMY).map(([group, regions]) => (
            <div key={group}>
              <p className="text-[11px] text-slate-500 uppercase mb-1">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {regions.map((region) => {
                  const active = pendingMuscles.muscles.some((m) => m.group === group && m.region === region);
                  return (
                    <button
                      key={region}
                      onClick={() => toggleMuscle(group, region)}
                      className="px-2.5 py-1.5 rounded-full text-xs font-medium border"
                      style={
                        active
                          ? { backgroundColor: GROUP_COLORS[group] + "33", borderColor: GROUP_COLORS[group], color: GROUP_COLORS[group] }
                          : { borderColor: "#334155", color: "#94a3b8" }
                      }
                    >
                      {region}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => setPendingMuscles(null)} className="flex-1 py-2.5 rounded-lg bg-white/5 text-slate-300 text-sm font-medium">
            Back
          </button>
          <button onClick={confirmSaveExercise} className="flex-1 py-2.5 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 text-white text-sm font-semibold">
            {editingId ? "Save Changes" : "Add Exercise"}
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-medium text-white text-sm">{editingId ? "Edit Exercise" : "New Exercise"}</p>
          <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1 text-slate-500"><X size={18} /></button>
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-1">Exercise name</p>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Incline Bench Press"
            className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-cyan-400"
          />
        </div>
        {exactMatch && <p className="text-xs text-slate-500">This exercise already exists — tapping Add will just use it.</p>}
        <button
          onClick={handleAddNew}
          disabled={!newName.trim()}
          className="w-full py-2.5 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-400 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Plus size={15} /> {editingId ? "Continue" : "Add Exercise"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          className="flex-1 bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-cyan-400"
        />
        <button onClick={onClose} className="p-2 text-slate-500">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1">
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center gap-1">
            <button
              onClick={() => onPick(e)}
              className="flex-1 text-left px-3 py-2.5 rounded-lg bg-white/5 active:bg-white/10 text-sm min-w-0"
            >
              {e.name}
              {e.muscles?.length > 0 && (
                <span className="text-slate-500 text-xs"> · {e.muscles.map((m) => m.region).join(", ")}</span>
              )}
            </button>
            <button onClick={() => startEditExercise(e)} className="p-2 text-slate-500 active:text-slate-300 shrink-0">
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={openForm}
        className="w-full py-2.5 rounded-lg border border-dashed border-cyan-400/50 text-cyan-400 text-sm font-medium flex items-center justify-center gap-1.5"
      >
        <Plus size={15} /> New Exercise
      </button>
    </div>
  );
}

// ---------- Progress Tab ----------


const PROGRESS_VIEWS = [
  { id: "exercises", label: "Exercises" },
  { id: "muscles", label: "Muscles" },
  { id: "bodyweight", label: "Weight" },
  { id: "measurements", label: "Measure" },
];

function ProgressTab({
  exercises,
  sessions,
  bodyWeightLog,
  setBodyWeightLog,
  exerciseGoals,
  setExerciseGoals,
  bodyMeasurementsLog,
  setBodyMeasurementsLog,
  showUndo,
}) {
  const [view, setView] = useState("exercises");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PROGRESS_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium border ${view === v.id ? "bg-blue-400 text-white border-blue-400" : "bg-slate-900 border-white/10 text-slate-400"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "exercises" && (
        <ExerciseProgress exercises={exercises} sessions={sessions} exerciseGoals={exerciseGoals} setExerciseGoals={setExerciseGoals} />
      )}
      {view === "muscles" && <MuscleVolumeView exercises={exercises} sessions={sessions} />}
      {view === "bodyweight" && <BodyWeightProgress log={bodyWeightLog} setLog={setBodyWeightLog} showUndo={showUndo} />}
      {view === "measurements" && (
        <BodyMeasurementsProgress log={bodyMeasurementsLog} setLog={setBodyMeasurementsLog} showUndo={showUndo} />
      )}
    </div>
  );
}

function ExerciseProgress({ exercises, sessions, exerciseGoals, setExerciseGoals }) {
  const loggedExerciseIds = new Set();
  sessions.forEach((s) => s.exercises.forEach((e) => loggedExerciseIds.add(e.exerciseId)));
  const loggedExercises = exercises.filter((e) => loggedExerciseIds.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));

  const [selectedId, setSelectedId] = useState(loggedExercises[0]?.id || "");
  const [metric, setMetric] = useState("weight"); // weight | volume
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  useEffect(() => {
    if (!selectedId && loggedExercises.length > 0) setSelectedId(loggedExercises[0].id);
  }, [loggedExercises.length]);

  if (loggedExercises.length === 0) {
    return <p className="text-slate-500 text-sm text-center pt-10">Log a workout to start seeing progress.</p>;
  }

  const points = [];
  let est1RM = 0;
  sessions
    .slice()
    .sort((a, b) => (a.date !== b.date ? (a.date > b.date ? 1 : -1) : (a.createdAt || 0) - (b.createdAt || 0)))
    .forEach((s) => {
      const matches = s.exercises.filter((e) => e.exerciseId === selectedId);
      if (matches.length === 0) return;
      let topWeight = 0;
      let volume = 0;
      matches.forEach((m) =>
        m.sets.forEach((st) => {
          if (st.warmup) return;
          const w = Number(st.weight) || 0;
          const r = Number(st.reps) || 0;
          topWeight = Math.max(topWeight, w);
          volume += w * r;
          est1RM = Math.max(est1RM, estimate1RM(w, r));
        })
      );
      points.push({ date: s.date, label: fmtDate(s.date).split(",")[0] + " " + s.date.slice(5), topWeight, volume });
    });

  const best = points.reduce((m, p) => Math.max(m, p.topWeight), 0);
  const first = points[0];
  const last = points[points.length - 1];
  const trend = points.length > 1 ? last.topWeight - first.topWeight : 0;
  const dataKey = metric === "weight" ? "topWeight" : "volume";
  const chartMax = points.reduce((m, p) => Math.max(m, p[dataKey]), 0);
  const yDomain = [0, Math.ceil((chartMax || 1) * 1.2)];

  const goal = exerciseGoals[selectedId];
  const goalPct = goal > 0 ? Math.min(100, (best / goal) * 100) : 0;

  const openGoalEditor = () => {
    setGoalInput(goal ? String(goal) : "");
    setEditingGoal(true);
  };
  const saveGoal = () => {
    const v = Number(goalInput);
    const next = { ...exerciseGoals };
    if (!goalInput.trim() || !(v > 0)) delete next[selectedId];
    else next[selectedId] = v;
    setExerciseGoals(next);
    setEditingGoal(false);
  };

  return (
    <div className="space-y-4">
      <select
        value={selectedId}
        onChange={(e) => { setSelectedId(e.target.value); setEditingGoal(false); }}
        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none"
      >
        {loggedExercises.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      <div className="flex gap-2">
        {[{ id: "weight", label: "Top Set Weight" }, { id: "volume", label: "Volume" }].map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${metric === m.id ? "bg-blue-400 text-white border-blue-400" : "bg-slate-900 border-white/10 text-slate-400"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Best" value={`${best}`} sub="lbs" />
        <StatCard label="Latest" value={`${last?.topWeight ?? "-"}`} sub="lbs" />
        <StatCard label="Trend" value={`${trend >= 0 ? "+" : ""}${trend}`} sub="lbs" color={trend > 0 ? "#34d399" : trend < 0 ? "#f87171" : "#94a3b8"} />
        <StatCard label="Est. 1RM" value={`${Math.round(est1RM)}`} sub="lbs" color="#a78bfa" />
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Target size={14} />
            <p className="text-sm font-medium">Goal</p>
          </div>
          {!editingGoal && (
            <button onClick={openGoalEditor} className="text-xs text-blue-400 font-medium">
              {goal ? "Edit" : "Set Goal"}
            </button>
          )}
        </div>
        {editingGoal ? (
          <div className="flex gap-2 mt-2">
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Target weight (lbs)"
              className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button onClick={saveGoal} className="px-3 rounded-lg bg-blue-400 text-white text-sm font-semibold">Save</button>
          </div>
        ) : goal ? (
          <>
            <div className="flex justify-between text-xs mb-1 mt-1">
              <span className="text-slate-400">{best} / {goal} lbs</span>
              <span className="text-slate-300 font-medium">{Math.round(goalPct)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all bg-blue-400" style={{ width: goalPct + "%" }} />
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500 mt-1">No goal set for this exercise yet.</p>
        )}
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-xl p-3 pt-5 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
            <YAxis domain={yDomain} tick={{ fill: "#64748b", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
            <Area type="monotone" dataKey={dataKey} stroke="none" fill="url(#progressFill)" />
            <Line type="monotone" dataKey={dataKey} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MuscleVolumeView({ exercises, sessions }) {
  const totals = computeMuscleVolume(sessions, exercises, 7);
  const max = Math.max(1, ...Object.values(totals));
  const groups = Object.keys(MUSCLE_TAXONOMY);
  const hasAny = Object.keys(totals).length > 0;

  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-300">Sets per Muscle Group — Last 7 Days</p>
      {!hasAny ? (
        <p className="text-slate-500 text-sm text-center py-6">
          No sets logged this week yet, or your exercises don't have muscle groups tagged.
        </p>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => {
            const count = totals[g] || 0;
            const pct = (count / max) * 100;
            return (
              <div key={g}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">{g}</span>
                  <span className="text-slate-300 font-medium">{count} set{count === 1 ? "" : "s"}</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: pct + "%", backgroundColor: GROUP_COLORS[g] }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BodyWeightProgress({ log, setLog, showUndo }) {
  const [weightInput, setWeightInput] = useState("");
  const [dateInput, setDateInput] = useState(todayStr());

  const sorted = log.slice().sort((a, b) => (a.date !== b.date ? (a.date > b.date ? 1 : -1) : (a.createdAt || 0) - (b.createdAt || 0)));

  const addEntry = () => {
    const w = Number(weightInput);
    if (!(w > 0)) return;
    const existingIdx = sorted.findIndex((e) => e.date === dateInput);
    let next;
    if (existingIdx >= 0) {
      const existingId = sorted[existingIdx].id;
      next = log.map((e) => (e.id === existingId ? { ...e, weight: w } : e));
    } else {
      next = [...log, { id: uid(), date: dateInput, weight: w, createdAt: Date.now() }];
    }
    setLog(next);
    setWeightInput("");
  };

  const deleteEntry = (id) => {
    const prev = log;
    setLog(log.filter((e) => e.id !== id));
    showUndo("Body weight entry deleted.", () => setLog(prev));
  };

  const points = sorted.map((e) => ({ date: e.date, label: fmtDate(e.date).split(",")[0] + " " + e.date.slice(5), weight: e.weight }));
  const latest = points[points.length - 1];
  const first30 = (() => {
    const cutoff = Date.now() - 30 * 86400000;
    const inWindow = points.filter((p) => new Date(p.date + "T00:00:00").getTime() >= cutoff);
    return inWindow[0];
  })();
  const change30 = latest && first30 && first30 !== latest ? Math.round((latest.weight - first30.weight) * 10) / 10 : 0;
  const chartValues = points.map((p) => p.weight);
  const dataMin = chartValues.length ? Math.min(...chartValues) : 0;
  const dataMax = chartValues.length ? Math.max(...chartValues) : 1;
  const pad = (dataMax - dataMin) * 0.15 || dataMax * 0.1 || 5;
  const yDomain = [Math.max(0, Math.floor(dataMin - pad)), Math.ceil(dataMax + pad)];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 flex gap-2">
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="bg-white/5 rounded-lg px-2 py-2.5 text-sm text-slate-300 outline-none focus:ring-1 focus:ring-blue-400"
        />
        <input
          type="number"
          inputMode="decimal"
          value={weightInput}
          onChange={(e) => setWeightInput(e.target.value)}
          placeholder="Weight (lbs)"
          className="flex-1 bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={addEntry} disabled={!weightInput.trim()} className="px-4 rounded-lg bg-blue-400 text-white text-sm font-semibold disabled:opacity-40">
          Log
        </button>
      </div>

      {points.length === 0 ? (
        <p className="text-slate-500 text-sm text-center pt-6">No body weight entries yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Current" value={`${latest.weight}`} sub="lbs" />
            <StatCard label="30-Day Change" value={`${change30 >= 0 ? "+" : ""}${change30}`} sub="lbs" color={change30 > 0 ? "#f87171" : change30 < 0 ? "#34d399" : "#94a3b8"} />
          </div>

          <div className="bg-slate-900 border border-white/10 rounded-xl p-3 pt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="bodyWeightFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis domain={yDomain} tick={{ fill: "#64748b", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="weight" stroke="none" fill="url(#bodyWeightFill)" />
                <Line type="monotone" dataKey="weight" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 3, fill: "#a78bfa" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5">
            {sorted.slice().reverse().slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-slate-900 border border-white/10 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-400">{fmtDate(e.date)}</span>
                <span className="text-sm font-medium text-slate-100">{e.weight} lbs</span>
                <button onClick={() => deleteEntry(e.id)} className="p-1 text-slate-500 active:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BodyMeasurementsProgress({ log, setLog, showUndo }) {
  const [type, setType] = useState(MEASUREMENT_TYPES[0]);
  const [valueInput, setValueInput] = useState("");
  const [dateInput, setDateInput] = useState(todayStr());

  const filtered = log.filter((e) => e.type === type);
  const sorted = filtered.slice().sort((a, b) => (a.date !== b.date ? (a.date > b.date ? 1 : -1) : (a.createdAt || 0) - (b.createdAt || 0)));

  const addEntry = () => {
    const v = Number(valueInput);
    if (!(v > 0)) return;
    const existingIdx = sorted.findIndex((e) => e.date === dateInput);
    let next;
    if (existingIdx >= 0) {
      const existingId = sorted[existingIdx].id;
      next = log.map((e) => (e.id === existingId ? { ...e, value: v } : e));
    } else {
      next = [...log, { id: uid(), date: dateInput, type, value: v, createdAt: Date.now() }];
    }
    setLog(next);
    setValueInput("");
  };

  const deleteEntry = (id) => {
    const prev = log;
    setLog(log.filter((e) => e.id !== id));
    showUndo("Measurement entry deleted.", () => setLog(prev));
  };

  const points = sorted.map((e) => ({ date: e.date, label: fmtDate(e.date).split(",")[0] + " " + e.date.slice(5), value: e.value }));
  const latest = points[points.length - 1];
  const first30 = (() => {
    const cutoff = Date.now() - 30 * 86400000;
    const inWindow = points.filter((p) => new Date(p.date + "T00:00:00").getTime() >= cutoff);
    return inWindow[0];
  })();
  const change30 = latest && first30 && first30 !== latest ? Math.round((latest.value - first30.value) * 10) / 10 : 0;
  const chartValues = points.map((p) => p.value);
  const dataMin = chartValues.length ? Math.min(...chartValues) : 0;
  const dataMax = chartValues.length ? Math.max(...chartValues) : 1;
  const pad = (dataMax - dataMin) * 0.15 || dataMax * 0.1 || 1;
  const yDomain = [Math.max(0, Math.floor(dataMin - pad)), Math.ceil(dataMax + pad)];

  return (
    <div className="space-y-4">
      <select
        value={type}
        onChange={(e) => { setType(e.target.value); setValueInput(""); }}
        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none"
      >
        {MEASUREMENT_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 flex gap-2">
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="bg-white/5 rounded-lg px-2 py-2.5 text-sm text-slate-300 outline-none focus:ring-1 focus:ring-blue-400"
        />
        <input
          type="number"
          inputMode="decimal"
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
          placeholder="Inches"
          className="flex-1 bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={addEntry} disabled={!valueInput.trim()} className="px-4 rounded-lg bg-blue-400 text-white text-sm font-semibold disabled:opacity-40">
          Log
        </button>
      </div>

      {points.length === 0 ? (
        <p className="text-slate-500 text-sm text-center pt-6">No {type.toLowerCase()} measurements logged yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Current" value={`${latest.value}`} sub="in" />
            <StatCard label="30-Day Change" value={`${change30 >= 0 ? "+" : ""}${change30}`} sub="in" color={change30 > 0 ? "#34d399" : change30 < 0 ? "#f87171" : "#94a3b8"} />
          </div>

          <div className="bg-slate-900 border border-white/10 rounded-xl p-3 pt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="measurementFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis domain={yDomain} tick={{ fill: "#64748b", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke="none" fill="url(#measurementFill)" />
                <Line type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={2.5} dot={{ r: 3, fill: "#2dd4bf" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5">
            {sorted.slice().reverse().slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-slate-900 border border-white/10 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-400">{fmtDate(e.date)}</span>
                <span className="text-sm font-medium text-slate-100">{e.value} in</span>
                <button onClick={() => deleteEntry(e.id)} className="p-1 text-slate-500 active:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-center">
      <p className="text-lg font-bold" style={{ color: color || "#e2e8f0" }}>{value}</p>
      <p className="text-[10px] text-slate-500 uppercase">{sub}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

// ---------- Food Tab ----------

function FoodTab({ foodLog, setFoodLog, targets, setTargets, showUndo }) {
  const [date, setDate] = useState(todayStr());
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const dayEntries = foodLog.filter((f) => f.date === date).sort((a, b) => (a.time < b.time ? -1 : 1));
  const totals = dayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const shiftDay = (delta) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  const deleteEntry = (id) => {
    const prev = foodLog;
    setFoodLog(foodLog.filter((f) => f.id !== id));
    showUndo("Meal entry deleted.", () => setFoodLog(prev));
  };

  const addEntry = (entry) => {
    setFoodLog([...foodLog, { id: uid(), date, time: new Date().toTimeString().slice(0, 5), ...entry }]);
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => shiftDay(-1)} className="p-2 text-slate-400"><ChevronLeft size={20} /></button>
        <p className="font-medium text-sm">{date === todayStr() ? "Today" : fmtDate(date)}</p>
        <button onClick={() => shiftDay(1)} disabled={date === todayStr()} className="p-2 text-slate-400 disabled:opacity-30"><ChevronRight size={20} /></button>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Today's Targets</p>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 text-slate-500"><Settings size={16} /></button>
        </div>
        {showSettings ? (
          <TargetsEditor targets={targets} onSave={(t) => { setTargets(t); setShowSettings(false); }} />
        ) : (
          <>
            <MacroBar label="Calories" value={totals.calories} target={targets.calories} color="#fbbf24" unit="kcal" />
            <MacroBar label="Protein" value={totals.protein} target={targets.protein} color="#34d399" unit="g" />
            <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs} color="#38bdf8" unit="g" />
            <MacroBar label="Fat" value={totals.fat} target={targets.fat} color="#f472b6" unit="g" />
          </>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-400 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 active:scale-[0.98] transition"
      >
        <Plus size={20} strokeWidth={2.5} /> Log Meal
      </button>

      {showAdd && <AddMealSheet onAdd={addEntry} onClose={() => setShowAdd(false)} />}

      <div className="space-y-2">
        {dayEntries.length === 0 && <p className="text-slate-500 text-sm text-center pt-6">No meals logged for this day.</p>}
        {dayEntries.map((e) => (
          <div key={e.id} className="bg-slate-900 border border-white/10 rounded-xl p-3.5 flex items-start justify-between">
            <div>
              <p className="font-medium text-sm text-white">{e.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{e.time} · {e.calories} kcal · P{e.protein} C{e.carbs} F{e.fat}</p>
            </div>
            <button onClick={() => deleteEntry(e.id)} className="p-1.5 text-slate-500 active:text-red-400"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MacroBar({ label, value, target, color, unit }) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-medium">{Math.round(value)} / {target} {unit}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: pct + "%", backgroundColor: color }} />
      </div>
    </div>
  );
}

function TargetsEditor({ targets, onSave }) {
  const [t, setT] = useState(targets);
  return (
    <div className="space-y-2.5">
      {[
        { key: "calories", label: "Calories (kcal)" },
        { key: "protein", label: "Protein (g)" },
        { key: "carbs", label: "Carbs (g)" },
        { key: "fat", label: "Fat (g)" },
      ].map((f) => (
        <div key={f.key} className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{f.label}</span>
          <input
            type="number"
            inputMode="numeric"
            value={t[f.key]}
            onChange={(e) => setT({ ...t, [f.key]: Number(e.target.value) })}
            className="w-24 bg-white/5 rounded-lg px-2 py-1.5 text-right text-sm outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
      ))}
      <button onClick={() => onSave(t)} className="w-full py-2.5 rounded-lg bg-gradient-to-br from-amber-600 to-amber-400 text-white text-sm font-semibold mt-1">
        Save Targets
      </button>
    </div>
  );
}

function AddMealSheet({ onAdd, onClose }) {
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });

  const submit = () => {
    onAdd({
      name: form.name || "Meal",
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 border-t border-white/10 rounded-t-2xl w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Log Meal</p>
          <button onClick={onClose} className="p-1 text-slate-500"><X size={20} /></button>
        </div>

        <div className="space-y-2.5">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Food name"
            className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-amber-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput label="Calories" value={form.calories} onChange={(v) => setForm({ ...form, calories: v })} />
            <LabeledInput label="Protein (g)" value={form.protein} onChange={(v) => setForm({ ...form, protein: v })} />
            <LabeledInput label="Carbs (g)" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
            <LabeledInput label="Fat (g)" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
          </div>
          <button onClick={submit} className="w-full py-3 rounded-xl bg-gradient-to-br from-amber-600 to-amber-400 text-white font-semibold shadow-lg shadow-amber-500/30">
            Save Meal
          </button>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 mb-1">{label}</p>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400"
      />
    </div>
  );
}

// ---------- Cardio Tab ----------

const CARDIO_TYPES = ["Run", "Hike"];

function formatDuration(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function paceSecPerMile(durationSec, distanceMi) {
  if (!distanceMi || distanceMi <= 0) return null;
  return durationSec / distanceMi;
}
function formatPace(durationSec, distanceMi) {
  const p = paceSecPerMile(durationSec, distanceMi);
  if (p === null) return "-";
  const m = Math.floor(p / 60);
  const s = Math.round(p % 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

function CardioTab({ cardioLog, setCardioLog, showUndo }) {
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const typesLogged = CARDIO_TYPES.filter((t) => cardioLog.some((a) => a.type === t));
  const [chartType, setChartType] = useState(typesLogged[0] || "Run");
  const [metric, setMetric] = useState("pace"); // pace | distance | elevation

  useEffect(() => {
    if (!typesLogged.includes(chartType) && typesLogged.length > 0) setChartType(typesLogged[0]);
  }, [cardioLog.length]);

  const addActivity = (entry) => {
    setCardioLog([{ id: uid(), ...entry }, ...cardioLog]);
    setShowAdd(false);
  };
  const deleteActivity = (id) => {
    const prev = cardioLog;
    setCardioLog(cardioLog.filter((a) => a.id !== id));
    setConfirmDeleteId(null);
    showUndo("Activity deleted.", () => setCardioLog(prev));
  };

  const sorted = cardioLog.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  const weekCutoff = Date.now() - 7 * 86400000;
  const weekActivities = cardioLog.filter((a) => new Date(a.date).getTime() >= weekCutoff);
  const weekDistance = weekActivities.reduce((s, a) => s + (Number(a.distance) || 0), 0);
  const weekElevation = weekActivities.reduce((s, a) => s + (Number(a.elevationGain) || 0), 0);

  const chartData = sorted
    .filter((a) => a.type === chartType)
    .slice()
    .reverse()
    .map((a) => ({
      label: a.date.slice(5),
      pace: paceSecPerMile(a.duration, a.distance) || 0,
      distance: Number(a.distance) || 0,
      elevation: Number(a.elevationGain) || 0,
    }));

  const chartValues = chartData.map((d) => d[metric]);
  const dataMin = chartValues.length ? Math.min(...chartValues) : 0;
  const dataMax = chartValues.length ? Math.max(...chartValues) : 1;
  const cardioPad = (dataMax - dataMin) * 0.15 || dataMax * 0.15 || 1;
  const cardioYDomain = [Math.max(0, Math.floor(dataMin - cardioPad)), Math.ceil(dataMax + cardioPad)];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="This Week" value={weekDistance.toFixed(1)} sub="miles" color="#fb923c" />
        <StatCard label="Elevation" value={Math.round(weekElevation)} sub="ft this wk" color="#fb923c" />
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-br from-orange-600 to-orange-400 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 active:scale-[0.98] transition"
      >
        <Plus size={20} strokeWidth={2.5} /> Log Activity
      </button>

      {showAdd && <AddCardioSheet onAdd={addActivity} onClose={() => setShowAdd(false)} />}

      {typesLogged.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex gap-2">
            {typesLogged.map((t) => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${chartType === t ? "bg-orange-400 text-white border-orange-400" : "bg-slate-900 border-white/10 text-slate-400"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[{ id: "pace", label: "Pace" }, { id: "distance", label: "Distance" }, { id: "elevation", label: "Elevation" }].map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${metric === m.id ? "bg-white/5 border-orange-400 text-orange-400" : "bg-slate-900 border-white/10 text-slate-500"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="bg-slate-900 border border-white/10 rounded-xl p-3 pt-5 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cardioFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis
                  domain={cardioYDomain}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  reversed={metric === "pace"}
                  tickFormatter={metric === "pace" ? (v) => formatDuration(v) : undefined}
                />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => (metric === "pace" ? formatDuration(v) + "/mi" : v)}
                />
                <Area type="monotone" dataKey={metric} stroke="none" fill="url(#cardioFill)" />
                <Line type="monotone" dataKey={metric} stroke="#fb923c" strokeWidth={2.5} dot={{ r: 3, fill: "#fb923c" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-slate-500 text-sm text-center pt-6">No runs or hikes logged yet.</p>}
        {sorted.map((a) => {
          const Icon = a.type === "Hike" ? Mountain : Footprints;
          const { bestPace, bestDistance, bestElevation } = getCardioBests(cardioLog, a.type, a.id);
          const pace = paceSecPerMile(a.duration, a.distance);
          const isPaceRecord = pace !== null && bestPace !== null && pace < bestPace;
          const isDistanceRecord = bestDistance > 0 && (Number(a.distance) || 0) > bestDistance;
          const isElevationRecord = bestElevation > 0 && (Number(a.elevationGain) || 0) > bestElevation;
          return (
            <div key={a.id} className="bg-slate-900 border border-white/10 rounded-xl p-3.5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-orange-400/15">
                    <Icon size={16} className="text-orange-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-white">{a.name || a.type}</p>
                    <p className="text-xs text-slate-500">{fmtDate(a.date)}</p>
                  </div>
                </div>
                {confirmDeleteId === a.id ? (
                  <button onClick={() => deleteActivity(a.id)} className="text-xs text-red-400 font-medium px-2 py-1">Confirm</button>
                ) : (
                  <button onClick={() => setConfirmDeleteId(a.id)} className="p-1.5 text-slate-500 active:text-red-400"><Trash2 size={16} /></button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1 mt-2.5 pt-2.5 border-t border-white/10 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-100 flex items-center justify-center gap-1">
                    {Number(a.distance).toFixed(2)}
                    {isDistanceRecord && <Trophy size={11} className="text-amber-400" title="Longest distance" />}
                  </p>
                  <p className="text-[10px] text-slate-500">miles</p>
                </div>
                <div><p className="text-sm font-semibold text-slate-100">{formatDuration(a.duration)}</p><p className="text-[10px] text-slate-500">time</p></div>
                <div>
                  <p className="text-sm font-semibold text-slate-100 flex items-center justify-center gap-1">
                    {formatPace(a.duration, a.distance)}
                    {isPaceRecord && <Trophy size={11} className="text-amber-400" title="Fastest pace" />}
                  </p>
                  <p className="text-[10px] text-slate-500">pace</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100 flex items-center justify-center gap-1">
                    {Math.round(a.elevationGain || 0)}
                    {isElevationRecord && <Trophy size={11} className="text-amber-400" title="Most elevation gain" />}
                  </p>
                  <p className="text-[10px] text-slate-500">ft gain</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddCardioSheet({ onAdd, onClose }) {
  const [form, setForm] = useState({
    type: "Run", name: "", date: todayStr(), distance: "", hrs: "0", mins: "", secs: "", elevationGain: "",
  });

  const submit = () => {
    const duration = (Number(form.hrs) || 0) * 3600 + (Number(form.mins) || 0) * 60 + (Number(form.secs) || 0);
    onAdd({
      type: form.type,
      name: form.name,
      date: form.date,
      distance: Number(form.distance) || 0,
      duration,
      elevationGain: Number(form.elevationGain) || 0,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 border-t border-white/10 rounded-t-2xl w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Log Run or Hike</p>
          <button onClick={onClose} className="p-1 text-slate-500"><X size={20} /></button>
        </div>

        <div className="space-y-2.5">
          <div className="flex gap-2">
            {CARDIO_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.type === t ? "bg-orange-400 text-white border-orange-400" : "bg-white/5 border-white/15 text-slate-400"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Activity name (optional)"
            className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-orange-400"
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="flex-1 bg-white/5 rounded-lg px-3 py-2.5 text-sm text-slate-300 outline-none focus:ring-1 focus:ring-orange-400"
            />
            <div className="flex-1 relative">
              <input
                type="number"
                inputMode="decimal"
                value={form.distance}
                onChange={(e) => setForm({ ...form, distance: e.target.value })}
                placeholder="Distance"
                className="w-full bg-white/5 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-orange-400"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-500">mi</span>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 mb-1">Duration</p>
            <div className="grid grid-cols-3 gap-2">
              <LabeledInput label="Hrs" value={form.hrs} onChange={(v) => setForm({ ...form, hrs: v })} />
              <LabeledInput label="Min" value={form.mins} onChange={(v) => setForm({ ...form, mins: v })} />
              <LabeledInput label="Sec" value={form.secs} onChange={(v) => setForm({ ...form, secs: v })} />
            </div>
          </div>

          <LabeledInput label="Elevation gain (ft)" value={form.elevationGain} onChange={(v) => setForm({ ...form, elevationGain: v })} />

          <button onClick={submit} className="w-full py-3 rounded-xl bg-gradient-to-br from-orange-600 to-orange-400 text-white font-semibold shadow-lg shadow-orange-500/30 mt-1">
            Save Activity
          </button>
        </div>
      </div>
    </div>
  );
}

