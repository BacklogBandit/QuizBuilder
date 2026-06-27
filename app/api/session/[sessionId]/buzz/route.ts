import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const cookieStore = await cookies()
  const deviceToken = cookieStore.get('participant_token')?.value
  if (!deviceToken) return NextResponse.json({ error: 'No participant token' }, { status: 401 })

  const body = await req.json()
  const { questionId } = body
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 })

  const service = createServiceClient()

  // Get participant
  const { data: participant } = await service
    .from('participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('device_token', deviceToken)
    .single()

  if (!participant) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })

  // Check if already buzzed for this question
  const { data: existing } = await service
    .from('buzz_events')
    .select('id, buzz_order')
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .eq('participant_id', participant.id)
    .single()

  if (existing) {
    return NextResponse.json({ buzzOrder: existing.buzz_order, alreadyBuzzed: true })
  }

  // Get next buzz order
  const { count } = await service
    .from('buzz_events')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('question_id', questionId)

  const buzzOrder = (count ?? 0) + 1

  const { data: buzz, error } = await service
    .from('buzz_events')
    .insert({
      session_id: sessionId,
      question_id: questionId,
      participant_id: participant.id,
      buzz_order: buzzOrder,
      buzzed_at: new Date().toISOString(),
    })
    .select('id, buzz_order')
    .single()

  if (error) {
    // Race condition — try to get existing
    const { data: retry } = await service
      .from('buzz_events')
      .select('buzz_order')
      .eq('session_id', sessionId)
      .eq('question_id', questionId)
      .eq('participant_id', participant.id)
      .single()
    return NextResponse.json({ buzzOrder: retry?.buzz_order ?? 1, alreadyBuzzed: false })
  }

  return NextResponse.json({ buzzOrder: buzz.buzz_order, alreadyBuzzed: false })
}
