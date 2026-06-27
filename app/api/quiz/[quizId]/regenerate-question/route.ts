import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    'X-Title': 'QuizMaster',
  },
})

export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { questionId, topic, context, difficulty = 'medium', points } = body
  if (!questionId || !topic) return NextResponse.json({ error: 'questionId and topic required' }, { status: 400 })

  const difficultyMap: Record<string, string> = {
    easy: 'straightforward',
    medium: 'moderately challenging',
    hard: 'difficult, requiring deep knowledge',
  }

  const prompt = `Generate exactly 1 trivia question about: "${topic}"${context ? `\nContext: ${context}` : ''}
Difficulty: ${difficultyMap[difficulty] ?? 'moderately challenging'}
Points value: ${points}

Respond with JSON only, no markdown:
{"question_text": "...", "answer_text": "..."}`

  const completion = await openai.chat.completions.create({
    model: 'anthropic/claude-3-5-haiku',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  let q: { question_text: string; answer_text: string }
  try {
    const jsonStr = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    q = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }

  const { data, error } = await service
    .from('questions')
    .update({ question_text: q.question_text, answer_text: q.answer_text })
    .eq('id', questionId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data })
}
