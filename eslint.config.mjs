import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '*.config.ts', '*.config.mjs', '*.config.js'] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // Эти правила требуют полноценного внедрения React Compiler. В проекте
      // пока сохранён проверенный вручную React-код, поэтому включим их
      // отдельной задачей, а не смешаем с security-обновлением зависимостей.
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default eslintConfig;
