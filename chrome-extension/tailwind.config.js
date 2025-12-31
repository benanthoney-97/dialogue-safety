/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: "jit",
  darkMode: "class",
  content: [
    "./**/*.{ts,tsx}", 
    "./src/**/*.{ts,tsx}" 
    // REMOVE the streamdown line that was here
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography') // Ensure this is here for the markdown
  ],
}