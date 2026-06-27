import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const cookieStore = await cookies()
  const deviceToken = cookieStore.get('participant_token')?.value

  if (!deviceToken) return NextResponse.json({ error: 'No participant token' }, { status: 401 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('participants')
    .select('id, username, total_score')
    .eq('session_id', sessionId)
    .eq('device_token', deviceToken)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
  return NextResponse.json(data)
}
