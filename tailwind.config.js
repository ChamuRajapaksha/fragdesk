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
          bg: '#0a0e27',
          surface: '#141933',
          border: '#1e293b',
          primary: '#00d9ff',
          accent: '#b026ff',
          danger: '#ff3366',
          success: '#00ff88',
          warning: '#fbbf24',
          text: '#e4e4e7',
          muted: '#71717a',
        }
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #00d9ff' },
          '100%': { boxShadow: '0 0 20px #00d9ff, 0 0 30px #00d9ff' },
        }
      }
    },
  },
  plugins: [],
}