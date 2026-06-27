import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'QuizMaster',
  description: 'Build and host live Jeopardy-style quiz nights',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
