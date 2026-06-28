import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Play, Clock } from 'lucide-react'
import DeleteQuizButton from '@/components/DeleteQuizButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('id, title, status, negative_marking, created_at')
    .eq('master_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="text-xl font-black text-white tracking-tight">
          Quiz<span className="text-purple-300">Master</span>
        </div>
        <form action="/auth/signout" method="post">
          <button
            formAction="/auth/signout"
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Title row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Your Quizzes</h1>
            <p className="text-sm text-gray-400 mt-1">
              {quizzes?.length ?? 0} quiz{quizzes?.length !== 1 ? 'zes' : ''}
            </p>
          </div>
          <Link
            href="/quiz/new"
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Quiz
          </Link>
        </div>

        {/* Quiz list */}
        {!quizzes || quizzes.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {quizzes.map((quiz) => (
              <QuizCard key={quiz.id} quiz={quiz} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed py-20 text-center" style={{ borderColor: 'var(--border)' }}>
      <div className="text-4xl mb-3">🎯</div>
      <h2 className="text-lg font-semibold text-white mb-1">No quizzes yet</h2>
      <p className="text-sm text-gray-400 mb-6">Create your first quiz to get started</p>
      <Link
        href="/quiz/new"
        className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} />
        Create Quiz
      </Link>
    </div>
  )
}

function QuizCard({ quiz }: { quiz: { id: string; title: string; status: string; negative_marking: boolean; created_at: string } }) {
  const statusColors: Record<string, string> = {
    draft: 'bg-gray-700 text-gray-300',
    active: 'bg-green-900/60 text-green-300',
    ended: 'bg-purple-900/60 text-purple-300',
  }
  const date = new Date(quiz.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div
      className="flex items-center justify-between p-5 rounded-xl border hover:border-purple-500/50 transition-colors"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <h3 className="font-semibold text-white truncate">{quiz.title}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock size={11} />
              {date}
            </span>
            {quiz.negative_marking && (
              <span className="text-xs text-orange-400">−ve marking</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-4 shrink-0">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[quiz.status] ?? 'bg-gray-700 text-gray-300'}`}>
          {quiz.status}
        </span>
        <Link
          href={`/quiz/${quiz.id}/configure`}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--border)' }}
        >
          Edit
        </Link>
        {quiz.status === 'draft' && (
          <Link
            href={`/api/session/create?quizId=${quiz.id}`}
            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Play size={12} />
            Launch
          </Link>
        )}
        <DeleteQuizButton quizId={quiz.id} quizTitle={quiz.title} />
      </div>
    </div>
  )
}
