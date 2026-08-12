import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Hook Form's watch API is intentionally not React-Compiler memoizable.
      // This project does not enable the React Compiler; keep the runtime-safe library boundary.
      'react-hooks/incompatible-library': 'off',
      // Preserve the existing project contract during the platform/security upgrade.
      // Interop boundaries with browser/OCR libraries still contain legacy any values;
      // hardening them belongs to a dedicated type-safety unit, not this runtime migration.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    '.test-dist/**',
    'next-env.d.ts',
  ]),
]);
