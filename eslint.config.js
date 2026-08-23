import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Линтер здесь не про стиль, а про исполнимость соглашений паспорта.
 * Три вещи, которые иначе не соблюдаются: запрет `any`, границы main/ui,
 * запрет синхронных Figma-API, несовместимых с documentAccess: "dynamic-page".
 */

/** Синхронные API, недоступные при dynamic page loading — см. аудит, блок B3. */
const BANNED_SYNC_FIGMA_METHODS = [
  'getNodeById',
  'getStyleById',
  'getLocalPaintStyles',
  'getLocalTextStyles',
  'getLocalEffectStyles',
  'getLocalGridStyles',
  'getLocalVariables',
  'getLocalVariableCollections',
  'getVariableById',
  'getVariableCollectionById',
];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // --- Граница: в main/ нет React и нет DOM ---
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', '*/ui/*'],
              message: 'В src/main нет React и нет импортов из ui/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'В plugin sandbox нет DOM.' },
        { name: 'window', message: 'В plugin sandbox нет DOM.' },
      ],
      'no-restricted-syntax': [
        'error',
        ...BANNED_SYNC_FIGMA_METHODS.map((name) => ({
          selector: `MemberExpression[property.name='${name}']`,
          message: `figma.${name} синхронный и недоступен при documentAccess: "dynamic-page". Используйте ${name}Async.`,
        })),
      ],
    },
  },

  // --- Граница: в ui/ нет figma.* ---
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-globals': [
        'error',
        {
          name: 'figma',
          message: 'В src/ui нет доступа к Figma API — только сообщения через shared/messages.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['*/main/*'], message: 'ui/ не импортирует из main/ — только из shared/.' },
          ],
        },
      ],
    },
  },

  // --- Тесты и скрипты ---
  {
    files: ['test/**/*.ts', 'scripts/**/*.mjs', '*.config.{ts,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js', 'postcss.config.js', 'tailwind.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
      parserOptions: { projectService: false, project: false },
    },
  },
);
