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

  // Atomically assign buzz order via RPC.
  // The assign_buzz() function uses pg_advisory_xact_lock(hashtext(question_id))
  // to serialise concurrent inserts — only one connection at a time can compute
  // and insert buzz_order for a given question, so duplicates are impossible.
  const { data: buzzOrder, error } = await service.rpc('assign_buzz', {
    p_session_id: sessionId,
    p_question_id: questionId,
    p_participant_id: participant.id,
  })

  if (error) {
    console.error('[buzz] assign_buzz RPC error:', error)
    return NextResponse.json({ error: 'Failed to record buzz' }, { status: 500 })
  }

  return NextResponse.json({ buzzOrder })
}
