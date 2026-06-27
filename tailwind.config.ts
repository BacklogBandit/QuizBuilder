import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          950: '#0a0314',
          900: '#0f051e',
          850: '#150c2a',
          800: '#1e0438',
          700: '#2d0a5e',
          600: '#3b0764',
          500: '#4c1d95',
          400: '#7c3aed',
          300: '#a78bfa',
          200: '#c4b5fd',
          100: '#ede9fe',
        },
      },
      backgroundImage: {
        'quiz-gradient': 'linear-gradient(155deg, #3b0764 0%, #1e0438 55%, #080212 100%)',
        'login-gradient': 'linear-gradient(140deg, #2d0a5e 0%, #0f051e 60%)',
      },
      animation: {
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}

export default config
