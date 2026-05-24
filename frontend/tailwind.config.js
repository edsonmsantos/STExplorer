/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                mac: {
                    // Chrome / sidebar / toolbar (Finder uses near-identical light grey)
                    chrome: '#ECECEC',
                    chromeAlt: '#E2E2E4',
                    titlebar: '#E5E5E5',
                    divider: '#D1D1D6',
                    hover: 'rgba(0,0,0,0.06)',
                    listAlt: '#F7F7F7',

                    // Selection
                    accent: '#0A84FF',
                    accentHover: '#0066CC',
                    selection: '#0A84FF',
                    selectionSoft: 'rgba(10,132,255,0.20)',
                    selectionInactive: '#D5D5D5',

                    // Text
                    text: '#1D1D1F',
                    textSoft: '#5F6368',
                    textMuted: '#86868B',

                    // Folder/file accents
                    folder: '#79A6E8',
                    folderBack: '#A8C8F0',
                },
            },
            fontFamily: {
                sans: [
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"SF Pro Text"',
                    '"Segoe UI"',
                    'Roboto',
                    'Helvetica',
                    'Arial',
                    'sans-serif',
                ],
            },
            boxShadow: {
                'mac-toolbar': 'inset 0 -1px 0 #D1D1D6',
                'mac-card': '0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
            },
        },
    },
    plugins: [],
};
