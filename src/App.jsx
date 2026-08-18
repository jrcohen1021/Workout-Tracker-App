import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Dumbbell, TrendingUp, UtensilsCrossed, Plus, X,
  ChevronLeft, ChevronRight, Trash2, Settings, Check, Loader2, ChevronDown,
  ChevronUp, Pencil, Flame, Target, Mountain, Footprints, Timer
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { loadKey, saveKey, deleteKey } from "./lib/storage";
import { SignOutButton } from "./components/AuthGate";

// ---------- Constants ----------

const MUSCLE_TAXONOMY = {
  Chest: ["Upper Chest", "Mid Chest", "Lower Chest"],
  Back: ["Lats", "Upper Back/Traps", "Lower Back"],
  Shoulders: ["Front Delts", "Side Delts", "Rear Delts"],
  Arms: ["Biceps", "Triceps", "Forearms"],
  Legs: ["Quads", "Hamstrings", "Glutes", "Calves"],
  Core: ["Abs", "Obliques"],
};

const GROUP_COLORS = {
  Chest: "#ea580c",
  Back: "#0284c7",
  Shoulders: "#7c3aed",
  Arms: "#db2777",
  Legs: "#059669",
  Core: "#ca8a04",
};

const TABS = [
  { id: "workouts", label: "Workouts", icon: Dumbbell, accent: "#059669" },
  { id: "progress", label: "Progress", icon: TrendingUp, accent: "#0284c7" },
  { id: "cardio", label: "Cardio", icon: Mountain, accent: "#e11d48" },
  { id: "food", label: "Food", icon: UtensilsCrossed, accent: "#d97706" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function fmtDate(d) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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

  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      const [ex, se, fl, tg, cl] = await Promise.all([
        loadKey("exercises", []),
        loadKey("sessions", []),
        loadKey("food-log", []),
        loadKey("daily-targets", { calories: 2400, protein: 180, carbs: 250, fat: 70 }),
        loadKey("cardio-log", []),
      ]);
      if (cancelled) return;
      setExercises(ex.value);
      setSessions(se.value);
      setFoodLog(fl.value);
      setTargets(tg.value);
      setCardioLog(cl.value);
      setLoadFailed([ex, se, fl, tg, cl].some((r) => r.failed));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const [saveError, setSaveError] = useState(false);

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
  };

  const activeAccent = TABS.find((t) => t.id === activeTab)?.accent || "#059669";

  if (!ready) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col max-w-md mx-auto relative">
      <header className="px-4 pt-5 pb-3 sticky top-0 bg-neutral-50/95 backdrop-blur z-20 border-b border-neutral-200">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight" style={{ color: activeAccent }}>
            {TABS.find((t) => t.id === activeTab)?.label}
          </h1>
          <div className="flex gap-1.5">
            <button
              onClick={() => setLoadAttempt((n) => n + 1)}
              className="text-[11px] text-neutral-400 border border-neutral-200 rounded-full px-2.5 py-1 active:text-neutral-700"
            >
              Reload
            </button>
            <button
              onClick={() => exportBackup({ exercises, sessions, foodLog, targets, cardioLog })}
              className="text-[11px] text-neutral-400 border border-neutral-200 rounded-full px-2.5 py-1 active:text-neutral-700"
            >
              Backup
            </button>
            <SignOutButton />
          </div>
        </div>
        {loadFailed && (
          <p className="text-xs text-amber-600 mt-2">
            Some data may not have loaded — this may not be everything you've saved. Try Reload above before adding anything new.
          </p>
        )}
        {saveError && (
          <p className="text-xs text-red-600 mt-2">
            Your last change didn't save. Check your connection, then use Backup above to save a copy just in case.
          </p>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-24">
        {activeTab === "workouts" && (
          <WorkoutsTab exercises={exercises} setExercises={persist.exercises} sessions={sessions} setSessions={persist.sessions} />
        )}
        {activeTab === "progress" && <ProgressTab exercises={exercises} sessions={sessions} />}
        {activeTab === "cardio" && <CardioTab cardioLog={cardioLog} setCardioLog={persist.cardioLog} />}
        {activeTab === "food" && (
          <FoodTab foodLog={foodLog} setFoodLog={persist.foodLog} targets={targets} setTargets={persist.targets} />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-neutral-200 flex z-30">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 active:opacity-70"
            >
              <Icon size={22} color={active ? t.accent : "#9ca3af"} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[11px] font-medium" style={{ color: active ? t.accent : "#9ca3af" }}>
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
  return { id: uid(), date: todayStr(), name: "", exercises: [] };
}

function WorkoutsTab({ exercises, setExercises, sessions, setSessions }) {
  const [draft, setDraft] = useState(null); // null = not editing
  const [editingOriginalId, setEditingOriginalId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
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

  const saveDraft = () => {
    const cleaned = { ...draft, exercises: draft.exercises.filter((e) => e.sets.length > 0) };
    if (cleaned.exercises.length === 0) return;
    let next;
    if (editingOriginalId) {
      next = sessions.map((s) => (s.id === editingOriginalId ? cleaned : s));
    } else {
      next = [cleaned, ...sessions];
    }
    next.sort((a, b) => (a.date < b.date ? 1 : -1));
    setSessions(next);
    setDraft(null);
    setEditingOriginalId(null);
    setDraftRestored(false);
  };

  const deleteSession = (id) => {
    setSessions(sessions.filter((s) => s.id !== id));
    setConfirmDeleteId(null);
  };

  const grouped = {};
  sessions.forEach((s) => { (grouped[s.date] = grouped[s.date] || []).push(s); });
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  const [importFile, setImportFile] = useState(null); // {exercises, sessions} preview
  const [importError, setImportError] = useState("");
  const [confirmClearAll, setConfirmClearAll] = useState(false);
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
    const mergedSessions = [...sessions, ...newSessions].sort((a, b) => (a.date < b.date ? 1 : -1));
    setExercises(mergedExercises);
    setSessions(mergedSessions);
    setImportFile(null);
  };

  if (draft) {
    return (
      <div className="space-y-3">
        {draftRestored && (
          <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <p className="text-xs text-emerald-600">Picked up where you left off — this workout was autosaved.</p>
            <button onClick={() => setDraftRestored(false)} className="text-emerald-600 p-1"><X size={14} /></button>
          </div>
        )}
        <SessionEditor
          draft={draft}
          setDraft={setDraft}
          exercises={exercises}
          setExercises={setExercises}
          onCancel={cancelDraft}
          onSave={saveDraft}
          isEditing={!!editingOriginalId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={startNew}
          className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition"
        >
          <Plus size={20} strokeWidth={2.5} /> New Workout
        </button>
        <button
          onClick={() => importInputRef.current?.click()}
          className="px-4 rounded-2xl bg-white border border-neutral-200 text-neutral-700 font-medium text-sm active:scale-[0.98] transition"
        >
          Import
        </button>
        <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={onImportFileChange} />
      </div>

      {sessions.length > 0 && !confirmClearAll && (
        <button onClick={() => setConfirmClearAll(true)} className="text-xs text-neutral-400 active:text-red-600">
          Clear all workouts
        </button>
      )}
      {confirmClearAll && (
        <div className="bg-white border border-red-500/30 rounded-xl p-3.5 space-y-2.5">
          <p className="text-sm text-neutral-800">
            Delete all {sessions.length} workout sessions? Your exercise library stays intact — only history is removed. This can't be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmClearAll(false)} className="flex-1 py-2.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-medium">
              Cancel
            </button>
            <button
              onClick={() => { setSessions([]); setConfirmClearAll(false); }}
              className="flex-1 py-2.5 rounded-lg bg-red-500/20 text-red-600 text-sm font-semibold"
            >
              Delete All
            </button>
          </div>
        </div>
      )}

      {importError && <p className="text-xs text-red-600">{importError}</p>}

      {importFile && (
        <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-2.5">
          <p className="font-medium text-sm text-neutral-900">Import Preview</p>
          <p className="text-xs text-neutral-500">
            {importFile.exercises.length} exercises · {importFile.sessions.length} workout sessions found in this file.
          </p>
          <p className="text-xs text-neutral-400">Anything already in your library or history (matched by id) will be skipped, so it's safe to import the same file twice.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setImportFile(null)} className="flex-1 py-2.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-medium">
              Cancel
            </button>
            <button onClick={confirmImport} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
              Import
            </button>
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <p className="text-neutral-400 text-sm text-center pt-10">No workouts logged yet. Start one above.</p>
      )}

      {dates.map((date) => (
        <div key={date}>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">{fmtDate(date)}</p>
          <div className="space-y-2">
            {grouped[date].map((s) => {
              const isOpen = expandedId === s.id;
              const totalSets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
              return (
                <div key={s.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : s.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                  >
                    <div>
                      <p className="font-medium text-neutral-900">{s.name || "Workout"}</p>
                      <p className="text-xs text-neutral-400">{s.exercises.length} exercises · {totalSets} sets</p>
                    </div>
                    {isOpen ? <ChevronUp size={18} className="text-neutral-400" /> : <ChevronDown size={18} className="text-neutral-400" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-neutral-200 pt-3 space-y-3">
                      {s.exercises.map((ex, i) => (
                        <div key={i}>
                          <p className="text-sm font-medium text-neutral-800">{ex.exerciseName}</p>
                          <p className="text-xs text-neutral-400">
                            {ex.sets.map((st, j) => `${st.weight}×${st.reps}`).join(", ")}
                          </p>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => startEdit(s)}
                          className="flex-1 py-2 rounded-lg bg-neutral-100 text-neutral-800 text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        {confirmDeleteId === s.id ? (
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-600 text-sm font-medium"
                          >
                            Confirm delete
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="flex-1 py-2 rounded-lg bg-neutral-100 text-red-600 text-sm font-medium flex items-center justify-center gap-1.5"
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
      ))}
    </div>
  );
}

function SessionEditor({ draft, setDraft, exercises, setExercises, onCancel, onSave, isEditing }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const addExerciseToSession = (exDef) => {
    setDraft({
      ...draft,
      exercises: [...draft.exercises, { exerciseId: exDef.id, exerciseName: exDef.name, sets: [{ weight: "", reps: "" }] }],
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

  const addSet = (exIdx) => {
    const next = [...draft.exercises];
    const last = next[exIdx].sets[next[exIdx].sets.length - 1];
    next[exIdx] = { ...next[exIdx], sets: [...next[exIdx].sets, { weight: last?.weight || "", reps: last?.reps || "" }] };
    setDraft({ ...draft, exercises: next });
  };

  const removeSet = (exIdx, setIdx) => {
    const next = [...draft.exercises];
    next[exIdx] = { ...next[exIdx], sets: next[exIdx].sets.filter((_, i) => i !== setIdx) };
    setDraft({ ...draft, exercises: next });
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex gap-2">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Workout name (optional)"
          className="flex-1 bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm placeholder-neutral-400 outline-none focus:border-emerald-600"
        />
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          className="bg-white border border-neutral-200 rounded-xl px-2 py-2.5 text-sm text-neutral-700 outline-none focus:border-emerald-600"
        />
      </div>

      {draft.exercises.map((ex, exIdx) => (
        <div key={exIdx} className="bg-white border border-neutral-200 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <p className="font-medium text-neutral-900">{ex.exerciseName}</p>
            <button onClick={() => removeExercise(exIdx)} className="p-1 text-neutral-400 active:text-red-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-1.5 px-1">
            <span className="text-[11px] text-neutral-400 uppercase">Set</span>
            <span className="text-[11px] text-neutral-400 uppercase">Lbs</span>
            <span className="text-[11px] text-neutral-400 uppercase">Reps</span>
            <span></span>
          </div>
          {ex.sets.map((st, setIdx) => (
            <div key={setIdx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-2 items-center">
              <span className="text-sm text-neutral-500 pl-1">{setIdx + 1}</span>
              <input
                type="number"
                inputMode="decimal"
                value={st.weight}
                onChange={(e) => updateSet(exIdx, setIdx, "weight", e.target.value)}
                className="bg-neutral-100 rounded-lg px-2 py-2.5 text-center text-base outline-none focus:ring-1 focus:ring-emerald-600"
              />
              <input
                type="number"
                inputMode="numeric"
                value={st.reps}
                onChange={(e) => updateSet(exIdx, setIdx, "reps", e.target.value)}
                className="bg-neutral-100 rounded-lg px-2 py-2.5 text-center text-base outline-none focus:ring-1 focus:ring-emerald-600"
              />
              <button onClick={() => removeSet(exIdx, setIdx)} className="p-2 text-neutral-400 active:text-red-600">
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={() => addSet(exIdx)}
            className="w-full mt-1 py-2 rounded-lg bg-neutral-100 text-emerald-600 text-sm font-medium flex items-center justify-center gap-1.5"
          >
            <Plus size={15} /> Add Set
          </button>
        </div>
      ))}

      {!pickerOpen ? (
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-neutral-300 text-neutral-500 font-medium flex items-center justify-center gap-2 active:bg-white"
        >
          <Plus size={18} /> Add Exercise
        </button>
      ) : (
        <ExercisePicker
          exercises={exercises}
          setExercises={setExercises}
          onPick={addExerciseToSession}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-neutral-100 text-neutral-700 font-medium">
          Cancel
        </button>
        <button
          onClick={onSave}
          className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-1.5"
        >
          <Check size={18} /> {isEditing ? "Save Changes" : "Finish Workout"}
        </button>
      </div>
    </div>
  );
}

function getBaseName(ex) {
  if (ex.baseName) return ex.baseName;
  return ex.name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
function getEquipment(ex) {
  if (ex.equipment !== undefined) return ex.equipment || "";
  const m = ex.name.match(/\(([^)]*)\)\s*$/);
  return m ? m[1] : "";
}
function displayName(baseName, equipment) {
  return equipment ? `${baseName} (${equipment})` : baseName;
}

function ExercisePicker({ exercises, setExercises, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newBase, setNewBase] = useState("");
  const [newEquipment, setNewEquipment] = useState("");
  const [pendingMuscles, setPendingMuscles] = useState(null); // {baseName, equipment, muscles}

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));

  const openForm = () => {
    setNewBase(query.trim());
    setNewEquipment("");
    setShowForm(true);
  };

  const matchingBase = newBase.trim()
    ? exercises.find((e) => getBaseName(e).toLowerCase() === newBase.trim().toLowerCase())
    : null;
  const proposedName = displayName(newBase.trim(), newEquipment.trim());
  const exactVariantExists = exercises.some((e) => e.name.toLowerCase() === proposedName.toLowerCase());

  const handleAddNew = () => {
    const baseName = newBase.trim();
    const equipment = newEquipment.trim();
    if (!baseName) return;

    if (exactVariantExists) {
      const existing = exercises.find((e) => e.name.toLowerCase() === proposedName.toLowerCase());
      onPick(existing);
      setShowForm(false);
      setQuery("");
      return;
    }

    if (matchingBase) {
      // Reuse muscle tags from the existing base movement.
      const newEx = { id: uid(), baseName, equipment, name: proposedName, muscles: matchingBase.muscles || [] };
      const next = [...exercises, newEx];
      setExercises(next);
      onPick(newEx);
      setShowForm(false);
      setQuery("");
      return;
    }

    setPendingMuscles({ baseName, equipment, muscles: [] });
  };

  const confirmNewExercise = () => {
    const { baseName, equipment, muscles } = pendingMuscles;
    const newEx = { id: uid(), baseName, equipment, name: displayName(baseName, equipment), muscles };
    const next = [...exercises, newEx];
    setExercises(next);
    onPick(newEx);
    setPendingMuscles(null);
    setShowForm(false);
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
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-3">
        <p className="font-medium text-neutral-900">"{displayName(pendingMuscles.baseName, pendingMuscles.equipment)}" targets:</p>
        <p className="text-xs text-neutral-400">Muscle tags are saved against "{pendingMuscles.baseName}" — every brand/equipment variant of this movement will share them.</p>
        <div className="space-y-2">
          {Object.entries(MUSCLE_TAXONOMY).map(([group, regions]) => (
            <div key={group}>
              <p className="text-[11px] text-neutral-400 uppercase mb-1">{group}</p>
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
                          : { borderColor: "#d1d5db", color: "#6b7280" }
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
          <button onClick={() => setPendingMuscles(null)} className="flex-1 py-2.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-medium">
            Back
          </button>
          <button onClick={confirmNewExercise} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
            Add Exercise
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-medium text-neutral-900 text-sm">New Exercise</p>
          <button onClick={() => setShowForm(false)} className="p-1 text-neutral-400"><X size={18} /></button>
        </div>
        <div>
          <p className="text-[11px] text-neutral-400 mb-1">Movement name</p>
          <input
            autoFocus
            value={newBase}
            onChange={(e) => setNewBase(e.target.value)}
            placeholder="e.g. Chest Press"
            className="w-full bg-neutral-100 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
        <div>
          <p className="text-[11px] text-neutral-400 mb-1">Equipment / brand (optional)</p>
          <input
            value={newEquipment}
            onChange={(e) => setNewEquipment(e.target.value)}
            placeholder="e.g. Hammer Strength"
            className="w-full bg-neutral-100 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
        {newBase.trim() && <p className="text-xs text-neutral-400">Will be added as "{proposedName}"</p>}
        {matchingBase && !exactVariantExists && (
          <p className="text-xs text-sky-600">Reusing muscle tags from "{matchingBase.baseName || getBaseName(matchingBase)}".</p>
        )}
        {exactVariantExists && <p className="text-xs text-neutral-400">This exact variant already exists — tapping Add will just use it.</p>}
        <button
          onClick={handleAddNew}
          disabled={!newBase.trim()}
          className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Plus size={15} /> Add Exercise
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          className="flex-1 bg-neutral-100 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <button onClick={onClose} className="p-2 text-neutral-400">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1">
        {filtered.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-neutral-100 active:bg-neutral-200 text-sm"
          >
            {e.name}
            {e.muscles?.length > 0 && (
              <span className="text-neutral-400 text-xs"> · {e.muscles.map((m) => m.region).join(", ")}</span>
            )}
          </button>
        ))}
      </div>
      <button
        onClick={openForm}
        className="w-full py-2.5 rounded-lg border border-dashed border-emerald-600/50 text-emerald-600 text-sm font-medium flex items-center justify-center gap-1.5"
      >
        <Plus size={15} /> New Exercise
      </button>
    </div>
  );
}

// ---------- Progress Tab ----------


function ProgressTab({ exercises, sessions }) {
  const loggedExerciseIds = new Set();
  sessions.forEach((s) => s.exercises.forEach((e) => loggedExerciseIds.add(e.exerciseId)));
  const loggedExercises = exercises.filter((e) => loggedExerciseIds.has(e.id));

  const movementNames = [...new Set(loggedExercises.map((e) => getBaseName(e)))].sort();

  const [selectedBase, setSelectedBase] = useState(movementNames[0] || "");
  const [selectedVariant, setSelectedVariant] = useState("all"); // 'all' or exercise id
  const [metric, setMetric] = useState("weight"); // weight | volume

  useEffect(() => {
    if (!selectedBase && movementNames.length > 0) setSelectedBase(movementNames[0]);
  }, [movementNames.length]);

  useEffect(() => {
    setSelectedVariant("all");
  }, [selectedBase]);

  if (loggedExercises.length === 0) {
    return <p className="text-neutral-400 text-sm text-center pt-10">Log a workout to start seeing progress.</p>;
  }

  const variants = loggedExercises.filter((e) => getBaseName(e) === selectedBase);
  const includedIds =
    selectedVariant === "all" ? variants.map((v) => v.id) : [selectedVariant];

  const points = [];
  sessions
    .slice()
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .forEach((s) => {
      const matches = s.exercises.filter((e) => includedIds.includes(e.exerciseId));
      if (matches.length === 0) return;
      let topWeight = 0;
      let volume = 0;
      matches.forEach((m) =>
        m.sets.forEach((st) => {
          const w = Number(st.weight) || 0;
          const r = Number(st.reps) || 0;
          topWeight = Math.max(topWeight, w);
          volume += w * r;
        })
      );
      points.push({ date: s.date, label: fmtDate(s.date).split(",")[0] + " " + s.date.slice(5), topWeight, volume });
    });

  const best = points.reduce((m, p) => Math.max(m, p.topWeight), 0);
  const first = points[0];
  const last = points[points.length - 1];
  const trend = points.length > 1 ? last.topWeight - first.topWeight : 0;

  return (
    <div className="space-y-4">
      <select
        value={selectedBase}
        onChange={(e) => setSelectedBase(e.target.value)}
        className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none"
      >
        {movementNames.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      {variants.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            onClick={() => setSelectedVariant("all")}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border"
            style={
              selectedVariant === "all"
                ? { backgroundColor: "#0284c733", borderColor: "#0284c7", color: "#0284c7" }
                : { borderColor: "#d1d5db", color: "#6b7280" }
            }
          >
            All equipment (combined)
          </button>
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVariant(v.id)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border"
              style={
                selectedVariant === v.id
                  ? { backgroundColor: "#0284c733", borderColor: "#0284c7", color: "#0284c7" }
                  : { borderColor: "#d1d5db", color: "#6b7280" }
              }
            >
              {getEquipment(v) || v.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {[{ id: "weight", label: "Top Set Weight" }, { id: "volume", label: "Volume" }].map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${metric === m.id ? "bg-sky-600 text-white border-sky-600" : "bg-white border-neutral-200 text-neutral-500"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Best" value={`${best}`} sub="lbs" />
        <StatCard label="Latest" value={`${last?.topWeight ?? "-"}`} sub="lbs" />
        <StatCard label="Trend" value={`${trend >= 0 ? "+" : ""}${trend}`} sub="lbs" color={trend > 0 ? "#059669" : trend < 0 ? "#dc2626" : "#6b7280"} />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 10 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey={metric === "weight" ? "topWeight" : "volume"} stroke="#0284c7" strokeWidth={2.5} dot={{ r: 3, fill: "#0284c7" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3 text-center">
      <p className="text-lg font-bold" style={{ color: color || "#111827" }}>{value}</p>
      <p className="text-[10px] text-neutral-400 uppercase">{sub}</p>
      <p className="text-[11px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

// ---------- Food Tab ----------

function FoodTab({ foodLog, setFoodLog, targets, setTargets }) {
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

  const deleteEntry = (id) => setFoodLog(foodLog.filter((f) => f.id !== id));

  const addEntry = (entry) => {
    setFoodLog([...foodLog, { id: uid(), date, time: new Date().toTimeString().slice(0, 5), ...entry }]);
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => shiftDay(-1)} className="p-2 text-neutral-500"><ChevronLeft size={20} /></button>
        <p className="font-medium text-sm">{date === todayStr() ? "Today" : fmtDate(date)}</p>
        <button onClick={() => shiftDay(1)} disabled={date === todayStr()} className="p-2 text-neutral-500 disabled:opacity-30"><ChevronRight size={20} /></button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-neutral-700">Today's Targets</p>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 text-neutral-400"><Settings size={16} /></button>
        </div>
        {showSettings ? (
          <TargetsEditor targets={targets} onSave={(t) => { setTargets(t); setShowSettings(false); }} />
        ) : (
          <>
            <MacroBar label="Calories" value={totals.calories} target={targets.calories} color="#d97706" unit="kcal" />
            <MacroBar label="Protein" value={totals.protein} target={targets.protein} color="#059669" unit="g" />
            <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs} color="#0284c7" unit="g" />
            <MacroBar label="Fat" value={totals.fat} target={targets.fat} color="#db2777" unit="g" />
          </>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="w-full py-3.5 rounded-2xl bg-amber-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition"
      >
        <Plus size={20} strokeWidth={2.5} /> Log Meal
      </button>

      {showAdd && <AddMealSheet onAdd={addEntry} onClose={() => setShowAdd(false)} />}

      <div className="space-y-2">
        {dayEntries.length === 0 && <p className="text-neutral-400 text-sm text-center pt-6">No meals logged for this day.</p>}
        {dayEntries.map((e) => (
          <div key={e.id} className="bg-white border border-neutral-200 rounded-xl p-3.5 flex items-start justify-between">
            <div>
              <p className="font-medium text-sm text-neutral-900">{e.name}</p>
              <p className="text-xs text-neutral-400 mt-0.5">{e.time} · {e.calories} kcal · P{e.protein} C{e.carbs} F{e.fat}</p>
            </div>
            <button onClick={() => deleteEntry(e.id)} className="p-1.5 text-neutral-400 active:text-red-600"><Trash2 size={16} /></button>
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
        <span className="text-neutral-500">{label}</span>
        <span className="text-neutral-700 font-medium">{Math.round(value)} / {target} {unit}</span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
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
          <span className="text-sm text-neutral-500">{f.label}</span>
          <input
            type="number"
            inputMode="numeric"
            value={t[f.key]}
            onChange={(e) => setT({ ...t, [f.key]: Number(e.target.value) })}
            className="w-24 bg-neutral-100 rounded-lg px-2 py-1.5 text-right text-sm outline-none focus:ring-1 focus:ring-amber-600"
          />
        </div>
      ))}
      <button onClick={() => onSave(t)} className="w-full py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold mt-1">
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
      <div className="bg-white border-t border-neutral-200 rounded-t-2xl w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Log Meal</p>
          <button onClick={onClose} className="p-1 text-neutral-400"><X size={20} /></button>
        </div>

        <div className="space-y-2.5">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Food name"
            className="w-full bg-neutral-100 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-amber-600"
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput label="Calories" value={form.calories} onChange={(v) => setForm({ ...form, calories: v })} />
            <LabeledInput label="Protein (g)" value={form.protein} onChange={(v) => setForm({ ...form, protein: v })} />
            <LabeledInput label="Carbs (g)" value={form.carbs} onChange={(v) => setForm({ ...form, carbs: v })} />
            <LabeledInput label="Fat (g)" value={form.fat} onChange={(v) => setForm({ ...form, fat: v })} />
          </div>
          <button onClick={submit} className="w-full py-3 rounded-xl bg-amber-600 text-white font-semibold">
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
      <p className="text-[11px] text-neutral-400 mb-1">{label}</p>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-neutral-100 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-600"
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

function CardioTab({ cardioLog, setCardioLog }) {
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
  const deleteActivity = (id) => { setCardioLog(cardioLog.filter((a) => a.id !== id)); setConfirmDeleteId(null); };

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="This Week" value={weekDistance.toFixed(1)} sub="miles" color="#e11d48" />
        <StatCard label="Elevation" value={Math.round(weekElevation)} sub="ft this wk" color="#e11d48" />
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="w-full py-3.5 rounded-2xl bg-rose-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition"
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
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${chartType === t ? "bg-rose-600 text-white border-rose-600" : "bg-white border-neutral-200 text-neutral-500"}`}
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
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${metric === m.id ? "bg-neutral-100 border-rose-600 text-rose-600" : "bg-white border-neutral-200 text-neutral-400"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl p-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  reversed={metric === "pace"}
                  tickFormatter={metric === "pace" ? (v) => formatDuration(v) : undefined}
                />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => (metric === "pace" ? formatDuration(v) + "/mi" : v)}
                />
                <Line type="monotone" dataKey={metric} stroke="#e11d48" strokeWidth={2.5} dot={{ r: 3, fill: "#e11d48" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-neutral-400 text-sm text-center pt-6">No runs or hikes logged yet.</p>}
        {sorted.map((a) => {
          const Icon = a.type === "Hike" ? Mountain : Footprints;
          return (
            <div key={a.id} className="bg-white border border-neutral-200 rounded-xl p-3.5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-rose-600/15">
                    <Icon size={16} className="text-rose-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-neutral-900">{a.name || a.type}</p>
                    <p className="text-xs text-neutral-400">{fmtDate(a.date)}</p>
                  </div>
                </div>
                {confirmDeleteId === a.id ? (
                  <button onClick={() => deleteActivity(a.id)} className="text-xs text-red-600 font-medium px-2 py-1">Confirm</button>
                ) : (
                  <button onClick={() => setConfirmDeleteId(a.id)} className="p-1.5 text-neutral-400 active:text-red-600"><Trash2 size={16} /></button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1 mt-2.5 pt-2.5 border-t border-neutral-200 text-center">
                <div><p className="text-sm font-semibold text-neutral-800">{Number(a.distance).toFixed(2)}</p><p className="text-[10px] text-neutral-400">miles</p></div>
                <div><p className="text-sm font-semibold text-neutral-800">{formatDuration(a.duration)}</p><p className="text-[10px] text-neutral-400">time</p></div>
                <div><p className="text-sm font-semibold text-neutral-800">{formatPace(a.duration, a.distance)}</p><p className="text-[10px] text-neutral-400">pace</p></div>
                <div><p className="text-sm font-semibold text-neutral-800">{Math.round(a.elevationGain || 0)}</p><p className="text-[10px] text-neutral-400">ft gain</p></div>
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
      <div className="bg-white border-t border-neutral-200 rounded-t-2xl w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold">Log Run or Hike</p>
          <button onClick={onClose} className="p-1 text-neutral-400"><X size={20} /></button>
        </div>

        <div className="space-y-2.5">
          <div className="flex gap-2">
            {CARDIO_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.type === t ? "bg-rose-600 text-white border-rose-600" : "bg-neutral-100 border-neutral-300 text-neutral-500"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Activity name (optional)"
            className="w-full bg-neutral-100 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-rose-600"
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="flex-1 bg-neutral-100 rounded-lg px-3 py-2.5 text-sm text-neutral-700 outline-none focus:ring-1 focus:ring-rose-600"
            />
            <div className="flex-1 relative">
              <input
                type="number"
                inputMode="decimal"
                value={form.distance}
                onChange={(e) => setForm({ ...form, distance: e.target.value })}
                placeholder="Distance"
                className="w-full bg-neutral-100 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-rose-600"
              />
              <span className="absolute right-3 top-2.5 text-xs text-neutral-400">mi</span>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-neutral-400 mb-1">Duration</p>
            <div className="grid grid-cols-3 gap-2">
              <LabeledInput label="Hrs" value={form.hrs} onChange={(v) => setForm({ ...form, hrs: v })} />
              <LabeledInput label="Min" value={form.mins} onChange={(v) => setForm({ ...form, mins: v })} />
              <LabeledInput label="Sec" value={form.secs} onChange={(v) => setForm({ ...form, secs: v })} />
            </div>
          </div>

          <LabeledInput label="Elevation gain (ft)" value={form.elevationGain} onChange={(v) => setForm({ ...form, elevationGain: v })} />

          <button onClick={submit} className="w-full py-3 rounded-xl bg-rose-600 text-white font-semibold mt-1">
            Save Activity
          </button>
        </div>
      </div>
    </div>
  );
}

