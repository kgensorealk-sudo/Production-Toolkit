
import { useEffect, useRef } from 'react';

interface ShortcutActions {
    onPrimary?: () => void; // Ctrl/Cmd + Enter
    onSecondary?: () => void; // Ctrl/Cmd + Shift + Enter (Optional)
    onCopy?: () => void;    // Ctrl/Cmd + Shift + C
    onClear?: () => void;   // Alt + Delete
}

const useKeyboardShortcuts = (actions: ShortcutActions, dependencies: any[] = []) => {
    const actionsRef = useRef(actions);
    
    useEffect(() => {
        actionsRef.current = actions;
    }, [actions]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on Mac

            // Primary Action: Ctrl + Enter
            if (isMod && !e.shiftKey && e.key === 'Enter' && actionsRef.current.onPrimary) {
                e.preventDefault();
                actionsRef.current.onPrimary();
                return;
            }

            // Secondary Action: Ctrl + Shift + Enter
            if (isMod && e.shiftKey && e.key === 'Enter' && actionsRef.current.onSecondary) {
                e.preventDefault();
                actionsRef.current.onSecondary();
                return;
            }

            // Copy Action: Ctrl + Shift + C
            if (isMod && e.shiftKey && e.key.toLowerCase() === 'c' && actionsRef.current.onCopy) {
                e.preventDefault();
                actionsRef.current.onCopy();
                return;
            }

            // Clear Action: Alt + Delete
            if (e.altKey && e.key === 'Delete' && actionsRef.current.onClear) {
                e.preventDefault();
                actionsRef.current.onClear();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, dependencies); // Only re-bind if dependencies change
};

export default useKeyboardShortcuts;
