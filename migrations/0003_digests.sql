-- Digests: one edition per person per day, written from free sources (see worker/digest.js).
CREATE TABLE IF NOT EXISTS digests (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
