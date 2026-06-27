import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractSheetId } from '@/lib/utils'

export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const { data: { user }, data: authData } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { categoryId, sheetUrl, point_increment = 10 } = body
  if (!categoryId || !sheetUrl) return NextResponse.json({ error: 'categoryId and sheetUrl required' }, { status: 400 })

  const sheetId = extractSheetId(sheetUrl)
  if (!sheetId) return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 })

  // Get the user's Google OAuth token from Supabase session
  const { data: { session } } = await supabase.auth.getSession()
  const accessToken = session?.provider_token
  if (!accessToken) return NextResponse.json({ error: 'Google access token not found. Please re-login.' }, { status: 401 })

  // Fetch sheet data
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:D200?majorDimension=ROWS`
  const sheetRes = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!sheetRes.ok) {
    const err = await sheetRes.json()
    return NextResponse.json({ error: 'Failed to fetch sheet', details: err }, { status: sheetRes.status })
  }

  const sheetData = await sheetRes.json()
  const rows: string[][] = sheetData.values ?? []
  if (rows.length < 2) return NextResponse.json({ error: 'Sheet has no data rows (need header + at least 1 question)' }, { status: 400 })

  // Skip header row, parse Q / A / Points
  const dataRows = rows.slice(1)
  const questions = dataRows
    .filter(row => row[0]?.trim() && row[1]?.trim())
    .map((row, i) => ({
      category_id: categoryId,
      question_text: row[0].trim(),
      answer_text: row[1].trim(),
      points: parseInt(row[2]) || (i + 1) * point_increment,
      order_index: i,
      type: 'text' as const,
    }))

  if (questions.length === 0) return NextResponse.json({ error: 'No valid questions found in sheet' }, { status: 400 })

  // Delete existing questions for this category first
  await service.from('questions').delete().eq('category_id', categoryId)

  const { data: inserted, error } = await service.from('questions').insert(questions).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ questions: inserted, count: inserted.length })
}
