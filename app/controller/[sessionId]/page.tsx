import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ControllerClient from './ControllerClient'

export default async function ControllerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirectTo=/controller/${sessionId}`)

  const service = createServiceClient()
  const { data: session } = await service
    .from('sessions')
    .select('id, quiz_id, join_code, status, current_question_id, quizzes(id, title, master_id, negative_marking)')
    .eq('id', sessionId)
    .single()

  if (!session) redirect('/dashboard')

  const quiz = session.quizzes as { id: string; title: string; master_id: string; negative_marking: boolean }
  if (quiz.master_id !== user.id) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <p className="text-red-400 font-semibold mb-2">Access Denied</p>
          <p className="text-gray-400 text-sm">You are not the Quiz Master for this session.</p>
        </div>
      </div>
    )
  }

  const { data: categories } = await service
    .from('categories')
    .select('id, title, order_index')
    .eq('quiz_id', quiz.id)
    .order('order_index')

  const { data: questions } = categories?.length
    ? await service
        .from('questions')
        .select('id, category_id, question_text, answer_text, points, order_index, is_answered, skipped')
        .in('category_id', categories.map((c: { id: string }) => c.id))
        .order('order_index')
    : { data: [] }

  return (
    <ControllerClient
      session={{ id: session.id, joinCode: session.join_code, status: session.status, currentQuestionId: session.current_question_id }}
      quiz={quiz}
      questions={questions ?? []}
    />
  )
}
