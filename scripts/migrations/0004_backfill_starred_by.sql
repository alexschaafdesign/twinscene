-- The 0002 migration added starred_by as an empty jsonb default, so rows
-- backfilled from the sheet before that point kept their `starred` flag but
-- lost the actual per-outlet blurb/url attribution, which still lives in
-- raw.STARRED_BY (comma list) / raw.STARRED_NOTES (JSON blurb/url per outlet).
-- Rebuild starred_by from that snapshot for any row starred=true with an
-- empty starred_by.
UPDATE shows
SET starred_by = (
  SELECT jsonb_agg(jsonb_build_object(
    'outlet', outlet,
    'blurb', COALESCE(raw->'STARRED_NOTES'->outlet->>'blurb', ''),
    'url', COALESCE(raw->'STARRED_NOTES'->outlet->>'url', '')
  ))
  FROM unnest(string_to_array(raw->>'STARRED_BY', ',')) AS outlet
  WHERE outlet <> ''
)
WHERE starred = true
  AND starred_by = '[]'::jsonb
  AND raw->>'STARRED_BY' IS NOT NULL
  AND raw->>'STARRED_BY' <> '';
