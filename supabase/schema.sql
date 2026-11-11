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

-- Horários ocupados, sem nenhum dado pessoal. É o que o cliente enxerga.
create or replace function public.get_busy(p_from date, p_to date)
returns table (barber_id text, day date, start_min int, dur_min int)
language sql stable security definer
set search_path = public
as $$
  select b.barber_id, b.day, b.start_min, b.dur_min
  from public.bookings b
  where b.day between p_from and least(p_to, p_from + 60)
    and b.status in ('confirmado','concluido','bloqueio');
$$;

-- Criação de agendamento pelo cliente. Tudo é conferido aqui no servidor:
-- preço e duração vêm da vitrine (o cliente não consegue alterar), o horário
-- precisa estar dentro do expediente e livre para o barbeiro escolhido.
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
  dow      int;
  digits   text;
  dur      int := 0;
  total    numeric := 0;
  picked   int := 0;
  wanted   int;
  names    jsonb := '[]'::jsonb;
  svc      jsonb;
  iv       jsonb;
  in_hours boolean := false;
  futuros  int;
  new_id   uuid;
begin
  select config into cfg from public.shop_config where id = 1;
  if cfg is null then raise exception 'not_configured'; end if;

  today   := (now() at time zone 'America/Sao_Paulo')::date;
  now_min := (extract(hour   from now() at time zone 'America/Sao_Paulo') * 60
            + extract(minute from now() at time zone 'America/Sao_Paulo'))::int;

  if p_day is null or p_day < today or p_day > today + 60 then raise exception 'bad_date'; end if;
  if p_start is null or p_start < 0 or p_start > 1439 or p_start % 5 <> 0 then raise exception 'bad_time'; end if;
  if p_day = today and p_start <= now_min then raise exception 'bad_time'; end if;

  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 80 then raise exception 'bad_name'; end if;

  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(digits) < 10 or char_length(digits) > 13 then raise exception 'bad_phone'; end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(cfg->'barbers', '[]'::jsonb)) b
    where b->>'id' = p_barber
  ) then raise exception 'bad_barber'; end if;

  select count(distinct x) into wanted from unnest(coalesce(p_service_ids, array[]::text[])) x;
  if wanted = 0 or wanted > 10 then raise exception 'bad_services'; end if;
  for svc in
    select s from jsonb_array_elements(coalesce(cfg->'services', '[]'::jsonb)) s
    where s->>'id' = any (p_service_ids)
  loop
    picked := picked + 1;
    dur    := dur + (svc->>'min')::int;
    total  := total + (svc->>'price')::numeric;
    names  := names || jsonb_build_array(jsonb_build_object('name', svc->>'name', 'price', (svc->>'price')::numeric));
  end loop;
  if picked <> wanted then raise exception 'bad_services'; end if;

  dow := extract(dow from p_day)::int;  -- 0 = domingo, igual ao JavaScript
  for iv in select * from jsonb_array_elements(coalesce(cfg->'hours'->(dow::text), '[]'::jsonb)) loop
    if p_start >= split_part(iv->>0, ':', 1)::int * 60 + split_part(iv->>0, ':', 2)::int
       and p_start + dur <= split_part(iv->>1, ':', 1)::int * 60 + split_part(iv->>1, ':', 2)::int then
      in_hours := true;
    end if;
  end loop;
  if not in_hours then raise exception 'bad_hours'; end if;

  -- evita dois clientes pegarem o mesmo horário ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('bk:' || p_barber || ':' || p_day::text));

  if exists (
    select 1 from public.bookings b
    where b.barber_id = p_barber and b.day = p_day
      and b.status in ('confirmado','concluido','bloqueio')
      and p_start < b.start_min + b.dur_min and b.start_min < p_start + dur
  ) then raise exception 'slot_taken'; end if;

  -- freio simples contra abuso: no máximo 3 horários futuros por telefone
  select count(*) into futuros from public.bookings b
  where b.status = 'confirmado' and b.day >= today
    and regexp_replace(b.phone, '\D', '', 'g') = digits;
  if futuros >= 3 then raise exception 'too_many'; end if;

  insert into public.bookings (barber_id, day, start_min, dur_min, services, total, name, phone, status, source)
  values (p_barber, p_day, p_start, dur, names, total, p_name, btrim(p_phone), 'confirmado', 'link')
  returning id into new_id;

  return jsonb_build_object('id', new_id, 'dur', dur, 'total', total, 'services', names);
end;
$$;

-- ---------- permissões ----------

revoke all on function public.is_owner()                                          from public;
revoke all on function public.get_busy(date, date)                                from public;
revoke all on function public.create_booking(text, date, int, text[], text, text) from public;
grant execute on function public.is_owner()                                          to anon, authenticated;
grant execute on function public.get_busy(date, date)                                to anon, authenticated;
grant execute on function public.create_booking(text, date, int, text[], text, text) to anon, authenticated;

alter table public.shop_config enable row level security;
alter table public.owners      enable row level security;
alter table public.bookings    enable row level security;

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
