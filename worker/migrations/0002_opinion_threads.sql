ALTER TABLE opinions ADD COLUMN parent_id TEXT REFERENCES opinions(id) ON DELETE CASCADE;
ALTER TABLE opinions ADD COLUMN edited_at INTEGER;
ALTER TABLE opinions ADD COLUMN deleted_at INTEGER;
ALTER TABLE opinions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE INDEX opinions_parent ON opinions(parent_id);
CREATE TABLE debate_participants (
  debate_id TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(debate_id,user_id),
  UNIQUE(debate_id,number)
);
INSERT INTO debate_participants(debate_id,user_id,number,created_at)
SELECT debate_id,user_id,ROW_NUMBER() OVER(PARTITION BY debate_id ORDER BY first_at,first_id,user_id),first_at
FROM (SELECT debate_id,user_id,MIN(created_at) first_at,MIN(id) first_id FROM opinions GROUP BY debate_id,user_id);
UPDATE opinions SET alias='익명 ' || (SELECT number FROM debate_participants p WHERE p.debate_id=opinions.debate_id AND p.user_id=opinions.user_id);
CREATE TRIGGER opinion_participant AFTER INSERT ON opinions
BEGIN
  INSERT OR IGNORE INTO debate_participants(debate_id,user_id,number,created_at)
    SELECT NEW.debate_id,NEW.user_id,COALESCE(MAX(number),0)+1,NEW.created_at FROM debate_participants WHERE debate_id=NEW.debate_id;
  UPDATE opinions SET alias='익명 ' || (SELECT number FROM debate_participants WHERE debate_id=NEW.debate_id AND user_id=NEW.user_id) WHERE id=NEW.id;
END;
CREATE TRIGGER opinion_reply_target BEFORE INSERT ON opinions
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM opinions p WHERE p.id=NEW.parent_id AND p.debate_id=NEW.debate_id AND p.deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'REPLY_TARGET_UNAVAILABLE'); END;
