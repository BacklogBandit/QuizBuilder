import confetti from 'canvas-confetti'

export function fireCorrectConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#a78bfa', '#7c3aed', '#fbbf24', '#fff', '#c4b5fd'],
  })
}

export function fireEndConfetti() {
  const duration = 3000
  const end = Date.now() + duration

  const frame = () => {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#a78bfa', '#7c3aed', '#fbbf24'],
    })
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#a78bfa', '#7c3aed', '#fbbf24'],
    })

    if (Date.now() < end) requestAnimationFrame(frame)
  }

  frame()
}
