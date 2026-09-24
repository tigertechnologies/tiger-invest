import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  safelist: ['text-up', 'text-down', 'text-warn', 'bg-up', 'bg-down', 'bg-warn'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        bg: v('bg'),
        'bg-soft': v('bg-soft'),
        card: v('card'),
        'card-2': v('card-2'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        neon: v('neon'),
        lime: v('lime'),
        up: v('up'),
        down: v('down'),
        warn: v('warn'),
        info: v('info'),
        violet: v('violet'),
        'on-neon': v('on-neon'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 0 1px rgb(var(--neon) / .35), 0 0 24px -4px rgb(var(--neon) / .45)',
        'neon-sm': '0 0 12px -2px rgb(var(--neon) / .5)',
      },
      keyframes: {
        pulseGlow: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
        scan: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(100%)' } },
      },
      animation: { pulseGlow: 'pulseGlow 2s ease-in-out infinite', scan: 'scan 1.6s linear infinite' },
    },
  },
  plugins: [],
} satisfies Config;
