# QuizBuilder

A live quiz platform with a Jeopardy-style board, real-time buzzer system, and AI-powered question generation.

## What it does

- **Quiz masters** log in with Google, build a quiz by importing from Google Sheets or generating questions with Claude AI, then run a live session from their laptop
- **Participants** join on their phones with a 6-digit code — no account needed — and compete using a real-time buzzer
- The board shows a Jeopardy-style grid (categories × point values). Answered tiles fade out. First buzzer gets a green screen, everyone else gets red with their position number
- Quiz masters can control scoring from their phone via a QR-code controller view

## Tech Stack

- **Next.js 15** (App Router) + TypeScript
- **Supabase** — PostgreSQL, Auth (Google OAuth), Realtime broadcast channels
- **Anthropic Claude** — AI question generation
- **Google Sheets API v4** — import questions from a spreadsheet
- **Tailwind CSS** + shadcn/ui
- **Vercel** — deployment

## Docs

- [`docs/FRONTEND.md`](docs/FRONTEND.md) — page breakdown, component tree, routing, real-time hooks
- [`docs/BACKEND.md`](docs/BACKEND.md) — database schema, API routes, Supabase RLS, AI + Sheets integration

## Setup

See the docs above for full setup instructions. Environment variables required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## Status

Planning & design phase — implementation starting soon.
