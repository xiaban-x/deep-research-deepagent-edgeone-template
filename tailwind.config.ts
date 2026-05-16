import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
      },
      colors: {
        warm: {
          50: '#fdf8f0',
          100: '#f9eddb',
          200: '#f3d9b5',
          300: '#ebbf85',
          400: '#e2a053',
          500: '#da8a33',
          600: '#cc7228',
          700: '#a95823',
          800: '#874722',
          900: '#6e3b1e',
        },
      },
      maxWidth: {
        prose: '65ch',
      },
    },
  },
  plugins: [],
};

export default config;
