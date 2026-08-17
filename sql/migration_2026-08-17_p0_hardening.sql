-- ============================================================
-- MrBokou — Migration P0 roadmap : audit_logs + rate limiting (2026-08-17)
-- À exécuter dans Supabase → SQL Editor, en une seule fois.
-- ============================================================

-- Journal des actions admin sensibles. Aucune policy INSERT : seules les
-- fonctions SECURITY DEFINER (propriétaire de la table) peuvent y écrire.
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table audit_logs enable row level security;

drop policy if exists "admin lit le journal" on audit_logs;
create policy "admin lit le journal" on audit_logs
  for select using (get_user_role() = 'admin');

-- Remplace admin_set_artisan_status pour y ajouter la journalisation.
create or replace function admin_set_artisan_status(p_profile_id uuid, p_status text)
returns void
language plpgsql
security definer
as $$
begin
  if get_user_role() <> 'admin' then
    raise exception 'Accès refusé';
  end if;
  if p_status not in ('en_attente', 'approuve', 'rejete') then
    raise exception 'Statut invalide';
  end if;
  if p_status = 'approuve' and exists (
    select 1 from artisan_profiles
    where profile_id = p_profile_id
      and (profile_photo_path is null or id_document_path is null or selfie_path is null)
  ) then
    raise exception 'Documents de vérification manquants (photo, pièce d''identité, selfie).';
  end if;
  update artisan_profiles set status = p_status, updated_at = now() where profile_id = p_profile_id;
  insert into audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'ADMIN_SET_ARTISAN_STATUS', 'artisan_profiles', p_profile_id, jsonb_build_object('status', p_status));
end;
$$;

-- Nouvelle RPC : seul moyen de marquer un devis reversé (corrige la
-- régression introduite par le revoke update du finding 4 : l'admin est un
-- compte "authenticated" comme un autre, il ne peut plus faire l'UPDATE
-- direct sur payout_status/payout_at).
create or replace function admin_mark_payout_done(p_quote_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if get_user_role() <> 'admin' then
    raise exception 'Accès refusé';
  end if;
  update quotes set payout_status = 'verse', payout_at = now()
  where id = p_quote_id and payment_status = 'paye';
  if not found then
    raise exception 'Devis introuvable ou non payé.';
  end if;
  insert into audit_logs (actor_id, action, target_table, target_id)
  values (auth.uid(), 'PAYOUT_MARKED_DONE', 'quotes', p_quote_id);
end;
$$;

grant execute on function admin_set_artisan_status(uuid, text) to authenticated;
grant execute on function admin_mark_payout_done(uuid) to authenticated;

-- Anti-spam : un client ne peut pas créer plus de 5 demandes en 10 minutes.
create or replace function enforce_request_rate_limit()
returns trigger
language plpgsql
security definer
as $$
begin
  if (
    select count(*) from requests
    where client_id = new.client_id and created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Trop de demandes créées récemment, réessayez dans quelques minutes.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_request_rate_limit on requests;
create trigger trg_enforce_request_rate_limit
  before insert on requests
  for each row execute function enforce_request_rate_limit();

-- Anti-spam : un artisan ne peut pas envoyer plus de 10 devis en 10 minutes.
create or replace function enforce_quote_rate_limit()
returns trigger
language plpgsql
security definer
as $$
begin
  if (
    select count(*) from quotes
    where artisan_id = new.artisan_id and created_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Trop de devis envoyés récemment, réessayez dans quelques minutes.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_quote_rate_limit on quotes;
create trigger trg_enforce_quote_rate_limit
  before insert on quotes
  for each row execute function enforce_quote_rate_limit();

-- Anti-spam : un utilisateur ne peut pas envoyer plus de 30 messages en 5 minutes.
create or replace function enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
as $$
begin
  if (
    select count(*) from messages
    where sender_id = new.sender_id and created_at > now() - interval '5 minutes'
  ) >= 30 then
    raise exception 'Trop de messages envoyés récemment, réessayez dans quelques minutes.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_message_rate_limit on messages;
create trigger trg_enforce_message_rate_limit
  before insert on messages
  for each row execute function enforce_message_rate_limit();
