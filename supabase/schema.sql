-- Reto compartido de Literal: apodos, tarjetas de la comunidad y puntajes.
-- Pegar completo en el SQL Editor de Supabase y ejecutar una vez.
--
-- Las tablas no se exponen: se lee por las vistas y se escribe por las funciones,
-- que comprueban el secreto que cada navegador recibe al entrar con apodo y contraseña.

create extension if not exists pgcrypto with schema extensions;

create table players (
  id uuid primary key default gen_random_uuid(),
  nick text not null check (char_length(nick) between 2 and 20),
  -- hash bcrypt, nunca la contraseña
  password text not null,
  secret uuid not null default gen_random_uuid(),
  -- copia del avance por tarjeta, para seguir desde otro dispositivo
  progress jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index players_nick on players (lower(nick));

-- ids de las tarjetas predefinidas (src/data/seed.ts): solo ellas cuentan para el ranking global
create table base_cards (id text primary key);
insert into base_cards (id) values
  ('dato-personal-21719'), ('dato-sensible-21719'), ('dato-personal-19628'), ('dato-sensible-19628'),
  ('responsable-ppt'), ('responsable-21719'), ('encargado-ppt'), ('encargado-21719'),
  ('falencias-principales'), ('falencias-otras'), ('principios-nombres'), ('principios-contenido'),
  ('ambito-19628'), ('fuentes-tratamiento'), ('caracteristicas-consentimiento'),
  ('derechos-caracteristicas'), ('derechos-contenido');

create table cards (
  id text primary key check (char_length(id) between 1 and 60),
  author uuid not null references players on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  source text not null default '' check (char_length(source) <= 120),
  grp text not null default '' check (char_length(grp) <= 80),
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table scores (
  player uuid not null references players on delete cascade,
  card_id text not null,
  community boolean not null,
  mastery real not null check (mastery between 0 and 1),
  mastered boolean not null,
  passes int not null check (passes between 0 and 100000),
  -- acumulados de todas las pasadas: de aquí salen la velocidad media y la precisión
  typed int not null default 0 check (typed between 0 and 100000000),
  errors int not null default 0 check (errors between 0 and 100000000),
  ms bigint not null default 0 check (ms between 0 and 100000000000),
  updated_at timestamptz not null default now(),
  primary key (player, card_id)
);

alter table players enable row level security;
alter table base_cards enable row level security;
alter table cards enable row level security;
alter table scores enable row level security;

create view community_cards as
  select c.id, c.title, c.source, c.grp as "group", c.text, p.nick as author, c.created_at
  from cards c
  join players p on p.id = c.author;

create view leaderboard as
  select
    p.nick,
    s.community,
    round(sum(s.mastery) * 100)::int as points,
    (count(*) filter (where s.mastered))::int as mastered,
    sum(s.passes)::int as passes,
    max(s.updated_at) as updated_at,
    -- una palabra son 5 caracteres; sin tiempo medido no hay velocidad
    coalesce(round(sum(s.typed) / 5.0 / nullif(sum(s.ms) / 60000.0, 0)), 0)::int as wpm,
    coalesce(round(100.0 * sum(s.typed) / nullif(sum(s.typed) + sum(s.errors), 0), 1), 0)::float8 as accuracy,
    sum(s.typed)::int as typed
  from scores s
  join players p on p.id = s.player
  group by p.id, p.nick, s.community;

grant select on community_cards, leaderboard to anon;

create function check_player(p_id uuid, p_secret uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from players where id = p_id and secret = p_secret) then
    raise exception 'unknown_player';
  end if;
end $$;

-- Entra con un apodo existente o lo crea con esa contraseña si todavía está libre.
create function enter_challenge(p_nick text, p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  found_player players;
begin
  if char_length(p_password) not between 4 and 72 then
    raise exception 'bad_password';
  end if;
  select * into found_player from players where lower(nick) = lower(btrim(p_nick));
  if found_player.id is null then
    insert into players (nick, password)
    values (btrim(p_nick), crypt(p_password, gen_salt('bf')))
    returning * into found_player;
  elsif found_player.password <> crypt(p_password, found_player.password) then
    raise exception 'wrong_password';
  end if;
  return json_build_object(
    'id', found_player.id, 'nick', found_player.nick, 'secret', found_player.secret, 'progress', found_player.progress
  );
end $$;

create function submit_scores(p_id uuid, p_secret uuid, p_scores jsonb, p_progress jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform check_player(p_id, p_secret);
  insert into scores (player, card_id, community, mastery, mastered, passes, typed, errors, ms)
  select p_id, s.card_id, c.id is not null, s.mastery, s.mastered, s.passes,
    coalesce(s.typed, 0), coalesce(s.errors, 0), coalesce(s.ms, 0)
  from jsonb_to_recordset(p_scores)
    as s(card_id text, mastery real, mastered boolean, passes int, typed int, errors int, ms bigint)
  left join cards c on c.id = s.card_id
  left join base_cards b on b.id = s.card_id
  where c.id is not null or b.id is not null
  on conflict (player, card_id) do update
    set community = excluded.community,
        mastery = excluded.mastery,
        mastered = excluded.mastered,
        passes = excluded.passes,
        typed = excluded.typed,
        errors = excluded.errors,
        ms = excluded.ms,
        updated_at = now();
  if p_progress is not null and pg_column_size(p_progress) < 500000 then
    update players set progress = p_progress where id = p_id;
  end if;
end $$;

create function publish_card(p_id uuid, p_secret uuid, p_card jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id text := p_card->>'id';
begin
  perform check_player(p_id, p_secret);
  if exists (select 1 from base_cards where id = v_id) then
    raise exception 'base_card';
  end if;
  -- a new wording is a new challenge: nobody keeps points earned on the old one
  delete from scores
  where card_id = v_id
    and exists (select 1 from cards where id = v_id and author = p_id and text <> p_card->>'text');
  insert into cards (id, author, title, source, grp, text)
  values (v_id, p_id, p_card->>'title', coalesce(p_card->>'source', ''), coalesce(p_card->>'group', ''), p_card->>'text')
  on conflict (id) do update
    set title = excluded.title, source = excluded.source, grp = excluded.grp, text = excluded.text
    where cards.author = p_id;
  if not found then
    raise exception 'not_author';
  end if;
end $$;

create function unpublish_card(p_id uuid, p_secret uuid, p_card_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform check_player(p_id, p_secret);
  delete from cards where id = p_card_id and author = p_id;
  if found then
    delete from scores where card_id = p_card_id;
  end if;
end $$;

revoke execute on function check_player(uuid, uuid) from public, anon, authenticated;
grant execute on function enter_challenge(text, text), submit_scores(uuid, uuid, jsonb, jsonb),
  publish_card(uuid, uuid, jsonb), unpublish_card(uuid, uuid, text) to anon;

notify pgrst, 'reload schema';
