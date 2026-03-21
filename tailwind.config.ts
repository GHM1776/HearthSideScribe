import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        castle: {
          bg: '#1A1215',
          surface: '#2A1F23',
          'surface-light': '#3A2D32',
          border: 'rgba(196, 153, 59, 0.2)',
          'border-bright': 'rgba(196, 153, 59, 0.4)',
        },
        gold: {
          dim: '#8B7432',
          DEFAULT: '#C4993B',
          bright: '#D4A847',
          glow: '#E8C55A',
          shimmer: '#F5DC8A',
        },
        crimson: {
          dark: '#5A1020',
          DEFAULT: '#8B1A1A',
          bright: '#B22234',
          light: '#D4414E',
        },
        parchment: {
          dark: '#C4B89A',
          DEFAULT: '#F0E6D3',
          light: '#FAF6F1',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        'display-decorative': ['Cinzel Decorative', 'serif'],
        body: ['Crimson Pro', 'serif'],
        ui: ['Inter', 'sans-serif'],
      },
      animation: {
        'rain-fall': 'rainFall linear infinite',
        'candle-flicker': 'candleFlicker 3s ease-in-out infinite alternate',
        'dust-float': 'dustFloat linear infinite',
        'lightning-flash': 'lightningFlash 0.2s ease-out',
        'fade-in': 'fadeIn 0.6s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'glow-pulse': 'glowPulse 4s ease-in-out infinite',
      },
      keyframes: {
        rainFall: {
          '0%': { transform: 'translateY(-100vh) translateX(0)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(100vh) translateX(-20px)', opacity: '0' },
        },
        candleFlicker: {
          '0%': { opacity: '0.8', transform: 'scale(1)' },
          '25%': { opacity: '1', transform: 'scale(1.02)' },
          '50%': { opacity: '0.85', transform: 'scale(0.98)' },
          '75%': { opacity: '0.95', transform: 'scale(1.01)' },
          '100%': { opacity: '0.9', transform: 'scale(1)' },
        },
        dustFloat: {
          '0%': { transform: 'translateY(100vh) translateX(0) scale(0)', opacity: '0' },
          '10%': { opacity: '1', transform: 'translateY(90vh) translateX(10px) scale(1)' },
          '90%': { opacity: '0.6' },
          '100%': { transform: 'translateY(-10vh) translateX(-20px) scale(0.5)', opacity: '0' },
        },
        lightningFlash: {
          '0%': { opacity: '0' },
          '20%': { opacity: '0.15' },
          '40%': { opacity: '0' },
          '60%': { opacity: '0.1' },
          '100%': { opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(196, 153, 59, 0.1)' },
          '50%': { boxShadow: '0 0 40px rgba(196, 153, 59, 0.25)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
