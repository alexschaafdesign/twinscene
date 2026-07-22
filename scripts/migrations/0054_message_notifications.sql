-- Messaging slice 2: in-app notifications for new messages.
--
-- Reuses the existing notify-on-write + join-on-read notifications system
-- (migration 0026). A fourth notification type, 'new_message', fans out when a
-- message is sent to everyone who can see that conversation EXCEPT the sender
-- (band editors / the linked musician on the recipient side, plus the human
-- initiator). Delivery is in-app only — the email-digest seam 0026 left open is
-- still unused.
--
-- notifications.type is free text (no check constraint), so no ALTER there; the
-- allowed set is enforced in TS (lib/notifications NotificationType).

-- Which conversation a 'new_message' row points at. Nullable like band_id /
-- show_id — only set for that type. Cascade so deleting a conversation clears
-- its notifications, matching the band/show foreign keys.
alter table notifications
  add column conversation_id uuid references conversations(id) on delete cascade;

-- Coalesce for 'new_message', keyed on (user, conversation): while a
-- new-message notification is still unread, further messages in the same thread
-- bump the existing row (timestamp + snippet) instead of piling up — a burst of
-- replies is one unread ping, not ten. Once read, the next message earns a
-- fresh row (the read_at IS NULL predicate stops matching). Same shape as the
-- band_update / show_changed coalesce indexes. Fan-out uses ON CONFLICT DO UPDATE.
create unique index notifications_new_message_unread_uniq
  on notifications (user_id, conversation_id)
  where type = 'new_message' and read_at is null;
