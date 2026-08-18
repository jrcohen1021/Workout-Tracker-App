-- Key/value persistence for the workout tracker.
-- One row per (user, key), where key is one of:
--   exercises | sessions | food-log | daily-targets | cardio-log | workout-templates | draft-session
-- (see DATA_MODEL.md for the shape of each key's value).

create table if not exists public.app_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.app_state enable row level security;

create policy "Users can select their own app_state"
  on public.app_state for select
  using (auth.uid() = user_id);

create policy "Users can insert their own app_state"
  on public.app_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own app_state"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own app_state"
  on public.app_state for delete
  using (auth.uid() = user_id);
