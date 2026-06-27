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
  console.log('\n[generate] ─── New request ───────────────────────')
  console.log('[generate] Using model:', MODEL)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { categoryId, topic, context, count = 5, difficulty = 'medium', point_increment = 10 } = body
  console.log('[generate] Params:', { categoryId, topic, context, count, difficulty, point_increment })

  if (!categoryId || !topic) return NextResponse.json({ error: 'categoryId and topic required' }, { status: 400 })

  const difficultyMap: Record<string, string> = {
    easy: 'straightforward',
    medium: 'moderately challenging',
    hard: 'difficult, requiring deep knowledge',
  }
  const pointValues = Array.from({ length: count }, (_, i) => (i + 1) * point_increment)

  const prompt = `Generate exactly ${count} trivia questions about: "${topic}"${context ? `\nAdditional context: ${context}` : ''}

Requirements:
- Difficulty: ${difficultyMap[difficulty] ?? 'moderately challenging'}
- Questions must be clear and unambiguous
- Answers must be factually correct and concise (1-5 words ideally)
- Order questions from easiest to hardest
- Assign point values in this order: ${pointValues.join(', ')}

Return a JSON array with exactly ${count} objects, each with these keys:
- "question_text": the question string
- "answer_text": the answer string
- "points": the point value as an integer

Return ONLY the JSON array, no explanation, no markdown.`

  console.log('[generate] Sending request to OpenRouter...')

  let raw = ''
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
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
    console.log('[generate] Raw response:\n', raw)
    console.log('[generate] Finish reason:', completion.choices[0]?.finish_reason)
  } catch (apiErr) {
    console.error('[generate] OpenRouter API error:', apiErr)
    return NextResponse.json({ error: 'OpenRouter API call failed', details: String(apiErr) }, { status: 500 })
  }

  let questions: { question_text: string; answer_text: string; points: number }[]
  try {
    // json_object mode may wrap array in a key — handle both cases
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      questions = parsed
    } else {
      // Find the first array value in the object
      const arr = Object.values(parsed).find(v => Array.isArray(v))
      if (!arr) throw new Error('No array found in response object')
      questions = arr as typeof questions
    }
    console.log('[generate] Parsed', questions.length, 'questions successfully')
  } catch (parseErr) {
    console.error('[generate] Parse failed:', parseErr, '\nRaw:', raw)
    return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }

  const rows = questions.map((q, i) => ({
    category_id: categoryId,
    question_text: q.question_text,
    answer_text: q.answer_text,
    points: q.points ?? pointValues[i] ?? (i + 1) * point_increment,
    order_index: i,
    type: 'text' as const,
  }))

  console.log('[generate] Inserting', rows.length, 'rows into DB...')
  const { data: inserted, error } = await service.from('questions').insert(rows).select()
  if (error) {
    console.error('[generate] DB insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[generate] Done. Inserted', inserted.length, 'questions.')
  console.log('[generate] ────────────────────────────────────────\n')
  return NextResponse.json({ questions: inserted })
}
