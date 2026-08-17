-- ============================================================
-- MrBokou — Autoriser l'approbation manuelle sans documents complets
-- (certains artisans se présentent en physique). L'admin décide, ce n'est
-- plus bloqué automatiquement.
-- ============================================================

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
  update artisan_profiles set status = p_status, updated_at = now() where profile_id = p_profile_id;
  insert into audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'ADMIN_SET_ARTISAN_STATUS', 'artisan_profiles', p_profile_id, jsonb_build_object('status', p_status));
end;
$$;
