import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ModalProvider } from './components/Modals'

const container = document.getElementById('root')
const root = createRoot(container)

root.render(
    <React.StrictMode>
        <ModalProvider>
            <App />
        </ModalProvider>
    </React.StrictMode>
)
