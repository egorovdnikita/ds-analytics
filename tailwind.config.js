/**
 * Тема плагина — дизайн-система Box UI.
 *
 * Здесь нет ни одного литерального цвета, радиуса или кегля: каждый ключ —
 * ссылка на CSS-переменную Box UI (src/ui/vendor/box-ui). Значения и моды
 * (светлая/тёмная тема, акцент, плотность скруглений) живут в токенах, а не
 * в коде плагина, — так же, как в компонентах самой Box UI.
 *
 * Модификаторы прозрачности Tailwind (`bg-accent/25`) с var() не работают:
 * полупрозрачные ступени берутся готовыми из токенов (`accent-soft`, `hover`).
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/ui/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--surface-base-fill-page)',
        surface: 'var(--surface-base-fill-raised)',
        overlay: 'var(--surface-base-fill-overlay)',
        hover: 'var(--interaction-ghost-fill-hover)',
        ink: {
          DEFAULT: 'var(--surface-base-content-strong)',
          soft: 'var(--surface-base-content-muted)',
          faint: 'var(--surface-base-content-subtle)',
        },
        line: {
          DEFAULT: 'var(--surface-base-border-default)',
          subtle: 'var(--surface-base-border-subtle)',
          strong: 'var(--surface-base-border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent-fill-solid)',
          soft: 'var(--accent-fill-soft)',
          ink: 'var(--accent-content-on-soft-default)',
          on: 'var(--accent-content-on-solid-default)',
          'on-muted': 'var(--accent-content-on-solid-muted)',
          hover: 'var(--interaction-accent-solid-fill-hover)',
        },
        // Статус работает только на элементе с [data-box-control][data-status]:
        // так Box UI переобъявляет статусные токены локально (controls.css).
        status: {
          DEFAULT: 'var(--status-fill-solid)',
          soft: 'var(--status-fill-soft)',
          ink: 'var(--status-content-on-surface-default)',
        },
      },
      borderRadius: {
        xs: 'var(--rounding-xs)',
        sm: 'var(--rounding-s)',
        md: 'var(--rounding-m)',
        card: 'var(--rounding-xl)',
        pill: 'var(--rounding-base-full)',
      },
      fontFamily: {
        sans: ['var(--font-family-body)'],
      },
      fontSize: {
        'caption-m': ['var(--type-caption-m-font-size)', 'var(--type-caption-m-line-height)'],
        'caption-l': ['var(--type-caption-l-font-size)', 'var(--type-caption-l-line-height)'],
        'body-m': ['var(--type-body-m-font-size)', 'var(--type-body-m-line-height)'],
        'body-l': ['var(--type-body-l-font-size)', 'var(--type-body-l-line-height)'],
        h5: ['var(--type-h5-font-size)', 'var(--type-h5-line-height)'],
        h4: ['var(--type-h4-font-size)', 'var(--type-h4-line-height)'],
      },
      fontWeight: {
        medium: 'var(--type-font-weight-medium)',
        semibold: 'var(--type-font-weight-semibold)',
      },
    },
  },
  plugins: [],
};
