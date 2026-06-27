'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fireCorrectConfetti, fireEndConfetti } from '@/lib/confetti'
import { cn } from '@/lib/utils'
import { RefreshCw, SkipForward, Undo2, Users, Trophy } from 'lucide-react'
import Link from 'next/link'

interface Category { id: string; title: string; order_index: number; point_increment: number }
interface Question { id: string; category_id: string; question_text: string; answer_text: string; points: number; order_index: number; is_answered: boolean; skipped: boolean }
interface BuzzItem { participantId: string; username: string; buzzOrder: number }
interface Participant { id: string; username: string; total_score: number }

interface Props {
  quiz: { id: string; title: string; negative_marking: boolean }
  session: { id: string; join_code: string; status: string }
  categories: Category[]
  questions: Question[]
  appUrl: string
}

export default function QuizBoard({ quiz, session, categories, questions: initialQuestions, appUrl }: Props) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [buzzList, setBuzzList] = useState<BuzzItem[]>([])
  const [revealAnswer, setRevealAnswer] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [sessionStatus, setSessionStatus] = useState(session.status)
  const [showWaiting, setShowWaiting] = useState(session.status === 'waiting')
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [lastAction, setLastAction] = useState<{ participantId: string; questionId: string } | null>(null)

  const joinUrl = `${appUrl}/join`
  const controllerUrl = `${appUrl}/controller/${session.id}`

  const supabase = createClient()

  // Start session
  async function startSession() {
    await fetch(`/api/session/${session.id}/start`, { method: 'POST' })
    setShowWaiting(false)
    setSessionStatus('live')
  }

  // Open a question tile
  async function openQuestion(q: Question) {
    if (q.is_answered) return
    setActiveQuestion(q)
    setBuzzList([])
    setRevealAnswer(false)
    await fetch(`/api/session/${session.id}/open-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id }),
    })
  }

  // Score a participant
  async function scoreAction(result: 'correct' | 'wrong') {
    if (!activeQuestion || buzzList.length === 0) return
    const top = buzzList[0]
    setLastAction({ participantId: top.participantId, questionId: activeQuestion.id })

    const res = await fetch(`/api/session/${session.id}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: activeQuestion.id, participantId: top.participantId, result }),
    })
    const data = await res.json()

    if (result === 'correct') {
      fireCorrectConfetti()
      setRevealAnswer(true)
      setQuestions(prev => prev.map(q => q.id === activeQuestion.id ? { ...q, is_answered: true } : q))
      // Check if all done
      const remaining = questions.filter(q => !q.is_answered && q.id !== activeQuestion.id)
      if (remaining.length === 0) {
        setTimeout(() => {
          fireEndConfetti()
          endQuiz()
        }, 1500)
      } else {
        setTimeout(() => {
          setActiveQuestion(null)
          setRevealAnswer(false)
          setBuzzList([])
        }, 2000)
      }
    } else {
      // Wrong: remove from buzz list, keep modal open for next buzzer
      setBuzzList(prev => prev.slice(1))
    }
  }

  async function skipQuestion() {
    if (!activeQuestion) return
    await fetch(`/api/session/${session.id}/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: activeQuestion.id }),
    })
    setQuestions(prev => prev.map(q => q.id === activeQuestion.id ? { ...q, is_answered: true, skipped: true } : q))
    setActiveQuestion(null)
    setBuzzList([])
    setRevealAnswer(false)
  }

  async function resetBuzzer() {
    if (!activeQuestion) return
    await fetch(`/api/session/${session.id}/reset-buzzer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: activeQuestion.id }),
    })
    setBuzzList([])
  }

  async function undoLastAction() {
    if (!lastAction) return
    await fetch(`/api/session/${session.id}/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: lastAction.questionId, participantId: lastAction.participantId }),
    })
    setQuestions(prev => prev.map(q => q.id === lastAction.questionId ? { ...q, is_answered: false, skipped: false } : q))
    setLastAction(null)
    setActiveQuestion(null)
    setBuzzList([])
    setRevealAnswer(false)
  }

  async function endQuiz() {
    await fetch(`/api/session/${session.id}/leaderboard`, { method: 'POST' })
    setSessionStatus('ended')
    setShowLeaderboard(true)
  }

  // Load leaderboard
  async function loadLeaderboard() {
    const res = await fetch(`/api/session/${session.id}/leaderboard`)
    const data = await res.json()
    setParticipants(data.leaderboard ?? [])
  }

  // Real-time: buzz events via Supabase Realtime Broadcast
  useEffect(() => {
    const channel = supabase.channel(`session:${session.id}`)

    channel
      .on('broadcast', { event: 'buzz' }, ({ payload }) => {
        setBuzzList(prev => {
          const exists = prev.find(b => b.participantId === payload.participantId)
          if (exists) return prev
          const updated = [...prev, payload].sort((a, b) => a.buzzOrder - b.buzzOrder)
          return updated
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        setParticipants(prev => [...prev, { id: row.id, username: row.username, total_score: row.total_score }])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter: `session_id=eq.${session.id}` }, ({ new: row }) => {
        setParticipants(prev => prev.map(p => p.id === row.id ? { ...p, total_score: row.total_score } : p))
      })
      .subscribe()

    loadLeaderboard()

    return () => { supabase.removeChannel(channel) }
  }, [session.id])

  const sortedCategories = [...categories].sort((a, b) => a.order_index - b.order_index)

  if (showLeaderboard) {
    return <LeaderboardScreen participants={participants} quizTitle={quiz.title} sessionId={session.id} />
  }

  if (showWaiting) {
    return (
      <WaitingRoom
        quizTitle={quiz.title}
        joinUrl={joinUrl}
        joinCode={session.join_code}
        participants={participants}
        onStart={startSession}
      />
    )
  }

  return (
    <div className="min-h-screen bg-quiz-gradient flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-xs text-purple-300 font-mono">Code: {session.join_code}</span>
          <span className="text-xs text-purple-400">{participants.length} joined</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-wide text-center">{quiz.title}</h1>
        <div className="flex items-center gap-3">
          {lastAction && (
            <button onClick={undoLastAction} className="flex items-center gap-1.5 text-xs text-yellow-300 hover:text-yellow-100 px-3 py-1.5 rounded-lg border border-yellow-500/40 transition-colors">
              <Undo2 size={13} /> Undo
            </button>
          )}
          <button onClick={() => { loadLeaderboard(); setShowLeaderboard(true) }} className="text-purple-300 hover:text-white transition-colors p-2">
            <Trophy size={18} />
          </button>
          <button onClick={endQuiz} className="text-xs text-gray-400 hover:text-white px-2 py-1.5 border border-gray-700 rounded transition-colors">
            End Quiz
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 px-4 pb-6">
        <div
          className="grid gap-3 h-full"
          style={{ gridTemplateColumns: `repeat(${sortedCategories.length}, 1fr)` }}
        >
          {sortedCategories.map(cat => {
            const catQs = questions.filter(q => q.category_id === cat.id).sort((a, b) => a.order_index - b.order_index)
            return (
              <div key={cat.id} className="space-y-3">
                {/* Category header */}
                <div className="bg-purple-900/70 border border-purple-400/30 rounded-xl px-3 py-3 text-center">
                  <span className="text-purple-100 font-bold text-sm uppercase tracking-wider">{cat.title}</span>
                </div>
                {/* Question tiles */}
                {catQs.map(q => (
                  <button
                    key={q.id}
                    onClick={() => openQuestion(q)}
                    disabled={q.is_answered}
                    className={cn(
                      'w-full aspect-square rounded-xl border-2 flex items-center justify-center transition-all',
                      q.is_answered
                        ? 'bg-purple-950/40 border-purple-900/30 cursor-default'
                        : 'bg-purple-800/50 border-purple-500/50 hover:bg-purple-700/60 hover:border-purple-400 hover:scale-[1.02] cursor-pointer shadow-lg'
                    )}
                  >
                    {q.is_answered ? (
                      <span className="text-purple-800 text-2xl font-black">{q.skipped ? '—' : '✓'}</span>
                    ) : (
                      <span className="text-yellow-300 text-3xl font-black drop-shadow">{q.points}</span>
                    )}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Question Modal */}
      {activeQuestion && (
        <QuestionModal
          question={activeQuestion}
          buzzList={buzzList}
          revealAnswer={revealAnswer}
          onCorrect={() => scoreAction('correct')}
          onWrong={() => scoreAction('wrong')}
          onSkip={skipQuestion}
          onResetBuzzer={resetBuzzer}
          onClose={() => { setActiveQuestion(null); setBuzzList([]); setRevealAnswer(false) }}
          negativeMarking={quiz.negative_marking}
        />
      )}
    </div>
  )
}

// ─── Question Modal ───────────────────────────────────────────

function QuestionModal({
  question, buzzList, revealAnswer, onCorrect, onWrong, onSkip, onResetBuzzer, onClose, negativeMarking
}: {
  question: Question
  buzzList: BuzzItem[]
  revealAnswer: boolean
  onCorrect: () => void
  onWrong: () => void
  onSkip: () => void
  onResetBuzzer: () => void
  onClose: () => void
  negativeMarking: boolean
}) {
  const topBuzzer = buzzList[0]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div
        className="w-full max-w-2xl rounded-t-3xl border-t border-x p-8 animate-slide-up"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Points badge */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-yellow-400 font-black text-xl">{question.points} pts</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        {/* Question text */}
        <p className="text-white text-xl font-semibold leading-snug mb-6">{question.question_text}</p>

        {/* Answer */}
        {revealAnswer && (
          <div className="mb-6 p-4 rounded-xl bg-green-900/30 border border-green-500/40">
            <p className="text-xs text-green-400 font-medium mb-1">ANSWER</p>
            <p className="text-green-300 text-lg font-bold">{question.answer_text}</p>
          </div>
        )}

        {/* Buzz list */}
        {buzzList.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Buzz Order</p>
            <div className="space-y-1.5">
              {buzzList.map((b, i) => (
                <div
                  key={b.participantId}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg',
                    i === 0 ? 'bg-green-900/40 border border-green-500/40' : 'bg-white/5'
                  )}
                >
                  <span className={cn('w-5 text-sm font-bold', i === 0 ? 'text-green-400' : 'text-gray-500')}>
                    #{b.buzzOrder}
                  </span>
                  <span className={cn('font-medium', i === 0 ? 'text-green-300' : 'text-gray-400')}>
                    {b.username}
                  </span>
                  {i === 0 && <span className="ml-auto text-green-400 text-xs font-bold">FIRST!</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCorrect}
            disabled={!topBuzzer || revealAnswer}
            className="flex-1 py-4 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white font-bold text-lg transition-colors"
          >
            ✓ Correct
          </button>
          <button
            onClick={onWrong}
            disabled={!topBuzzer || revealAnswer}
            className="flex-1 py-4 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-30 text-white font-bold text-lg transition-colors"
          >
            ✗ Wrong{negativeMarking ? ` (−${question.points})` : ''}
          </button>
        </div>

        {/* Secondary row */}
        <div className="flex gap-3 mt-3">
          <button onClick={onSkip} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm text-gray-300 hover:text-white transition-colors" style={{ borderColor: 'var(--border)' }}>
            <SkipForward size={14} /> Skip
          </button>
          <button onClick={onResetBuzzer} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm text-gray-300 hover:text-white transition-colors" style={{ borderColor: 'var(--border)' }}>
            <RefreshCw size={14} /> Reset Buzzers
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Waiting Room ─────────────────────────────────────────────

function WaitingRoom({
  quizTitle, joinUrl, joinCode, participants, onStart
}: {
  quizTitle: string
  joinUrl: string
  joinCode: string
  participants: Participant[]
  onStart: () => void
}) {
  // Generate QR code URL via Google Charts API
  const qrUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(joinUrl)}&choe=UTF-8`

  return (
    <div className="min-h-screen bg-quiz-gradient flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-black text-white mb-2 tracking-wide">{quizTitle}</h1>
      <p className="text-purple-300 mb-10">Waiting for participants to join…</p>

      <div className="flex gap-12 items-start mb-12">
        {/* QR Code */}
        <div className="text-center">
          <div className="bg-white p-3 rounded-2xl inline-block mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR Code" width={160} height={160} />
          </div>
          <p className="text-xs text-purple-300">Scan to join</p>
        </div>

        {/* Code */}
        <div className="text-center">
          <div className="bg-purple-900/60 border border-purple-400/40 rounded-2xl px-8 py-6 mb-3">
            <p className="text-xs text-purple-400 mb-2 uppercase tracking-widest">Join Code</p>
            <p className="text-5xl font-black text-white tracking-widest font-mono">{joinCode}</p>
          </div>
          <p className="text-xs text-purple-300">{joinUrl}</p>
        </div>

        {/* Controller QR */}
        <div className="text-center">
          <div className="bg-white p-3 rounded-2xl inline-block mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(`${joinUrl.replace('/join', '')}/controller/${participants[0]?.id ?? ''}`)}&choe=UTF-8`}
              alt="Controller QR"
              width={160}
              height={160}
            />
          </div>
          <p className="text-xs text-purple-300">QM Controller</p>
        </div>
      </div>

      {/* Participants */}
      <div className="mb-10">
        <p className="text-sm text-purple-400 mb-4">
          <Users size={14} className="inline mr-1" />
          {participants.length} participant{participants.length !== 1 ? 's' : ''} joined
        </p>
        {participants.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center max-w-lg">
            {participants.map(p => (
              <span key={p.id} className="px-3 py-1.5 bg-purple-800/50 border border-purple-500/30 rounded-full text-sm text-purple-200">
                {p.username}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onStart}
        disabled={participants.length === 0}
        className="px-10 py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black text-lg rounded-2xl transition-colors shadow-xl"
      >
        Start Quiz →
      </button>
      {participants.length === 0 && (
        <p className="text-xs text-purple-500 mt-3">Waiting for at least 1 participant</p>
      )}
    </div>
  )
}

// ─── Leaderboard Screen ───────────────────────────────────────

function LeaderboardScreen({ participants, quizTitle, sessionId }: { participants: Participant[]; quizTitle: string; sessionId: string }) {
  useEffect(() => { fireEndConfetti() }, [])

  const sorted = [...participants].sort((a, b) => b.total_score - a.total_score)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen bg-quiz-gradient flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-black text-white mb-2 tracking-wide">{quizTitle}</h1>
      <p className="text-purple-300 mb-10">Final Results</p>

      <div className="w-full max-w-md space-y-3 mb-10">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-4 px-5 py-4 rounded-2xl border',
              i === 0 ? 'bg-yellow-900/30 border-yellow-500/50' : 'bg-purple-900/30 border-purple-500/30'
            )}
          >
            <span className="text-2xl">{medals[i] ?? `${i + 1}.`}</span>
            <span className="flex-1 font-bold text-white text-lg">{p.username}</span>
            <span className={cn('font-black text-xl', i === 0 ? 'text-yellow-400' : 'text-purple-300')}>
              {p.total_score}
            </span>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard"
        className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
