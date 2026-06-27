'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function NewQuizPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [negativeMarking, setNegativeMarking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/quiz/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, negative_marking: negativeMarking }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/quiz/${data.quizId}/configure`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quiz')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors w-fit">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-6 py-14">
        <h1 className="text-2xl font-bold text-white mb-1">Create a Quiz</h1>
        <p className="text-sm text-gray-400 mb-8">You can add categories and questions in the next step.</p>

        <form onSubmit={handleCreate} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Quiz Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. FIFA World Cup 2026"
              className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              autoFocus
              required
            />
            <p className="text-xs text-gray-500 mt-1.5">This will appear as the board header during the live quiz.</p>
          </div>

          {/* Scoring */}
          <div>
            <p className="text-sm font-medium text-gray-300 mb-3">Scoring Mode</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="scoring"
                  checked={!negativeMarking}
                  onChange={() => setNegativeMarking(false)}
                  className="mt-0.5 accent-purple-500"
                />
                <div>
                  <span className="text-sm text-white font-medium">Standard</span>
                  <p className="text-xs text-gray-500 mt-0.5">Correct answer earns points. Wrong answers score nothing.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="scoring"
                  checked={negativeMarking}
                  onChange={() => setNegativeMarking(true)}
                  className="mt-0.5 accent-purple-500"
                />
                <div>
                  <span className="text-sm text-white font-medium">Negative Marking</span>
                  <p className="text-xs text-gray-500 mt-0.5">Wrong answers deduct the full question value from the team's score.</p>
                </div>
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : 'Create & Add Categories →'}
          </button>
        </form>
      </main>
    </div>
  )
}
