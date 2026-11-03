/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#081a33', 900: '#0b2545', 800: '#13315c', 700: '#1b4079', 100: '#e3ebf7', 50: '#f2f6fb' },
        teal: { 700: '#0b7a7c', 600: '#0f8b8d', 500: '#16a3a5', 100: '#d6f0f0', 50: '#eef9f9' },
      },
      fontFamily: { sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
