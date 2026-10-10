-- Our Recipe Book v1: paste into the Supabase SQL Editor and run once.
-- Household membership is enforced in the DATABASE, not just in the user interface.
-- UUID generation uses built-in Postgres gen_random_uuid().

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  invite_code text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 24),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create table if not exists public.recipes (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  category text not null default 'Other',
  status text not null default 'to-try' check (status in ('to-try','favorite','needs-work')),
  ingredients text not null default '',
  instructions text not null default '',
  notes text not null default '',
  source_url text not null default '',
  servings integer check (servings is null or (servings between 1 and 1000)),
  prep_minutes integer check (prep_minutes is null or (prep_minutes between 0 and 10000)),
  cook_minutes integer check (cook_minutes is null or (cook_minutes between 0 and 10000)),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_recipe_household on public.recipes(household_id, updated_at desc);
-- Give signed-in device accounts the necessary table privileges.
-- Row Level Security below still limits which rows they can access.
revoke all on public.households, public.household_members, public.recipes from anon;
grant select on public.households, public.household_members to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;

create or replace function public.is_household_member(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.recipes enable row level security;

create policy "members can view their household" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "members can see their memberships" on public.household_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "members read recipes" on public.recipes
  for select to authenticated using (public.is_household_member(household_id));
create policy "members create recipes" on public.recipes
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "members update recipes" on public.recipes
  for update to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "members delete recipes" on public.recipes
  for delete to authenticated using (public.is_household_member(household_id));

create or replace function public.create_household(p_name text default 'Our Recipes')
returns table(household_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_code text;
  v_name text := left(trim(coalesce(p_name,'')), 100);
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first';
  end if;
  if v_name = '' then v_name := 'Our Recipes'; end if;
  insert into public.households (name, owner_id)
  values (v_name, (select auth.uid()))
  returning id, households.invite_code into v_id, v_code;
  insert into public.household_members (household_id, user_id)
  values (v_id, (select auth.uid()));
  return query select v_id, v_code;
end;
$$;
revoke all on function public.create_household(text) from public;
grant execute on function public.create_household(text) to authenticated;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select h.id into v_id from public.households h
   where h.invite_code = lower(trim(p_code));
  if v_id is null then raise exception 'Invite code not recognized'; end if;
  insert into public.household_members (household_id, user_id)
    values (v_id, (select auth.uid())) on conflict do nothing;
  return v_id;
end;
$$;
revoke all on function public.join_household(text) from public;
grant execute on function public.join_household(text) to authenticated;

-- Any current household member can rotate the invite code. This does not revoke existing members.
create or replace function public.rotate_household_code(p_household uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  update public.households set invite_code = left(replace(gen_random_uuid()::text, '-', ''), 24)
  where id = p_household and public.is_household_member(id)
  returning invite_code into v_code;
  if v_code is null then raise exception 'Only a household member may rotate its code'; end if;
  return v_code;
end;
$$;
revoke all on function public.rotate_household_code(uuid) from public;
grant execute on function public.rotate_household_code(uuid) to authenticated;

-- Private image storage; individual files are restricted to members of the household
-- in the first directory component of the object path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images','recipe-images',false,5000000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5000000,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "household members read photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'recipe-images' and exists (
      select 1 from public.household_members m
      where m.user_id = (select auth.uid())
        and m.household_id::text = split_part(name,'/',1)
    )
  );
create policy "household members upload photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'recipe-images' and exists (
      select 1 from public.household_members m
      where m.user_id = (select auth.uid())
        and m.household_id::text = split_part(name,'/',1)
    )
  );
create policy "household members replace photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'recipe-images' and exists (
      select 1 from public.household_members m
      where m.user_id = (select auth.uid())
        and m.household_id::text = split_part(name,'/',1)
    )
  ) with check (
    bucket_id = 'recipe-images' and exists (
      select 1 from public.household_members m
      where m.user_id = (select auth.uid())
        and m.household_id::text = split_part(name,'/',1)
    )
  );
create policy "household members remove photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'recipe-images' and exists (
      select 1 from public.household_members m
      where m.user_id = (select auth.uid())
        and m.household_id::text = split_part(name,'/',1)
    )
  );
