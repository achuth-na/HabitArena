-- HabitArena's first private app data. RLS is enabled before the app uses these tables.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[A-Za-z0-9_]{3,24}$'
  )
);

create unique index profiles_username_unique_case_insensitive
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

create policy "Profiles are private to their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  target_per_week smallint not null default 7 check (target_per_week between 1 and 7),
  created_at timestamptz not null default now()
);

create index habits_user_id_created_at_idx on public.habits (user_id, created_at);
alter table public.habits enable row level security;
grant select, insert, update, delete on public.habits to authenticated;

create policy "Users can view their own habits"
  on public.habits for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own habits"
  on public.habits for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own habits"
  on public.habits for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own habits"
  on public.habits for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (habit_id, completed_on)
);

create index habit_completions_habit_id_date_idx
  on public.habit_completions (habit_id, completed_on);
alter table public.habit_completions enable row level security;
grant select, insert, update, delete on public.habit_completions to authenticated;

create policy "Users can view completions for their own habits"
  on public.habit_completions for select to authenticated
  using (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

create policy "Users can record completions for their own habits"
  on public.habit_completions for insert to authenticated
  with check (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

create policy "Users can update completions for their own habits"
  on public.habit_completions for update to authenticated
  using (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );

create policy "Users can delete completions for their own habits"
  on public.habit_completions for delete to authenticated
  using (
    exists (
      select 1 from public.habits
      where habits.id = habit_completions.habit_id
        and habits.user_id = (select auth.uid())
    )
  );
