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
  const { categoryId, topic, context, count = 5, difficulty = 'medium', point_increment = 10 } = body
  if (!categoryId || !topic) return NextResponse.json({ error: 'categoryId and topic required' }, { status: 400 })

  const difficultyMap: Record<string, string> = {
    easy: 'straightforward',
    medium: 'moderately challenging',
    hard: 'difficult, requiring deep knowledge',
  }
  const difficultyDesc = difficultyMap[difficulty] ?? 'moderately challenging'

  const prompt = `Generate exactly ${count} trivia questions about: "${topic}"${context ? `\nAdditional context: ${context}` : ''}

Requirements:
- Difficulty: ${difficultyDesc}
- Each question must be clear and unambiguous
- Answers must be factually correct and concise (1-5 words ideally)
- Points: assign ${count} questions with values ${Array.from({ length: count }, (_, i) => (i + 1) * point_increment).join(', ')} in order of difficulty (easiest first)

Respond with a JSON array ONLY, no markdown, no explanation:
[
  {
    "question_text": "...",
    "answer_text": "...",
    "points": ${point_increment}
  }
]`

  const completion = await openai.chat.completions.create({
    model: 'anthropic/claude-3-5-haiku',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''
  let questions: { question_text: string; answer_text: string; points: number }[]
  try {
    const jsonStr = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    questions = JSON.parse(jsonStr)
    if (!Array.isArray(questions)) throw new Error('Not an array')
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }

  const rows = questions.map((q, i) => ({
    category_id: categoryId,
    question_text: q.question_text,
    answer_text: q.answer_text,
    points: q.points ?? (i + 1) * point_increment,
    order_index: i,
    type: 'text' as const,
  }))

  const { data: inserted, error } = await service.from('questions').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ questions: inserted })
}
