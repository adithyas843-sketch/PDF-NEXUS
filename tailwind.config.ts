import type { Config } from 'tailwindcss';
export default { content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'], theme: { extend: { colors: { ink: '#19221d', muted: '#6a756e', line: '#e7ebe8', green: '#178153', mint: '#e8f5ee' }, boxShadow: { soft: '0 2px 8px rgba(23,42,31,.04)' } } }, plugins: [] } satisfies Config;
