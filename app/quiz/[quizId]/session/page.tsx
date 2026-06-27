import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import QuizBoard from './QuizBoard'

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { quizId } = await params
  const { sessionId } = await searchParams
  if (!sessionId) redirect(`/quiz/${quizId}/configure`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // Verify QM + load data
  const { data: quiz } = await service
    .from('quizzes')
    .select('id, title, negative_marking')
    .eq('id', quizId)
    .eq('master_id', user.id)
    .single()

  if (!quiz) redirect('/dashboard')

  const { data: session } = await service
    .from('sessions')
    .select('id, join_code, status')
    .eq('id', sessionId)
    .single()

  if (!session) redirect('/dashboard')

  const { data: categories } = await service
    .from('categories')
    .select('id, title, order_index, point_increment')
    .eq('quiz_id', quizId)
    .order('order_index')

  const { data: questions } = categories?.length
    ? await service
        .from('questions')
        .select('id, category_id, question_text, answer_text, points, order_index, is_answered, skipped')
        .in('category_id', categories.map(c => c.id))
        .order('order_index')
    : { data: [] }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <QuizBoard
      quiz={quiz}
      session={session}
      categories={categories ?? []}
      questions={questions ?? []}
      appUrl={appUrl}
    />
  )
}
