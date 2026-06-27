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

const MODEL = process.env.AI_MODEL ?? 'google/gemini-3.1-flash-lite'

export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  console.log('\n[regenerate] ─── New request ──────────────────────')
  console.log('[regenerate] Using model:', MODEL)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { questionId, topic, context, difficulty = 'medium', points } = body
  console.log('[regenerate] Params:', { questionId, topic, context, difficulty, points })

  if (!questionId || !topic) return NextResponse.json({ error: 'questionId and topic required' }, { status: 400 })

  const difficultyMap: Record<string, string> = {
    easy: 'straightforward',
    medium: 'moderately challenging',
    hard: 'difficult, requiring deep knowledge',
  }

  const prompt = `Generate 1 trivia question about: "${topic}"${context ? `\nContext: ${context}` : ''}
Difficulty: ${difficultyMap[difficulty] ?? 'moderately challenging'}
Points value: ${points}

Return a JSON object with exactly these keys:
- "question_text": the question string
- "answer_text": the answer string (1-5 words, factually correct)

Return ONLY the JSON object, no explanation, no markdown.`

  console.log('[regenerate] Sending request to OpenRouter...')

  let raw = ''
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a trivia question generator. Always respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
    })
    raw = completion.choices[0]?.message?.content?.trim() ?? ''
    console.log('[regenerate] Raw response:\n', raw)
  } catch (apiErr) {
    console.error('[regenerate] OpenRouter API error:', apiErr)
    return NextResponse.json({ error: 'OpenRouter API call failed', details: String(apiErr) }, { status: 500 })
  }

  let q: { question_text: string; answer_text: string }
  try {
    q = JSON.parse(raw)
    console.log('[regenerate] Parsed question:', q)
  } catch (parseErr) {
    console.error('[regenerate] Parse failed:', parseErr, '\nRaw:', raw)
    return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }

  const { data, error } = await service
    .from('questions')
    .update({ question_text: q.question_text, answer_text: q.answer_text })
    .eq('id', questionId)
    .select()
    .single()

  if (error) {
    console.error('[regenerate] DB update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[regenerate] Done. Updated question:', data.id)
  console.log('[regenerate] ────────────────────────────────────────\n')
  return NextResponse.json({ question: data })
}
