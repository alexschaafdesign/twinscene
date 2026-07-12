-- 0004 indexed raw->'STARRED_NOTES' directly, but that value is itself a
-- JSON-encoded string (the sheet cell held JSON text, so it round-tripped
-- into raw as a string, not an object) — ->outlet on a jsonb string scalar
-- silently returns null, so every blurb/url backfilled empty. Redo it with
-- an explicit ::jsonb parse of the text first. Also handles the legacy shape
-- where STARRED_NOTES[outlet] is a plain blurb string rather than
-- {blurb, url} (same normalization the old Apps Script did on read).
UPDATE shows
SET starred_by = (
  SELECT jsonb_agg(jsonb_build_object(
    'outlet', outlet,
    'blurb', CASE jsonb_typeof((raw->>'STARRED_NOTES')::jsonb -> outlet)
      WHEN 'string' THEN (raw->>'STARRED_NOTES')::jsonb ->> outlet
      ELSE COALESCE((raw->>'STARRED_NOTES')::jsonb -> outlet ->> 'blurb', '')
    END,
    'url', CASE jsonb_typeof((raw->>'STARRED_NOTES')::jsonb -> outlet)
      WHEN 'object' THEN COALESCE((raw->>'STARRED_NOTES')::jsonb -> outlet ->> 'url', '')
      ELSE ''
    END
  ))
  FROM unnest(string_to_array(raw->>'STARRED_BY', ',')) AS outlet
  WHERE outlet <> ''
)
WHERE starred = true
  AND raw->>'STARRED_BY' IS NOT NULL
  AND raw->>'STARRED_BY' <> '';
