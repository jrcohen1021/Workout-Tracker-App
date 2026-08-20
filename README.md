# Workout + Food Tracker

A React app with a workout tracker, progress charts, a food/macro log, and a
running/hiking tracker. Built on Vite + React, persisted with Supabase
(Postgres + Auth), and installable to a phone's home screen as a PWA.

## Stack

- **Frontend:** Vite + React + Tailwind CSS, `recharts` for charts, `lucide-react` for icons.
- **Persistence:** Supabase Postgres. A single `app_state` table holds one JSON
  row per `(user, key)` for each of `exercises`, `sessions`, `food-log`,
  `daily-targets`, `cardio-log`, `workout-templates`, `body-weight-log`,
  `exercise-goals`, `body-measurements-log`, and `draft-session` (see
  `DATA_MODEL.md`). Row Level Security scopes every row to the signed-in
  user, so data syncs across devices for the same account.
- **Auth:** Supabase email/password auth, gating the app behind a sign-in
  screen (`src/components/AuthGate.jsx`).
- **PWA:** `public/manifest.webmanifest` + icons give a real home-screen icon
  and full-screen launch when added via "Add to Home Screen".

## Workout features

- **Rest timer** — starts automatically after logging a set (90s default,
  ±15s adjustable).
- **Personal records** — a set's weight input flags with a trophy badge when
  it beats your previous best for that exercise.
- **Templates** — save a workout's exercise list (not weights/reps) and start
  future workouts from it, pre-filled with your last logged sets.
- **Repeat last workout** — one tap to start a new session cloned from your
  most recently logged one.
- **Plate calculator** — per exercise, shows which plates to load per side
  for a target barbell weight.
- **Previous-log pre-fill** — adding an exercise (directly or via a template)
  pre-fills its sets with what you logged last time.
- **Per-exercise notes** — optional free-text note per exercise, per session.
- **Warm-up sets** — flag a set as a warm-up to exclude it from PRs,
  best-weight, estimated 1RM, and muscle-volume counts.
- **Drop sets** — flag a set as a drop (tap the same badge again) to mark it
  as a continuation of the set before it; still counts normally toward PRs
  and volume.
- **Progressive overload nudge** — a set's reps input flags with a badge once
  it hits 9+ reps, suggesting more weight next time (skipped for warm-up and
  drop sets). Also shown up front when you re-add an exercise whose most
  recent log already hit 9+ reps.
- **Workout duration** — timed automatically from starting a new workout to
  saving it; a live elapsed-time readout shows while you're logging, and the
  total shows in session history.
- **Supersets/circuits** — group two or more exercises in a session together;
  the rest timer is skipped between exercises within a group and only starts
  after the last one, matching how you'd actually move through a circuit.
- **Body measurements** — track chest/waist/hips/arms/thighs/calves over
  time, each with its own trend chart (Progress tab → Measure).
- **Quick-adjust buttons** — ±5 lb and ±1 rep taps on every set, no keyboard
  needed.
- **Exercise picker** — sorts your most recently logged exercises to the top,
  and lets you edit an exercise's name/muscle tags in place (pencil icon).
- **Workout history search** — filter past sessions by workout name, exercise
  name, or date.
- **Undo on delete** — deleting a workout, exercise library, template, cardio
  activity, meal, or body weight entry shows a brief "Undo" toast.
- **Progress tab** — three views: per-exercise charts (with an estimated
  1-rep-max and an optional weight goal with progress bar), a weekly
  sets-per-muscle-group breakdown, and body weight tracking with its own
  trend chart.
- **Cardio PRs** — fastest pace, longest distance, and most elevation gain
  flag with a trophy badge per activity type.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com), then grab the
**Project URL** and **anon public key** from Project Settings → API.

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
```

### 3. Run the database migration

Using the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

Or just paste the contents of `supabase/migrations/0001_init.sql` into the
Supabase dashboard's SQL Editor and run it.

### 4. Enable email/password auth

In the Supabase dashboard: Authentication → Providers → Email should already
be enabled by default. If you don't want the "confirm your email" step during
local testing, you can turn off "Confirm email" under Authentication →
Providers → Email settings.

### 5. Run it

```bash
npm run dev
```

## Project layout

```
src/
  App.jsx                  # main app (tabs, all feature UI — single file by design)
  lib/
    supabaseClient.js       # Supabase client, reads VITE_SUPABASE_* env vars
    storage.js               # loadKey/saveKey/deleteKey backed by app_state table
  components/
    AuthGate.jsx               # sign-in/sign-up screen + session hook
supabase/
  migrations/0001_init.sql      # app_state table + RLS policies
```

## Importing existing data

The Workouts tab has an **Import** button that accepts a JSON file shaped like
`{"exercises": [...], "sessions": [...]}` (matching the shapes in
`DATA_MODEL.md`). `sample-data-import.json` in this repo is one such file —
useful for smoke-testing the import flow. Records are merged by `id`, so
importing the same file twice is safe.
