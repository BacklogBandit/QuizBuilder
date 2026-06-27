import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ConfigureClient from './ConfigureClient'

export default async function ConfigurePage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: quiz } = await service
    .from('quizzes')
    .select('id, title, negative_marking, status')
    .eq('id', quizId)
    .eq('master_id', user.id)
    .single()

  if (!quiz) redirect('/dashboard')

  const { data: categories } = await service
    .from('categories')
    .select('id, title, order_index, source_type, point_increment')
    .eq('quiz_id', quizId)
    .order('order_index')

  const { data: questions } = categories?.length
    ? await service
        .from('questions')
        .select('id, category_id, question_text, answer_text, points, order_index, is_answered')
        .in('category_id', categories.map((c: { id: string }) => c.id))
        .order('order_index')
    : { data: [] }

  return (
    <ConfigureClient
      quiz={quiz}
      initialCategories={categories ?? []}
      initialQuestions={questions ?? []}
    />
  )
}
