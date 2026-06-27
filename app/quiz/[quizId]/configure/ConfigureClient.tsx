'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, RefreshCw, Play, Loader2, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Category { id: string; title: string; order_index: number; source_type: string; point_increment: number }
interface Question { id: string; category_id: string; question_text: string; answer_text: string; points: number; order_index: number; is_answered: boolean }

interface Props {
  quiz: { id: string; title: string; negative_marking: boolean; status: string }
  initialCategories: Category[]
  initialQuestions: Question[]
}

export default function ConfigureClient({ quiz, initialCategories, initialQuestions }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [launching, setLaunching] = useState(false)

  function questionsFor(catId: string) {
    return questions.filter(q => q.category_id === catId).sort((a, b) => a.order_index - b.order_index)
  }

  async function deleteCategory(catId: string) {
    if (!confirm('Delete this category and all its questions?')) return
    await fetch(`/api/quiz/${quiz.id}/category?categoryId=${catId}`, { method: 'DELETE' })
    setCategories(prev => prev.filter(c => c.id !== catId))
    setQuestions(prev => prev.filter(q => q.category_id !== catId))
  }

  async function regenerateQuestion(q: Question, topic: string) {
    const res = await fetch(`/api/quiz/${quiz.id}/regenerate-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, topic, points: q.points }),
    })
    const data = await res.json()
    if (data.question) {
      setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, ...data.question } : x))
    }
  }

  async function launchQuiz() {
    setLaunching(true)
    const res = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId: quiz.id }),
    })
    const data = await res.json()
    if (data.sessionId) {
      window.location.href = `/quiz/${quiz.id}/session?sessionId=${data.sessionId}`
    } else {
      setLaunching(false)
    }
  }

  const totalQuestions = questions.length
  const canLaunch = categories.length > 0 && totalQuestions > 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="font-bold text-white text-lg leading-none">{quiz.title}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} · {totalQuestions} question{totalQuestions !== 1 ? 's' : ''}
              {quiz.negative_marking ? ' · −ve marking' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddCategory(true)}
            className="flex items-center gap-1.5 text-sm border px-3 py-2 rounded-lg hover:border-purple-500 hover:text-white text-gray-300 transition-colors"
            style={{ borderColor: 'var(--border)' }}
          >
            <Plus size={14} /> Add Category
          </button>
          <button
            onClick={launchQuiz}
            disabled={!canLaunch || launching}
            className="flex items-center gap-1.5 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {launching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {launching ? 'Launching…' : 'Launch Quiz'}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Board Preview */}
        {categories.length > 0 && (
          <BoardPreview categories={categories} questions={questions} quizTitle={quiz.title} />
        )}

        {/* Category Cards */}
        {categories.length === 0 ? (
          <EmptyCategories onAdd={() => setShowAddCategory(true)} />
        ) : (
          <div className="space-y-4">
            {categories.map(cat => (
              <CategoryCard
                key={cat.id}
                quiz={quiz}
                category={cat}
                questions={questionsFor(cat.id)}
                onDelete={() => deleteCategory(cat.id)}
                onQuestionsUpdate={newQs => {
                  setQuestions(prev => [...prev.filter(q => q.category_id !== cat.id), ...newQs])
                }}
                onRegenerate={regenerateQuestion}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Category Modal */}
      {showAddCategory && (
        <AddCategoryModal
          quizId={quiz.id}
          orderIndex={categories.length}
          onClose={() => setShowAddCategory(false)}
          onCreated={(cat, qs) => {
            setCategories(prev => [...prev, cat])
            setQuestions(prev => [...prev, ...qs])
            setShowAddCategory(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Board Preview ───────────────────────────────────────────

function BoardPreview({ categories, questions, quizTitle }: { categories: Category[]; questions: Question[]; quizTitle: string }) {
  const cols = Math.min(categories.length, 6)
  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs text-gray-500 px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        Board Preview
      </p>
      <div className="bg-quiz-gradient p-4">
        <h2 className="text-center text-white font-black text-lg mb-3 tracking-wide">{quizTitle}</h2>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {categories.slice(0, 6).map(cat => {
            const catQs = questions.filter(q => q.category_id === cat.id).sort((a, b) => a.order_index - b.order_index)
            return (
              <div key={cat.id} className="space-y-1.5">
                <div className="bg-purple-800/80 rounded px-2 py-2 text-center text-xs font-bold text-purple-100 uppercase tracking-wide truncate">
                  {cat.title}
                </div>
                {catQs.map(q => (
                  <div key={q.id} className="bg-purple-200/10 border border-purple-400/20 rounded px-2 py-2 text-center">
                    <span className="text-yellow-300 font-black text-sm">{q.points}</span>
                  </div>
                ))}
                {catQs.length === 0 && (
                  <div className="bg-purple-200/5 rounded px-2 py-2 text-center text-gray-600 text-xs">no questions</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────

function EmptyCategories({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed py-20 text-center" style={{ borderColor: 'var(--border)' }}>
      <div className="text-4xl mb-3">🗂️</div>
      <h2 className="text-lg font-semibold text-white mb-1">No categories yet</h2>
      <p className="text-sm text-gray-400 mb-6">Add a category (column) to start building your board</p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} /> Add First Category
      </button>
    </div>
  )
}

// ─── Category Card ───────────────────────────────────────────

function CategoryCard({
  quiz, category, questions, onDelete, onQuestionsUpdate, onRegenerate
}: {
  quiz: Props['quiz']
  category: Category
  questions: Question[]
  onDelete: () => void
  onQuestionsUpdate: (qs: Question[]) => void
  onRegenerate: (q: Question, topic: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [catTopic, setCatTopic] = useState('')

  async function handleRegenerate(q: Question) {
    const topic = catTopic || category.title
    setRegeneratingId(q.id)
    await onRegenerate(q, topic)
    setRegeneratingId(null)
  }

  return (
    <div className="rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setCollapsed(v => !v)} className="text-gray-400 hover:text-white">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <div>
            <h3 className="font-semibold text-white">{category.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {questions.length} question{questions.length !== 1 ? 's' : ''} · {category.source_type === 'sheet' ? 'Google Sheets' : 'AI Generated'} · +{category.point_increment} pts
            </p>
          </div>
        </div>
        <button onClick={onDelete} className="text-gray-600 hover:text-red-400 transition-colors p-1">
          <Trash2 size={15} />
        </button>
      </div>

      {!collapsed && questions.length > 0 && (
        <div className="border-t px-5 py-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          {/* Topic hint for AI regen */}
          {category.source_type === 'ai' && (
            <input
              type="text"
              value={catTopic}
              onChange={e => setCatTopic(e.target.value)}
              placeholder={`Topic hint for ↻ (defaults to "${category.title}")`}
              className="w-full px-3 py-2 rounded text-xs text-white placeholder-gray-600 outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            />
          )}
          {questions.map(q => (
            <div key={q.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--bg)' }}>
              <span className="text-yellow-400 font-black text-sm w-10 shrink-0">{q.points}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white leading-snug">{q.question_text}</p>
                <p className="text-xs text-green-400 mt-1">✓ {q.answer_text}</p>
              </div>
              {category.source_type === 'ai' && (
                <button
                  onClick={() => handleRegenerate(q)}
                  disabled={regeneratingId === q.id}
                  title="Regenerate this question"
                  className="text-gray-500 hover:text-purple-400 transition-colors shrink-0 mt-0.5"
                >
                  {regeneratingId === q.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <RefreshCw size={14} />
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!collapsed && questions.length === 0 && (
        <div className="border-t px-5 py-8 text-center text-sm text-gray-600" style={{ borderColor: 'var(--border)' }}>
          No questions yet
        </div>
      )}
    </div>
  )
}

// ─── Add Category Modal ──────────────────────────────────────

type SourceTab = 'ai' | 'sheet'

function AddCategoryModal({
  quizId, orderIndex, onClose, onCreated
}: {
  quizId: string
  orderIndex: number
  onClose: () => void
  onCreated: (cat: Category, qs: Question[]) => void
}) {
  const [tab, setTab] = useState<SourceTab>('ai')
  const [title, setTitle] = useState('')
  const [pointIncrement, setPointIncrement] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // AI fields
  const [topic, setTopic] = useState('')
  const [context, setContext] = useState('')
  const [count, setCount] = useState(5)
  const [difficulty, setDifficulty] = useState('medium')

  // Sheet fields
  const [sheetUrl, setSheetUrl] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Category title required'); return }
    setLoading(true)
    setError('')

    try {
      // 1. Create category
      const catRes = await fetch(`/api/quiz/${quizId}/category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), source_type: tab, point_increment: pointIncrement, order_index: orderIndex }),
      })
      const catData = await catRes.json()
      if (!catRes.ok) throw new Error(catData.error)
      const categoryId = catData.categoryId

      let questions: Question[] = []

      // 2. Generate / import questions
      if (tab === 'ai') {
        if (!topic.trim()) throw new Error('Topic required for AI generation')
        const genRes = await fetch(`/api/quiz/${quizId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId, topic: topic.trim(), context: context.trim(), count, difficulty, point_increment: pointIncrement }),
        })
        const genData = await genRes.json()
        if (!genRes.ok) throw new Error(genData.error)
        questions = genData.questions
      } else {
        if (!sheetUrl.trim()) throw new Error('Sheet URL required')
        const sheetRes = await fetch(`/api/quiz/${quizId}/import-sheet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId, sheetUrl: sheetUrl.trim(), point_increment: pointIncrement }),
        })
        const sheetData = await sheetRes.json()
        if (!sheetRes.ok) throw new Error(sheetData.error)
        questions = sheetData.questions
      }

      onCreated(
        { id: categoryId, title: title.trim(), order_index: orderIndex, source_type: tab, point_increment: pointIncrement },
        questions
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border overflow-auto max-h-[90vh]" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold text-white text-lg">Add Category</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Category Title */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Category Name</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. World Capitals"
              className="w-full px-3 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              required
            />
          </div>

          {/* Point Increment */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Point Increment: <span className="text-white">{pointIncrement}</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">Questions will be worth {Array.from({ length: 5 }, (_, i) => (i + 1) * pointIncrement).join(', ')} points</p>
            <input
              type="range"
              min={5} max={50} step={5}
              value={pointIncrement}
              onChange={e => setPointIncrement(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Source Tabs */}
          <div>
            <div className="flex rounded-lg overflow-hidden border mb-4" style={{ borderColor: 'var(--border)' }}>
              {(['ai', 'sheet'] as SourceTab[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-2 text-sm font-medium transition-colors',
                    tab === t ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  )}
                  style={tab !== t ? { background: 'var(--bg)' } : {}}
                >
                  {t === 'ai' ? '✨ AI Generate' : '📊 Google Sheets'}
                </button>
              ))}
            </div>

            {tab === 'ai' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Topic *</label>
                  <input
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. FIFA World Cup history"
                    className="w-full px-3 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Context <span className="text-gray-600">(optional)</span></label>
                  <input
                    value={context}
                    onChange={e => setContext(e.target.value)}
                    placeholder='e.g. "EA Sports FIFA game, not the tournament"'
                    className="w-full px-3 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Questions: <span className="text-white">{count}</span>
                    </label>
                    <input type="range" min={3} max={15} step={1} value={count}
                      onChange={e => setCount(Number(e.target.value))} className="w-full" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Difficulty</label>
                    <select
                      value={difficulty}
                      onChange={e => setDifficulty(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    <span className="flex items-center gap-1"><Link2 size={12} /> Google Sheets URL</span>
                  </label>
                  <input
                    value={sheetUrl}
                    onChange={e => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-3 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  />
                </div>
                <div className="rounded-lg p-3 text-xs text-gray-400" style={{ background: 'var(--bg)' }}>
                  <p className="font-medium text-gray-300 mb-1.5">📋 Sheet format</p>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <span className="text-purple-300">A: Question</span>
                    <span className="text-green-300">B: Answer</span>
                    <span className="text-yellow-300">C: Points (opt)</span>
                  </div>
                  <p className="mt-2 text-gray-600">Row 1 is header (skipped). If column C is empty, points are auto-assigned using the increment above.</p>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white border transition-colors" style={{ borderColor: 'var(--border)' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold transition-colors"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> {tab === 'ai' ? 'Generating…' : 'Importing…'}</> : 'Add Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
