-- ============================================================
-- MrBokou — Correctif : les "revoke ... (colonne) ... from authenticated"
-- posés plus tôt aujourd'hui (findings 4 et 6) sont des no-op en PostgreSQL :
-- un privilège table-level (accordé par défaut par Supabase) prime toujours
-- sur une restriction au niveau colonne. Vérifié en conditions réelles :
-- un compte artisan sans aucun document KYC a pu s'auto-approuver par un
-- simple UPDATE direct, malgré le revoke sur artisan_profiles.status.
-- Cette migration remplace ces revoke inefficaces par des triggers, le seul
-- mécanisme qui fonctionne réellement pour ce genre de restriction.
-- À exécuter dans Supabase → SQL Editor, en une seule fois.
-- ============================================================

-- 1) profiles.phone : retirer le SELECT au niveau table (pas colonne), puis
-- le redonner colonne par colonne pour tout sauf phone.
revoke select on profiles from authenticated;
revoke select on profiles from anon;
grant select (id, role, full_name, city, created_at) on profiles to authenticated;
grant select (id, role, full_name, city, created_at) on profiles to anon;

-- 2) artisan_profiles.status/rating : trigger qui fige ces colonnes pour
-- tout non-admin (bloque l'auto-approbation qu'on vient de reproduire).
create or replace function guard_artisan_profile_update()
returns trigger
language plpgsql
security definer
as $$
begin
  if get_user_role() = 'admin' then
    return new;
  end if;
  new.status := old.status;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  return new;
end;
$$;

drop trigger if exists trg_guard_artisan_profile_update on artisan_profiles;
create trigger trg_guard_artisan_profile_update
  before update on artisan_profiles
  for each row execute function guard_artisan_profile_update();

-- 3) quotes.payment_id/payment_status/payout_status/payout_at : remplace
-- guard_quote_update() pour figer ces colonnes quand l'appelant est un
-- client authentifié normal (pas admin, pas service_role/webhook).
create or replace function guard_quote_update()
returns trigger
language plpgsql
security definer
as $$
begin
  if get_user_role() = 'admin' then
    return new;
  end if;

  if auth.uid() is null then
    if new.status <> old.status and (old.status <> 'en_attente' or new.status not in ('accepte', 'refuse')) then
      raise exception 'Modification non autorisée';
    end if;
  else
    if old.status <> 'en_attente' or new.status <> 'refuse' then
      raise exception 'Modification non autorisée';
    end if;
    new.payment_id := old.payment_id;
    new.payment_status := old.payment_status;
    new.payout_status := old.payout_status;
    new.payout_at := old.payout_at;
  end if;

  new.request_id := old.request_id;
  new.artisan_id := old.artisan_id;
  new.amount := old.amount;
  new.description := old.description;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Réinitialise le compte artisan de test qui s'était auto-approuvé pendant
-- la vérification de cette faille (aucun document KYC soumis).
update artisan_profiles set status = 'en_attente'
where profile_id in (select id from profiles where full_name = 'Test Artisan Audit');
