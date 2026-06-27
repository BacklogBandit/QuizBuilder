import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { extractSheetId } from '@/lib/utils'

export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: quiz } = await service.from('quizzes').select('master_id').eq('id', quizId).single()
  if (!quiz || quiz.master_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { categoryId, sheetUrl, point_increment = 10 } = body
  if (!categoryId || !sheetUrl) return NextResponse.json({ error: 'categoryId and sheetUrl required' }, { status: 400 })

  const sheetId = extractSheetId(sheetUrl)
  if (!sheetId) return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 })

  // Read the Google access token stored as a cookie during OAuth callback
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('google_access_token')?.value
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Google access token expired. Please sign out and sign back in.' },
      { status: 401 }
    )
  }

  console.log('[import-sheet] Fetching sheet:', sheetId)

  // Fetch sheet data via Google Sheets API v4
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:G200?majorDimension=ROWS`
  const sheetRes = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!sheetRes.ok) {
    const err = await sheetRes.json().catch(() => ({}))
    console.error('[import-sheet] Sheets API error:', err)
    // 401 from Google means token expired
    if (sheetRes.status === 401) {
      return NextResponse.json(
        { error: 'Google access token expired. Please sign out and sign back in.' },
        { status: 401 }
      )
    }
    return NextResponse.json({ error: 'Failed to fetch sheet', details: err }, { status: sheetRes.status })
  }

  const sheetData = await sheetRes.json()
  const rows: string[][] = sheetData.values ?? []
  console.log('[import-sheet] Raw rows fetched:', rows.length)

  if (rows.length < 2) {
    return NextResponse.json(
      { error: 'Sheet has no data rows. Row 1 must be a header; add questions from row 2 onwards.' },
      { status: 400 }
    )
  }

  // Skip header row
  // Columns: A=Question, B=Answer, C=Points, D=Option A, E=Option B, F=Option C, G=Option D
  const dataRows = rows.slice(1)
  const questions = dataRows
    .filter(row => row[0]?.trim() && row[1]?.trim())
    .map((row, i) => {
      const opts = [row[3], row[4], row[5], row[6]]
        .map(o => o?.trim())
        .filter(Boolean)
      const isMcq = opts.length >= 2
      return {
        category_id: categoryId,
        question_text: row[0].trim(),
        answer_text: row[1].trim(),
        points: parseInt(row[2]) || (i + 1) * point_increment,
        order_index: i,
        type: isMcq ? 'mcq' : 'text',
        options: isMcq ? opts : null,
      }
    })

  console.log('[import-sheet] Valid questions parsed:', questions.length)

  if (questions.length === 0) {
    return NextResponse.json(
      { error: 'No valid questions found. Ensure columns A (question) and B (answer) are filled.' },
      { status: 400 }
    )
  }

  // Replace any existing questions for this category
  await service.from('questions').delete().eq('category_id', categoryId)

  const { data: inserted, error } = await service.from('questions').insert(questions).select()
  if (error) {
    console.error('[import-sheet] DB insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[import-sheet] Inserted', inserted.length, 'questions successfully')
  return NextResponse.json({ questions: inserted, count: inserted.length })
}
