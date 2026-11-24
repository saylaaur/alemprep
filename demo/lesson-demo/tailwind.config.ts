import type { Config } from 'tailwindcss';
import base from '../../tailwind.config';

const config: Config = {
  ...base,
  content: ['./components/**/*.{ts,tsx}', './demo/**/*.{ts,tsx}'],
};

export default config;
