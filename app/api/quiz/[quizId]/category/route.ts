import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify ownership
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { title, source_type, point_increment, order_index } = body
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const { data, error } = await service
    .from('categories')
    .insert({ quiz_id: quizId, title: title.trim(), source_type: source_type ?? 'ai', point_increment: point_increment ?? 10, order_index: order_index ?? 0 })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categoryId: data.id })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('categoryId')
  if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 })

  await service.from('categories').delete().eq('id', categoryId).eq('quiz_id', quizId)
  return NextResponse.json({ ok: true })
}
