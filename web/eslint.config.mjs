import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals, ...nextTypescript,
  // The original game synchronizes browser-local progress through effects and uses
  // unoptimized pixel art deliberately. Preserve those existing behaviors.
  { rules: { 'react-hooks/set-state-in-effect': 'off', '@next/next/no-img-element': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  globalIgnores(['.next/**','node_modules/**','next-env.d.ts','test-results/**','playwright-report/**']),
]);
