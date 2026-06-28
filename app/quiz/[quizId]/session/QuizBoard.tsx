'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { fireCorrectConfetti, fireEndConfetti } from '@/lib/confetti'
import { cn } from '@/lib/utils'
import { RefreshCw, SkipForward, Undo2, Users, Trophy } from 'lucide-react'
import Link from 'next/link'
import QRCodeCanvas from '@/components/QRCode'

interface Category { id: string; title: string; order_index: number; point_increment: number }
interface Question { id: string; category_id: string; question_text: string; answer_text: string; options?: string[] | null; type: string; points: number; order_index: number; is_answered: boolean; skipped: boolean }
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
  const [pendingEndQuiz, setPendingEndQuiz] = useState(false)

  const joinUrl = `${appUrl}/join`
  const controllerUrl = `${appUrl}/controller/${session.id}`

  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)

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
    if (!activeQuestion) return
    const top = buzzList[0] ?? null

    // Only call the score API if someone actually buzzed
    if (top) {
      setLastAction({ participantId: top.participantId, questionId: activeQuestion.id })
      await fetch(`/api/session/${session.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: activeQuestion.id, participantId: top.participantId, result }),
      })
    }

    if (result === 'correct') {
      fireCorrectConfetti()
      setRevealAnswer(true)
      setQuestions(prev => prev.map(q => q.id === activeQuestion.id ? { ...q, is_answered: true } : q))
      const remaining = questions.filter(q => !q.is_answered && q.id !== activeQuestion.id)
      if (remaining.length === 0) {
        // Last question — fire confetti now, end the quiz when QM closes
        setTimeout(() => fireEndConfetti(), 400)
        setPendingEndQuiz(true)
      }
      // No auto-close — QM dismisses with ✕
    } else {
      // Notify wrong participant, and who's next
      const nextBuzzer = buzzList[1] ?? null
      if (top) {
        channelRef.current?.send({
          type: 'broadcast', event: 'buzz-result',
          payload: { wrongParticipantId: top.participantId, nextParticipantId: nextBuzzer?.participantId ?? null },
        })
      }
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
    // Show the answer before closing — QM dismisses manually
    setRevealAnswer(true)
  }

  function closeQuestion() {
    setActiveQuestion(null)
    setBuzzList([])
    setRevealAnswer(false)
    if (pendingEndQuiz) {
      setPendingEndQuiz(false)
      endQuiz()
    }
  }

  async function resetBuzzer() {
    if (!activeQuestion) return
    await fetch(`/api/session/${session.id}/reset-buzzer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: activeQuestion.id }),
    })
    setBuzzList([])
    // Tell all participant screens to go back to idle
    channelRef.current?.send({ type: 'broadcast', event: 'buzz-reset', payload: {} })
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
    channelRef.current = channel

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

    return () => { channelRef.current = null; supabase.removeChannel(channel) }
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
        controllerUrl={controllerUrl}
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
          {activeQuestion && (
            <button onClick={resetBuzzer} className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-white px-3 py-1.5 rounded-lg border border-purple-500/40 transition-colors">
              <RefreshCw size={13} /> Reset Buzzers
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
      <div className="flex-1 px-4 pb-4 overflow-auto">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${sortedCategories.length}, 1fr)` }}
        >
          {sortedCategories.map(cat => {
            const catQs = questions.filter(q => q.category_id === cat.id).sort((a, b) => a.order_index - b.order_index)
            return (
              <div key={cat.id} className="space-y-2">
                {/* Category header */}
                <div className="bg-purple-900/70 border border-purple-400/30 rounded-xl px-2 py-3 text-center">
                  <span className="text-white font-black text-base uppercase tracking-wide">{cat.title}</span>
                </div>
                {/* Question tiles */}
                {catQs.map(q => (
                  <button
                    key={q.id}
                    onClick={() => openQuestion(q)}
                    disabled={q.is_answered}
                    className={cn(
                      'w-full h-16 rounded-xl border-2 flex items-center justify-center transition-all',
                      q.is_answered
                        ? 'bg-purple-950/40 border-purple-900/30 cursor-default'
                        : 'bg-purple-800/50 border-purple-500/50 hover:bg-purple-700/60 hover:border-purple-400 hover:scale-[1.02] cursor-pointer shadow-lg'
                    )}
                  >
                    {q.is_answered ? (
                      <span className="text-purple-700 text-xl font-black">{q.skipped ? '—' : '✓'}</span>
                    ) : (
                      <span className="text-yellow-300 text-2xl font-black drop-shadow">{q.points}</span>
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
          onUndo={lastAction ? undoLastAction : null}
          onClose={closeQuestion}
          negativeMarking={quiz.negative_marking}
        />
      )}
    </div>
  )
}

// ─── Question Modal ───────────────────────────────────────────

function QuestionModal({
  question, buzzList, revealAnswer, onCorrect, onWrong, onSkip, onResetBuzzer, onUndo, onClose, negativeMarking
}: {
  question: Question
  buzzList: BuzzItem[]
  revealAnswer: boolean
  onCorrect: () => void
  onWrong: () => void
  onSkip: () => void
  onResetBuzzer: () => void
  onUndo: (() => void) | null
  onClose: () => void
  negativeMarking: boolean
}) {
  const [wrongFlash, setWrongFlash] = useState(false)

  function handleWrong() {
    setWrongFlash(true)
    setTimeout(() => setWrongFlash(false), 600)
    onWrong()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col transition-colors duration-200"
      style={{ background: wrongFlash ? 'rgba(180,0,0,0.35)' : 'rgba(0,0,0,0.88)' }}
    >
      {/* ── Close button: absolutely positioned so nothing in the flex flow can overlap it ── */}
      <button
        onClick={onClose}
        className={cn(
          'absolute top-5 right-6 z-10 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all',
          revealAnswer
            ? 'bg-white text-black hover:bg-gray-200 shadow-lg shadow-white/20'
            : 'text-gray-500 hover:text-white border border-gray-700'
        )}
      >
        {revealAnswer ? 'Close  ✕' : '✕'}
      </button>

      {/* ── Question — full screen, centred ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-16 text-center">
        <span className="text-yellow-400 font-black text-2xl mb-8">{question.points} pts</span>
        <p className="text-white font-black leading-tight" style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}>
          {question.question_text}
        </p>

        {/* MCQ options */}
        {question.options && question.options.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-10 w-full max-w-3xl">
            {question.options.map((opt, i) => {
              const labels = ['A', 'B', 'C', 'D']
              const isCorrect = revealAnswer && opt === question.answer_text
              const isActuallyCorrect = opt === question.answer_text
              return (
                <button
                  key={i}
                  disabled={revealAnswer}
                  onClick={() => isActuallyCorrect ? onCorrect() : handleWrong()}
                  className={cn(
                    'flex items-center gap-3 px-5 py-4 rounded-2xl border-2 text-left transition-all',
                    isCorrect
                      ? 'bg-green-900/50 border-green-400/80 text-green-200'
                      : revealAnswer
                        ? 'bg-white/5 border-white/10 text-gray-200 opacity-50'
                        : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10 hover:border-purple-400/60 cursor-pointer active:scale-[0.98]'
                  )}
                >
                  <span className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0',
                    isCorrect ? 'bg-green-500 text-white' : 'bg-purple-800 text-purple-200'
                  )}>
                    {labels[i]}
                  </span>
                  <span className="font-semibold text-lg leading-snug">{opt}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Control panel — pinned to bottom ── */}
      <div className="w-full max-w-2xl mx-auto px-6 pb-8 space-y-3">
        {/* Answer */}
        {revealAnswer && (
          <div className="p-4 rounded-2xl bg-green-900/40 border border-green-500/40 text-center">
            <p className="text-xs text-green-400 font-semibold uppercase tracking-widest mb-1">Answer</p>
            <p className="text-green-200 text-2xl font-bold">{question.answer_text}</p>
          </div>
        )}

        {/* Buzz list */}
        {buzzList.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {buzzList.map((b, i) => (
              <div
                key={b.participantId}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold',
                  i === 0 ? 'bg-green-900/60 border border-green-500/60 text-green-300' : 'bg-white/5 text-gray-400'
                )}
              >
                <span>#{b.buzzOrder}</span>
                <span>{b.username}</span>
                {i === 0 && <span className="text-green-400 font-bold">⚡</span>}
              </div>
            ))}
          </div>
        )}

        {/* Correct / Wrong */}
        <div className="flex gap-3">
          <button
            onClick={onCorrect}
            disabled={revealAnswer}
            className="flex-1 py-4 rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white font-black text-lg transition-colors"
          >
            ✓ Correct
          </button>
          <button
            onClick={handleWrong}
            disabled={revealAnswer}
            className="flex-1 py-4 rounded-2xl bg-red-700 hover:bg-red-600 disabled:opacity-30 text-white font-black text-lg transition-colors"
          >
            ✗ Wrong{negativeMarking ? ` (−${question.points})` : ''}
          </button>
        </div>

        {/* Secondary row: Skip | Reset Buzzers | Undo | Close */}
        <div className="flex gap-2">
          <button onClick={onSkip} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm text-gray-400 hover:text-white transition-colors" style={{ borderColor: '#2a1d4a' }}>
            <SkipForward size={13} /> Skip
          </button>
          <button onClick={onResetBuzzer} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm text-purple-300 hover:text-white transition-colors" style={{ borderColor: '#4c2a8a' }}>
            <RefreshCw size={13} /> Reset Buzzers
          </button>
          {onUndo && (
            <button onClick={onUndo} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm text-yellow-400 hover:text-yellow-200 transition-colors" style={{ borderColor: '#78450a' }}>
              <Undo2 size={13} /> Undo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Waiting Room ─────────────────────────────────────────────

function WaitingRoom({
  quizTitle, joinUrl, controllerUrl, joinCode, participants, onStart
}: {
  quizTitle: string
  joinUrl: string
  controllerUrl: string
  joinCode: string
  participants: Participant[]
  onStart: () => void
}) {
  return (
    <div className="min-h-screen bg-quiz-gradient flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-black text-white mb-2 tracking-wide">{quizTitle}</h1>
      <p className="text-purple-300 mb-10">Waiting for participants to join…</p>

      <div className="flex gap-12 items-start mb-12">
        {/* Join QR */}
        <div className="text-center">
          <div className="bg-white p-3 rounded-2xl inline-block mb-3">
            <QRCodeCanvas url={joinUrl} size={160} />
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
            <QRCodeCanvas url={controllerUrl} size={160} />
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
