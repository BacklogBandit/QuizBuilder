import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify QM ownership via session → quiz
  const { data: session } = await service
    .from('sessions')
    .select('quiz_id, quizzes(master_id)')
    .eq('id', sessionId)
    .single()

  const quiz = (session?.quizzes as { master_id: string } | null)
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await service
    .from('sessions')
    .update({ status: 'live', started_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
