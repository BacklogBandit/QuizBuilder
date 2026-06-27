import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateJoinCode } from '@/lib/utils'

export async function GET(req: Request) {
  // Redirect from dashboard "Launch" link
  const { searchParams } = new URL(req.url)
  const quizId = searchParams.get('quizId')
  if (!quizId) return NextResponse.redirect(new URL('/dashboard', req.url))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const service = createServiceClient()

  // Check quiz ownership
  const { data: quiz } = await service.from('quizzes').select('master_id, status').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.redirect(new URL('/dashboard', req.url))

  // Generate unique join code
  let joinCode = generateJoinCode()
  let attempts = 0
  while (attempts < 10) {
    const { data: existing } = await service.from('sessions').select('id').eq('join_code', joinCode).single()
    if (!existing) break
    joinCode = generateJoinCode()
    attempts++
  }

  const { data: session, error } = await service
    .from('sessions')
    .insert({ quiz_id: quizId, join_code: joinCode, status: 'waiting' })
    .select('id')
    .single()

  if (error) return NextResponse.redirect(new URL('/dashboard?error=create_failed', req.url))

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

  let joinCode = generateJoinCode()
  let attempts = 0
  while (attempts < 10) {
    const { data: existing } = await service.from('sessions').select('id').eq('join_code', joinCode).single()
    if (!existing) break
    joinCode = generateJoinCode()
    attempts++
  }

  const { data: session, error } = await service
    .from('sessions')
    .insert({ quiz_id: quizId, join_code: joinCode, status: 'waiting' })
    .select('id, join_code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessionId: session.id, joinCode: session.join_code })
}
