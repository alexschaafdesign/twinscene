CREATE TABLE show_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'created' | 'updated' | 'starred' | 'linked_band' | etc
  actor text NOT NULL,  -- 'scraper:<source>' | 'public_submission' | 'admin' | 'press:<outlet>'
  changed_fields jsonb, -- optional: what actually changed, if easy to capture
  submitter_name text,  -- for public submissions specifically, if collected
  submitter_email text, -- same
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_show_history_show_id ON show_history(show_id);
CREATE INDEX idx_show_history_created_at ON show_history(created_at);
