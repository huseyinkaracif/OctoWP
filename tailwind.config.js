/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}', './src/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e9f9f1',
          100: '#c9f0dd',
          200: '#95e3bd',
          300: '#5ed598',
          400: '#34c47a',
          500: '#25d366',
          600: '#1ebe5b',
          700: '#128c7e',
          800: '#0f6f64',
          900: '#075e54',
          950: '#053c37'
        },
        accent: {
          400: '#5ec8f5',
          500: '#34b7f1',
          600: '#1f9fd6'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
