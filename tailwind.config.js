/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        cream: '#FFF8EE',
        paper: '#FFFDF7',
        sun: '#FFB703',
        sky: '#3B82F6',
        leaf: '#16A34A',
        berry: '#E11D48',
        cloud: '#E2E8F0',
        smoke: '#64748B',
      },
      fontFamily: {
        display: ['"Fredoka"', '"Baloo 2"', 'system-ui', 'sans-serif'],
        body: ['"Nunito"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 6px 0 0 rgba(15, 23, 42, 0.10)',
        cardHover: '0 10px 0 0 rgba(15, 23, 42, 0.12)',
        press: '0 2px 0 0 rgba(15, 23, 42, 0.10)',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.96)' },
          '60%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        wiggle: {
          '0%,100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Soft pulsing halo for kid-facing attention. Stays gentle —
        // opacity floor is 0.35 so it never feels like a strobe.
        attentionHalo: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%':      { opacity: '0.75', transform: 'scale(1.03)' },
        },
        // Periodic wiggle: stays still for ~3.6s of every 4s cycle, then
        // does one quick wave — draws the eye back without being annoying.
        attentionWiggle: {
          '0%, 90%, 100%': { transform: 'rotate(0deg)' },
          '92%':           { transform: 'rotate(-4deg)' },
          '94%':           { transform: 'rotate(4deg)' },
          '96%':           { transform: 'rotate(-3deg)' },
          '98%':           { transform: 'rotate(2deg)' },
        },
      },
      animation: {
        pop: 'pop 220ms ease-out',
        wiggle: 'wiggle 280ms ease-in-out',
        slideUp: 'slideUp 220ms ease-out',
        attentionHalo: 'attentionHalo 2.4s ease-in-out infinite',
        attentionWiggle: 'attentionWiggle 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
