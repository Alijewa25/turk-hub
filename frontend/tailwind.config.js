/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        skyBlue: {
          DEFAULT: '#33B2CC',
          hover: '#2991A8',
          glow: 'rgba(51, 178, 204, 0.2)',
        },
        darkBg: '#0F172A',
        cardBg: '#1E293B',
      },
    },
  },
  plugins: [],
}
