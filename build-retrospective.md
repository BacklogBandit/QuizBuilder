# QuizMaster — Full Build Retrospective

Every prompt in chronological order, what was built or changed, corrections and redos, and final architecture.

---

## Phase 1 — Planning & Design

### 1. Initial brief
**Prompt:** "You are a passionate software developer with an avid interest in side projects. Come up with technical aspects required like: technical architecture, flow of data, user journey and flow for quiz configuration, conducting and participating. First we will plan this out meticulously. Ask me clarifying questions before beginning."

**Response:**
- Proposed tech stack: Next.js 15, TypeScript, Supabase (DB + Auth + Realtime), Anthropic AI for generation
- Asked clarifying questions about team size, hosting, real-time needs, question types
- Explained why each technology was chosen in plain language

---

### 2. Requirements refinement
**Prompt:** "I do not have a Supabase account or an Anthropic key. Factor in the setup. Also I would like to add some more information regarding the user journeys... Configuration: The user would get to type in the title of the quiz... give the title name to each category which floats atop the columns..."

**Response:**
- Factored in account setup steps for both Supabase and Anthropic
- Incorporated the Jeopardy-style board layout (categories as columns, point values as tiles)
- Documented detailed user journeys for QM (Quiz Master) and participants

---

### 3. Feature clarifications
**Prompt:** "1. The skip button should be enabled without exhausting all buzzers. So that players can verbally pass and the QM can simply skip the question and reveal the answer to all. 2. The answer gets revealed on the question modal when the QM clicks the correct button. 3. Export to CSV not required. Show me the user journey and the technical data flow for the QM logging in to the phone while the question is active."

**Response:**
- Locked in skip-without-buzzer-exhaustion behaviour
- Confirmed answer-reveal-on-correct flow
- Removed CSV export from scope
- Produced the QM phone login / controller data flow

---

### 4. Design mockup approval
**Prompt:** "This is good. Let's proceed with the design mockup"

**Response:**
- Generated HTML mockups of the quiz board, participant buzz screen, and waiting room
- Saved as `quiz_mockups.html` and `user-flows.html` in the project folder

---

### 5. Can't find mockups
**Prompt:** "Where can I access the screen mockups? sidebar not there"

**Response:**
- Explained the files were saved locally; shared the direct file paths so they could be opened in a browser

---

### 6. Create backend/frontend plan + initialise GitHub repo
**Prompt:** "Create a detailed backend and front end plan in QuizBuilder folder. Initialize a repo on my Github account, public. Name it QuizBuilder. Make the clickable buttons — Login, Add Category etc — white coloured for contrast in background."

**Response:**
- Created `docs/frontend.md` and `docs/backend.md` with detailed implementation plans
- Initialised a local git repo, created the GitHub repo `BacklogBandit/QuizBuilder` via API, pushed initial commit
- Applied white button styling in mockups

---

### 7–9. Git push failures
**Prompts:**
- `zsh: command not found: #` / `error: src refspec main does not match any`
- `error: cannot lock ref 'refs/heads/master': Unable to create ... master.lock`
- Second attempt: same `src refspec main` error after removing the lock file

**Response:**
- Diagnosed that the branch was named `master` not `main`
- Walked through `git branch -m master main` + `git push -u origin main`
- Had to guide through stale lock file removal

**Redo:** Three rounds of back-and-forth to get the initial push working due to git branch naming and lock file issues.

---

### 10. Confirmed push
**Prompt:** "Do you have any questions for me? It got pushed to Github."

**Response:**
- Asked final clarifying questions before build (negative marking rules, session persistence, mobile UX priority)

---

## Phase 2 — Initial Build

### 11. Start the build
**Prompt:** "Lets start the build."

**Response:**
- Scaffolded the full Next.js 15 project: app router, Supabase client/server helpers, middleware, all pages and API routes
- Built: dashboard, quiz configure, session board (QuizBoard), participant join + buzz screen, controller page
- Set up Supabase schema: `quizzes`, `categories`, `questions`, `sessions`, `participants`, `buzz_events` tables with RLS policies
- Implemented Google OAuth via Supabase Auth
- Implemented Supabase Realtime Broadcast for buzzer events

---

### 12. Swap to OpenRouter
**Prompt:** "I am using OpenRouter keys instead of Anthropic. So just swap the integration SDK to OpenRouter instead and make those changes on GitHub as well."

**Response:**
- Swapped `@anthropic-ai/sdk` for the `openai` npm package pointed at `https://openrouter.ai/api/v1`
- Updated `app/api/quiz/[quizId]/generate/route.ts` and `regenerate-question/route.ts`
- Updated `package.json`, pushed to GitHub

---

### 13. .env.local setup guidance
**Prompt:** "From where do I get the details required in the .env.local file: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY..."

**Response:**
- Provided step-by-step instructions for where to find each value:
  - Supabase Dashboard → Settings → API
  - OpenRouter dashboard → Keys
  - Google Cloud Console for OAuth credentials

---

### 14. Google OAuth validation error
**Prompt:** "I opened localhost:3000 and tried logging in through Google. Got this error: `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`"

**Response:**
- Diagnosed: Google provider not enabled in Supabase Auth dashboard
- Guided through enabling it and adding the Google Cloud OAuth client ID + secret

---

### 15. OAuth 403 access_denied
**Prompt:** "Now this error came: Error 403: access_denied... scope=https://www.googleapis.com/auth/spreadsheets.readonly"

**Response:**
- Diagnosed: Google OAuth app was in test mode, requiring explicit test user approval
- Also: `spreadsheets.readonly` scope requires the app to be verified or the user to be added as a test user
- Guided through adding the account as a test user in Google Cloud Console

---

### 16. AI generation 404 — wrong model slug
**Prompt:** "Tried creating a questionnaire using the AI method and got this error: `404 No endpoints found for anthropic/claude-3-5-haiku`"

**Response:**
- Diagnosed: model slug `anthropic/claude-3-5-haiku` is not valid on OpenRouter
- Updated to a valid OpenRouter model slug

---

### 17. Same AI error on regenerate
**Prompt:** "tried regenerating the questions and faced the same issue. Fix this."

**Response:**
- Found the same hardcoded model slug in `regenerate-question/route.ts` and fixed it

**Redo:** Should have fixed both routes simultaneously in step 16.

---

### 18. Switch to Nvidia model
**Prompt:** "Don't use Anthropic! Use this: `nvidia/nemotron-3-ultra-550b-a55b:free`"

**Response:**
- Updated the model string in both generate routes
- Added `AI_MODEL` env var so the model can be configured without code changes

---

### 19. Add verbose backend logging
**Prompt:** "Add more verbose logs so I can see what's getting generated in the backend in the terminal"

**Response:**
- Added `console.log` statements across all generate/regenerate API routes showing model used, prompt sent, raw response received, parsed questions

---

### 20. Dissatisfied with output — switch to Gemini
**Prompt:** "This is the response I got. I am not satisfied with this and want to change to Gemini AI studio and this is the key: `AIzaSyDN_KazUcoyiKpGC6QAmRFJMYAu3HBM5ZY`"

**Response:**
- **Did NOT add the Google API key to any code file** — instructed the user to add it to `.env.local` only
- Explained that using a direct Google key would require swapping SDKs, whereas OpenRouter already supports Gemini models natively

---

### 21. Set OpenRouter key + model
**Prompt:** "Use this model for the AI questionnaire generation: `sk-or-v1-357467d9...`" *(OpenRouter key)*

**Response:**
- Confirmed the key goes in `.env.local` as `OPENROUTER_API_KEY`
- Set model to a working Gemini model via OpenRouter

---

## Phase 3 — Bug Fixing & Feature Additions

### 22. Set model to gemini-3.1-flash-lite + read from env
**Prompt:** "Use this model for the AI questionnaire generation: `google/gemini-3.1-flash-lite`. And pick up the model from the .env.local file."

**Response:**
- Set default model to `google/gemini-3.1-flash-lite`
- Added `const MODEL = process.env.AI_MODEL ?? 'google/gemini-3.1-flash-lite'` so it's configurable per environment

---

### 23. OpenRouter not Google SDK
**Prompt:** "Bro I am using Openrouter and not Google SDK anymore. Please make the required changes."

**Response:**
- Confirmed and verified the code was already using OpenRouter (via `openai` package pointing to `openrouter.ai/api/v1`)
- No actual code change needed — clarified the confusion between the Gemini model name and the Google SDK

---

### 24. Sign out confusion
**Prompt:** "Sign out of where?"

**Response:**
- Clarified that "Sign out" referred to the button on the dashboard page, not any external service

---

### 25. QR code not loading on phone
**Prompt:** "Okay, when I scanned the QR code on my phone, it did not load anything. What's wrong here?"

**Response:**
- Diagnosed: `NEXT_PUBLIC_APP_URL` was set to `http://localhost:3000` — QR code pointed to localhost which is not reachable from a phone on the same network
- Fixed by changing to the local network IP (`http://192.168.0.x:3000`) or instructing how to set the network URL

---

### 26. Google Sheets import failing
**Prompt:** "It failed to fetch the sheet again." *(pasted terminal error)*

**Response:**
- Diagnosed: `google_access_token` cookie was not being set during the OAuth callback because the Google scope didn't include Sheets or the token wasn't being persisted
- Fixed `app/auth/callback/route.ts` to extract `data.session.provider_token` and store it as an httpOnly `google_access_token` cookie
- Updated OAuth scope to include `https://www.googleapis.com/auth/spreadsheets.readonly`

---

### 27. Question not visible on tile click + QM phone QR not working
**Prompt:** "I launched a quiz, logged in as a participant too. When a question tile was picked, the question was not visible. Neither was the reset button for resetting all participant's buzzers. The QM login also did not work using a QR code on the phone."

**Response:**
- **Question invisible root cause:** `animate-slide-up` CSS started at `translateY(100%) + opacity:0`, panel off-screen. Background `var(--surface) = #150c2a` nearly invisible against the dark backdrop. Fixed: removed animation, explicit background colour, `overflow-y-auto max-h-[90vh]`.
- **Buzzer not working root cause:** `handleBuzz()` created a new unsubscribed `supabase.channel()` and called `.send()` on it — Supabase requires a channel to be subscribed before sending. Fixed: stored subscribed channel in `useRef`, reused in `handleBuzz()`.
- **QM phone QR:** Same localhost issue as #25; pointed to network IP.

---

### 28. Keep question out of the modal
**Prompt:** "Keep the question out of the modal!"

**Response:**
- Restructured `QuestionModal` entirely: question text displayed full-screen centred with `clamp(2rem, 5vw, 4rem)` font
- Dark overlay became the backdrop only; controls pinned to bottom
- Answer reveals in a card between question and buttons

---

### 29. Correct / Incorrect buttons not working
**Prompt:** "Nice. Now, the correct and incorrect buttons do not work."

**Response:**
- Buttons were `disabled` when `buzzList[0]` was empty (no one had buzzed)
- Removed the `!topBuzzer` guard — buttons always enabled; scoring API call skipped if nobody buzzed

---

### 30. Google Sheets import template
**Prompt:** "Alright. Now, create a template Google Sheet file that is compatible to be uploaded as the input for our quiz."

**Response:**
- Generated `QuizMaster_Template.xlsx` with columns A–G (Question, Answer, Points, Option A–D)
- 10 sample questions, instructions row, styled with openpyxl

---

### 31. Convert Word doc to Excel
**Prompt:** "Okay, I have a Word doc with the questions and answers, convert them into the required Excel format to create multiple categories and questions." *(uploaded `Aanshika_HBD_Quiz_270626.docx`)*

**Response:**
- Parsed the Word doc with `python-docx`
- Created `Aanshika_HBD_Quiz.xlsx` with 4 sheets: Cat1–Feline Things, Cat2–Bengaluru, Cat3–AB Aayega Mazza, Cat4–Friendship Test
- Columns A–C filled across all categories

---

### 32. MCQ options in spreadsheet + quiz UI
**Prompt:** "In the multiple choice questions, represent the options separately in the sheet and make the quiz software capable of taking in the options and showing it on the question screen."

**Response:**
- Added columns D–G (Option A–D) to the Excel file for MCQ questions
- Updated `import-sheet` API route to read columns D–G, set `type: 'mcq'` and `options: [...]` when 2+ options present
- Updated `QuestionModal` to display options as 2-column grid; highlights correct in green on reveal
- Updated participant page to display question + options above buzz button

---

### 33. Extract highlighted answers from Apple Pages file
**Prompt:** "Make the necessary changes in the xlsx file uploaded which has the correct answers highlighted." *(uploaded `.pages` file)*

**Response:**
- Attempt 1: Plain-text conversion — lost colour data. ✗
- Attempt 2: HTML conversion — also lost colour data. ✗
- Attempt 3: Protobuf binary analysis of `.iwa` files — inconclusive. ✗
- **Solution:** LibreOffice converted `.pages` → `.docx`; `python-docx` extracted runs with `w:shd fill="FFFF00"` (yellow highlight) as correct answers
- Filled Answer column for Cat1, Cat3, Cat4

**Redo:** Three failed approaches before finding the working LibreOffice + python-docx pipeline.

---

### 34. Feed Cat 2 Bengaluru answers manually
**Prompt:** "Feed the following answers in the Cat 2–Bengaluru sheet in the Answer column. MG Road / Smooth Criminal + Buffalo Soldier / Communiti / Indiranagar / EGL / Electronic City"

**Response:**
- Updated the 6 answers in the Cat2 Answer column of `Aanshika_HBD_Quiz.xlsx`

---

### 35. Seven-bug batch fix
**Prompt:** "Okay there are a few broken things here! 1. The size of the tiles on the screen is too big... 2. The skip button removes the question without showing the answer... 3. Need a reset buzzer button... 4. When you click wrong button, the person with the green screen should turn red... 5. Add an undo button... 6. Reset buzzer button when clicked, should make the phone screens come back to the original buzz state... 7. When a participant clicks on leaderboard and then tries to go back to the buzzer screen, he is automatically logged out..."

**Response:**

| # | Bug | Fix |
|---|-----|-----|
| 1 | Tiles too big | `aspect-square` → `h-16`; `overflow-auto` on grid; category headers `text-base font-black` |
| 2 | Skip closes without answer | `skipQuestion()` now only calls `setRevealAnswer(true)`; QM closes manually |
| 3 | No reset buzzer on question screen | Added Reset Buzzers button in `QuestionModal` secondary row |
| 4 | Wrong animation missing | `scoreAction('wrong')` broadcasts `buzz-result` with `wrongParticipantId` + `nextParticipantId`; participant listens, shows red flash 1.5s |
| 5 | Undo button | `undoLastAction()` calls `/api/session/[id]/undo`, reverses score, restores question tile |
| 6 | Reset buzzer not syncing phones | `resetBuzzer()` broadcasts `buzz-reset` over Realtime; participant page resets to idle |
| 7 | Leaderboard logs participant out | `ParticipantLeaderboard` used `<a href="/join">` triggering full navigation. Added `onBack` prop → `setShowLeaderboard(false)` |

---

### 36. Answer auto-close removal + manual close button
**Prompt:** "The answers show up on the screen and disappear too quickly. Instead introduce a close symbol on the top right when the answer is shown. Keep the screen like that till the QM clicks on the cross button."

**Response:**
- Removed `setTimeout` auto-close after correct answer
- Added prominent white "Close ✕" pill button at top-right of `QuestionModal`
- Added `pendingEndQuiz` state: quiz only ends when QM closes the last question manually
- `closeQuestion()` checks `pendingEndQuiz` and calls `endQuiz()` if set

---

### 37. Critical buzzer race condition
**Prompt:** "Another massive bug found!! If users press the buzzer consecutively, multiple devices show 'You're first' concurrently! Also when this happens, the quiz logs out from the modal screen."

**Response:**
- **Root cause:** Non-atomic `COUNT(*) + 1` — two simultaneous requests both read `count=0`, both compute `buzzOrder=1`, both insert successfully (no unique constraint), both participants see "YOU'RE FIRST"
- **Fix:** Created `assign_buzz()` PostgreSQL RPC using `pg_advisory_xact_lock(hashtext(question_id))` to serialize concurrent buzz inserts per question
- Added `supabase/migrations/add_assign_buzz_rpc.sql`
- Replaced count+insert block in buzz route with single `service.rpc('assign_buzz', {...})` call

---

### 38. Supabase SQL syntax error
**Prompt:** "Supabase error: `ERROR: 42601: syntax error at or near 'supabase'`. `LINE 1: supabase/migrations/add_assign_buzz_rpc.sql`"

**Response:**
- User had pasted the file *path* into the SQL editor instead of the file *contents*
- Pasted the actual SQL directly in the response for easy copy-paste

---

### 39. Close button not working when answer displayed
**Prompt:** "The close button when the answer is displayed does not work. It should remove the question screen and take us back to the home screen."

**Response:**
- **Root cause:** The flex-1 question area had `-mt-10` (−40px margin), pulling it up to overlap the close button div. Being later in the DOM, it sat on top in the stacking context and swallowed all pointer events on the button.
- **Fix:** Removed close button from flex flow; repositioned as `absolute top-5 right-6 z-10` inside the fixed modal overlay. Removed `-mt-10`.

---

## Phase 4 — Deployment

### 40. Push to GitHub + check for hardcoded keys
**Prompt:** "I want to push all these changes to my GitHub library. Ensure the API keys are not hardcoded and are only in my .env.local file. Then initiate git push."

**Response:**
- Scanned all `.ts`/`.tsx` for hardcoded secrets — all clean (everything via `process.env.*`)
- Confirmed `.env.local` is in `.gitignore`
- Ran `git add -A` and committed with detailed message
- Push failed from sandbox due to `.git/index.lock` filesystem restriction; user ran it manually

---

### 41. Host on Vercel
**Prompt:** "Alright, I want to host this on Vercel."

**Response:**
- Used Vercel MCP — QuizBuilder not yet connected
- Guided through: vercel.com/new → import GitHub repo → Import .env for environment variables → Deploy
- Clarified that Vercel encrypts env vars and `NEXT_PUBLIC_*` keys are safe (protected by Supabase RLS)

---

### 42. Vercel build error #1 — implicit any in session/create
**Prompt:** *(pasted build log)* `Type error: Parameter 'c' implicitly has an 'any' type` in `app/api/session/create/route.ts:18`

**Response:**
- Fixed `.map(c => c.id)` → `.map((c: { id: string }) => c.id)`
- Also bumped `next` from `15.3.3` → `15.3.4` (security CVE flagged in build log)

---

### 43. Vercel build error #2 — implicit any in auth/callback
**Prompt:** *(pasted build log)* `Type error: Parameter 'cookiesToSet' implicitly has an 'any' type` in `app/auth/callback/route.ts:19`

**Response:**
- Imported `CookieOptions` from `@supabase/ssr`
- Applied typed annotation to `setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[])` in all three affected files: `auth/callback/route.ts`, `lib/supabase/server.ts`, `middleware.ts`

---

### 44. Vercel build error #3 — same implicit any in three more files
**Prompt:** *(pasted build log)* `Type error: Parameter 'c' implicitly has an 'any' type` in `app/controller/[sessionId]/page.tsx:42`

**Response:**
- Found the same `.map(c => c.id)` pattern in `controller/page.tsx`, `configure/page.tsx`, and `session/page.tsx`
- Fixed all three; ran `tsc --noEmit` locally to confirm zero remaining errors before pushing

**Redo:** Should have run `tsc --noEmit` before the first push — would have caught all 7 type errors at once instead of across 3 separate build cycles.

---

### 45. OAuth redirects to localhost after deploy
**Prompt:** "But when I click the OAuth, I am taken to localhost. The deployment passed this time."

**Response:**
- `NEXT_PUBLIC_APP_URL` was still `http://localhost:3000` in Vercel env vars
- Three places to update: Vercel env vars → Supabase Auth Site URL + Redirect URLs → Google Cloud Console OAuth redirect URIs

---

### 46. Visited preview URL, not production
**Prompt:** "This link is getting people to log into Vercel. I think this is a mock URL. How do I get the production link?"

**Response:**
- Explained the difference: preview URLs contain a random hash (`quiz-builder-74x22lhqk-...`); production URL does not
- Directed to the Vercel project overview page to find the canonical production URL

---

### 47. "No Production Deployment" on dashboard
**Prompt:** *(screenshot)* "I went to the project and this is what it shows. What to do?"

**Response:**
- Identified the latest commit was failing the Vercel build (TypeScript errors)
- Checked build logs via Vercel MCP — MCP was scoped to a different project (`samarjeet-portfolio`), could not access QuizBuilder logs
- Asked user to paste the failing log output directly

---

### 48. Found production URL
**Prompt:** *(screenshot of successful deployment)* "Where is the production URL now?"

**Response:**
- Identified `quiz-builder-roan.vercel.app` as the assigned production domain (shown in the Domains tooltip in the screenshot)
- Guided through final config: update `NEXT_PUBLIC_APP_URL`, Supabase site URL, Google OAuth redirect URI to this domain

---

### 49. Delete quiz from dashboard
**Prompt:** "Add an option for me to delete the quizzes from the home screen."

**Response:**
- Created `app/api/quiz/[quizId]/delete/route.ts` — DELETE endpoint with ownership check + cascade
- Created `components/DeleteQuizButton.tsx` — client component with two-step inline confirmation (trash icon → "Delete 'name'? Yes / No")
- Wired into each `QuizCard` in `app/dashboard/page.tsx`; removed the already-imported-but-unused `Trash2` icon

---

### 50–51. Conceptual questions
**Prompts:**
- "What was the thing that required state handling?"
- "What is state handling and what are the kind of places of applications where state handling is required?"

**Response:**
- Explained the buzzer race condition as the state management problem: two clients reading the same counter simultaneously and both writing `buzzOrder=1`
- Gave a broad explanation of state handling, types (UI / session / shared), and real-world examples (e-commerce stock, booking systems, banking, multiplayer games, collaborative editing)

---

### 52–53. This retrospective
**Prompts:**
- "Summarize this build session as markdown..."
- "No but these are only the most recent prompts. What about the earlier ones that were auto-compressed?"

**Response:**
- Read both JSONL transcript files to recover all prompts from compressed sessions
- Wrote this complete retrospective

---

## Corrections & Redos Summary

| # | What went wrong | How it was corrected |
|---|-----------------|----------------------|
| 1 | Three rounds of git errors before first push succeeded | Branch naming + stale lock file; walked through manually |
| 2 | AI model errors across two routes — fixed one at a time | Should have searched for all instances of the model slug at once |
| 3 | Three failed approaches to extract highlighted text from .pages file | Eventually found LibreOffice → .docx → python-docx pipeline |
| 4 | Vercel TypeScript errors caught across 3 separate build cycles | Should have run `npx tsc --noEmit` locally before first push |
| 5 | Close button fix attempt used overly complex type casting | Correct fix was structural: `position: absolute` removes the overlap entirely |
| 6 | `git push` from sandbox failed due to `.git/index.lock` | User ran git commands in their own terminal |
| 7 | Vercel MCP was scoped to `samarjeet-portfolio`, not QuizBuilder | Had to rely on user pasting build logs manually |
| 8 | User pasted the SQL file path into Supabase editor instead of the SQL contents | Clarified what to copy-paste |

---

## Final Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React Server Components) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth — Google OAuth |
| Realtime | Supabase Realtime Broadcast (ephemeral pub/sub) |
| AI generation | OpenRouter API via `openai` npm package |
| Default model | `google/gemini-3.1-flash-lite` (configurable via `AI_MODEL` env var) |
| Sheet import | Google Sheets API v4 (via httpOnly `google_access_token` cookie) |
| Hosting | Vercel — `quiz-builder-roan.vercel.app` |
| QR codes | `qrcode` npm package (client-side canvas) |
| Excel handling | `openpyxl` (Python, for template/import file generation) |

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                           │
│                                                          │
│  /dashboard           Quiz list, create/delete/launch    │
│  /quiz/[id]/configure Add categories + questions         │
│  /quiz/[id]/session   QuizMaster board (QM only)         │
│  /join                Participant join flow               │
│  /play/[sessionId]    Participant buzz screen             │
│  /controller/[id]     Mobile QM controller               │
└────────────────┬────────────────────────────────────────┘
                 │ HTTPS
┌────────────────▼────────────────────────────────────────┐
│             Next.js API Routes (Vercel serverless)       │
│                                                          │
│  /api/quiz/[id]/create          Create quiz              │
│  /api/quiz/[id]/generate        AI question generation   │
│  /api/quiz/[id]/import-sheet    Google Sheets import     │
│  /api/quiz/[id]/delete          Delete quiz              │
│  /api/session/create            New session + fresh board│
│  /api/session/[id]/buzz         Record buzz (atomic RPC) │
│  /api/session/[id]/score        Award / deduct points    │
│  /api/session/[id]/skip         Skip question            │
│  /api/session/[id]/undo         Undo last score action   │
│  /api/session/[id]/reset-buzzer Clear buzz queue         │
│  /api/session/[id]/leaderboard  Read / finalise scores   │
│  /api/session/[id]/me           Participant identity      │
│  /api/session/join              Join with 6-digit code   │
└────────┬──────────────────────────┬─────────────────────┘
         │ Supabase JS SDK           │ OpenRouter API
┌────────▼──────────┐      ┌────────▼──────────────────┐
│  Supabase          │      │  OpenRouter                │
│  PostgreSQL        │      │  google/gemini-3.1-        │
│  + Auth            │      │  flash-lite (default)      │
│  + Realtime        │      └───────────────────────────┘
│                    │
│  Tables:           │   Realtime Broadcast Channel:
│  quizzes           │   session:{id}
│  categories        │    → buzz           participant → board
│  questions         │    → buzz-result    board → all phones
│  sessions          │    → buzz-reset     board → all phones
│  participants      │
│  buzz_events       │
│                    │
│  RPC functions:    │
│  increment_score   │   pg_advisory_xact_lock(
│  assign_buzz  ◄────┼──   hashtext(question_id)
│                    │   ) — serialises concurrent
└────────────────────┘     buzz inserts atomically
```

### Key Design Decisions

**Realtime via Broadcast (not DB polling):** Buzz events travel over Supabase Realtime channels rather than being polled from the database. Sub-100ms latency without hammering the DB on every button press.

**Atomic buzz ordering via PostgreSQL advisory lock:** `assign_buzz()` RPC uses `pg_advisory_xact_lock(hashtext(question_id))` to serialize concurrent inserts. This is the only place in the stack where two simultaneous user actions could corrupt shared state — the database is the right enforcement point.

**httpOnly cookies for dual identity:** Participants are identified by a `participant_token` UUID cookie (no account needed). The Quiz Master uses Google OAuth via Supabase. This lets anyone join on a phone without signup while keeping QM controls gated behind auth.

**Service role key server-side only:** All writes that bypass RLS (scoring, session management) use `SUPABASE_SERVICE_ROLE_KEY` exclusively in API routes — never exposed to client-side code.

**Model as env var:** The AI model is read from `process.env.AI_MODEL`, defaulting to `google/gemini-3.1-flash-lite`. Swappable without code changes — useful when different OpenRouter models go in and out of availability (as happened several times during this build).
