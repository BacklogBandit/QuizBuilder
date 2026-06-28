import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify ownership before deleting
  const { data: quiz } = await service
    .from('quizzes')
    .select('master_id')
    .eq('id', quizId)
    .single()

  if (!quiz || quiz.master_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Cascade: questions + categories are deleted via DB FK cascade;
  // buzz_events + participants are tied to sessions which also cascade.
  const { error } = await service.from('quizzes').delete().eq('id', quizId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
