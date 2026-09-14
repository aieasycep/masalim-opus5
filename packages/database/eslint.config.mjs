import nodeConfig from '@masalim/config/eslint/node';

export default [
  ...nodeConfig,
  {
    files: ['prisma/**/*.ts'],
    rules: {
      // The seed script is a CLI: progress output is its interface.
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
