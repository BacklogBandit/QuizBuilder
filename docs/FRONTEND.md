# QuizBuilder — Frontend Plan

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Vercel-native, server components for auth-gated pages, client components for real-time UI |
| Language | TypeScript | Type safety across DB schema ↔ API ↔ UI |
| Styling | Tailwind CSS | Utility-first, zero runtime, fast mobile render |
| Components | shadcn/ui | Production-quality unstyled primitives (modals, tooltips, sliders) |
| Real-time | Supabase Realtime (client SDK) | Subscribes to session broadcast channel for buzzer events |
| Animations | canvas-confetti | Lightweight, no deps — used for correct answer burst + quiz-end |
| Icons | lucide-react | Tree-shakeable icon set |

---

## Directory Structure

```
app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx              # Google OAuth sign-in page
│   └── auth/callback/
│       └── route.ts              # Supabase OAuth callback handler
│
├── dashboard/
│   └── page.tsx                  # Quiz master's quiz list (protected)
│
├── quiz/
│   ├── new/
│   │   └── page.tsx              # Step 1 wizard: title + scoring rules
│   └── [quizId]/
│       ├── configure/
│       │   └── page.tsx          # Step 2: add categories + import questions
│       └── session/
│           └── page.tsx          # Live Jeopardy board (laptop view)
│
├── controller/
│   └── [sessionId]/
│       └── page.tsx              # QM phone controller (same Google auth, mobile view)
│
├── join/
│   └── page.tsx                  # Participant: enter 6-digit code + username
│
├── play/
│   └── [sessionId]/
│       └── page.tsx              # Participant buzzer screen
│
├── results/
│   └── [sessionId]/
│       └── page.tsx              # Final leaderboard (auto-redirect at quiz end)
│
└── layout.tsx                    # Root layout: Supabase provider, fonts

components/
├── auth/
│   └── GoogleSignInButton.tsx
│
├── config/
│   ├── QuizSetupForm.tsx         # Title input + negative marking toggle
│   ├── AddCategoryPanel.tsx      # Category title + method selector
│   ├── BoardPreview.tsx          # Mini live board preview (right panel)
│   ├── SheetsImportForm.tsx      # URL input + template table
│   ├── AIGenerateForm.tsx        # Topic, context, difficulty, count, increment
│   └── QuestionPreviewList.tsx   # Generated question cards with regen buttons
│
├── board/
│   ├── JeopardyBoard.tsx         # Main grid: category headers + tile grid
│   ├── CategoryHeader.tsx        # Column header cell
│   ├── QuestionTile.tsx          # Individual point tile (active / answered states)
│   └── QuestionModal.tsx         # Slide-up modal: question, answer reveal, actions
│
├── buzzer/
│   ├── BuzzButton.tsx            # Full-screen participant buzz button
│   ├── BuzzResultScreen.tsx      # Green (1st) or Red (nth) full-screen state
│   └── BuzzOrderList.tsx         # Ranked list shown in modal + QM phone
│
├── controller/
│   └── QMController.tsx          # QM phone: question text, buzz list, action buttons
│
├── leaderboard/
│   ├── LeaderboardTable.tsx      # Rank | Name | Score | Correct | Deductions
│   └── LeaderboardOverlay.tsx    # Slide-up panel (during quiz)
│
├── lobby/
│   └── LobbyScreen.tsx           # Waiting room: participant list + QM start button
│
└── ui/                           # shadcn/ui re-exports + custom primitives
    ├── Button.tsx
    ├── Modal.tsx
    ├── Toggle.tsx
    └── Tooltip.tsx

lib/
├── supabase/
│   ├── client.ts                 # Browser Supabase client (singleton)
│   ├── server.ts                 # Server Supabase client (cookies)
│   └── middleware.ts             # Auth middleware: protect /dashboard, /quiz/*
├── realtime/
│   └── useSessionChannel.ts      # Custom hook: subscribe to session broadcast channel
├── confetti.ts                   # canvas-confetti wrapper (burst + full-screen)
└── utils.ts                      # cn(), formatPoints(), generateJoinCode()

hooks/
├── useBuzzer.ts                  # Participant: send buzz, receive ordered results
├── useQuizSession.ts             # QM: open question, score, skip, undo, reset
├── useLeaderboard.ts             # Subscribe to score:update events, sort participants
└── useQuizComplete.ts            # Watch all questions answered → redirect to /results
```

---

## Routing & Auth Rules

| Route | Who can access | Guard mechanism |
|---|---|---|
| `/login` | Anyone | Public |
| `/dashboard` | Quiz master only | Supabase session cookie check in middleware |
| `/quiz/new` | Quiz master only | middleware |
| `/quiz/[id]/configure` | Quiz master (owner) | middleware + RLS |
| `/quiz/[id]/session` | Quiz master (owner) | middleware + RLS |
| `/controller/[sessionId]` | Quiz master (same Google account) | Server checks `auth.user.id === session.quiz_master_id` |
| `/join` | Anyone | Public |
| `/play/[sessionId]` | Participants with device cookie | Cookie presence check |
| `/results/[sessionId]` | Anyone in the session | Public within session |

---

## Page-by-Page Breakdown

### `/login`
- Centered card on purple gradient background
- "Continue with Google" button → Supabase `signInWithOAuth({ provider: 'google', scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly' })`
- On success → redirect to `/dashboard`
- Note: participants never hit this page

### `/dashboard`
- Sidebar nav (My Quizzes, Results, Settings)
- Quiz cards grid: title, category count, question count, status badge (Draft / Completed)
- "+ New Quiz" button → `/quiz/new`
- Server component: fetches quizzes via Supabase server client (no client-side fetch)

### `/quiz/new`
- 3-step wizard sidebar (Quiz Setup → Categories → Launch)
- Step 1: Quiz title input + scoring toggle (Negative Marking / Standard)
- `useRouter().push('/quiz/[newId]/configure')` on submit

### `/quiz/[id]/configure`
- Left panel: category title input + method selector (Sheets / AI)
- Right panel: live `<BoardPreview>` that re-renders as categories are added
- On "Configure Import →": shows either `<SheetsImportForm>` or `<AIGenerateForm>` below
- On category confirmed: saves to DB, board preview updates, "+ Add Category" button reappears

#### Sheets Import sub-flow
- URL input → `POST /api/quiz/[id]/import-sheet` → preview table of parsed questions
- Sample template table with hover tooltips on column headers
- "Confirm" → saves questions to DB

#### AI Generation sub-flow
- Topic (pre-filled from category title), Context textarea (optional), Question count slider (3–15), Difficulty chips (Easy/Med/Hard), Point increment input
- "Generate" → `POST /api/quiz/[id]/generate` → streaming response renders question cards one by one
- Each card has "↻ Regenerate" → `POST /api/quiz/[id]/regenerate-question` → replaces that card
- "Add Category to Quiz" → saves to DB

### `/quiz/[id]/session` (Laptop board)
- Full-screen purple gradient
- `<JeopardyBoard>` with category headers + `<QuestionTile>` grid
- Click tile → `<QuestionModal>` slides up
  - Question text, pts badge, answer box (hidden until `question:correct` event)
  - Buzz order list (real-time, updates as buzzes arrive)
  - ✓ Correct, ✗ Wrong, Skip, ↩ Undo, ↺ Reset Buzzer buttons
  - On ✓ Correct: `canvas-confetti` burst fires, answer reveals, tile fades
- Leaderboard icon (top right) → `<LeaderboardOverlay>` slide-in
- Reset Buzzer FAB (bottom right)
- `useQuizComplete()` hook watches for all tiles answered → redirects to `/results/[sessionId]`
- QR code displayed in corner: encodes `/controller/[sessionId]`

### `/controller/[sessionId]` (QM phone)
- Server checks: `auth.user.id === session.quiz_master_id` — else redirect `/join`
- Subscribes to `session:[sessionId]` channel
- On `question:opened` event → shows question text + pts
- Buzz list updates in real-time, #1 row highlighted green
- Large ✓ Correct / ✗ Wrong buttons, secondary row: Skip | ↩ Undo | ↺ Reset
- Skip is always visible — not gated on buzzer exhaustion

### `/join`
- 6-digit code input + username input
- `POST /api/session/join` → sets `participant_id` cookie (httpOnly, session-scoped)
- Redirect → `/play/[sessionId]`

### `/play/[sessionId]` (Participant)
- Reads `participant_id` from cookie — if missing, redirect `/join`
- **Lobby state**: shows participant list, waiting for QM to start
- **Buzzer state**: full-screen BUZZ button (purple radial gradient)
  - On tap → `POST /api/session/[id]/buzz` → receives buzz order back
  - If rank === 1 → full-screen green + "YOU'RE FIRST! 🎉"
  - If rank > 1 → full-screen red + rank number (e.g. "2nd")
  - After `question:result` event: score delta toast (e.g. "+30 pts")
  - After `buzzer:reset` event: returns to BUZZ button state
- Score displayed top-right
- Leaderboard icon (bottom-left) → slide-up panel
- `useQuizComplete()` → redirects to `/results/[sessionId]`

### `/results/[sessionId]`
- Full-screen confetti on mount (`canvas-confetti` full-spread)
- `<LeaderboardTable>` sorted by total_score desc
- Gold row for 1st place
- Columns: Rank | Player | Score | Correct | Deductions

---

## State Management

No global state library needed. State lives in:

| Scope | Mechanism |
|---|---|
| Auth session | Supabase client (persisted in cookies) |
| Participant identity | `participant_id` httpOnly cookie |
| Real-time quiz state | Supabase Realtime broadcast channel (ephemeral) |
| UI component state | React `useState` / `useReducer` |
| Server data | Next.js server components + `fetch` with `cache: 'no-store'` for live data |

---

## Real-time Channel Events (client subscriptions)

All clients subscribe to channel `session:[sessionId]` on mount.

```ts
// useSessionChannel.ts
const channel = supabase.channel(`session:${sessionId}`)
  .on('broadcast', { event: 'question:opened' }, handler)
  .on('broadcast', { event: 'buzzer:update' }, handler)
  .on('broadcast', { event: 'question:correct' }, handler)
  .on('broadcast', { event: 'question:wrong' }, handler)
  .on('broadcast', { event: 'question:skipped' }, handler)
  .on('broadcast', { event: 'buzzer:reset' }, handler)
  .on('broadcast', { event: 'score:update' }, handler)
  .on('broadcast', { event: 'quiz:complete' }, handler)
  .subscribe()
```

---

## Key Component Contracts

```ts
// QuestionTile
type TileProps = {
  questionId: string
  points: number
  isAnswered: boolean
  onClick: (questionId: string) => void
}

// BuzzOrderList
type BuzzListProps = {
  buzzes: { participantId: string; username: string; order: number; buzzedAt: string }[]
  activeIndex: number   // which buzzer is currently "on" (after wrong answers, advances)
}

// QMController
type ControllerProps = {
  sessionId: string
  currentQuestion: { id: string; text: string; points: number; categoryName: string } | null
  buzzes: BuzzItem[]
  activeIndex: number
  onCorrect: () => void
  onWrong: () => void
  onSkip: () => void
  onUndo: () => void
  onReset: () => void
}
```

---

## Mobile Considerations

- Participant pages (`/play`, `/join`) are mobile-first — `max-w-sm` centered, large tap targets (min 48px)
- QM controller (`/controller`) is mobile-optimized — ✓/✗ buttons are full-width, thumb-reachable
- Laptop board (`/session`) is desktop-only — no responsive scaling needed, designed for projection
- No PWA/service worker required — all sessions are short-lived

---

## Environment Variables (Frontend)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
