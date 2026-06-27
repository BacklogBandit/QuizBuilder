import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: session } = await service
    .from('sessions')
    .select('quiz_id, quizzes(master_id)')
    .eq('id', sessionId)
    .single()

  const quiz = (session?.quizzes as { master_id: string } | null)
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { questionId } = body
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 })

  // Delete all buzz events for this question so participants can re-buzz
  await service.from('buzz_events').delete().eq('session_id', sessionId).eq('question_id', questionId)

  return NextResponse.json({ ok: true })
}
