import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const service = createServiceClient()

  const { data, error } = await service
    .from('participants')
    .select('id, username, total_score')
    .eq('session_id', sessionId)
    .order('total_score', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leaderboard: data })
}

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  // End the session
  const { sessionId } = await params
  const service = createServiceClient()
  await service
    .from('sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
  return NextResponse.json({ ok: true })
}
