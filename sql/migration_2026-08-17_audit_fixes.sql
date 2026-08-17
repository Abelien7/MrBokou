-- ============================================================
-- MrBokou — Migration correctifs audit sécurité (2026-08-17)
-- À exécuter dans Supabase → SQL Editor.
-- IMPORTANT : coller et exécuter UN BLOC À LA FOIS (le SQL Editor
-- tronque parfois les gros collages), dans l'ordre BLOC 1 → BLOC 3.
-- ============================================================


-- ============================================================
-- BLOC 1 — Finding 1 (CRITIQUE) : policy RLS "requests" trop permissive.
-- Un artisan non approuvé ou hors catégorie ne doit plus pouvoir lire
-- toutes les demandes en attente de la plateforme.
-- ============================================================

drop policy if exists "le client voit ses demandes" on requests;

create policy "le client voit ses demandes" on requests
  for select using (
    client_id = auth.uid()
    or artisan_id = auth.uid()
    or get_user_role() = 'admin'
    or (
      status = 'en_attente'
      and get_user_role() = 'artisan'
      and exists (
        select 1 from artisan_profiles ap
        where ap.profile_id = auth.uid()
          and ap.status = 'approuve'
          and requests.category_id = any(ap.categories)
      )
    )
  );


-- ============================================================
-- BLOC 2 — Finding 4 (ÉLEVÉE) : colonnes de paiement non figées sur
-- "quotes". Un client ne doit jamais pouvoir écrire payment_id /
-- payment_status / payout_status / payout_at lui-même.
-- ============================================================

revoke update (payment_id, payment_status, payout_status, payout_at) on quotes from authenticated;


-- ============================================================
-- BLOC 3 — Finding 5 (MOYENNE) : artisan_id non figé lors des
-- transitions "acceptee -> en_cours" et "en_cours -> terminee" sur
-- "requests". Remplace la fonction guard_request_update() en entier
-- (CREATE OR REPLACE, sans danger pour les données existantes).
-- ============================================================

create or replace function guard_request_update()
returns trigger
language plpgsql
security definer
as $$
declare
  actor_role text := get_user_role();
begin
  if actor_role = 'admin' then
    return new;
  end if;

  -- le client ne peut qu'annuler sa propre demande tant qu'elle est en attente
  if actor_role = 'client' and old.client_id = auth.uid() then
    if old.status = 'en_attente' and new.status = 'annulee' then
      new.artisan_id := old.artisan_id;
      new.accepted_at := old.accepted_at;
      new.completed_at := old.completed_at;
    else
      raise exception 'Modification non autorisée';
    end if;

  -- un artisan accepte une demande en attente, ou fait progresser sa propre mission
  elsif actor_role = 'artisan' then
    if old.status = 'en_attente' and new.status = 'acceptee' and new.artisan_id = auth.uid() then
      new.accepted_at := now();
      new.completed_at := old.completed_at;
    elsif old.artisan_id = auth.uid() and old.status = 'acceptee' and new.status = 'en_cours' then
      if not exists (select 1 from quotes q where q.request_id = old.id and q.status = 'accepte') then
        raise exception 'Le client doit accepter un devis avant de démarrer.';
      end if;
      new.artisan_id := old.artisan_id;
      new.completed_at := old.completed_at;
    elsif old.artisan_id = auth.uid() and old.status = 'en_cours' and new.status = 'terminee' then
      new.artisan_id := old.artisan_id;
      new.completed_at := now();
    else
      raise exception 'Modification non autorisée';
    end if;

  else
    raise exception 'Modification non autorisée';
  end if;

  -- dans tous les cas non-admin : ces champs restent figés
  new.client_id := old.client_id;
  new.category_id := old.category_id;
  new.description := old.description;
  new.address_text := old.address_text;
  new.lat := old.lat;
  new.lng := old.lng;
  new.created_at := old.created_at;
  return new;
end;
$$;
