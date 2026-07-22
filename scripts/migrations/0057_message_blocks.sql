-- Messaging slice 4: anti-abuse — per-identity blocking.
--
-- The recipient side of a conversation (a band's editors, or a musician's
-- linked user) can block a specific human from messaging that identity. Keyed
-- polymorphically on the blocking identity (blocker_type/blocker_id), matching
-- conversations.recipient_type/recipient_id — a block is owned by the band or
-- musician, not by whichever editor clicked "Block", so it's shared across all
-- of a band's editors just like the inbox is.
--
-- A blocked user can't start a new conversation with that identity, nor send
-- further messages into an existing one (enforced server-side in the message
-- routes). The block never hides an existing thread — the recipient side keeps
-- seeing it (and can unblock), and the blocked user can still read it.
--
-- (Rate limiting reuses the existing generic auth_rate_limits bucket counter,
-- migration 0037 — no schema needed here.)
create table message_blocks (
  blocker_type       text   not null check (blocker_type in ('band', 'musician')),
  blocker_id         bigint not null,
  blocked_user_id    bigint not null references users(id) on delete cascade,
  -- Which editor performed the block, for an audit trail. Nullable + SET NULL
  -- so removing that editor's account doesn't drop the block itself.
  blocked_by_user_id bigint references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  -- PK doubles as the isBlocked lookup index: (identity, user) point check.
  primary key (blocker_type, blocker_id, blocked_user_id)
);
