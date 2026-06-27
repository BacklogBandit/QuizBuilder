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
  const { questionId, participantId, result } = body // result: 'correct' | 'wrong'
  if (!questionId || !participantId || !result) {
    return NextResponse.json({ error: 'questionId, participantId, result required' }, { status: 400 })
  }

  // Get question points
  const { data: question } = await service.from('questions').select('points').eq('id', questionId).single()
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const pointsDelta = result === 'correct' ? question.points : quiz.negative_marking ? -question.points : 0

  // Update buzz event
  await service
    .from('buzz_events')
    .update({ result, points_delta: pointsDelta })
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .eq('participant_id', participantId)

  // Update participant score
  if (pointsDelta !== 0) {
    await service.rpc('increment_score', { participant_id: participantId, delta: pointsDelta })
  }

  // Mark question answered if correct
  if (result === 'correct') {
    await service.from('questions').update({ is_answered: true }).eq('id', questionId)
  }

  return NextResponse.json({ ok: true, pointsDelta })
}
