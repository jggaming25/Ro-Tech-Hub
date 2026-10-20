-- ============================================================
--  Ro-Tech Hub · Supabase Schema
--  Im Supabase Dashboard -> SQL Editor als Ganzes ausführen.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
do $$ begin
  create type public.user_rank as enum ('user', 'admin', 'master');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.review_status as enum ('pending', 'approved', 'hidden', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.suggestion_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.purchase_type as enum ('gamepass', 'subscription', 'free');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.purchase_status as enum ('pending', 'confirmed', 'rejected', 'refunded');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Tabellen
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  username text not null,
  rank public.user_rank not null default 'user',
  blocked boolean not null default false,
  blocked_reason text,
  mfa_email_enabled boolean not null default false,
  email_verified boolean not null default false,
  notify_inapp boolean not null default true,
  notify_desktop boolean not null default true,
  discord_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email_verified boolean not null default false;

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create index if not exists profiles_rank_idx on public.profiles (rank);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  image_url text,
  category text not null default 'Sonstiges',
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'EUR',
  for_sale boolean not null default true,
  on_sale boolean not null default false,
  discount_percent integer not null default 0 check (discount_percent between 0 and 100),
  visible boolean not null default true,
  purchase_type public.purchase_type not null default 'gamepass',
  roblox_gamepass_id text,
  roblox_subscription_id text,
  discord_role_id text,
  download_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_visible_created_idx on public.products (visible, created_at desc);
create index if not exists products_category_idx on public.products (category);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  content text not null check (char_length(regexp_replace(content, '\s', '', 'g')) between 1 and 500),
  status public.review_status not null default 'pending',
  moderation_note text,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists reviews_status_created_idx on public.reviews (status, created_at desc);
create index if not exists reviews_product_idx on public.reviews (product_id);

create table if not exists public.product_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null check (char_length(description) between 5 and 2000),
  category text,
  link text,
  status public.suggestion_status not null default 'pending',
  admin_note text,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suggestions_status_idx on public.product_suggestions (status, created_at desc);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  purchase_type public.purchase_type not null default 'gamepass',
  status public.purchase_status not null default 'pending',
  roblox_username text,
  roblox_receipt text,
  admin_note text,
  role_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);
create index if not exists purchases_status_idx on public.purchases (status, created_at desc);
create unique index if not exists purchases_one_pending_idx
  on public.purchases (user_id, product_id) where (status = 'pending');

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  body text not null default '',
  kind text not null default 'info' check (kind in ('info', 'success', 'warning', 'sale')),
  link text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_idx on public.notifications (created_at desc);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);

-- ------------------------------------------------------------
-- Hilfsfunktionen
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_rank()
returns public.user_rank
language sql
stable
security definer
set search_path = public
as $$
  select rank from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_rank() in ('admin', 'master'), false);
$$;

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_rank() = 'master', false);
$$;

create or replace function public.is_blocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select blocked from public.profiles where id = auth.uid()), false);
$$;

-- ------------------------------------------------------------
-- Auth -> Profil
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
  suffix integer := 0;
begin
  base_name := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if base_name is null then
    base_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  candidate := base_name;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    suffix := suffix + 1;
    candidate := base_name || suffix::text;
  end loop;

  insert into public.profiles (id, email, username)
  values (new.id, coalesce(new.email, ''), candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('rth.email_sync', '1', true);
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ------------------------------------------------------------
-- Schutz-Trigger (Rechte / Immunitäten)
-- ------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_rank public.user_rank;
  changing_protected boolean;
  changing_safe boolean;
begin
  if actor is null then
    return new;
  end if;

  if new.email is distinct from old.email
     and coalesce(current_setting('rth.email_sync', true), '') <> '1' then
    raise exception 'Die E-Mail kann nur über die Kontoeinstellungen geändert werden.';
  end if;

  if old.id = actor
     and coalesce(current_setting('rth.allow_discord_sync', true), '') = '1'
     and new.discord_id is distinct from old.discord_id
     and (to_jsonb(new) - 'discord_id' - 'updated_at') = (to_jsonb(old) - 'discord_id' - 'updated_at') then
    return new;
  end if;

  actor_rank := public.current_rank();

  changing_protected :=
    (new.email is distinct from old.email)
    or (new.rank is distinct from old.rank)
    or (new.blocked is distinct from old.blocked)
    or (new.blocked_reason is distinct from old.blocked_reason)
    or (new.discord_id is distinct from old.discord_id);

  changing_safe :=
    (new.username is distinct from old.username)
    or (new.mfa_email_enabled is distinct from old.mfa_email_enabled)
    or (new.email_verified is distinct from old.email_verified)
    or (new.notify_inapp is distinct from old.notify_inapp)
    or (new.notify_desktop is distinct from old.notify_desktop);

  if actor_rank = 'master' then
    if old.id = actor and new.rank is distinct from old.rank then
      raise exception 'Der eigene Rang kann nicht geändert werden.';
    end if;
    if old.rank = 'master' and old.id <> actor
       and (new.rank is distinct from old.rank or new.blocked is distinct from old.blocked) then
      raise exception 'Master Admins sind gegeneinander immun.';
    end if;
    if new.blocked and old.rank = 'master' then
      raise exception 'Master Admins können nicht gesperrt werden.';
    end if;
    return new;
  end if;

  if actor_rank = 'admin' then
    if changing_protected then
      if old.id = actor then
        raise exception 'Admins können ihre eigenen geschützten Felder nicht ändern.';
      end if;
      if (new.email is distinct from old.email)
         or (new.rank is distinct from old.rank)
         or (new.discord_id is distinct from old.discord_id) then
        raise exception 'Admins dürfen ausschließlich Sperren verwalten.';
      end if;
      if old.rank <> 'user' then
        raise exception 'Admins und Master Admins sind immun gegen Sperren.';
      end if;
    end if;
    if old.id <> actor and changing_safe then
      raise exception 'Admins dürfen nur Sperren verwalten.';
    end if;
    return new;
  end if;

  if old.id <> actor then
    raise exception 'Keine Berechtigung.';
  end if;
  if changing_protected then
    raise exception 'Dieses Feld darf nicht geändert werden.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.protect_product_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_master() then
    return new;
  end if;

  if public.is_admin()
     and old.visible = true
     and new.visible = false
     and (to_jsonb(new) - 'visible' - 'updated_at') = (to_jsonb(old) - 'visible' - 'updated_at') then
    return new;
  end if;

  raise exception 'Admins dürfen Produkte ausschließlich ausblenden.';
end;
$$;

drop trigger if exists products_protect_fields on public.products;
create trigger products_protect_fields
  before update on public.products
  for each row execute function public.protect_product_fields();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Bewertungen
-- ------------------------------------------------------------
create or replace function public.prepare_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.is_blocked() then
    raise exception 'Dein Account ist gesperrt.';
  end if;
  new.user_id := auth.uid();
  new.status := 'pending';
  new.moderation_note := null;
  new.moderated_by := null;
  new.moderated_at := null;
  return new;
end;
$$;

drop trigger if exists reviews_prepare_insert on public.reviews;
create trigger reviews_prepare_insert
  before insert on public.reviews
  for each row execute function public.prepare_review_insert();

create or replace function public.prepare_review_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    if (to_jsonb(new) - 'status' - 'moderation_note' - 'moderated_by' - 'moderated_at' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'moderation_note' - 'moderated_by' - 'moderated_at' - 'updated_at') then
      raise exception 'Admins dürfen nur den Status einer Bewertung ändern.';
    end if;
    new.moderated_by := auth.uid();
    new.moderated_at := now();
    return new;
  end if;

  if old.user_id <> auth.uid() then
    raise exception 'Keine Berechtigung.';
  end if;
  if old.status <> 'pending' then
    raise exception 'Nur ausstehende Bewertungen können bearbeitet werden.';
  end if;
  if (to_jsonb(new) - 'rating' - 'content' - 'status' - 'moderated_by' - 'moderated_at' - 'moderation_note' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'rating' - 'content' - 'status' - 'moderated_by' - 'moderated_at' - 'moderation_note' - 'updated_at') then
    raise exception 'Diese Felder können nicht geändert werden.';
  end if;
  new.status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  return new;
end;
$$;

drop trigger if exists reviews_prepare_update on public.reviews;
create trigger reviews_prepare_update
  before update on public.reviews
  for each row execute function public.prepare_review_update();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create or replace function public.notify_review_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_title text;
  v_body text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'approved' then
    v_kind := 'success';
    v_title := 'Bewertung freigegeben';
    v_body := 'Deine Bewertung ist jetzt öffentlich sichtbar.';
  elsif new.status = 'rejected' then
    v_kind := 'warning';
    v_title := 'Bewertung abgelehnt';
    v_body := 'Deine Bewertung wurde nicht freigegeben.';
  elsif new.status = 'hidden' then
    v_kind := 'warning';
    v_title := 'Bewertung ausgeblendet';
    v_body := 'Deine Bewertung ist derzeit nicht öffentlich sichtbar.';
  else
    return new;
  end if;

  insert into public.notifications (user_id, title, body, kind, link)
  values (new.user_id, v_title, v_body, v_kind, 'reviews.html');
  return new;
end;
$$;

drop trigger if exists reviews_notify_status on public.reviews;
create trigger reviews_notify_status
  after update of status on public.reviews
  for each row execute function public.notify_review_status_change();

-- ------------------------------------------------------------
-- Produktvorschläge
-- ------------------------------------------------------------
create or replace function public.prepare_suggestion_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.is_blocked() then
    raise exception 'Dein Account ist gesperrt.';
  end if;
  new.user_id := auth.uid();
  new.status := 'pending';
  new.admin_note := null;
  new.moderated_by := null;
  new.moderated_at := null;
  return new;
end;
$$;

drop trigger if exists suggestions_prepare_insert on public.product_suggestions;
create trigger suggestions_prepare_insert
  before insert on public.product_suggestions
  for each row execute function public.prepare_suggestion_insert();

create or replace function public.prepare_suggestion_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    if (to_jsonb(new) - 'status' - 'admin_note' - 'moderated_by' - 'moderated_at' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'admin_note' - 'moderated_by' - 'moderated_at' - 'updated_at') then
      raise exception 'Admins dürfen nur den Status eines Vorschlags ändern.';
    end if;
    new.moderated_by := auth.uid();
    new.moderated_at := now();
    return new;
  end if;

  if old.user_id <> auth.uid() then
    raise exception 'Keine Berechtigung.';
  end if;
  if old.status <> 'pending' then
    raise exception 'Nur ausstehende Vorschläge können bearbeitet werden.';
  end if;
  if (to_jsonb(new) - 'name' - 'description' - 'category' - 'link' - 'status' - 'admin_note' - 'moderated_by' - 'moderated_at' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'name' - 'description' - 'category' - 'link' - 'status' - 'admin_note' - 'moderated_by' - 'moderated_at' - 'updated_at') then
    raise exception 'Diese Felder können nicht geändert werden.';
  end if;
  new.status := 'pending';
  new.admin_note := null;
  new.moderated_by := null;
  new.moderated_at := null;
  return new;
end;
$$;

drop trigger if exists suggestions_prepare_update on public.product_suggestions;
create trigger suggestions_prepare_update
  before update on public.product_suggestions
  for each row execute function public.prepare_suggestion_update();

drop trigger if exists suggestions_set_updated_at on public.product_suggestions;
create trigger suggestions_set_updated_at
  before update on public.product_suggestions
  for each row execute function public.set_updated_at();

create or replace function public.notify_suggestion_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  insert into public.notifications (user_id, title, body, kind, link)
  values (
    new.user_id,
    case when new.status = 'approved' then 'Vorschlag angenommen' else 'Vorschlag geprüft' end,
    case when new.status = 'approved'
      then 'Dein Produktvorschlag wurde angenommen. Danke für deinen Input!'
      else 'Dein Produktvorschlag wurde leider nicht angenommen.' end,
    case when new.status = 'approved' then 'success' else 'warning' end,
    'reviews.html'
  );
  return new;
end;
$$;

drop trigger if exists suggestions_notify_status on public.product_suggestions;
create trigger suggestions_notify_status
  after update of status on public.product_suggestions
  for each row execute function public.notify_suggestion_status_change();

-- ------------------------------------------------------------
-- Käufe
-- ------------------------------------------------------------
create or replace function public.create_purchase(
  p_product_id uuid,
  p_roblox_username text default null,
  p_roblox_receipt text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.products%rowtype;
  v_amount numeric(12,2);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Bitte melde dich an.';
  end if;
  if public.is_blocked() then
    raise exception 'Dein Account ist gesperrt.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and visible = true;

  if not found then
    raise exception 'Produkt wurde nicht gefunden.';
  end if;
  if not v_product.for_sale then
    raise exception 'Dieses Produkt ist derzeit nicht im Verkauf.';
  end if;
  if v_product.purchase_type <> 'free' and v_product.price <= 0 then
    raise exception 'Für dieses Produkt ist kein Preis hinterlegt.';
  end if;

  if exists (
    select 1 from public.purchases
    where user_id = v_uid and product_id = p_product_id and status = 'pending'
  ) then
    raise exception 'Für dieses Produkt existiert bereits eine offene Bestellung.';
  end if;

  v_amount := case
    when v_product.purchase_type = 'free' then 0
    when v_product.on_sale then round(v_product.price * (1 - v_product.discount_percent::numeric / 100), 2)
    else v_product.price
  end;

  insert into public.purchases (
    user_id, product_id, product_name, amount, currency, purchase_type,
    status, roblox_username, roblox_receipt
  ) values (
    v_uid, v_product.id, v_product.name, v_amount, v_product.currency, v_product.purchase_type,
    'pending', nullif(trim(p_roblox_username), ''), nullif(trim(p_roblox_receipt), '')
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.protect_purchase_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_admin() then
    raise exception 'Keine Berechtigung.';
  end if;
  if (to_jsonb(new) - 'status' - 'admin_note' - 'role_granted_at' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'status' - 'admin_note' - 'role_granted_at' - 'updated_at') then
    raise exception 'Bestellungen dürfen nur im Status geändert werden.';
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_protect_update on public.purchases;
create trigger purchases_protect_update
  before update on public.purchases
  for each row execute function public.protect_purchase_update();

drop trigger if exists purchases_set_updated_at on public.purchases;
create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

create or replace function public.notify_purchase_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'confirmed' then
    insert into public.notifications (user_id, title, body, kind, link)
    values (new.user_id, 'Kauf bestätigt', 'Dein Kauf von „' || new.product_name || '“ wurde bestätigt. Die Discord-Rolle wird automatisch vergeben.', 'success', 'account.html');
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, title, body, kind, link)
    values (new.user_id, 'Kauf abgelehnt', 'Dein Kauf von „' || new.product_name || '“ konnte nicht bestätigt werden.', 'warning', 'account.html');
  elsif new.status = 'refunded' then
    insert into public.notifications (user_id, title, body, kind, link)
    values (new.user_id, 'Kauf erstattet', 'Dein Kauf von „' || new.product_name || '“ wurde als erstattet markiert.', 'info', 'account.html');
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_notify_status on public.purchases;
create trigger purchases_notify_status
  after update of status on public.purchases
  for each row execute function public.notify_purchase_status_change();

-- ------------------------------------------------------------
-- Discord-Verknüpfung (nur aus verifizierter OAuth-Identität)
-- ------------------------------------------------------------
create or replace function public.sync_discord_identity()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord_id text;
begin
  if auth.uid() is null then
    raise exception 'Bitte melde dich an.';
  end if;

  select provider_id into v_discord_id
  from auth.identities
  where user_id = auth.uid() and provider = 'discord'
  limit 1;

  if v_discord_id is null then
    return null;
  end if;

  perform set_config('rth.allow_discord_sync', '1', true);
  update public.profiles set discord_id = v_discord_id where id = auth.uid();
  return v_discord_id;
end;
$$;

-- ------------------------------------------------------------
-- Durchschnittsbewertung (nur freigegebene Bewertungen)
-- ------------------------------------------------------------
create or replace view public.product_ratings
with (security_invoker = true)
as
select
  product_id,
  round(avg(rating)::numeric, 2) as avg_rating,
  count(*)::integer as review_count
from public.reviews
where status = 'approved'
group by product_id;

-- ------------------------------------------------------------
-- Discord-Bot (nur Master Admin + Service Role)
-- ------------------------------------------------------------
create table if not exists public.bot_settings (
  id integer primary key default 1 check (id = 1),
  guild_id text,
  mod_log_channel_id text,
  welcome_channel_id text,
  mute_role_id text,
  mod_role_ids text[] not null default '{}',
  auto_role_ids text[] not null default '{}',
  welcome_enabled boolean not null default false,
  welcome_message text not null default 'Willkommen {user} auf {server}!',
  automod_enabled boolean not null default false,
  automod_invites boolean not null default true,
  automod_links boolean not null default false,
  automod_caps boolean not null default true,
  automod_spam boolean not null default true,
  automod_banned_words text[] not null default '{}',
  automod_action text not null default 'delete' check (automod_action in ('delete', 'timeout')),
  log_messages boolean not null default true,
  log_members boolean not null default true,
  log_moderation boolean not null default true,
  dm_on_action boolean not null default true,
  warn_timeout_at integer not null default 3 check (warn_timeout_at between 0 and 20),
  warn_ban_at integer not null default 0 check (warn_ban_at between 0 and 20),
  purchases_enabled boolean not null default true,
  bot_activity text not null default 'Ro-Tech Hub',
  disabled_commands text[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  user_id text not null,
  username text,
  moderator_id text,
  moderator_name text,
  reason text not null,
  active boolean not null default true,
  removed_at timestamptz,
  removed_by text,
  created_at timestamptz not null default now()
);

create index if not exists warnings_guild_user_idx on public.warnings (guild_id, user_id, active);
create index if not exists warnings_created_idx on public.warnings (created_at desc);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  guild_id text,
  action text not null,
  target_id text,
  target_name text,
  moderator_id text,
  moderator_name text,
  reason text,
  duration_seconds integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_created_idx on public.moderation_actions (created_at desc);

create table if not exists public.bot_heartbeat (
  id integer primary key default 1 check (id = 1),
  last_seen timestamptz,
  guild_name text,
  latency_ms integer,
  version text,
  updated_at timestamptz not null default now()
);

create table if not exists public.discord_role_jobs (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('create', 'delete')),
  product_id uuid,
  role_id text,
  role_name text,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'skipped', 'failed', 'cancelled')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists discord_role_jobs_pending_idx
  on public.discord_role_jobs (status, created_at) where (status = 'pending');

-- Produktrollen automatisch anlegen und beim Löschen aufräumen.
create or replace function public.enqueue_product_role_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.discord_role_id is null then
      insert into public.discord_role_jobs (action, product_id, role_name)
      values ('create', new.id, new.name);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    delete from public.discord_role_jobs
     where product_id = old.id and action = 'create' and status = 'pending';

    if old.discord_role_id is not null then
      insert into public.discord_role_jobs (action, product_id, role_id, role_name)
      values ('delete', old.id, old.discord_role_id, old.name);
    end if;
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists products_enqueue_role_create on public.products;
create trigger products_enqueue_role_create
  after insert on public.products
  for each row execute function public.enqueue_product_role_job();

drop trigger if exists products_enqueue_role_delete on public.products;
create trigger products_enqueue_role_delete
  before delete on public.products
  for each row execute function public.enqueue_product_role_job();

-- Auch bereits vorhandene Produkte ohne Rolle einmalig einspeisen.
insert into public.discord_role_jobs (action, product_id, role_name)
select 'create', p.id, p.name
from public.products p
where p.discord_role_id is null
  and not exists (
    select 1 from public.discord_role_jobs j
    where j.product_id = p.id and j.action = 'create' and j.status = 'pending'
  );

drop trigger if exists bot_settings_set_updated_at on public.bot_settings;
create trigger bot_settings_set_updated_at
  before update on public.bot_settings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.reviews enable row level security;
alter table public.product_suggestions enable row level security;
alter table public.purchases enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select
  using (visible = true or public.is_admin());

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (public.is_master());

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated
  using (public.is_master());

drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select
  using (
    status = 'approved'
    or public.is_admin()
    or (user_id = auth.uid() and status <> 'hidden')
  );

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and not public.is_blocked());

drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews
  for update to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status = 'pending'))
  with check (public.is_admin() or user_id = auth.uid());

drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews
  for delete to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status = 'pending'));

drop policy if exists suggestions_select on public.product_suggestions;
create policy suggestions_select on public.product_suggestions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists suggestions_insert on public.product_suggestions;
create policy suggestions_insert on public.product_suggestions
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and not public.is_blocked());

drop policy if exists suggestions_update on public.product_suggestions;
create policy suggestions_update on public.product_suggestions
  for update to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status = 'pending'))
  with check (public.is_admin() or user_id = auth.uid());

drop policy if exists suggestions_delete on public.product_suggestions;
create policy suggestions_delete on public.product_suggestions
  for delete to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status = 'pending'));

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists purchases_update on public.purchases;
create policy purchases_update on public.purchases
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    public.is_admin()
    or (is_active = true and (user_id is null or user_id = auth.uid()))
  );

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (public.is_master());

drop policy if exists notification_reads_select on public.notification_reads;
create policy notification_reads_select on public.notification_reads
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists notification_reads_insert on public.notification_reads;
create policy notification_reads_insert on public.notification_reads
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_reads_update on public.notification_reads;
create policy notification_reads_update on public.notification_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notification_reads_delete on public.notification_reads;
create policy notification_reads_delete on public.notification_reads
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions
  for select to authenticated
  using (public.is_admin());

drop policy if exists admin_actions_insert on public.admin_actions;
create policy admin_actions_insert on public.admin_actions
  for insert to authenticated
  with check (public.is_admin() and actor_id = auth.uid());

alter table public.bot_settings enable row level security;
alter table public.warnings enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.bot_heartbeat enable row level security;

drop policy if exists bot_settings_select on public.bot_settings;
create policy bot_settings_select on public.bot_settings
  for select to authenticated
  using (public.is_master());

drop policy if exists bot_settings_insert on public.bot_settings;
create policy bot_settings_insert on public.bot_settings
  for insert to authenticated
  with check (public.is_master());

drop policy if exists bot_settings_update on public.bot_settings;
create policy bot_settings_update on public.bot_settings
  for update to authenticated
  using (public.is_master())
  with check (public.is_master());

drop policy if exists warnings_select on public.warnings;
create policy warnings_select on public.warnings
  for select to authenticated
  using (public.is_master());

drop policy if exists warnings_update on public.warnings;
create policy warnings_update on public.warnings
  for update to authenticated
  using (public.is_master())
  with check (public.is_master());

drop policy if exists moderation_actions_select on public.moderation_actions;
create policy moderation_actions_select on public.moderation_actions
  for select to authenticated
  using (public.is_master());

drop policy if exists bot_heartbeat_select on public.bot_heartbeat;
create policy bot_heartbeat_select on public.bot_heartbeat
  for select to authenticated
  using (public.is_master());

alter table public.discord_role_jobs enable row level security;

drop policy if exists discord_role_jobs_select on public.discord_role_jobs;
create policy discord_role_jobs_select on public.discord_role_jobs
  for select to authenticated
  using (public.is_master());

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on public.products, public.product_ratings, public.reviews to anon;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant select, insert, update, delete on public.product_suggestions to authenticated;
grant select on public.purchases to authenticated;
grant update on public.purchases to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_reads to authenticated;
grant select, insert on public.admin_actions to authenticated;
grant select, insert, update, delete on public.bot_settings to authenticated;
grant select, update on public.warnings to authenticated;
grant select on public.moderation_actions to authenticated;
grant select on public.bot_heartbeat to authenticated;
grant select on public.discord_role_jobs to authenticated;

revoke insert, delete on public.purchases from anon, authenticated;
grant execute on function public.create_purchase(uuid, text, text) to authenticated;
grant execute on function public.sync_discord_identity() to authenticated;

grant all on public.profiles, public.products, public.reviews, public.product_suggestions,
  public.purchases, public.notifications, public.notification_reads, public.admin_actions,
  public.bot_settings, public.warnings, public.moderation_actions, public.bot_heartbeat,
  public.discord_role_jobs
  to service_role;

-- ------------------------------------------------------------
-- Storage-Bucket für Produktbilder
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_master_insert" on storage.objects;
create policy "product_images_master_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_master());

drop policy if exists "product_images_master_update" on storage.objects;
create policy "product_images_master_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_master())
  with check (bucket_id = 'product-images' and public.is_master());

drop policy if exists "product_images_master_delete" on storage.objects;
create policy "product_images_master_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_master());
