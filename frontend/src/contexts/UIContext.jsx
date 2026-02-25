/**
 * UI Context — Global UI state for agent-controlled navigation.
 *
 * Single source of truth for modal/view visibility.
 * UI Agent actions update this context; components subscribe to it.
 * Mobile and desktop use the same state — no breakpoint inconsistencies.
 *
 * CRITICAL: UI actions NEVER mutate backend session state.
 * This context is purely frontend presentation state.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
    const [isCartOpen, setCartOpen] = useState(false);
    const [isOrdersOpen, setOrdersOpen] = useState(false);
    const [isPrescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
    const [prescriptionMode, setPrescriptionMode] = useState('upload'); // "upload" | "replace"
    const [isTraceOpen, setTraceOpen] = useState(false);

    const closeAllModals = useCallback(() => {
        setCartOpen(false);
        setOrdersOpen(false);
        setPrescriptionModalOpen(false);
        setTraceOpen(false);
    }, []);

    /**
     * Execute a validated UI action from the agent.
     * Maps action strings to context state changes.
     * Returns true if the action was handled, false otherwise.
     */
    const executeUIAction = useCallback((action) => {
        switch (action) {
            case 'open_cart':
                setCartOpen(true);
                return true;
            case 'open_my_orders':
                setOrdersOpen(true);
                return true;
            case 'close_modal':
                closeAllModals();
                return true;
            case 'open_upload_prescription':
                setPrescriptionMode('upload');
                setPrescriptionModalOpen(true);
                return true;
            case 'trigger_prescription_upload':
                setPrescriptionMode('upload');
                setPrescriptionModalOpen(true);
                return true;
            case 'trigger_prescription_update':
                setPrescriptionMode('replace');
                setPrescriptionModalOpen(true);
                return true;
            case 'open_trace':
                setTraceOpen(true);
                return true;
            default:
                return false;
        }
    }, [closeAllModals]);

    return (
        <UIContext.Provider value={{
            isCartOpen, setCartOpen,
            isOrdersOpen, setOrdersOpen,
            isPrescriptionModalOpen, setPrescriptionModalOpen,
            prescriptionMode, setPrescriptionMode,
            isTraceOpen, setTraceOpen,
            closeAllModals,
            executeUIAction,
        }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const ctx = useContext(UIContext);
    if (!ctx) throw new Error('useUI must be used within a UIProvider');
    return ctx;
}

export default UIContext;
