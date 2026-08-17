-- ============================================================
-- MrBokou — Migration finding 6 : téléphone protégé par relation (2026-08-17)
-- À exécuter dans Supabase → SQL Editor, en une seule fois (un seul bloc).
-- Prérequis : les BLOCS 1-3 de migration_2026-08-17_audit_fixes.sql doivent
-- déjà être appliqués (la fonction get_user_role() doit exister).
-- ============================================================

create or replace function contact_phone(target_id uuid)
returns text
language sql
security definer
stable
as $$
  select phone from profiles
  where id = target_id
    and (
      target_id = auth.uid()
      or get_user_role() = 'admin'
      or exists (
        select 1 from requests r
        where (r.client_id = auth.uid() and r.artisan_id = target_id)
           or (r.artisan_id = auth.uid() and r.client_id = target_id)
      )
    );
$$;

grant execute on function contact_phone(uuid) to authenticated;
revoke select (phone) on profiles from authenticated;
revoke select (phone) on profiles from anon;
