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
    .select('quiz_id, quizzes(master_id, negative_marking)')
    .eq('id', sessionId)
    .single()

  const quiz = (session?.quizzes as { master_id: string; negative_marking: boolean } | null)
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { questionId, participantId } = body
  if (!questionId || !participantId) return NextResponse.json({ error: 'questionId and participantId required' }, { status: 400 })

  // Get the buzz event to undo
  const { data: buzz } = await service
    .from('buzz_events')
    .select('result, points_delta')
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .eq('participant_id', participantId)
    .not('result', 'is', null)
    .single()

  if (!buzz) return NextResponse.json({ error: 'No scored event to undo' }, { status: 404 })

  // Reverse the score
  if (buzz.points_delta !== 0 && buzz.points_delta != null) {
    await service.rpc('increment_score', { participant_id: participantId, delta: -buzz.points_delta })
  }

  // Clear the result on the buzz event
  await service
    .from('buzz_events')
    .update({ result: null, points_delta: null })
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .eq('participant_id', participantId)

  // Un-answer the question
  await service.from('questions').update({ is_answered: false, skipped: false }).eq('id', questionId)

  return NextResponse.json({ ok: true, reversed: buzz.points_delta })
}
