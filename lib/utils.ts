import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export function formatPoints(pts: number): string {
  return pts >= 1000 ? `${pts / 1000}k` : String(pts)
}

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Quiz {
  id: string
  master_id: string
  title: string
  negative_marking: boolean
  status: 'draft' | 'active' | 'ended'
  created_at: string
}

export interface Category {
  id: string
  quiz_id: string
  title: string
  order_index: number
  source_type: 'sheet' | 'ai'
  point_increment: number
}

export interface QuestionOption {
  label: string
  text: string
}

export interface Question {
  id: string
  category_id: string
  question_text: string
  answer_text: string
  options: QuestionOption[] | null
  type: 'text' | 'mcq' | 'multi'
  points: number
  order_index: number
  is_answered: boolean
  skipped: boolean
}

export interface Session {
  id: string
  quiz_id: string
  join_code: string
  status: 'waiting' | 'live' | 'ended'
  current_question_id: string | null
  started_at: string | null
  ended_at: string | null
}

export interface Participant {
  id: string
  session_id: string
  username: string
  total_score: number
  joined_at: string
}

export interface BuzzEvent {
  id: string
  session_id: string
  question_id: string
  participant_id: string
  buzz_order: number
  buzzed_at: string
  result: 'correct' | 'wrong' | 'skipped' | null
  points_delta: number | null
}

export interface BuzzItem {
  participantId: string
  username: string
  order: number
  buzzedAt: string
  result?: 'correct' | 'wrong' | null
}
