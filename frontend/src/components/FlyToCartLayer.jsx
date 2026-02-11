import React, { useEffect, useState } from 'react';
import { Pill } from 'lucide-react';

/**
 * Renders a flying element from startRect to endRect
 */
const FlyingItem = ({ startRect, endRect, onComplete }) => {
    const [style, setStyle] = useState({
        position: 'fixed',
        left: startRect.left,
        top: startRect.top,
        width: startRect.width,
        height: startRect.height,
        opacity: 1,
        transform: 'scale(1)',
        transition: 'all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)',
        zIndex: 9999,
        pointerEvents: 'none'
    });

    useEffect(() => {
        // Trigger animation in next frame
        requestAnimationFrame(() => {
            setStyle(prev => ({
                ...prev,
                left: endRect.left + (endRect.width / 2) - (startRect.width / 4), // Center in cart
                top: endRect.top + (endRect.height / 2) - (startRect.height / 4),
                width: startRect.width / 2, // Shrink
                height: startRect.height / 2,
                opacity: 0.5,
                transform: 'scale(0.5)'
            }));
        });

        const timer = setTimeout(onComplete, 800);
        return () => clearTimeout(timer);
    }, [startRect, endRect, onComplete]);

    return (
        <div style={style} className="flex items-center justify-center bg-red-100 rounded-xl border border-red-200 shadow-xl">
            <Pill size={24} className="text-red-500" />
        </div>
    );
};

export default function FlyToCartLayer({ items, cartRef }) {
    if (!cartRef.current) return null;

    const cartRect = cartRef.current.getBoundingClientRect();

    return (
        <>
            {items.map(item => (
                <FlyingItem
                    key={item.id}
                    startRect={item.startRect}
                    endRect={cartRect}
                    onComplete={item.onComplete}
                />
            ))}
        </>
    );
}
