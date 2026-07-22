-- Messaging slice 3: email notifications for new messages.
--
-- Two additive columns on users:
--   notify_email_messages — per-user opt-out (default on). When a message
--     produces a FRESH in-app notification (the thread wasn't already unread),
--     and this is true, we also email the recipient. Bursts don't re-email
--     because the notification coalesces (migration 0054) — no email is sent
--     when the fan-out UPDATEs an existing unread row, only when it INSERTs.
--   unsubscribe_token — a stable per-user secret backing a one-click, no-login
--     unsubscribe link in the email footer (/unsubscribe/<token>). Volatile
--     default means the ADD COLUMN rewrites the table and every existing row
--     gets its own uuid; the unique index enforces that going forward.
alter table users
  add column notify_email_messages boolean not null default true;

alter table users
  add column unsubscribe_token uuid not null default gen_random_uuid();

create unique index users_unsubscribe_token_uniq on users (unsubscribe_token);
