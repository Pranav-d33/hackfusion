/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                'brand': ['Inter', 'sans-serif'],
                'body': ['Roboto', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Bengali', 'sans-serif'],
                'mono': ['JetBrains Mono', 'monospace'],
            },
            colors: {
                'mediloon': {
                    50: '#FEF2F2',
                    100: '#FEE2E2',
                    200: '#FECACA',
                    300: '#FCA5A5',
                    400: '#F87171',
                    500: '#EF4444',
                    600: '#DC2626',
                    'red': '#DC2626',
                    700: '#B91C1C',
                    800: '#991B1B',
                    900: '#7F1D1D',
                    'dark': '#B91C1C',
                },
                'surface': {
                    'white': '#FFFFFF',
                    'snow': '#FAFAFA',
                    'cloud': '#F5F5F5',
                    'mist': '#F0F0F0',
                    'fog': '#E5E5E5',
                },
                'ink': {
                    'primary': '#1A1A2E',
                    'secondary': '#374151',
                    'muted': '#6B7280',
                    'faint': '#9CA3AF',
                    'ghost': '#D1D5DB',
                },
                'accent': {
                    'amber': '#F59E0B',
                    'amber-light': '#FEF3C7',
                    'emerald': '#10B981',
                    'emerald-light': '#D1FAE5',
                    'sapphire': '#3B82F6',
                    'sapphire-light': '#DBEAFE',
                    'violet': '#8B5CF6',
                    'violet-light': '#EDE9FE',
                },
            },
            borderRadius: {
                '4xl': '2rem',
                '5xl': '2.5rem',
            },
            boxShadow: {
                'glow-red': '0 0 20px rgba(220, 38, 38, 0.3)',
                'glow-red-lg': '0 0 40px rgba(220, 38, 38, 0.4)',
                'glow-red-sm': '0 0 10px rgba(220, 38, 38, 0.2)',
                'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.02), 0 1px 2px -1px rgba(0, 0, 0, 0.02)',
                'md': '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
                'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.02), 0 4px 6px -4px rgba(0, 0, 0, 0.02)',
                'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.02), 0 8px 10px -6px rgba(0, 0, 0, 0.02)',
                '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.04)',
                'glass': '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -2px rgba(0, 0, 0, 0.02), 0 10px 15px -3px rgba(0, 0, 0, 0.02)',
                'glass-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.02), 0 4px 6px -4px rgba(0, 0, 0, 0.02), 0 20px 25px -5px rgba(0, 0, 0, 0.03)',
                'lift': '0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -4px rgba(0, 0, 0, 0.03)',
                'lift-lg': '0 20px 25px -5px rgba(0, 0, 0, 0.04), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
                'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.4)',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'float-delayed': 'float 6s ease-in-out 2s infinite',
                'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
                'slide-up': 'slide-up 0.5s ease-out',
                'slide-down': 'slide-down 0.3s ease-out',
                'fade-in': 'fade-in 0.4s ease-out',
                'fade-in-up': 'fade-in-up 0.5s ease-out',
                'scale-in': 'scale-in 0.3s ease-out',
                'spin-slow': 'spin 3s linear infinite',
                'bounce-gentle': 'bounce-gentle 2s ease-in-out infinite',
                'cart-pop': 'cart-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
                'dot-bounce': 'dot-bounce 1.4s infinite ease-in-out both',
                'gradient-shift': 'gradient-shift 3s ease infinite',
                'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            },
            keyframes: {
                'float': {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-8px)' },
                },
                'glow-pulse': {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(220, 38, 38, 0.2)' },
                    '50%': { boxShadow: '0 0 40px rgba(220, 38, 38, 0.5)' },
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
                    '0%': { opacity: '0', transform: 'scale(0.9)' },
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
            },
        },
    },
    plugins: [],
}
