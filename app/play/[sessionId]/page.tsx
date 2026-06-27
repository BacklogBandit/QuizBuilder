'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Participant { id: string; username: string; total_score: number }

export default function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [myInfo, setMyInfo] = useState<{ participantId: string; username: string } | null>(null)
  const [myScore, setMyScore] = useState(0)
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>('waiting')
  const [buzzState, setBuzzState] = useState<'idle' | 'first' | 'other' | 'loading'>('idle')
  const [myBuzzOrder, setMyBuzzOrder] = useState<number | null>(null)
  const [leaderboard, setLeaderboard] = useState<Participant[]>([])
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      // Get my participant info from cookie-backed API
      const res = await fetch(`/api/session/${sessionId}/me`)
      if (res.ok) {
        const data = await res.json()
        setMyInfo({ participantId: data.id, username: data.username })
        setMyScore(data.total_score)
      }
      setLoading(false)
    }
    init()
  }, [sessionId])

  useEffect(() => {
    const channel = supabase.channel(`session:${sessionId}`)

    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, ({ new: row }) => {
        setSessionStatus(row.status)
        if (row.current_question_id !== currentQuestionId) {
          setCurrentQuestionId(row.current_question_id)
          setBuzzState('idle')
          setMyBuzzOrder(null)
        }
        if (row.status === 'ended') {
          loadLeaderboard()
          setShowLeaderboard(true)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter: `id=eq.${myInfo?.participantId}` }, ({ new: row }) => {
        setMyScore(row.total_score)
      })
      .subscribe()

    // Load initial session state
    supabase.from('sessions').select('status, current_question_id').eq('id', sessionId).single().then(({ data }) => {
      if (data) {
        setSessionStatus(data.status)
        setCurrentQuestionId(data.current_question_id)
        if (data.status === 'ended') { loadLeaderboard(); setShowLeaderboard(true) }
      }
    })

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, myInfo?.participantId])

  async function loadLeaderboard() {
    const res = await fetch(`/api/session/${sessionId}/leaderboard`)
    const data = await res.json()
    setLeaderboard(data.leaderboard ?? [])
  }

  async function handleBuzz() {
    if (!currentQuestionId || !myInfo || buzzState !== 'idle') return
    setBuzzState('loading')

    try {
      const res = await fetch(`/api/session/${sessionId}/buzz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestionId }),
      })
      const data = await res.json()

      // Broadcast to board via realtime
      const channel = supabase.channel(`session:${sessionId}`)
      await channel.send({
        type: 'broadcast',
        event: 'buzz',
        payload: {
          participantId: myInfo.participantId,
          username: myInfo.username,
          buzzOrder: data.buzzOrder,
        },
      })

      setMyBuzzOrder(data.buzzOrder)
      setBuzzState(data.buzzOrder === 1 ? 'first' : 'other')
    } catch {
      setBuzzState('idle')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="animate-spin text-purple-400" size={32} />
      </div>
    )
  }

  if (!myInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <p className="text-white mb-4">You're not in this session.</p>
          <a href="/join" className="text-purple-400 hover:text-purple-300">Join a quiz →</a>
        </div>
      </div>
    )
  }

  if (showLeaderboard) {
    return <ParticipantLeaderboard leaderboard={leaderboard} myId={myInfo.participantId} />
  }

  if (sessionStatus === 'waiting') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, #2d1b69 0%, #0a0314 70%)' }}
      >
        <div className="text-2xl font-bold text-white mb-2">Welcome, {myInfo.username}!</div>
        <p className="text-purple-300 text-sm">Waiting for the quiz to start…</p>
        <div className="mt-8 flex gap-1">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-2 h-2 rounded-full bg-purple-500 animate-pulse-slow" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    )
  }

  const bgStyle =
    buzzState === 'first'
      ? 'radial-gradient(ellipse at 50% 50%, #14532d 0%, #052e16 60%, #0a0314 100%)'
      : buzzState === 'other'
      ? 'radial-gradient(ellipse at 50% 50%, #7f1d1d 0%, #450a0a 60%, #0a0314 100%)'
      : 'radial-gradient(ellipse at 50% 60%, #2d1b69 0%, #0a0314 70%)'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: bgStyle }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <span className="text-sm font-medium text-white">{myInfo.username}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm font-black text-purple-300">{myScore} pts</span>
          <button onClick={() => { loadLeaderboard(); setShowLeaderboard(true) }} className="text-purple-400 hover:text-purple-200">
            <Trophy size={18} />
          </button>
        </div>
      </div>

      {/* Main buzz area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {buzzState === 'first' ? (
          <div className="text-center">
            <div className="text-7xl mb-4">🎉</div>
            <h2 className="text-3xl font-black text-white">YOU'RE FIRST!</h2>
            <p className="text-green-300 mt-2">Answer the question!</p>
          </div>
        ) : buzzState === 'other' ? (
          <div className="text-center">
            <div className="text-7xl mb-4">#{myBuzzOrder}</div>
            <h2 className="text-2xl font-bold text-red-300">Someone buzzed first</h2>
            <p className="text-gray-400 mt-2">You're #{myBuzzOrder} in queue</p>
          </div>
        ) : buzzState === 'loading' ? (
          <Loader2 size={48} className="animate-spin text-purple-400" />
        ) : (
          <button
            onClick={handleBuzz}
            disabled={!currentQuestionId || sessionStatus !== 'live'}
            className={cn(
              'w-64 h-64 rounded-full flex items-center justify-center text-3xl font-black text-white transition-all active:scale-95',
              currentQuestionId && sessionStatus === 'live'
                ? 'bg-purple-600 hover:bg-purple-500 shadow-2xl shadow-purple-500/40 border-4 border-purple-400/50'
                : 'bg-gray-800 border-4 border-gray-700 opacity-40 cursor-not-allowed'
            )}
          >
            BUZZ!
          </button>
        )}

        {!currentQuestionId && sessionStatus === 'live' && buzzState === 'idle' && (
          <p className="text-purple-500 text-sm mt-6">Waiting for next question…</p>
        )}
      </div>
    </div>
  )
}

function ParticipantLeaderboard({ leaderboard, myId }: { leaderboard: Participant[]; myId: string }) {
  const sorted = [...leaderboard].sort((a, b) => b.total_score - a.total_score)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #2d1b69 0%, #0a0314 70%)' }}
    >
      <h1 className="text-3xl font-black text-white mb-1">Results</h1>
      <p className="text-purple-400 text-sm mb-8">Final leaderboard</p>

      <div className="w-full max-w-sm space-y-3">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-4 px-5 py-4 rounded-2xl border',
              p.id === myId ? 'bg-purple-800/60 border-purple-400/60' : 'bg-white/5 border-white/10',
              i === 0 && 'border-yellow-500/50 bg-yellow-900/20'
            )}
          >
            <span className="text-xl">{medals[i] ?? `${i + 1}.`}</span>
            <span className={cn('flex-1 font-semibold', p.id === myId ? 'text-purple-300' : 'text-white')}>
              {p.username} {p.id === myId && '(you)'}
            </span>
            <span className={cn('font-black text-lg', i === 0 ? 'text-yellow-400' : 'text-purple-300')}>
              {p.total_score}
            </span>
          </div>
        ))}
      </div>

      <a href="/join" className="mt-10 text-sm text-purple-400 hover:text-purple-300 transition-colors">
        Play another quiz →
      </a>
    </div>
  )
}
