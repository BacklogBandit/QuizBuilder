import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const body = await req.json()
  const { joinCode, username } = body
  if (!joinCode || !username?.trim()) {
    return NextResponse.json({ error: 'joinCode and username required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Look up session
  const { data: session } = await service
    .from('sessions')
    .select('id, status, quiz_id')
    .eq('join_code', joinCode.toUpperCase())
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found. Check your code.' }, { status: 404 })
  if (session.status === 'ended') return NextResponse.json({ error: 'This quiz has ended.' }, { status: 410 })

  // Get or create participant
  const cookieStore = await cookies()
  let deviceToken = cookieStore.get('participant_token')?.value
  if (!deviceToken) deviceToken = randomUUID()

  // Upsert participant
  const { data: participant, error } = await service
    .from('participants')
    .upsert(
      { session_id: session.id, username: username.trim(), device_token: deviceToken, total_score: 0 },
      { onConflict: 'device_token', ignoreDuplicates: false }
    )
    .select('id, username, total_score')
    .single()

  if (error) {
    // Check if username taken
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Username already taken in this session.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const response = NextResponse.json({ sessionId: session.id, participantId: participant.id, username: participant.username })
  response.cookies.set('participant_token', deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return response
}
