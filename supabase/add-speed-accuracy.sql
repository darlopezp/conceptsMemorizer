-- Añade velocidad media y precisión al ranking de una base que ya tenía schema.sql aplicado.
-- Pegar completo en el SQL Editor de Supabase y ejecutar una vez. En una base nueva basta con schema.sql.

alter table scores
  add column typed int not null default 0 check (typed between 0 and 100000000),
  add column errors int not null default 0 check (errors between 0 and 100000000),
  add column ms bigint not null default 0 check (ms between 0 and 100000000000);

create or replace view leaderboard as
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

create or replace function submit_scores(p_id uuid, p_secret uuid, p_scores jsonb, p_progress jsonb) returns void
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

notify pgrst, 'reload schema';
