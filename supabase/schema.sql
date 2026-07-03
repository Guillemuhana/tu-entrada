-- ============================================================
-- TU ENTRADA — Schema de base de datos (Supabase / Postgres)
-- ============================================================
-- Ejecutar completo en el SQL Editor de Supabase (una sola vez).

-- Extensión para generar UUIDs / tokens
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PERFILES (rol de cada usuario autenticado: admin | validador)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'validador' check (role in ('admin', 'validador')),
  created_at timestamptz not null default now()
);

-- Cuando se crea un usuario nuevo en auth.users, le creamos su perfil automáticamente
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'validador')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. EVENTOS
-- ------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  event_date timestamptz,
  location text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. INVITADOS / ENTRADAS
-- ------------------------------------------------------------
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  ticket_type text not null default 'General',
  -- código único que va codificado en el QR (no es el id, para no exponer la PK)
  code text not null unique default encode(gen_random_bytes(12), 'hex'),
  status text not null default 'pendiente' check (status in ('pendiente', 'ingresado', 'anulado')),
  checked_in_at timestamptz,
  checked_in_by uuid references profiles(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_guests_event on guests(event_id);
create index if not exists idx_guests_code on guests(code);

-- Distingue invitados nominados (con nombre real) de entradas genéricas generadas
-- en lote (ej: "General #1", "General #2"...) sin datos de contacto asociados.
alter table guests add column if not exists is_generic boolean not null default false;

-- ------------------------------------------------------------
-- 4. LOG DE ESCANEOS (auditoría — queda registro de cada intento)
-- ------------------------------------------------------------
create table if not exists scan_logs (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references guests(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  code_scanned text not null,
  result text not null check (result in ('aprobado', 'rechazado_duplicado', 'rechazado_invalido', 'rechazado_anulado')),
  scanned_by uuid references profiles(id),
  scanned_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table events enable row level security;
alter table guests enable row level security;
alter table scan_logs enable row level security;

-- Helper: ¿el usuario autenticado es admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---- PROFILES ----
drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin" on profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles
  for update using (public.is_admin());

-- ---- EVENTS ----
-- Cualquier usuario autenticado (admin o validador) puede ver los eventos
drop policy if exists "events_select_authenticated" on events;
create policy "events_select_authenticated" on events
  for select using (auth.role() = 'authenticated');

-- Solo admin crea / edita / borra eventos
drop policy if exists "events_write_admin" on events;
create policy "events_write_admin" on events
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- GUESTS ----
-- El público (anon) puede ver SOLO los campos de su propia entrada buscando por code
-- (se filtra desde el cliente por "code=eq.xxx"; no exponemos listados completos a anon)
drop policy if exists "guests_select_public_by_code" on guests;
create policy "guests_select_public_by_code" on guests
  for select using (true);

-- Admin: alta / edición / borrado de invitados
drop policy if exists "guests_write_admin" on guests;
create policy "guests_write_admin" on guests
  for insert with check (public.is_admin());

drop policy if exists "guests_update_admin" on guests;
create policy "guests_update_admin" on guests
  for update using (public.is_admin());

drop policy if exists "guests_delete_admin" on guests;
create policy "guests_delete_admin" on guests
  for delete using (public.is_admin());

-- Validador: puede marcar como ingresado (update de status) — acotado por RLS,
-- y la lógica fina de negocio la resuelve la función validar_entrada() más abajo.
drop policy if exists "guests_checkin_validador" on guests;
create policy "guests_checkin_validador" on guests
  for update using (
    auth.role() = 'authenticated'
  ) with check (
    auth.role() = 'authenticated'
  );

-- ---- SCAN LOGS ----
drop policy if exists "scan_logs_select_authenticated" on scan_logs;
create policy "scan_logs_select_authenticated" on scan_logs
  for select using (auth.role() = 'authenticated');

drop policy if exists "scan_logs_insert_authenticated" on scan_logs;
create policy "scan_logs_insert_authenticated" on scan_logs
  for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- FUNCIÓN RPC: validar_entrada
-- Hace todo el check-in de forma atómica (evita condiciones de carrera
-- si dos validadores escanean el mismo QR casi al mismo tiempo).
-- ============================================================
create or replace function public.validar_entrada(p_code text)
returns table (
  resultado text,
  guest_id uuid,
  full_name text,
  ticket_type text,
  status text,
  checked_in_at timestamptz,
  event_name text
) as $$
declare
  v_guest guests%rowtype;
  v_event_name text;
begin
  select * into v_guest from guests where code = p_code for update;

  if not found then
    insert into scan_logs (code_scanned, result, scanned_by)
    values (p_code, 'rechazado_invalido', auth.uid());
    return query select 'invalido'::text, null::uuid, null::text, null::text, null::text, null::timestamptz, null::text;
    return;
  end if;

  select name into v_event_name from events where id = v_guest.event_id;

  if v_guest.status = 'anulado' then
    insert into scan_logs (guest_id, event_id, code_scanned, result, scanned_by)
    values (v_guest.id, v_guest.event_id, p_code, 'rechazado_anulado', auth.uid());
    return query select 'anulado'::text, v_guest.id, v_guest.full_name, v_guest.ticket_type, v_guest.status, v_guest.checked_in_at, v_event_name;
    return;
  end if;

  if v_guest.status = 'ingresado' then
    insert into scan_logs (guest_id, event_id, code_scanned, result, scanned_by)
    values (v_guest.id, v_guest.event_id, p_code, 'rechazado_duplicado', auth.uid());
    return query select 'duplicado'::text, v_guest.id, v_guest.full_name, v_guest.ticket_type, v_guest.status, v_guest.checked_in_at, v_event_name;
    return;
  end if;

  update guests
  set status = 'ingresado', checked_in_at = now(), checked_in_by = auth.uid()
  where id = v_guest.id;

  insert into scan_logs (guest_id, event_id, code_scanned, result, scanned_by)
  values (v_guest.id, v_guest.event_id, p_code, 'aprobado', auth.uid());

  return query select 'aprobado'::text, v_guest.id, v_guest.full_name, v_guest.ticket_type, 'ingresado'::text, now(), v_event_name;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Cómo crear tu primer usuario ADMIN:
-- 1. Andá a Authentication > Users en el dashboard de Supabase y creá un usuario
--    (o registrate desde la pantalla de login de la app, queda como "validador" por defecto).
-- 2. Corré esto una vez, reemplazando el email:
--
--    update profiles set role = 'admin' where email = 'tu-email@dominio.com';
-- ============================================================
