-- ============================================================
-- MrBokou — schema Supabase
-- Plateforme de mise en relation clients <-> artisans BTP
-- ============================================================

-- 1. Catégories de services (Electricité, Plomberie, ...)
create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  created_at timestamptz not null default now()
);

insert into service_categories (name, icon) values
  ('Electricité', 'zap'),
  ('Plomberie', 'droplet'),
  ('Maçonnerie', 'brick-wall'),
  ('Peinture', 'paint-bucket'),
  ('Climatisation', 'wind'),
  ('Menuiserie', 'hammer')
on conflict (name) do nothing;

-- 2. Profils (un profil par utilisateur Supabase Auth)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('client', 'artisan', 'admin')) default 'client',
  full_name text not null,
  phone text not null,
  city text,
  created_at timestamptz not null default now()
);

-- 3. Profils artisans (infos métier, en plus du profil de base)
create table if not exists artisan_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  categories uuid[] not null default '{}',
  bio text,
  ville text,
  is_available boolean not null default false,
  lat double precision,
  lng double precision,
  status text not null check (status in ('en_attente', 'approuve', 'rejete')) default 'en_attente',
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  -- Vérification d'identité (voir bucket storage "artisan-documents" plus bas) :
  -- requis avant qu'un admin puisse approuver le profil.
  profile_photo_path text,
  id_document_path text,
  selfie_path text,
  updated_at timestamptz not null default now()
);

-- 4. Demandes de service ("courses")
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references service_categories(id),
  description text not null,
  address_text text not null,
  lat double precision,
  lng double precision,
  status text not null check (status in ('en_attente', 'acceptee', 'en_cours', 'terminee', 'annulee')) default 'en_attente',
  artisan_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz
);

-- 5. Avis clients sur artisans
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references requests(id) on delete cascade,
  client_id uuid not null references profiles(id),
  artisan_id uuid not null references profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Fonction : recalcule la note moyenne d'un artisan après un avis
-- ============================================================
create or replace function update_artisan_rating()
returns trigger
language plpgsql
security definer
as $$
begin
  update artisan_profiles
  set
    rating_count = rating_count + 1,
    rating_avg = (rating_avg * rating_count + new.rating) / (rating_count + 1)
  where profile_id = new.artisan_id;
  return new;
end;
$$;

drop trigger if exists trg_update_artisan_rating on reviews;
create trigger trg_update_artisan_rating
  after insert on reviews
  for each row execute function update_artisan_rating();

-- ============================================================
-- Création automatique du profil à l'inscription
-- ============================================================
-- Le profil (et le profil artisan) est créé par ce trigger, pas par le client :
-- ça fonctionne même quand la confirmation par email est activée et qu'il
-- n'existe donc pas encore de session pour passer les policies RLS classiques
-- au moment du signUp(). Les infos viennent des métadonnées passées à
-- supabase.auth.signUp({ options: { data: {...} } }) côté JS (voir js/auth.js).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'client');
begin
  if v_role not in ('client', 'artisan') then
    v_role := 'client';
  end if;

  insert into public.profiles (id, role, full_name, phone, city)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new.raw_user_meta_data->>'city'
  );

  if v_role = 'artisan' then
    insert into public.artisan_profiles (profile_id, categories)
    values (
      new.id,
      coalesce(
        (select array_agg(elem::uuid) from jsonb_array_elements_text(new.raw_user_meta_data->'categories') as elem),
        '{}'::uuid[]
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
-- Verrous anti-triche pour une place de marché à double face :
--   - un artisan ne peut pas s'auto-approuver ni gonfler sa propre note
--   - un client/artisan ne peut pas forcer un changement de statut arbitraire
--   - un client ne peut pas poster un faux avis sur une mission qui n'a pas eu lieu
-- ============================================================
alter table profiles enable row level security;
alter table artisan_profiles enable row level security;
alter table service_categories enable row level security;
alter table requests enable row level security;
alter table reviews enable row level security;

-- Fonction utilitaire : le rôle de l'utilisateur connecté (évite la récursion RLS,
-- appelée aussi depuis le JS via supabase.rpc("get_user_role"))
create or replace function get_user_role()
returns text
language sql
security definer
stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- service_categories : lecture publique
create policy "categories lisibles par tous" on service_categories
  for select using (true);

-- profiles : chacun voit/modifie le sien, l'admin voit tout, tout profil est lisible
-- (nécessaire pour afficher le nom du client à l'artisan et vice versa)
create policy "profils lisibles par tous les connectés" on profiles
  for select using (auth.uid() is not null);

-- Un utilisateur ne peut se créer/modifier qu'en tant que client ou artisan :
-- le rôle admin ne peut être attribué que manuellement (SQL) par l'opérateur MrBokou,
-- sinon n'importe quel compte pourrait s'auto-promouvoir admin via l'API.
create policy "un utilisateur crée son propre profil" on profiles
  for insert with check (auth.uid() = id and role in ('client', 'artisan'));

create policy "un utilisateur modifie son propre profil" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role in ('client', 'artisan'));

-- artisan_profiles
create policy "profils artisans lisibles par tous les connectés" on artisan_profiles
  for select using (auth.uid() is not null);

create policy "un artisan crée son propre profil métier" on artisan_profiles
  for insert with check (auth.uid() = profile_id);

create policy "un artisan modifie son propre profil métier" on artisan_profiles
  for update using (auth.uid() = profile_id or get_user_role() = 'admin');

-- Un artisan authentifié a le droit UPDATE sur sa ligne (policy ci-dessus),
-- mais pas sur ces colonnes précises : seules les fonctions SECURITY DEFINER
-- (propriétaire de la table, donc non concernées par ce REVOKE) peuvent les modifier.
revoke update (status, rating_avg, rating_count) on artisan_profiles from authenticated;

-- RPC admin : seul moyen d'approuver/rejeter un artisan
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
  -- Impossible d'approuver sans les 3 documents de vérification d'identité
  -- (photo de profil, pièce d'identité, selfie) : garantie anti-arnaque,
  -- pas seulement une suggestion côté interface.
  if p_status = 'approuve' and exists (
    select 1 from artisan_profiles
    where profile_id = p_profile_id
      and (profile_photo_path is null or id_document_path is null or selfie_path is null)
  ) then
    raise exception 'Documents de vérification manquants (photo, pièce d''identité, selfie).';
  end if;
  update artisan_profiles set status = p_status, updated_at = now() where profile_id = p_profile_id;
end;
$$;

-- requests
create policy "le client voit ses demandes" on requests
  for select using (
    client_id = auth.uid()
    or artisan_id = auth.uid()
    or get_user_role() = 'admin'
    or (status = 'en_attente' and get_user_role() = 'artisan')
  );

create policy "un client crée une demande" on requests
  for insert with check (client_id = auth.uid());

create policy "maj demande : client annule, artisan accepte/termine" on requests
  for update using (
    client_id = auth.uid()
    or get_user_role() = 'admin'
    or (get_user_role() = 'artisan' and (status = 'en_attente' or artisan_id = auth.uid()))
  );

-- La policy ci-dessus autorise à TOUCHER la ligne ; ce trigger restreint ensuite
-- CE QUI peut changer, pour empêcher un client/artisan de réécrire la description,
-- l'adresse, ou de forcer un statut hors de la transition qui le concerne.
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
      new.completed_at := old.completed_at;
    elsif old.artisan_id = auth.uid() and old.status = 'en_cours' and new.status = 'terminee' then
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

drop trigger if exists trg_guard_request_update on requests;
create trigger trg_guard_request_update
  before update on requests
  for each row execute function guard_request_update();

-- reviews
create policy "avis lisibles par tous les connectés" on reviews
  for select using (auth.uid() is not null);

-- Un avis ne peut être posté que par le client d'une mission réellement terminée,
-- et doit correspondre à l'artisan qui l'a effectivement traitée (anti faux-avis).
create policy "le client note sa demande terminée" on reviews
  for insert with check (
    client_id = auth.uid()
    and exists (
      select 1 from requests r
      where r.id = request_id
        and r.client_id = auth.uid()
        and r.artisan_id = reviews.artisan_id
        and r.status = 'terminee'
    )
  );

-- ============================================================
-- Devis (négociation de prix) et messagerie client <-> artisan
-- ============================================================
-- Un devis par ligne : si le client refuse, l'artisan en renvoie un autre
-- (nouvelle ligne) plutôt que de modifier le refusé.
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  artisan_id uuid not null references profiles(id),
  amount integer not null check (amount > 0),
  description text,
  status text not null check (status in ('en_attente', 'accepte', 'refuse')) default 'en_attente',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  content text,
  image_path text,
  created_at timestamptz not null default now(),
  constraint messages_content_or_image check (content is not null or image_path is not null)
);

alter table quotes enable row level security;
alter table messages enable row level security;

-- quotes
create policy "participants lisent les devis" on quotes
  for select using (
    get_user_role() = 'admin'
    or exists (
      select 1 from requests r where r.id = quotes.request_id
        and (r.client_id = auth.uid() or r.artisan_id = auth.uid())
    )
  );

create policy "l'artisan envoie un devis sur sa mission acceptée" on quotes
  for insert with check (
    artisan_id = auth.uid()
    and exists (
      select 1 from requests r where r.id = quotes.request_id
        and r.artisan_id = auth.uid() and r.status = 'acceptee'
    )
  );

create policy "le client répond au devis" on quotes
  for update using (
    get_user_role() = 'admin'
    or exists (select 1 from requests r where r.id = quotes.request_id and r.client_id = auth.uid())
  );

-- La policy ci-dessus autorise à toucher la ligne ; ce trigger restreint ensuite
-- ce qui peut changer : seulement en_attente -> accepte|refuse, rien d'autre.
create or replace function guard_quote_update()
returns trigger
language plpgsql
security definer
as $$
begin
  if get_user_role() = 'admin' then
    return new;
  end if;
  if old.status <> 'en_attente' or new.status not in ('accepte', 'refuse') then
    raise exception 'Modification non autorisée';
  end if;
  new.request_id := old.request_id;
  new.artisan_id := old.artisan_id;
  new.amount := old.amount;
  new.description := old.description;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_guard_quote_update on quotes;
create trigger trg_guard_quote_update
  before update on quotes
  for each row execute function guard_quote_update();

-- messages : ouverts une fois la demande acceptée, jusqu'à la fin de la mission
create policy "participants lisent les messages" on messages
  for select using (
    get_user_role() = 'admin'
    or exists (
      select 1 from requests r where r.id = messages.request_id
        and (r.client_id = auth.uid() or r.artisan_id = auth.uid())
    )
  );

create policy "participants envoient des messages" on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from requests r where r.id = messages.request_id
        and (r.client_id = auth.uid() or r.artisan_id = auth.uid())
        and r.status in ('acceptee', 'en_cours')
    )
  );

-- ============================================================
-- Stockage : photos jointes aux messages (bucket privé)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('request-photos', 'request-photos', false)
on conflict (id) do nothing;

-- Convention de chemin : request-photos/{request_id}/{fichier} — le premier
-- segment du chemin sert à vérifier que l'uploadeur/lecteur fait bien partie
-- de la demande concernée.
create policy "participants envoient des photos de leur demande" on storage.objects
  for insert with check (
    bucket_id = 'request-photos'
    and exists (
      select 1 from requests r
      where r.id::text = (storage.foldername(name))[1]
        and (r.client_id = auth.uid() or r.artisan_id = auth.uid())
    )
  );

create policy "participants voient les photos de leur demande" on storage.objects
  for select using (
    bucket_id = 'request-photos'
    and exists (
      select 1 from requests r
      where r.id::text = (storage.foldername(name))[1]
        and (r.client_id = auth.uid() or r.artisan_id = auth.uid())
    )
  );

-- ============================================================
-- Stockage : documents de vérification d'identité artisan (bucket privé)
-- ============================================================
-- Convention de chemin : artisan-documents/{profile_id}/{profile|id-document|selfie}.jpg
-- Jamais lisible par un client ni un autre artisan : c'est de la pièce
-- d'identité, seul le propriétaire et l'admin y ont accès.
insert into storage.buckets (id, name, public)
values ('artisan-documents', 'artisan-documents', false)
on conflict (id) do nothing;

create policy "un artisan envoie ses propres documents" on storage.objects
  for insert with check (
    bucket_id = 'artisan-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "l'artisan et l'admin voient les documents" on storage.objects
  for select using (
    bucket_id = 'artisan-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or get_user_role() = 'admin')
  );

-- ============================================================
-- Realtime : activer les diffusions temps réel
-- ============================================================
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table quotes;
alter publication supabase_realtime add table messages;
