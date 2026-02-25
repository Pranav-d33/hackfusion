import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { UIProvider } from './contexts/UIContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <LanguageProvider>
            <UIProvider>
                <App />
            </UIProvider>
        </LanguageProvider>
    </React.StrictMode>,
)
