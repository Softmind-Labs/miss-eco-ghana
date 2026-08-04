-- Miss Eco Ghana — contestant registration.
-- Fields mirror the existing Google Form (forms.gle/Anb6gerfSaNeiBXC9).
--
-- Free-text "Other:" answers are stored in a companion *_other column rather than
-- being folded into the choice column, so the choice columns stay countable.

create table public.registrations (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- Contact
  full_name        text    not null,
  email            text    not null,
  phone            text    not null,
  age              integer not null check (age between 16 and 60),
  instagram_handle text    not null,
  tiktok_handle    text    not null,

  -- How did you hear about this Competition?
  heard_from       text not null check (heard_from in ('Instagram', 'Tiktok', 'A friend', 'Other')),
  heard_from_other text,

  -- Long answers
  environmental_view text not null,  -- environmental problems in Ghana + recommendations
  standout_qualities text not null,  -- 3 qualities that stand out

  -- Multiple choice
  contested_before  text not null check (contested_before in ('Yes', 'No', 'Maybe')),
  has_passport      text not null check (has_passport     in ('Yes', 'No', 'Other')),
  has_passport_other text,
  has_support       text not null check (has_support      in ('Yes', 'No', 'Maybe')),
  bikini_comfort    text          check (bikini_comfort   in ('Yes', 'No', 'Maybe')),  -- optional on the form
  occupation        text not null check (occupation       in ('Student', 'Worker', 'Entrepreneur', 'Other')),
  occupation_other  text,
  has_what_it_takes       text not null check (has_what_it_takes in ('Yes', 'No', 'Maybe', 'Other')),
  has_what_it_takes_other text,

  -- Object key in the private `registration-photos` bucket
  photo_path text not null,

  -- Resolved server-side from created_at, never trusted from the client
  tier    text    not null check (tier in ('early', 'late')),
  fee_ghs integer not null,

  -- If "Other" is picked, the free-text box must be filled in
  constraint heard_from_other_required
    check (heard_from <> 'Other' or nullif(btrim(heard_from_other), '') is not null),
  constraint passport_other_required
    check (has_passport <> 'Other' or nullif(btrim(has_passport_other), '') is not null),
  constraint occupation_other_required
    check (occupation <> 'Other' or nullif(btrim(occupation_other), '') is not null),
  constraint what_it_takes_other_required
    check (has_what_it_takes <> 'Other' or nullif(btrim(has_what_it_takes_other), '') is not null)
);

-- This table holds PII (email, phone, age, photo). Lock it down completely:
-- RLS on with NO policies means anon and authenticated get nothing at all.
-- The Edge Function reaches it with the service role, which bypasses RLS.
alter table public.registrations enable row level security;

-- One entry per person. The function maps the resulting 23505 to a friendly message.
create unique index registrations_email_key on public.registrations (lower(email));
create index        registrations_created_at_idx on public.registrations (created_at desc);

-- Private bucket for the required headshot. Same story: no policies, so the only
-- way in or out is the service role (the function) or the dashboard.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-photos',
  'registration-photos',
  false,
  10485760,                                             -- 10 MB, matching the form
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;
