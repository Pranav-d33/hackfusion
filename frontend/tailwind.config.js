/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                'brand': ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', 'sans-serif'],
                'body': ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Bengali', 'sans-serif'],
                'mono': ['"SF Mono"', '"JetBrains Mono"', 'monospace'],
            },
            colors: {
                /* ── Primary: Indigo-Blue (replaces mediloon/red) ── */
                'mediloon': {
                    50: '#EEF2FF',
                    100: '#E0E7FF',
                    200: '#C7D2FE',
                    300: '#A5B4FC',
                    400: '#818CF8',
                    500: '#6366F1',
                    600: '#4F46E5',
                    'red': '#4F46E5',
                    700: '#4338CA',
                    800: '#3730A3',
                    900: '#312E81',
                    'dark': '#4338CA',
                },
                /* ── Surfaces: Apple warm grays ── */
                'surface': {
                    'white': '#FFFFFF',
                    'snow': '#F5F5F7',
                    'cloud': '#EEEEEF',
                    'mist': '#E8E8ED',
                    'fog': '#D2D2D7',
                },
                /* ── Ink: Apple text hierarchy ── */
                'ink': {
                    'primary': '#1D1D1F',
                    'secondary': '#424245',
                    'muted': '#86868B',
                    'faint': '#AEAEB2',
                    'ghost': '#D1D1D6',
                },
                /* ── Accent Colors ── */
                'accent': {
                    'amber': '#FF9F0A',
                    'amber-light': '#FFF7E6',
                    'emerald': '#30D158',
                    'emerald-light': '#E8FAF0',
                    'sapphire': '#0A84FF',
                    'sapphire-light': '#E5F2FF',
                    'violet': '#BF5AF2',
                    'violet-light': '#F5E9FE',
                },
            },
            borderRadius: {
                '4xl': '1.5rem',
                '5xl': '2rem',
            },
            boxShadow: {
                /* ── Apple-style layered shadows ── */
                'glow-red': '0 0 20px rgba(99, 102, 241, 0.25)',
                'glow-red-lg': '0 0 40px rgba(99, 102, 241, 0.3)',
                'glow-red-sm': '0 0 12px rgba(99, 102, 241, 0.15)',
                'sm': '0 1px 2px rgba(0, 0, 0, 0.04)',
                DEFAULT: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03)',
                'md': '0 4px 12px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)',
                'lg': '0 8px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04)',
                'xl': '0 16px 48px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04)',
                '2xl': '0 24px 64px rgba(0, 0, 0, 0.1)',
                'glass': '0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06)',
                'glass-lg': '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
                'lift': '0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04)',
                'lift-lg': '0 12px 40px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04)',
                'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.5)',
                'apple': '0 0.5px 1px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)',
                'apple-lg': '0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(0,0,0,0.04), 0 12px 36px rgba(0,0,0,0.07)',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'float-delayed': 'float 6s ease-in-out 2s infinite',
                'glow-pulse': 'glow-pulse 2.5s ease-in-out infinite',
                'slide-up': 'slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                'slide-down': 'slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                'fade-in': 'fade-in 0.4s ease-out',
                'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                'scale-in': 'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                'spin-slow': 'spin 3s linear infinite',
                'bounce-gentle': 'bounce-gentle 2s ease-in-out infinite',
                'cart-pop': 'cart-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
                'dot-bounce': 'dot-bounce 1.4s infinite ease-in-out both',
                'gradient-shift': 'gradient-shift 3s ease infinite',
                'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'mesh-flow': 'mesh-flow 15s ease infinite',
                'orb-float-1': 'orb-float 20s ease-in-out infinite',
                'orb-float-2': 'orb-float 25s ease-in-out infinite reverse',
                'orb-float-3': 'orb-float 22s ease-in-out infinite 2s',
            },
            keyframes: {
                'float': {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-8px)' },
                },
                'glow-pulse': {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)' },
                    '50%': { boxShadow: '0 0 40px rgba(99, 102, 241, 0.35)' },
                },
                'slide-up': {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'slide-down': {
                    '0%': { opacity: '0', transform: 'translateY(-10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'fade-in-up': {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'bounce-gentle': {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-4px)' },
                },
                'cart-pop': {
                    '0%': { transform: 'scale(1)' },
                    '50%': { transform: 'scale(1.3)' },
                    '100%': { transform: 'scale(1)' },
                },
                'pulse-subtle': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.85' },
                },
                'dot-bounce': {
                    '0%, 80%, 100%': { transform: 'scale(0)' },
                    '40%': { transform: 'scale(1)' },
                },
                'gradient-shift': {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
                'waveIdle': {
                    '0%': { transform: 'scaleY(0.4)' },
                    '100%': { transform: 'scaleY(1)' },
                },
                'slide-in-right': {
                    '0%': { transform: 'translateX(100%)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                'mesh-flow': {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
                'orb-float': {
                    '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
                    '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
                    '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
                }
            },
        },
    },
    plugins: [],
}
