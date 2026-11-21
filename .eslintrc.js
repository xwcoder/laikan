module.exports = {
  root: true,
  // Keep official shadcn registry sources in their published format.
  ignorePatterns: ['src/ui/components/ui/'],
  env: {
    browser: true,
    node: true,
    es2023: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'sonarjs',
  ],
  extends: [
    'airbnb',
    'plugin:react/jsx-runtime',
    'plugin:sonarjs/recommended',
    'plugin:import/typescript',
  ],
  settings: {
    'import/core-modules': ['electron'],
    'import/resolver': {
      typescript: {},
      node: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts'],
      },
    },
  },
  rules: {
    'max-len': ['error', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],
    complexity: ['error', { max: 10 }],
    semi: ['error', 'never'],
    'no-confusing-arrow': ['off'],
    'no-restricted-syntax': ['off'],
    'no-unused-vars': ['off'],
    '@typescript-eslint/no-unused-vars': ['error'],
    'no-nested-ternary': ['off'],

    'react/jsx-filename-extension': ['error', { extensions: ['.tsx'] }],
    'react/require-default-props': ['off'],
    'jsx-a11y/click-events-have-key-events': ['off'],
    'jsx-a11y/interactive-supports-focus': ['off'],

    'import/extensions': ['error', {
      js: 'never',
      jsx: 'never',
      ts: 'never',
      tsx: 'never',
      mts: 'never',
      json: 'always',
    }],
    'import/no-extraneous-dependencies': ['error', {
      devDependencies: [
        '**/*.test.js',
        '**/*.spec.js',
        'src/ui/**',
        'src/i18n/**',
        './*.js',
        './*.ts',
        './*.mts',
      ],
    }],
    'import/prefer-default-export': ['off'],
  },
  overrides: [
    {
      files: ['tests/**/*.test.ts'],
      rules: {
        // Repeated fixture values make expectations independent and readable.
        'sonarjs/no-duplicate-string': 'off',
        'no-script-url': 'off',
      },
    },
    {
      // Reusable shadcn primitives forward native and Radix accessibility props.
      files: ['src/ui/components/**/*.tsx'],
      rules: { 'react/jsx-props-no-spreading': 'off' },
    },
  ],
}
