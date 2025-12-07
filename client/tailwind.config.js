/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#DC2626',
        'primary-dull': '#B91C1C',
        beige: '#F5F5DC',
        'beige-dark': '#D4C5A9',
      },
    },
  },
  plugins: [],
}