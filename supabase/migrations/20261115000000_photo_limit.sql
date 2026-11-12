-- A listing holds at most 10 photos (the editor stops at 10 too; this is the rule the browser cannot skip).
alter table public.listings
  add constraint listings_photos_max check (jsonb_array_length(photos) <= 10);
