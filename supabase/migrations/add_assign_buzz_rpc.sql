-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- It creates the assign_buzz() function that atomically assigns buzz order,
-- fixing the race condition where multiple participants could both get buzz_order=1.

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
