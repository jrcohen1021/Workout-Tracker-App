# Data Model

Each of these is a `key` in the Supabase `app_state` table (see
`supabase/migrations/0001_init.sql`): one row per `(user_id, key)`, with the
JSON shown below stored in that row's `value` jsonb column. Row Level Security
scopes every row to `auth.uid()`, so each signed-in account gets its own
private copy of all keys, synced across devices.

## `exercises` — array

```json
{
  "id": "string (unique)",
  "name": "string, e.g. 'Incline Bench Press'",
  "muscles": [
    { "group": "Chest|Back|Shoulders|Arms|Legs|Core", "region": "string, e.g. 'Upper Chest'" }
  ]
}
```

No equipment/brand variant tracking — each exercise is just a name. Older
imported data may still carry legacy `baseName`/`equipment` fields; they're
ignored.

Muscle taxonomy (fixed set used throughout the app — see `MUSCLE_TAXONOMY` near
the top of `src/App.jsx`):
- Chest: Upper Chest, Mid Chest, Lower Chest
- Back: Lats, Upper Back/Traps, Lower Back
- Shoulders: Front Delts, Side Delts, Rear Delts
- Arms: Biceps, Triceps, Forearms
- Legs: Quads, Hamstrings, Glutes, Calves
- Core: Abs, Obliques

## `sessions` — array (workout history)

```json
{
  "id": "string (unique)",
  "date": "YYYY-MM-DD",
  "createdAt": "number (Date.now() at creation) — tiebreaker for ordering same-day sessions",
  "name": "string, optional workout name",
  "exercises": [
    {
      "exerciseId": "references exercises[].id",
      "exerciseName": "cached display name at time of logging",
      "sets": [ { "weight": "number (lbs)", "reps": "number", "warmup": "boolean, optional — excluded from PRs, best-weight, 1RM, and muscle-volume counts" } ],
      "notes": "string, optional free-text note for this exercise in this session"
    }
  ]
}
```

`date` alone can't order multiple workouts logged the same day, so every
sort/comparison that needs "most recent" (saving, importing, the Progress
chart, previous-log lookups) sorts by `date` then falls back to `createdAt`.
Sessions saved before this field existed simply sort as if `createdAt` were
`0` — their relative order among same-day ties is whatever it happened to be.

## `food-log` — array

```json
{
  "id": "string (unique)",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "name": "string",
  "calories": "number (kcal)",
  "protein": "number (g)",
  "carbs": "number (g)",
  "fat": "number (g)"
}
```

## `daily-targets` — single object

```json
{ "calories": 2400, "protein": 180, "carbs": 250, "fat": 70 }
```

## `cardio-log` — array (runs/hikes)

```json
{
  "id": "string (unique)",
  "date": "YYYY-MM-DD",
  "type": "Run | Hike",
  "name": "string, optional",
  "distance": "number (miles)",
  "duration": "number (seconds)",
  "elevationGain": "number (feet)"
}
```

## `workout-templates` — array

```json
{
  "id": "string (unique)",
  "name": "string, e.g. 'Push Day'",
  "exercises": [
    { "exerciseId": "references exercises[].id", "exerciseName": "cached display name" }
  ]
}
```

Structure only — no weights/reps prescribed. Starting a workout from a
template seeds a fresh draft with these exercises, each pre-filled with the
sets from the last time that exercise was logged (or one empty set if it's
never been logged before).

## `body-weight-log` — array

```json
{
  "id": "string (unique)",
  "date": "YYYY-MM-DD",
  "weight": "number (lbs)",
  "createdAt": "number (Date.now() at creation)"
}
```

Logging a second entry for a date that already has one overwrites it rather
than adding a duplicate.

## `exercise-goals` — single object

```json
{ "exerciseId": "goalWeight (number, lbs)" }
```

Sparse map keyed by `exercises[].id`; an exercise with no goal set simply has
no key here.

## `draft-session` — single object (autosave safety net)

```json
{ "draft": { "id": "...", "date": "YYYY-MM-DD", "name": "...", "exercises": [...] }, "editingOriginalId": "string | null" }
```

Deleted (row removed) whenever there's no in-progress workout, so an
in-progress workout survives an accidental close but doesn't linger forever.

## Not persisted (in-memory only, fine to leave that way)

- Which tab is active, which session/food-entry sheet is open, form drafts
  other than the workout-in-progress draft.
