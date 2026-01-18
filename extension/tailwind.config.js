/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand': {
          900: '#7f1d1d', // dark red
          800: '#991b1b',
        }
      }
    },
  },
  plugins: [],
}
