import nodeConfig from '@masalim/config/eslint/node';

export default [
  ...nodeConfig,
  {
    rules: {
      // Nest's DI relies on parameter decorators reading design-time types.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
