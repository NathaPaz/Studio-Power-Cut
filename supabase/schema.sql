-- =====================================================================
-- Studio Power Cut: esquema do banco de dados (Supabase / Postgres)
--
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar mais de uma vez: os comandos são idempotentes, e os dados
-- iniciais só entram se o banco ainda não tiver configuração.
--
-- Modelo de acesso
--   Cliente (sem login)  lê a vitrine (perfil, serviços, produtos...),
--                        vê só quais horários estão ocupados e cria um
--                        agendamento pela função create_booking().
--                        Não consegue ler nome nem telefone de ninguém.
--   Dono (com login)     lê e altera tudo: agenda, clientes, vitrine.
-- =====================================================================

-- ---------- tabelas ----------

-- Vitrine inteira em um documento só: perfil, horários, serviços, equipe,
-- produtos, cursos e novidades. É conteúdo público, editado pelo dono.
create table if not exists public.shop_config (
  id         int primary key default 1 check (id = 1),
  config     jsonb not null,
  updated_at timestamptz not null default now()
);

-- Quem pode administrar. Um usuário do Supabase Auth vira dono ao entrar aqui.
create table if not exists public.owners (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.bookings (
  id         uuid primary key default gen_random_uuid(),
  barber_id  text    not null,
  day        date    not null,
  start_min  int     not null check (start_min between 0 and 1439),
  dur_min    int     not null check (dur_min between 5 and 600),
  services   jsonb   not null default '[]'::jsonb,
  total      numeric(10,2) not null default 0,
  name       text    not null default '',
  phone      text    not null default '',
  status     text    not null check (status in ('confirmado','concluido','faltou','cancelado','bloqueio')),
  source     text    not null default 'link' check (source in ('link','manual')),
  created_at timestamptz not null default now()
);
create index if not exists bookings_day_idx on public.bookings (day, barber_id);

-- Colunas novas de agendamentos (pagamento, cancelamento pelo cliente, observação).
alter table public.bookings
  add column if not exists paid_method    text check (paid_method in ('dinheiro','pix','debito','credito')),
  add column if not exists paid_total     numeric(10,2),
  add column if not exists commission_pct numeric(5,2),
  add column if not exists cancel_token   text,
  add column if not exists note           text not null default '',
  add column if not exists overbook       boolean not null default false;
create unique index if not exists bookings_cancel_token_idx on public.bookings (cancel_token) where cancel_token is not null;

-- Folgas, férias, feriados e dias com horário especial. barber_id nulo = a loja toda.
-- kind 'especial' usa "intervals" (ex.: [["10:00","14:00"]]); os demais fecham o dia.
create table if not exists public.time_off (
  id         uuid primary key default gen_random_uuid(),
  barber_id  text,
  day_from   date not null,
  day_to     date not null,
  kind       text not null check (kind in ('folga','ferias','feriado','especial')),
  intervals  jsonb not null default '[]'::jsonb,
  reason     text not null default '',
  created_at timestamptz not null default now(),
  check (day_to >= day_from)
);
create index if not exists time_off_days_idx on public.time_off (day_from, day_to);

-- Dinheiro: só o dono enxerga (nada disso entra na vitrine pública).
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  category   text not null default 'Outros',
  amount     numeric(10,2) not null check (amount >= 0),
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists expenses_day_idx on public.expenses (day);

create table if not exists public.barber_finance (
  barber_id      text primary key,
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100)
);

create table if not exists public.owner_settings (
  id           int primary key default 1 check (id = 1),
  monthly_goal numeric(12,2) not null default 0
);
insert into public.owner_settings (id) values (1) on conflict (id) do nothing;

-- ---------- funções auxiliares ----------

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.owners where user_id = auth.uid());
$$;

create or replace function public.touch_shop_config()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists shop_config_touch on public.shop_config;
create trigger shop_config_touch before update on public.shop_config
  for each row execute function public.touch_shop_config();

-- Expediente de um barbeiro em um dia: folga/férias/feriado fecham; "especial"
-- troca o horário; senão vale o horário próprio do barbeiro ou, na falta dele,
-- o da loja. É a regra única usada pelo servidor ao aceitar um agendamento.
create or replace function public._hours_for(cfg jsonb, p_barber text, p_day date)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  dow int := extract(dow from p_day)::int;  -- 0 = domingo, igual ao JavaScript
  e   record;
  sp  jsonb := null;
  gen jsonb := null;
  bh  jsonb;
begin
  for e in
    select t.kind, t.barber_id, t.intervals from public.time_off t
    where p_day between t.day_from and t.day_to and (t.barber_id is null or t.barber_id = p_barber)
    order by t.created_at
  loop
    if e.kind <> 'especial' then return '[]'::jsonb; end if;
    if e.barber_id is not null then sp := e.intervals; else gen := coalesce(gen, e.intervals); end if;
  end loop;
  if sp  is not null then return sp;  end if;
  if gen is not null then return gen; end if;
  select b->'hours'->(dow::text) into bh
  from jsonb_array_elements(coalesce(cfg->'barbers', '[]'::jsonb)) b
  where b->>'id' = p_barber;
  if bh is not null and jsonb_typeof(bh) = 'array' then return bh; end if;
  return coalesce(cfg->'hours'->(dow::text), '[]'::jsonb);
end;
$$;

-- Devolve null se o horário serve para o barbeiro, ou o motivo (bad_hours / slot_taken).
-- Depois de cada atendimento vale o intervalo "bufferMin" da configuração.
create or replace function public._barber_slot(cfg jsonb, p_barber text, p_day date, p_start int, p_dur int)
returns text
language plpgsql stable
set search_path = public
as $$
declare
  iv  jsonb;
  ok  boolean := false;
  buf int := coalesce((cfg->>'bufferMin')::int, 0);
begin
  for iv in select * from jsonb_array_elements(public._hours_for(cfg, p_barber, p_day)) loop
    if p_start >= split_part(iv->>0, ':', 1)::int * 60 + split_part(iv->>0, ':', 2)::int
       and p_start + p_dur <= split_part(iv->>1, ':', 1)::int * 60 + split_part(iv->>1, ':', 2)::int then
      ok := true;
    end if;
  end loop;
  if not ok then return 'bad_hours'; end if;
  if exists (
    select 1 from public.bookings b
    where b.barber_id = p_barber and b.day = p_day
      and b.status in ('confirmado','concluido','bloqueio')
      and p_start < b.start_min + b.dur_min + (case when b.status = 'bloqueio' then 0 else buf end)
      and b.start_min < p_start + p_dur + (case when b.status = 'bloqueio' then 0 else buf end)
  ) then return 'slot_taken'; end if;
  return null;
end;
$$;

-- Horários ocupados, sem nenhum dado pessoal. É o que o cliente enxerga.
-- blk = true quando é bloqueio do dono (não leva intervalo depois).
drop function if exists public.get_busy(date, date);
create function public.get_busy(p_from date, p_to date)
returns table (barber_id text, day date, start_min int, dur_min int, blk boolean)
language sql stable security definer
set search_path = public
as $$
  select b.barber_id, b.day, b.start_min, b.dur_min, (b.status = 'bloqueio')
  from public.bookings b
  where b.day between p_from and least(p_to, p_from + 60)
    and b.status in ('confirmado','concluido','bloqueio');
$$;

-- Folgas e dias especiais do período, sem o motivo.
create or replace function public.get_exceptions(p_from date, p_to date)
returns table (barber_id text, day_from date, day_to date, kind text, intervals jsonb)
language sql stable security definer
set search_path = public
as $$
  select t.barber_id, t.day_from, t.day_to, t.kind, t.intervals
  from public.time_off t
  where t.day_to >= p_from and t.day_from <= least(p_to, p_from + 60);
$$;

-- Criação de agendamento pelo cliente. Tudo é conferido aqui no servidor:
-- preço e duração vêm da vitrine (o cliente não consegue alterar), o horário
-- precisa estar no expediente do barbeiro (com folgas) e livre. Com p_barber
-- 'any', o servidor escolhe quem tem o horário livre e menos atendimentos no dia.
create or replace function public.create_booking(
  p_barber      text,
  p_day         date,
  p_start       int,
  p_service_ids text[],
  p_name        text,
  p_phone       text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  cfg      jsonb;
  today    date;
  now_min  int;
  digits   text;
  dur      int := 0;
  total    numeric := 0;
  picked   int := 0;
  wanted   int;
  names    jsonb := '[]'::jsonb;
  svc      jsonb;
  futuros  int;
  new_id   uuid;
  tok      text;
  chosen   text := null;
  cand     text;
  code     text;
  first_code text := null;
begin
  select config into cfg from public.shop_config where id = 1;
  if cfg is null then raise exception 'not_configured'; end if;

  today   := (now() at time zone 'America/Sao_Paulo')::date;
  now_min := (extract(hour   from now() at time zone 'America/Sao_Paulo') * 60
            + extract(minute from now() at time zone 'America/Sao_Paulo'))::int;

  if p_day is null or p_day < today or p_day > today + 60 then raise exception 'bad_date'; end if;
  if p_start is null or p_start < 0 or p_start > 1439 or p_start % 5 <> 0 then raise exception 'bad_time'; end if;
  if p_day = today and p_start <= now_min + coalesce((cfg->>'leadMin')::int, 0) then raise exception 'bad_time'; end if;

  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 80 then raise exception 'bad_name'; end if;

  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(digits) < 10 or char_length(digits) > 13 then raise exception 'bad_phone'; end if;

  select count(distinct x) into wanted from unnest(coalesce(p_service_ids, array[]::text[])) x;
  if wanted = 0 or wanted > 10 then raise exception 'bad_services'; end if;
  for svc in
    select s from jsonb_array_elements(coalesce(cfg->'services', '[]'::jsonb)) s
    where s->>'id' = any (p_service_ids)
  loop
    picked := picked + 1;
    dur    := dur + (svc->>'min')::int;
    total  := total + (svc->>'price')::numeric;
    names  := names || jsonb_build_array(jsonb_build_object('id', svc->>'id', 'name', svc->>'name', 'price', (svc->>'price')::numeric));
  end loop;
  if picked <> wanted then raise exception 'bad_services'; end if;

  -- evita dois clientes pegarem o mesmo horário ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('bk:' || p_day::text));

  if p_barber is null or p_barber in ('', 'any') then
    for cand in
      select b->>'id' from jsonb_array_elements(coalesce(cfg->'barbers', '[]'::jsonb)) b
      order by (select count(*) from public.bookings k
                where k.barber_id = b->>'id' and k.day = p_day and k.status in ('confirmado','concluido')), b->>'id'
    loop
      code := public._barber_slot(cfg, cand, p_day, p_start, dur);
      if code is null then chosen := cand; exit; end if;
      if first_code is null or code = 'slot_taken' then first_code := code; end if;
    end loop;
    if chosen is null then raise exception '%', coalesce(first_code, 'bad_barber'); end if;
  else
    if not exists (
      select 1 from jsonb_array_elements(coalesce(cfg->'barbers', '[]'::jsonb)) b where b->>'id' = p_barber
    ) then raise exception 'bad_barber'; end if;
    code := public._barber_slot(cfg, p_barber, p_day, p_start, dur);
    if code is not null then raise exception '%', code; end if;
    chosen := p_barber;
  end if;

  -- freio simples contra abuso: no máximo 3 horários futuros por telefone
  select count(*) into futuros from public.bookings b
  where b.status = 'confirmado' and b.day >= today
    and regexp_replace(b.phone, '\D', '', 'g') = digits;
  if futuros >= 3 then raise exception 'too_many'; end if;

  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.bookings (barber_id, day, start_min, dur_min, services, total, name, phone, status, source, cancel_token)
  values (chosen, p_day, p_start, dur, names, total, p_name, btrim(p_phone), 'confirmado', 'link', tok)
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'barber', chosen, 'dur', dur, 'total', total, 'services', names, 'token', tok);
end;
$$;

-- Cliente vê e cancela o próprio horário pelo link secreto (token de 64 caracteres).
create or replace function public.get_my_booking(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  b   public.bookings;
  cfg jsonb;
  hrs int;
begin
  if p_token is null or char_length(p_token) <> 64 then return null; end if;
  select * into b from public.bookings where cancel_token = p_token;
  if not found then return null; end if;
  select config into cfg from public.shop_config where id = 1;
  hrs := coalesce((cfg->>'cancelHours')::int, 2);
  return jsonb_build_object(
    'barber', b.barber_id, 'day', b.day, 'start', b.start_min, 'dur', b.dur_min,
    'services', b.services, 'total', b.total, 'name', b.name, 'status', b.status,
    'cancel_hours', hrs,
    'can_cancel', b.status = 'confirmado'
      and ((b.day + make_interval(mins => b.start_min)) at time zone 'America/Sao_Paulo') - now() >= make_interval(hours => hrs));
end;
$$;

create or replace function public.cancel_my_booking(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  b   public.bookings;
  cfg jsonb;
  hrs int;
begin
  if p_token is null or char_length(p_token) <> 64 then raise exception 'not_found'; end if;
  select * into b from public.bookings where cancel_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if b.status <> 'confirmado' then raise exception 'not_cancellable'; end if;
  select config into cfg from public.shop_config where id = 1;
  hrs := coalesce((cfg->>'cancelHours')::int, 2);
  if ((b.day + make_interval(mins => b.start_min)) at time zone 'America/Sao_Paulo') - now() < make_interval(hours => hrs) then
    raise exception 'too_late';
  end if;
  update public.bookings set status = 'cancelado' where id = b.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- permissões ----------

revoke all on function public.is_owner()                                          from public;
revoke all on function public.get_busy(date, date)                                from public;
revoke all on function public.get_exceptions(date, date)                          from public;
revoke all on function public.create_booking(text, date, int, text[], text, text) from public;
revoke all on function public.get_my_booking(text)                                from public;
revoke all on function public.cancel_my_booking(text)                             from public;
revoke all on function public._hours_for(jsonb, text, date)                       from public;
revoke all on function public._barber_slot(jsonb, text, date, int, int)           from public;
grant execute on function public.is_owner()                                          to anon, authenticated;
grant execute on function public.get_busy(date, date)                                to anon, authenticated;
grant execute on function public.get_exceptions(date, date)                          to anon, authenticated;
grant execute on function public.create_booking(text, date, int, text[], text, text) to anon, authenticated;
grant execute on function public.get_my_booking(text)                                to anon, authenticated;
grant execute on function public.cancel_my_booking(text)                             to anon, authenticated;
-- _hours_for e _barber_slot são internas: só as funções acima (security definer) as chamam.
-- No Supabase, funções novas já nascem liberadas para anon/authenticated, então tiramos de forma explícita.
revoke all on function public._hours_for(jsonb, text, date)             from anon, authenticated;
revoke all on function public._barber_slot(jsonb, text, date, int, int) from anon, authenticated;

alter table public.shop_config    enable row level security;
alter table public.owners         enable row level security;
alter table public.bookings       enable row level security;
alter table public.time_off       enable row level security;
alter table public.expenses       enable row level security;
alter table public.barber_finance enable row level security;
alter table public.owner_settings enable row level security;

drop policy if exists config_read  on public.shop_config;
drop policy if exists config_write on public.shop_config;
drop policy if exists config_edit  on public.shop_config;
create policy config_read  on public.shop_config for select to anon, authenticated using (true);
create policy config_write on public.shop_config for insert to authenticated with check (public.is_owner());
create policy config_edit  on public.shop_config for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- owners: sem nenhuma policy, ninguém lê pela API. Só o SQL Editor mexe aqui.

drop policy if exists bookings_owner on public.bookings;
create policy bookings_owner on public.bookings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Agenda e dinheiro: somente o dono (nenhuma policy para anon).
drop policy if exists time_off_owner on public.time_off;
create policy time_off_owner on public.time_off for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists expenses_owner on public.expenses;
create policy expenses_owner on public.expenses for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists barber_finance_owner on public.barber_finance;
create policy barber_finance_owner on public.barber_finance for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists owner_settings_owner on public.owner_settings;
create policy owner_settings_owner on public.owner_settings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------- fotos (Storage) ----------

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_owner_insert on storage.objects;
drop policy if exists media_owner_update on storage.objects;
drop policy if exists media_owner_delete on storage.objects;
create policy media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_owner());
create policy media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_owner()) with check (bucket_id = 'media' and public.is_owner());
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_owner());

-- ---------- dados iniciais do Studio Power Cut ----------
-- As imagens apontam para a pasta site/assets do projeto. Quando o dono troca
-- uma foto pelo painel, o endereço passa a ser o do Storage.

insert into public.shop_config (id, config)
values (1, $cfg${
 "slug": "studio-power-cut",
 "name": "Studio Power Cut",
 "tagline": "Barbearia Premium. Corte, barba e experiência completa.",
 "city": "Porto Alegre, RS",
 "address": "Rua Dona Firmina, 528",
 "whatsapp": "(51) 98194-5319",
 "instagram": "@studiopowercut",
 "brand": "#946d12",
 "hero": "#111111",
 "logo": "assets/logo.jpg",
 "cover": "assets/cover.jpg",
 "priceNote": "O preço pode variar conforme a data escolhida.",
 "hours": {
  "0": [
   [
    "09:00",
    "12:00"
   ]
  ],
  "1": [
   [
    "09:00",
    "12:00"
   ],
   [
    "14:00",
    "21:00"
   ]
  ],
  "2": [
   [
    "09:00",
    "12:00"
   ],
   [
    "14:00",
    "21:00"
   ]
  ],
  "3": [
   [
    "09:00",
    "12:00"
   ],
   [
    "14:00",
    "18:30"
   ]
  ],
  "4": [
   [
    "09:00",
    "12:00"
   ],
   [
    "14:00",
    "18:30"
   ]
  ],
  "5": [
   [
    "09:00",
    "12:00"
   ],
   [
    "13:00",
    "22:00"
   ]
  ],
  "6": [
   [
    "08:00",
    "12:00"
   ],
   [
    "13:00",
    "22:00"
   ]
  ]
 },
 "services": [
  {
   "id": "v1",
   "name": "Barba",
   "price": 20,
   "min": 20
  },
  {
   "id": "v2",
   "name": "Corte",
   "price": 40,
   "min": 30
  },
  {
   "id": "v3",
   "name": "Corte + barba",
   "price": 60,
   "min": 45
  },
  {
   "id": "v4",
   "name": "Corte + barba + sobrancelha",
   "price": 70,
   "min": 60
  },
  {
   "id": "v5",
   "name": "Corte + luzes",
   "price": 120,
   "min": 120
  },
  {
   "id": "v6",
   "name": "Corte + pigmentação",
   "price": 70,
   "min": 40
  },
  {
   "id": "v7",
   "name": "Corte + pigmentação + sobrancelha",
   "price": 80,
   "min": 45
  },
  {
   "id": "v8",
   "name": "Corte + sobrancelha",
   "price": 50,
   "min": 40
  }
 ],
 "barbers": [
  {
   "id": "b1",
   "name": "Miguel",
   "nick": "Neves",
   "photo": "assets/miguel.jpg"
  },
  {
   "id": "b2",
   "name": "Vitor Teixeira",
   "nick": "Vitinho",
   "photo": "assets/vitor.jpg"
  }
 ],
 "products": [
  {
   "id": "p1",
   "name": "Balm hidratante",
   "price": 32,
   "desc": "Hidrata pele, barba, bigode e cabelo.",
   "img": "assets/balm.jpg",
   "on": true
  },
  {
   "id": "p2",
   "name": "Cera black 120g",
   "price": 26,
   "desc": "",
   "img": "assets/black.jpg",
   "on": true
  },
  {
   "id": "p3",
   "name": "Cera brilho 120g",
   "price": 26,
   "desc": "",
   "img": "assets/brilho.jpg",
   "on": true
  },
  {
   "id": "p4",
   "name": "Cera modeladora - morango",
   "price": 26,
   "desc": "",
   "img": "assets/morango.jpg",
   "on": true
  },
  {
   "id": "p5",
   "name": "Cera modeladora - uva",
   "price": 26,
   "desc": "",
   "img": "assets/uva.jpg",
   "on": true
  },
  {
   "id": "p6",
   "name": "Esponja",
   "price": 40,
   "desc": "",
   "img": "assets/esponja.jpg",
   "on": true
  },
  {
   "id": "p7",
   "name": "Gel cola 300g",
   "price": 24,
   "desc": "Fixação extra forte, sem álcool.",
   "img": "assets/gel.jpg",
   "on": true
  },
  {
   "id": "p8",
   "name": "Pós barba 120ml",
   "price": 32,
   "desc": "",
   "img": "assets/posbarba.jpg",
   "on": true
  }
 ],
 "courses": [
  {
   "id": "c1",
   "name": "Curso Studio Power Cut",
   "price": 0,
   "info": "",
   "desc": "Fale com a gente pelo WhatsApp para saber datas, conteúdo e valores.",
   "video": "",
   "img": ""
  }
 ],
 "news": [
  {
   "id": "n1",
   "date": "2026-03-24",
   "title": "Assinatura mensal",
   "text": "Se você corta o cabelo toda semana ou de 15 em 15 dias, não faz sentido pagar avulso. Cabelo, barba e sobrancelha por R$ 179,99 (de R$ 280) ou só o corte por R$ 134,99 (de R$ 160). Chame no WhatsApp para saber como funciona.",
   "img": "assets/plano.jpg"
  }
 ]
}$cfg$::jsonb)
on conflict (id) do nothing;

-- =====================================================================
-- DEPOIS DE RODAR ESTE ARQUIVO, cadastre o dono (veja o README, passo 3):
--   1) Authentication > Users > Add user (e-mail e senha do dono)
--   2) rode no SQL Editor:
--        insert into public.owners (user_id)
--        select id from auth.users where email = 'EMAIL_DO_DONO';
-- =====================================================================
