'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SkipForward, RefreshCw, Undo2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Question { id: string; category_id: string; question_text: string; answer_text: string; points: number; order_index: number; is_answered: boolean; skipped: boolean }
interface BuzzItem { participantId: string; username: string; buzzOrder: number }

interface Props {
  session: { id: string; joinCode: string; status: string; currentQuestionId: string | null }
  quiz: { id: string; title: string; negative_marking: boolean }
  questions: Question[]
}

export default function ControllerClient({ session, quiz, questions: initialQuestions }: Props) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [currentQuestionId, setCurrentQuestionId] = useState(session.currentQuestionId)
  const [buzzList, setBuzzList] = useState<BuzzItem[]>([])
  const [revealAnswer, setRevealAnswer] = useState(false)
  const [lastAction, setLastAction] = useState<{ participantId: string; questionId: string } | null>(null)
  const [scoring, setScoring] = useState(false)

  const supabase = createClient()
  const currentQuestion = currentQuestionId ? questions.find(q => q.id === currentQuestionId) ?? null : null
  const topBuzzer = buzzList[0] ?? null

  useEffect(() => {
    const channel = supabase.channel(`session:${session.id}`)

    channel
      .on('broadcast', { event: 'buzz' }, ({ payload }) => {
        setBuzzList(prev => {
          const exists = prev.find(b => b.participantId === payload.participantId)
          if (exists) return prev
          return [...prev, payload].sort((a, b) => a.buzzOrder - b.buzzOrder)
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` }, ({ new: row }) => {
        if (row.current_question_id !== currentQuestionId) {
          setCurrentQuestionId(row.current_question_id)
          setBuzzList([])
          setRevealAnswer(false)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session.id, currentQuestionId])

  async function scoreAction(result: 'correct' | 'wrong') {
    if (!currentQuestion || !topBuzzer || scoring) return
    setScoring(true)
    setLastAction({ participantId: topBuzzer.participantId, questionId: currentQuestion.id })

    await fetch(`/api/session/${session.id}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: currentQuestion.id, participantId: topBuzzer.participantId, result }),
    })

    if (result === 'correct') {
      setRevealAnswer(true)
      setQuestions(prev => prev.map(q => q.id === currentQuestion.id ? { ...q, is_answered: true } : q))
      setTimeout(() => { setCurrentQuestionId(null); setBuzzList([]); setRevealAnswer(false) }, 2000)
    } else {
      setBuzzList(prev => prev.slice(1))
    }
    setScoring(false)
  }

  async function skipQuestion() {
    if (!currentQuestion) return
    await fetch(`/api/session/${session.id}/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: currentQuestion.id }),
    })
    setQuestions(prev => prev.map(q => q.id === currentQuestion.id ? { ...q, is_answered: true, skipped: true } : q))
    setCurrentQuestionId(null)
    setBuzzList([])
    setRevealAnswer(false)
  }

  async function resetBuzzer() {
    if (!currentQuestion) return
    await fetch(`/api/session/${session.id}/reset-buzzer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: currentQuestion.id }),
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
    setCurrentQuestionId(null)
    setBuzzList([])
    setRevealAnswer(false)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="font-black text-white text-lg">{quiz.title}</h1>
        <p className="text-xs text-gray-500 mt-0.5">Controller · Code: {session.joinCode}</p>
      </div>

      {!currentQuestion ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-gray-400 text-sm">Waiting for a question to be opened on the board…</p>
          <p className="text-gray-600 text-xs mt-2">Select a tile on the laptop screen</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* Current Question */}
          <div className="rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-yellow-400 font-black text-lg">{currentQuestion.points} pts</span>
              {quiz.negative_marking && <span className="text-xs text-orange-400">−ve marking on</span>}
            </div>
            <p className="text-white font-medium leading-snug">{currentQuestion.question_text}</p>
            {revealAnswer && (
              <div className="mt-3 p-3 rounded-lg bg-green-900/30 border border-green-500/30">
                <p className="text-xs text-green-400 mb-1">ANSWER</p>
                <p className="text-green-300 font-bold">{currentQuestion.answer_text}</p>
              </div>
            )}
          </div>

          {/* Buzz Order */}
          {buzzList.length > 0 && (
            <div className="rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Buzz Order</p>
              <div className="space-y-2">
                {buzzList.map((b, i) => (
                  <div key={b.participantId} className={cn('flex items-center gap-3 px-3 py-2 rounded-lg', i === 0 ? 'bg-green-900/40 border border-green-500/30' : 'bg-white/5')}>
                    <span className={cn('w-5 text-sm font-bold', i === 0 ? 'text-green-400' : 'text-gray-600')}>#{b.buzzOrder}</span>
                    <span className={cn('font-medium flex-1', i === 0 ? 'text-green-300' : 'text-gray-400')}>{b.username}</span>
                    {i === 0 && <span className="text-xs text-green-400 font-bold">ANSWERING</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {buzzList.length === 0 && (
            <div className="rounded-xl border px-4 py-6 text-center text-gray-600 text-sm" style={{ borderColor: 'var(--border)' }}>
              No buzzes yet — waiting for participants…
            </div>
          )}

          {/* Primary action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => scoreAction('correct')}
              disabled={!topBuzzer || revealAnswer || scoring}
              className="flex-1 py-5 rounded-2xl bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white font-black text-xl transition-colors active:scale-95"
            >
              {scoring ? <Loader2 size={20} className="animate-spin mx-auto" /> : '✓'}
            </button>
            <button
              onClick={() => scoreAction('wrong')}
              disabled={!topBuzzer || revealAnswer || scoring}
              className="flex-1 py-5 rounded-2xl bg-red-700 hover:bg-red-600 disabled:opacity-30 text-white font-black text-xl transition-colors active:scale-95"
            >
              ✗
            </button>
          </div>

          {/* Secondary buttons */}
          <div className="flex gap-2">
            <button onClick={skipQuestion} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border text-sm text-gray-300 hover:text-white transition-colors active:scale-95" style={{ borderColor: 'var(--border)' }}>
              <SkipForward size={14} /> Skip
            </button>
            {lastAction && (
              <button onClick={undoLastAction} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-yellow-500/40 text-sm text-yellow-300 hover:text-yellow-100 transition-colors active:scale-95">
                <Undo2 size={14} /> Undo
              </button>
            )}
            <button onClick={resetBuzzer} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border text-sm text-gray-300 hover:text-white transition-colors active:scale-95" style={{ borderColor: 'var(--border)' }}>
              <RefreshCw size={14} /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
