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
      },
      animation: {
        pop: 'pop 220ms ease-out',
        wiggle: 'wiggle 280ms ease-in-out',
        slideUp: 'slideUp 220ms ease-out',
      },
    },
  },
  plugins: [],
}
