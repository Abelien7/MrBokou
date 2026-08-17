-- ============================================================
-- MrBokou — Migration finding 11 : limites de taille (2026-08-17)
-- À exécuter dans Supabase → SQL Editor, en une seule fois.
-- ============================================================

alter table requests
  add constraint requests_description_length check (char_length(description) between 1 and 2000),
  add constraint requests_address_text_length check (char_length(address_text) between 1 and 500);

alter table reviews
  add constraint reviews_comment_length check (char_length(comment) <= 1000);

alter table artisan_profiles
  add constraint artisan_profiles_bio_length check (char_length(bio) <= 1000);

alter table quotes
  add constraint quotes_description_length check (char_length(description) <= 2000);

alter table messages
  add constraint messages_content_length check (char_length(content) <= 2000);

update storage.buckets
set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg']
where id in ('request-photos', 'artisan-documents');
