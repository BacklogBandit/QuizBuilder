import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateJoinCode } from '@/lib/utils'

async function resetQuestionsForQuiz(service: ReturnType<typeof createServiceClient>, quizId: string) {
  // Get all category IDs for this quiz
  const { data: categories } = await service
    .from('categories')
    .select('id')
    .eq('quiz_id', quizId)

  if (!categories?.length) return

  // Reset is_answered + skipped so every session starts with a fresh board
  await service
    .from('questions')
    .update({ is_answered: false, skipped: false })
    .in('category_id', categories.map((c: { id: string }) => c.id))
}

async function createSession(service: ReturnType<typeof createServiceClient>, quizId: string) {
  let joinCode = generateJoinCode()
  for (let i = 0; i < 10; i++) {
    const { data: existing } = await service.from('sessions').select('id').eq('join_code', joinCode).single()
    if (!existing) break
    joinCode = generateJoinCode()
  }
  return service
    .from('sessions')
    .insert({ quiz_id: quizId, join_code: joinCode, status: 'waiting' })
    .select('id, join_code')
    .single()
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const quizId = searchParams.get('quizId')
  if (!quizId) return NextResponse.redirect(new URL('/dashboard', req.url))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.redirect(new URL('/dashboard', req.url))

  await resetQuestionsForQuiz(service, quizId)

  const { data: session, error } = await createSession(service, quizId)
  if (error || !session) return NextResponse.redirect(new URL('/dashboard?error=create_failed', req.url))

  return NextResponse.redirect(new URL(`/quiz/${quizId}/session?sessionId=${session.id}`, req.url))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { quizId } = body
  if (!quizId) return NextResponse.json({ error: 'quizId required' }, { status: 400 })

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await resetQuestionsForQuiz(service, quizId)

  const { data: session, error } = await createSession(service, quizId)
  if (error || !session) return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 })

  return NextResponse.json({ sessionId: session.id, joinCode: session.join_code })
}
