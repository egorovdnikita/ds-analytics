/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/ui/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Полотно серое, карточки белые — как в вебе HireHi.
        canvas: '#EFEFEC',
        ink: { DEFAULT: '#1B1B1A', soft: '#6B6B68', faint: '#9C9C98' },
        accent: { DEFAULT: '#41AE80', soft: '#E6F4ED', ink: '#2C7C5A' },
        warn: { DEFAULT: '#C08A3E', soft: '#FBF1E2' },
        danger: { DEFAULT: '#C2685F', soft: '#FAEBE9' },
      },
      borderRadius: { card: '18px', pill: '999px' },
      // Теней нет: карточки отделяются от полотна цветом, а не подъёмом.
    },
  },
  plugins: [],
};
