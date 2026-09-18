/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        frag: {
          bg: 'rgb(var(--frag-bg) / <alpha-value>)',
          surface: 'rgb(var(--frag-surface) / <alpha-value>)',
          border: 'rgb(var(--frag-border) / <alpha-value>)',
          primary: 'rgb(var(--frag-primary) / <alpha-value>)',
          accent: 'rgb(var(--frag-accent) / <alpha-value>)',
          danger: 'rgb(var(--frag-danger) / <alpha-value>)',
          success: 'rgb(var(--frag-success) / <alpha-value>)',
          warning: 'rgb(var(--frag-warning) / <alpha-value>)',
          text: 'rgb(var(--frag-text) / <alpha-value>)',
          muted: 'rgb(var(--frag-muted) / <alpha-value>)',
        }
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px var(--frag-primary)' },
          '100%': { boxShadow: '0 0 20px var(--frag-primary), 0 0 30px var(--frag-primary)' },
        }
      }
    },
  },
  plugins: [],
}