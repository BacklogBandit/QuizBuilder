# QuizBuilder — Backend Plan

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Next.js 15 API Routes (Edge + Node) | Co-located with frontend, Vercel serverless functions, no separate backend service |
| Database | Supabase (PostgreSQL) | Managed Postgres, Row Level Security, built-in Auth, Realtime |
| Auth | Supabase Auth (Google OAuth) | Quiz master login via Google; participant identity via httpOnly cookie |
| Real-time | Supabase Realtime Broadcast | Ephemeral pub/sub for buzzer events — sub-50ms latency, no DB writes until QM confirms |
| AI | Anthropic Claude (claude-3-5-haiku) | Structured JSON output for question generation; fast + cheap for batch generation |
| Sheets | Google Sheets API v4 | Read quiz master's sheet using their OAuth access token stored in Supabase session |
| Hosting | Vercel | Zero-config Next.js deploy, edge functions for low-latency API routes |

---

## Database Schema (PostgreSQL via Supabase)

### Tables

```sql
-- Quiz masters are Supabase auth users (auth.users)
-- No separate profiles table needed at MVP

CREATE TABLE quizzes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  negative_marking boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'draft'  -- draft | active | ended
                    CHECK (status IN ('draft','active','ended')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  title           text NOT NULL,
  order_index     int NOT NULL DEFAULT 0,
  source_type     text NOT NULL CHECK (source_type IN ('sheet','ai')),
  point_increment int NOT NULL DEFAULT 10,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  question_text   text NOT NULL,
  answer_text     text NOT NULL,
  options         jsonb,           -- null for 'text' type; [{label,text}] for mcq/multi
  type            text NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text','mcq','multi')),
  points          int NOT NULL,
  order_index     int NOT NULL DEFAULT 0,
  is_answered     boolean NOT NULL DEFAULT false,
  skipped         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
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

CREATE TABLE participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  username        text NOT NULL,
  total_score     int NOT NULL DEFAULT 0,
  device_token    text NOT NULL UNIQUE,   -- random UUID set as httpOnly cookie
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, username)            -- no duplicate names per session
);

CREATE TABLE buzz_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  buzz_order      int NOT NULL,           -- 1 = first, 2 = second, etc.
  buzzed_at       timestamptz NOT NULL DEFAULT now(),
  result          text CHECK (result IN ('correct','wrong','skipped',null)),
  points_delta    int                     -- positive for correct, negative for wrong with neg marking
);
```

### Indexes

```sql
CREATE INDEX idx_categories_quiz_id ON categories(quiz_id);
CREATE INDEX idx_questions_category_id ON questions(category_id);
CREATE INDEX idx_sessions_join_code ON sessions(join_code);
CREATE INDEX idx_participants_session_id ON participants(session_id);
CREATE INDEX idx_participants_device_token ON participants(device_token);
CREATE INDEX idx_buzz_events_session_question ON buzz_events(session_id, question_id);
```

### Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE buzz_events ENABLE ROW LEVEL SECURITY;

-- Quizzes: quiz master can CRUD their own
CREATE POLICY "QM owns quiz" ON quizzes
  USING (auth.uid() = master_id);

-- Categories & questions: readable by anyone with the session, writable by QM
CREATE POLICY "QM manages categories" ON categories
  USING (auth.uid() = (SELECT master_id FROM quizzes WHERE id = quiz_id));

CREATE POLICY "QM manages questions" ON questions
  USING (auth.uid() = (
    SELECT q.master_id FROM quizzes q
    JOIN categories c ON c.quiz_id = q.id
    WHERE c.id = category_id
  ));

-- Sessions: public read (participants need to read session status)
CREATE POLICY "Anyone reads sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "QM manages sessions" ON sessions
  FOR ALL USING (auth.uid() = (SELECT master_id FROM quizzes WHERE id = quiz_id));

-- Participants: insert via service role (API route); read by anyone in session
CREATE POLICY "Anyone reads participants" ON participants FOR SELECT USING (true);

-- Buzz events: insert via service role only; readable by QM
CREATE POLICY "QM reads buzz events" ON buzz_events FOR SELECT
  USING (auth.uid() = (SELECT q.master_id FROM sessions s JOIN quizzes q ON q.id = s.quiz_id WHERE s.id = session_id));
```

### Supabase Realtime Configuration

```sql
-- Enable realtime for sessions and questions tables (for completion detection)
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
```

---

## API Routes

All routes live under `app/api/`. All write operations use the **service role key** (server-only, never exposed to client).

---

### Auth

#### `GET /api/auth/session`
Returns current session user (used by server components to verify QM role).

---

### Quiz Configuration

#### `POST /api/quiz/create`
**Auth:** Quiz master (Google session required)

```ts
// Body
{ title: string; negativeMarking: boolean }

// Response
{ quizId: string }
```
- Creates `quizzes` row with `master_id = auth.user.id`

---

#### `POST /api/quiz/[quizId]/category`
**Auth:** Quiz master (owner check via RLS)

```ts
// Body
{ title: string; sourceType: 'sheet' | 'ai'; pointIncrement: number; orderIndex: number }

// Response
{ categoryId: string }
```

---

#### `POST /api/quiz/[quizId]/import-sheet`
**Auth:** Quiz master

```ts
// Body
{ categoryId: string; sheetUrl: string }

// Response
{ questions: ParsedQuestion[]; count: number }
```

Flow:
1. Extract spreadsheet ID from URL using regex
2. Call `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/Sheet1` with `Authorization: Bearer {google_access_token}` (retrieved from Supabase session)
3. Parse rows: `[question, answer, points, type, optA, optB, optC, optD]`
4. Map to question schema, bulk insert via service role

---

#### `POST /api/quiz/[quizId]/generate`
**Auth:** Quiz master

```ts
// Body
{
  categoryId: string
  topic: string
  context?: string
  count: number        // 3–15
  difficulty: 'easy' | 'medium' | 'hard'
  pointIncrement: number
}

// Response: Server-Sent Events stream of question objects
```

Claude prompt:
```
System: You are a quiz question generator. Return ONLY valid JSON — an array of question objects. No markdown, no explanation.

User: Generate {count} quiz questions about "{topic}".
Context: {context || "None provided."}
Difficulty: {difficulty}
Order questions from easiest to hardest.

Each object must have:
{
  "question_text": string,
  "answer_text": string,
  "type": "text" | "mcq",
  "options": [{"label": "A", "text": "..."}, ...] | null
}

For "text" type, set options to null.
For "mcq" type, provide exactly 4 options. answer_text should be the correct option label (e.g. "B").
```

Uses `anthropic.messages.stream()` with `claude-3-5-haiku-20241022`. Streams each parsed question as an SSE event. On completion, bulk-inserts all questions with `points = (index + 1) * pointIncrement`.

---

#### `POST /api/quiz/[quizId]/regenerate-question`
**Auth:** Quiz master

```ts
// Body
{ questionId: string; topic: string; context?: string; difficulty: string; points: number }

// Response
{ question: ParsedQuestion }
```

Single-question variant of the generate route. Deletes old question row, inserts replacement.

---

### Session Management

#### `POST /api/session/create`
**Auth:** Quiz master

```ts
// Body
{ quizId: string }

// Response
{ sessionId: string; joinCode: string }
```

- Generates a random 6-character alphanumeric code (collision check against existing sessions)
- Creates session row with `status = 'waiting'`
- Updates quiz status to `'active'`

---

#### `POST /api/session/join`
**Auth:** None (public)

```ts
// Body
{ joinCode: string; username: string }

// Response (sets httpOnly cookie: participant_id=<uuid>)
{ sessionId: string; participantId: string; quizTitle: string }
```

- Looks up session by `join_code`
- Validates session status is `'waiting'` or `'live'`
- Validates username uniqueness within session
- Creates participant row with `device_token = crypto.randomUUID()`
- Sets `Set-Cookie: participant_token=<device_token>; HttpOnly; SameSite=Strict; Max-Age=86400`

---

#### `POST /api/session/[sessionId]/start`
**Auth:** Quiz master

- Updates `sessions.status = 'live'`, sets `started_at = now()`
- Broadcasts `{ event: 'session:started' }` to session channel

---

#### `POST /api/session/[sessionId]/open-question`
**Auth:** Quiz master

```ts
// Body
{ questionId: string }
```

- Updates `sessions.current_question_id = questionId`
- Broadcasts `{ event: 'question:opened', data: { questionId, questionText, points, categoryName } }` to session channel

---

#### `POST /api/session/[sessionId]/buzz`
**Auth:** Participant (via device_token cookie)

```ts
// No body required

// Response
{ buzzOrder: number }
```

Flow:
1. Validate `participant_token` cookie → look up participant
2. Check session `current_question_id` is set and question not yet answered
3. Count existing buzz_events for this question → `buzz_order = count + 1`
4. Insert buzz_event row with `buzzed_at = now()`
5. Fetch updated ordered buzz list for this question
6. Broadcast `{ event: 'buzzer:update', data: { buzzes: [{participantId, username, order, buzzedAt}] } }`
7. Return `{ buzzOrder: n }`

---

#### `POST /api/session/[sessionId]/score`
**Auth:** Quiz master

```ts
// Body
{ result: 'correct' | 'wrong'; participantId: string; questionId: string }
```

Flow for **correct**:
1. Look up question `points` value and quiz `negative_marking` flag
2. Update `buzz_events` row: `result = 'correct'`, `points_delta = +points`
3. Update `participants.total_score += points`
4. Update `questions.is_answered = true`
5. Fetch all updated scores
6. Broadcast `{ event: 'question:correct', data: { winnerId, winnerUsername, points, questionId } }`
7. Broadcast `{ event: 'score:update', data: { scores: [{participantId, username, totalScore}] } }`
8. Check if all questions answered → if yes, broadcast `{ event: 'quiz:complete' }` and update `sessions.status = 'ended'`

Flow for **wrong**:
1. Update `buzz_events` row: `result = 'wrong'`, `points_delta = negativeMarking ? -points : 0`
2. If negative marking: update `participants.total_score -= points`
3. Broadcast `{ event: 'question:wrong', data: { participantId, pointsDelta } }`
4. Broadcast `{ event: 'score:update', data: { scores } }` (if neg marking changed scores)
5. Client advances `activeIndex` to next buzzer — no DB state for "whose turn it is" (derived from buzz_events ordered by buzz_order, filtering out 'wrong' results)

---

#### `POST /api/session/[sessionId]/skip`
**Auth:** Quiz master

```ts
// Body
{ questionId: string }
```

1. Update `questions.is_answered = true`, `questions.skipped = true`
2. Broadcast `{ event: 'question:skipped', data: { questionId, answerText } }`
3. Check if all questions answered → if yes, `quiz:complete`

---

#### `POST /api/session/[sessionId]/reset-buzzer`
**Auth:** Quiz master

1. Broadcast `{ event: 'buzzer:reset' }` — no DB write
2. All clients return to BUZZ button ready state

---

#### `POST /api/session/[sessionId]/undo`
**Auth:** Quiz master

```ts
// Body
{ questionId: string; participantId: string }
```

Reverses the last scored buzz_event for this question:
1. Find most recent buzz_event with `result IN ('correct','wrong')` for this question
2. Reverse `participants.total_score` by `-points_delta`
3. Set buzz_event `result = null`, `points_delta = null`
4. Set `questions.is_answered = false` (if it was correct)
5. Broadcast `{ event: 'buzzer:undo', data: { questionId, participantId, reversedDelta } }`
6. Broadcast updated `score:update`

---

#### `GET /api/session/[sessionId]/leaderboard`
**Auth:** None (public within session)

```ts
// Response
{
  participants: {
    participantId: string
    username: string
    totalScore: number
    correctCount: number
    totalDeductions: number
    rank: number
  }[]
}
```

---

## Supabase Realtime — Broadcast Events Reference

| Event | Emitted by | Received by | Payload |
|---|---|---|---|
| `session:started` | QM (start route) | All participants | `{}` |
| `question:opened` | QM (open-question route) | All | `{ questionId, questionText, points, categoryName }` |
| `buzzer:update` | Server (buzz route) | All | `{ buzzes: [{participantId, username, order}] }` |
| `question:correct` | Server (score route) | All | `{ winnerId, winnerUsername, points, questionId }` |
| `question:wrong` | Server (score route) | All | `{ participantId, pointsDelta }` |
| `question:skipped` | Server (skip route) | All | `{ questionId, answerText }` |
| `buzzer:reset` | Server (reset route) | All | `{}` |
| `score:update` | Server (score/skip routes) | All | `{ scores: [{participantId, username, totalScore}] }` |
| `quiz:complete` | Server (auto-detected) | All | `{}` |
| `buzzer:undo` | Server (undo route) | All | `{ questionId, participantId, reversedDelta }` |

---

## Anthropic Integration

```ts
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateQuestions(params: {
  topic: string
  context?: string
  count: number
  difficulty: 'easy' | 'medium' | 'hard'
}): Promise<GeneratedQuestion[]> {
  const message = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: buildPrompt(params)
    }]
  })
  
  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  return JSON.parse(raw) as GeneratedQuestion[]
}
```

Cost estimate: ~$0.01–0.05 per category generation (5–15 questions).

---

## Google Sheets Integration

```ts
// lib/sheets.ts
export async function readSheet(sheetUrl: string, googleAccessToken: string) {
  const sheetId = extractSheetId(sheetUrl)
  // e.g. https://docs.google.com/spreadsheets/d/{ID}/edit
  
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1`,
    { headers: { Authorization: `Bearer ${googleAccessToken}` } }
  )
  
  const { values } = await res.json()
  // values[0] = header row, values[1..] = data rows
  
  return values.slice(1).map(row => ({
    question_text: row[0],
    answer_text:   row[1],
    points:        parseInt(row[2]),
    type:          row[3] || 'text',
    options:       parseOptions(row)
  }))
}

function parseOptions(row: string[]) {
  if (!row[4]) return null
  return ['A','B','C','D']
    .map((label, i) => ({ label, text: row[4 + i] }))
    .filter(o => o.text)
}
```

The quiz master's Google OAuth access token is retrieved from their Supabase session on the server:
```ts
const { data: { session } } = await supabase.auth.getSession()
const googleToken = session?.provider_token  // Google access token
```

---

## Session Cookie Strategy (Participants)

Participants are not Supabase auth users. Their identity is a `device_token` (UUID) stored in an httpOnly cookie.

```ts
// Set on join
response.cookies.set('participant_token', deviceToken, {
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 60 * 60 * 24,   // 24 hours
  path: '/'
})

// Read on buzz/score/etc
const deviceToken = request.cookies.get('participant_token')?.value
const participant = await supabase
  .from('participants')
  .select('*')
  .eq('device_token', deviceToken)
  .single()
```

---

## Environment Variables (Backend)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-only, never exposed to client

# Anthropic
ANTHROPIC_API_KEY=                # Server-only

# Google OAuth (via Supabase Auth settings — no separate env vars needed)
# Configured in Supabase dashboard under Auth > Providers > Google
```

---

## Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` never imported in any `app/` client component
- [ ] `ANTHROPIC_API_KEY` server-only (no `NEXT_PUBLIC_` prefix)
- [ ] All write API routes validate auth: QM routes check Supabase session, participant routes check device cookie
- [ ] RLS enabled on all tables — service role used only in API routes
- [ ] Session join validates `status IN ('waiting','live')` — can't join ended sessions
- [ ] Username uniqueness enforced at DB level (UNIQUE constraint) and API level
- [ ] Join code is 6-char alphanumeric (62^6 = ~56 billion combinations) — no brute-force risk for short sessions
- [ ] `/controller/[sessionId]` verifies `auth.uid() === session.quiz_master_id` server-side

---

## Deployment (Vercel)

```
vercel.json (optional overrides)
{
  "functions": {
    "app/api/quiz/[quizId]/generate/route.ts": {
      "maxDuration": 30    // AI generation may take up to 30s for 15 questions
    }
  }
}
```

All other routes run as default Vercel serverless functions (10s timeout).
Supabase free tier: 500MB DB, 2GB bandwidth, 200 concurrent realtime connections — more than enough for ≤20 players.
