import { validateProductionConfig } from './lib/production-config';
import { loadEnv } from './lib/db';

loadEnv();
const errors = validateProductionConfig(process.env);
if (errors.length > 0) {
  console.error('Production preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Production preflight passed: required variables are present and use production-safe URLs.');
