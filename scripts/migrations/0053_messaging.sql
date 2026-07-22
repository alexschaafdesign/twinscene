-- Unified messaging, slice 1: message bands & musicians into one inbox.
--
-- A single user can be themselves, an editor of one or more bands
-- (band_editors), and/or a linked musician (musicians.user_id). This gives
-- them ONE inbox that aggregates messages sent to ANY of those identities,
-- tagged with which identity was addressed.
--
-- The recipient side is polymorphic (recipient_type/recipient_id) so "message
-- the band" and "message the musician" share one table instead of forking into
-- two systems. recipient_type is constrained to 'band'/'musician' now; adding
-- 'user' later (open user-to-user DMs) is a one-line constraint change with no
-- reshape — deliberately NOT exposed in this slice (no anti-spam/blocking yet).

create table conversations (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('band', 'musician')), -- 'user' added later
  recipient_id bigint not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index on conversations (recipient_type, recipient_id, last_message_at desc);

-- Who started/is part of the thread from the OTHER side (the human who
-- initiated contact). Kept separate from recipient so group/multi-recipient
-- threads later don't reshape this table. In this slice it's always exactly
-- one row: the initiating human.
create table conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id bigint not null references users(id),
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_user_id bigint not null references users(id),
  -- If the sender sent AS the band/musician (an editor replying on the
  -- recipient side), record that identity. null = sent as themselves (the
  -- initiating human). sender_user_id is always the real human who typed it,
  -- so per-editor attribution can be surfaced later with no schema change.
  sender_as_type text check (sender_as_type in ('band', 'musician')),
  sender_as_id bigint,
  body text not null,
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

-- Per-person read tracking, decoupled from conversation_participants because a
-- band/musician conversation can have MULTIPLE people who can legitimately view
-- it (every editor of the band, or the linked musician's user) without each of
-- them being a "participant" in the initiator sense. Any of N editors reading a
-- thread does NOT mark it read for the others.
create table conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id bigint not null references users(id),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
