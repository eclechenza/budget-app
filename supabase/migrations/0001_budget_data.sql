create table public.budget_data (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  budget_state  jsonb not null default '{}'::jsonb,
  route_data    jsonb not null default '{}'::jsonb,
  rates_data    jsonb not null default '{}'::jsonb,
  birth_date    date,
  updated_at    timestamptz not null default now()
);

alter table public.budget_data enable row level security;

create policy "select own row" on public.budget_data
  for select using (auth.uid() = user_id);

create policy "insert own row" on public.budget_data
  for insert with check (auth.uid() = user_id);

create policy "update own row" on public.budget_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger budget_data_set_updated_at
  before update on public.budget_data
  for each row execute function public.set_updated_at();
