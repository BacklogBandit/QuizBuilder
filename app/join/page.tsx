'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !username.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/session/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode: code.trim().toUpperCase(), username: username.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/play/${data.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(ellipse at 50% 50%, #2d1b69 0%, #0a0314 70%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-black text-white mb-1 tracking-tight">
            Quiz<span className="text-purple-300">Master</span>
          </div>
          <p className="text-sm text-gray-400">Join a live quiz</p>
        </div>

        <form onSubmit={handleJoin} className="bg-white/5 border border-purple-300/20 rounded-2xl p-7 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Session Code</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-center text-2xl font-mono font-bold tracking-widest outline-none focus:ring-2 focus:ring-purple-500"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              maxLength={6}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Your Name</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              maxLength={20}
              required
            />
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length < 4 || !username.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-base transition-colors"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Joining…</> : 'Join Quiz →'}
          </button>
        </form>

        <p className="text-center mt-5 text-xs text-gray-600">
          Are you the Quiz Master?{' '}
          <a href="/login" className="text-purple-400 hover:text-purple-300 transition-colors">Sign in →</a>
        </p>
      </div>
    </div>
  )
}
