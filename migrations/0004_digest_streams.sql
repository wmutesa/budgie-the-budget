-- Several digests per person: each edition belongs to a digest ("stream").
CREATE TABLE IF NOT EXISTS digest_editions (
  user_id TEXT NOT NULL,
  stream TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, stream, id)
);
INSERT OR IGNORE INTO digest_editions (user_id, stream, id, data, created_at) SELECT user_id, 'main', id, data, created_at FROM digests;
DROP TABLE IF EXISTS digests;
