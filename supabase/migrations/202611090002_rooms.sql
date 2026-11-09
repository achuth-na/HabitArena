-- Room-owned checklists, member-owned check-ins, and profile identity.
create extension if not exists pgcrypto with schema extensions;

alter table public.profiles add column display_name text not null default 'Player';
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index profiles_username_unique_case_insensitive
  on public.profiles (lower(username)) where username is not null;

create or replace function public.handle_new_habitarena_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(user_id, display_name, username)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Player'),
    nullif(lower(trim(new.raw_user_meta_data ->> 'username')), '')
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name, username = excluded.username;
  return new;
end;
$$;
drop trigger if exists on_habitarena_user_created on auth.users;
create trigger on_habitarena_user_created after insert on auth.users
for each row execute function public.handle_new_habitarena_profile();

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  invite_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.room_memberships (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  password_hash text not null
);
create table public.room_checklist_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 80),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index room_checklist_items_unique_label
  on public.room_checklist_items (room_id, lower(label));
create table public.room_checklist_completions (
  item_id uuid not null references public.room_checklist_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_on date not null,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id, completed_on)
);
create index room_memberships_user_id_idx on public.room_memberships (user_id, joined_at);
create index room_checklist_items_room_position_idx on public.room_checklist_items (room_id, position);

alter table public.rooms enable row level security;
alter table public.room_memberships enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_checklist_items enable row level security;
alter table public.room_checklist_completions enable row level security;
grant select, update, delete on public.rooms to authenticated;
grant select, delete on public.room_memberships to authenticated;
grant select, insert, update, delete on public.room_checklist_items to authenticated;
grant select, insert, update, delete on public.room_checklist_completions to authenticated;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.room_memberships
    where room_id = p_room_id and user_id = (select auth.uid()));
$$;
create or replace function public.is_room_manager(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.room_memberships
    where room_id = p_room_id and user_id = (select auth.uid()) and role in ('owner', 'admin'));
$$;
revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.is_room_manager(uuid) from public, anon;
grant execute on function public.is_room_member(uuid), public.is_room_manager(uuid) to authenticated;

create policy "Room members can view their rooms" on public.rooms
  for select to authenticated using (public.is_room_member(id));
create policy "Room managers can edit room details" on public.rooms
  for update to authenticated using (public.is_room_manager(id))
  with check (public.is_room_manager(id));
create policy "Only owners can delete rooms" on public.rooms
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy "Room members can view the roster" on public.room_memberships
  for select to authenticated using (public.is_room_member(room_id));
create policy "Members can leave rooms" on public.room_memberships
  for delete to authenticated using (
    user_id = (select auth.uid()) and role <> 'owner'
  );
create policy "Room members can view checklist items" on public.room_checklist_items
  for select to authenticated using (public.is_room_member(room_id));
create policy "Room managers can add checklist items" on public.room_checklist_items
  for insert to authenticated with check (public.is_room_manager(room_id));
create policy "Room managers can edit checklist items" on public.room_checklist_items
  for update to authenticated using (public.is_room_manager(room_id))
  with check (public.is_room_manager(room_id));
create policy "Room managers can remove checklist items" on public.room_checklist_items
  for delete to authenticated using (public.is_room_manager(room_id));
create policy "Room members can view room check-ins" on public.room_checklist_completions
  for select to authenticated using (
    exists (select 1 from public.room_checklist_items i
      where i.id = item_id and public.is_room_member(i.room_id))
  );
create policy "Members can mark their own room check-ins" on public.room_checklist_completions
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.room_checklist_items i
      where i.id = item_id and public.is_room_member(i.room_id))
  );
create policy "Members can update their own room check-ins" on public.room_checklist_completions
  for update to authenticated using (user_id = (select auth.uid()) and exists (
      select 1 from public.room_checklist_items i
      where i.id = item_id and public.is_room_member(i.room_id)))
  with check (user_id = (select auth.uid()) and exists (
      select 1 from public.room_checklist_items i
      where i.id = item_id and public.is_room_member(i.room_id)));
create policy "Members can remove their own room check-ins" on public.room_checklist_completions
  for delete to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.room_checklist_items i
      where i.id = item_id and public.is_room_member(i.room_id))
  );

create or replace function public.create_room(p_name text, p_password text, p_checklist text[])
returns table(room_id uuid, invite_code text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room_id uuid;
  v_code text;
  v_count integer;
begin
  if v_user_id is null then raise exception 'Sign in to create a room.'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 60 then
    raise exception 'Room names must be between 1 and 60 characters.';
  end if;
  if p_password is null or char_length(p_password) < 8 then
    raise exception 'Room passwords must be at least 8 characters.';
  end if;
  select count(*)::integer into v_count
    from unnest(coalesce(p_checklist, array[]::text[])) as checklist(item)
    where char_length(trim(item)) between 1 and 80;
  if v_count < 1 or v_count > 20 then
    raise exception 'Add between 1 and 20 checklist items.';
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (select 1 from public.rooms r where r.invite_code = v_code);
  end loop;
  insert into public.rooms(name, invite_code, owner_id)
    values (trim(p_name), v_code, v_user_id) returning id into v_room_id;
  insert into public.room_secrets(room_id, password_hash)
    values (v_room_id, extensions.crypt(p_password, extensions.gen_salt('bf')));
  insert into public.room_memberships(room_id, user_id, role) values (v_room_id, v_user_id, 'owner');
  insert into public.room_checklist_items(room_id, label, position)
    select v_room_id, trim(x.item), x.position::integer
    from unnest(p_checklist) with ordinality as x(item, position)
    where char_length(trim(x.item)) between 1 and 80;
  return query select v_room_id, v_code;
end;
$$;

create or replace function public.join_room(p_invite_code text, p_password text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room_id uuid;
  v_password_hash text;
begin
  if v_user_id is null then raise exception 'Sign in to join a room.'; end if;
  select r.id, s.password_hash into v_room_id, v_password_hash
    from public.rooms r join public.room_secrets s on s.room_id = r.id
    where r.invite_code = upper(trim(coalesce(p_invite_code, '')));
  if v_room_id is null or extensions.crypt(coalesce(p_password, ''), v_password_hash) <> v_password_hash then
    raise exception 'Room ID or password is incorrect.';
  end if;
  insert into public.room_memberships(room_id, user_id, role) values (v_room_id, v_user_id, 'member')
    on conflict (room_id, user_id) do nothing;
  return v_room_id;
end;
$$;

create or replace function public.update_room_password(p_room_id uuid, p_password text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_room_manager(p_room_id) then raise exception 'Only a room owner or admin can change this.'; end if;
  if p_password is null or char_length(p_password) < 8 then raise exception 'Use at least 8 characters.'; end if;
  update public.room_secrets set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
    where room_id = p_room_id;
end;
$$;

create or replace function public.get_room_roster(p_room_id uuid)
returns table(user_id uuid, display_name text, username text, role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_room_member(p_room_id) then raise exception 'Join this room to view its members.'; end if;
  return query select m.user_id, coalesce(p.display_name, 'Player'), coalesce(p.username, ''),
      m.role
    from public.room_memberships m left join public.profiles p on p.user_id = m.user_id
    where m.room_id = p_room_id order by m.joined_at;
end;
$$;

create or replace function public.get_room_checkboard(p_room_id uuid, p_on date default current_date)
returns table(item_id uuid, item_name text, user_id uuid, display_name text,
  username text, is_completed boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_room_member(p_room_id) then raise exception 'Join this room to view its checklist.'; end if;
  return query
  select i.id, i.label, m.user_id, coalesce(p.display_name, 'Player'),
    coalesce(p.username, ''),
    exists (select 1 from public.room_checklist_completions c
      where c.item_id = i.id and c.user_id = m.user_id and c.completed_on = p_on)
  from public.room_checklist_items i
  cross join public.room_memberships m
  left join public.profiles p on p.user_id = m.user_id
  where i.room_id = p_room_id and m.room_id = p_room_id
  order by i.position, m.joined_at;
end;
$$;

create or replace function public.get_room_summary(p_room_id uuid, p_start date, p_end date)
returns table(user_id uuid, display_name text, username text, score numeric,
  completed_count integer, possible_count integer)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days integer := p_end - p_start + 1;
begin
  if not public.is_room_member(p_room_id) then raise exception 'Join this room to view reports.'; end if;
  if p_start is null or p_end is null or p_end < p_start or v_days > 370 then
    raise exception 'Choose a valid report period.';
  end if;
  return query
  with each_item as (
    select m.user_id, i.id as item_id, count(c.item_id)::integer as done,
      least(count(c.item_id)::numeric / v_days, 1::numeric) as normalized
    from public.room_memberships m
    cross join public.room_checklist_items i
    left join public.room_checklist_completions c on c.item_id = i.id
      and c.user_id = m.user_id and c.completed_on between p_start and p_end
    where m.room_id = p_room_id and i.room_id = p_room_id
    group by m.user_id, i.id
  )
  select m.user_id, coalesce(p.display_name, 'Player'), coalesce(p.username, ''),
    coalesce(round(avg(e.normalized) * 100, 1), 0::numeric),
    coalesce(sum(e.done), 0)::integer, (count(e.item_id) * v_days)::integer
  from public.room_memberships m
  left join public.profiles p on p.user_id = m.user_id
  left join each_item e on e.user_id = m.user_id
  where m.room_id = p_room_id
  group by m.user_id, p.display_name, p.username, m.joined_at
  order by coalesce(round(avg(e.normalized) * 100, 1), 0::numeric) desc, m.joined_at;
end;
$$;

revoke all on function public.create_room(text, text, text[]) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.update_room_password(uuid, text) from public, anon;
revoke all on function public.get_room_roster(uuid) from public, anon;
revoke all on function public.get_room_checkboard(uuid, date) from public, anon;
revoke all on function public.get_room_summary(uuid, date, date) from public, anon;
grant execute on function public.create_room(text, text, text[]) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.update_room_password(uuid, text) to authenticated;
grant execute on function public.get_room_roster(uuid) to authenticated;
grant execute on function public.get_room_checkboard(uuid, date) to authenticated;
grant execute on function public.get_room_summary(uuid, date, date) to authenticated;
