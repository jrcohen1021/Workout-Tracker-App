# Workout + Food Tracker

A React app with a workout tracker, progress charts, a food/macro log, and a
running/hiking tracker. Built on Vite + React, persisted with Supabase
(Postgres + Auth), and installable to a phone's home screen as a PWA.

## Stack

- **Frontend:** Vite + React + Tailwind CSS, `recharts` for charts, `lucide-react` for icons.
- **Persistence:** Supabase Postgres. A single `app_state` table holds one JSON
  row per `(user, key)` for each of `exercises`, `sessions`, `food-log`,
  `daily-targets`, `cardio-log`, `workout-templates`, and `draft-session` (see
  `DATA_MODEL.md`). Row Level Security scopes every row to the signed-in user,
  so data syncs across devices for the same account.
- **Auth:** Supabase email/password auth, gating the app behind a sign-in
  screen (`src/components/AuthGate.jsx`).
- **PWA:** `public/manifest.webmanifest` + icons give a real home-screen icon
  and full-screen launch when added via "Add to Home Screen".

## Workout features

- **Rest timer** — starts automatically after logging a set (90s default,
  ±15s adjustable).
- **Personal records** — a set's weight input flags with a trophy badge when
  it beats your previous best for that exact exercise variant.
- **Templates** — save a workout's exercise list (not weights/reps) and start
  future workouts from it.
- **Plate calculator** — per exercise, shows which plates to load per side
  for a target barbell weight.

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
