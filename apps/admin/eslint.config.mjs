import { reactConfig } from '@masalim/config/eslint/react';

export default [
  ...reactConfig,
  { ignores: ['.next/**', 'next-env.d.ts'] },
];
