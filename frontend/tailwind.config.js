/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                mediloon: {
                    red: '#E53935',
                    'red-dark': '#C62828',
                    'red-light': '#EF5350',
                },
            },
            animation: {
                'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'bounce-soft': 'bounce 1s ease-in-out infinite',
            },
        },
    },
    plugins: [],
}
