import nodeConfig from '@masalim/config/eslint/node';

export default [
  ...nodeConfig,
  {
    rules: {
      /**
       * NestJS resolves dependencies from `design:paramtypes`, which TypeScript
       * only emits for classes imported as *values*. `consistent-type-imports`
       * cannot tell an injected provider from an ordinary type and would rewrite
       * those imports to `import type`, breaking dependency injection at runtime
       * with an "undefined dependency" error that typechecks perfectly.
       */
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Supertest response bodies are `any` by design.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
