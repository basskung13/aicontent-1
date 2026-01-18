/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9', // Sky 500
          600: '#0284c7', // Sky 600
          700: '#0369a1', // Sky 700
        },
        dark: {
          bg: '#0f172a',    // Slate 900
          card: '#1e293b',  // Slate 800
          text: '#f8fafc',  // Slate 50
          muted: '#94a3b8', // Slate 400
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // We'll need to import Inter in index.css
      }
    },
  },
  plugins: [],
}
