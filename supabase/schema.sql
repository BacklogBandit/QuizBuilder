-- ============================================================
-- QuizBuilder — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quizzes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  negative_marking boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','ended')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  title           text NOT NULL,
  order_index     int NOT NULL DEFAULT 0,
  source_type     text NOT NULL CHECK (source_type IN ('sheet','ai')),
  point_increment int NOT NULL DEFAULT 10,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  question_text   text NOT NULL,
  answer_text     text NOT NULL,
  options         jsonb,
  type            text NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text','mcq','multi')),
  points          int NOT NULL,
  order_index     int NOT NULL DEFAULT 0,
  is_answered     boolean NOT NULL DEFAULT false,
  skipped         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id              uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  join_code            char(6) NOT NULL UNIQUE,
  status               text NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting','live','ended')),
  current_question_id  uuid REFERENCES questions(id),
  started_at           timestamptz,
  ended_at             timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  username      text NOT NULL,
  total_score   int NOT NULL DEFAULT 0,
  device_token  text NOT NULL UNIQUE,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, username)
);

CREATE TABLE IF NOT EXISTS buzz_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  buzz_order      int NOT NULL,
  buzzed_at       timestamptz NOT NULL DEFAULT now(),
  result          text CHECK (result IN ('correct','wrong','skipped')),
  points_delta    int
);

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_categories_quiz_id      ON categories(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_category_id   ON questions(category_id);
CREATE INDEX IF NOT EXISTS idx_sessions_join_code      ON sessions(join_code);
CREATE INDEX IF NOT EXISTS idx_participants_session_id ON participants(session_id);
CREATE INDEX IF NOT EXISTS idx_participants_token      ON participants(device_token);
CREATE INDEX IF NOT EXISTS idx_buzz_session_question   ON buzz_events(session_id, question_id);

-- ── Row Level Security ───────────────────────────────────────

ALTER TABLE quizzes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE buzz_events  ENABLE ROW LEVEL SECURITY;

-- Quizzes: QM owns their own
CREATE POLICY "QM manages own quizzes" ON quizzes
  USING (auth.uid() = master_id);

-- Categories: QM manages, anyone reads via quiz context
CREATE POLICY "QM manages categories" ON categories
  USING (auth.uid() = (SELECT master_id FROM quizzes WHERE id = quiz_id));

CREATE POLICY "Anyone reads categories" ON categories
  FOR SELECT USING (true);

-- Questions: QM manages, anyone reads
CREATE POLICY "QM manages questions" ON questions
  USING (auth.uid() = (
    SELECT q.master_id FROM quizzes q
    JOIN categories c ON c.quiz_id = q.id
    WHERE c.id = category_id
  ));

CREATE POLICY "Anyone reads questions" ON questions
  FOR SELECT USING (true);

-- Sessions: QM manages, anyone reads
CREATE POLICY "QM manages sessions" ON sessions
  USING (auth.uid() = (SELECT master_id FROM quizzes WHERE id = quiz_id));

CREATE POLICY "Anyone reads sessions" ON sessions
  FOR SELECT USING (true);

-- Participants: anyone reads; inserts handled via service role in API
CREATE POLICY "Anyone reads participants" ON participants
  FOR SELECT USING (true);

-- Buzz events: anyone reads (for leaderboard/scores)
CREATE POLICY "Anyone reads buzz events" ON buzz_events
  FOR SELECT USING (true);

-- ── Helper RPC ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_score(participant_id uuid, delta integer)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE participants SET total_score = total_score + delta WHERE id = participant_id;
$$;

-- Atomic buzz-order assignment.
-- Uses pg_advisory_xact_lock to serialize concurrent buzzes per question,
-- eliminating the COUNT(*)+1 race condition where two participants both get buzz_order=1.
CREATE OR REPLACE FUNCTION assign_buzz(
  p_session_id uuid,
  p_question_id uuid,
  p_participant_id uuid
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_buzz_order int;
BEGIN
  -- Advisory lock scoped to this transaction, keyed on the question id.
  -- Any concurrent call for the same question blocks here until we commit.
  PERFORM pg_advisory_xact_lock(hashtext(p_question_id::text));

  -- Re-check inside the lock (another connection may have inserted before us)
  SELECT buzz_order INTO v_buzz_order
  FROM buzz_events
  WHERE session_id     = p_session_id
    AND question_id    = p_question_id
    AND participant_id = p_participant_id;

  IF v_buzz_order IS NOT NULL THEN
    RETURN v_buzz_order;
  END IF;

  -- Assign next order — safe because the advisory lock serialises this block
  INSERT INTO buzz_events (session_id, question_id, participant_id, buzz_order, buzzed_at)
  VALUES (
    p_session_id,
    p_question_id,
    p_participant_id,
    (SELECT COALESCE(MAX(buzz_order), 0) + 1
       FROM buzz_events
      WHERE question_id = p_question_id
        AND session_id  = p_session_id),
    now()
  )
  RETURNING buzz_order INTO v_buzz_order;

  RETURN v_buzz_order;
END;
$$;

-- ── Realtime ─────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE buzz_events;
