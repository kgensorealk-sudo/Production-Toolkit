
import { useEffect } from 'react';

interface ShortcutActions {
    onPrimary?: () => void; // Ctrl/Cmd + Enter
    onSecondary?: () => void; // Ctrl/Cmd + Shift + Enter (Optional)
    onCopy?: () => void;    // Ctrl/Cmd + Shift + C
    onClear?: () => void;   // Alt + Delete
}

const useKeyboardShortcuts = (actions: ShortcutActions, dependencies: any[] = []) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on Mac

            // Primary Action: Ctrl + Enter
            if (isMod && !e.shiftKey && e.key === 'Enter' && actions.onPrimary) {
                e.preventDefault();
                actions.onPrimary();
                return;
            }

            // Secondary Action: Ctrl + Shift + Enter
            if (isMod && e.shiftKey && e.key === 'Enter' && actions.onSecondary) {
                e.preventDefault();
                actions.onSecondary();
                return;
            }

            // Copy Action: Ctrl + Shift + C
            if (isMod && e.shiftKey && e.key.toLowerCase() === 'c' && actions.onCopy) {
                e.preventDefault();
                actions.onCopy();
                return;
            }

            // Clear Action: Alt + Delete
            if (e.altKey && e.key === 'Delete' && actions.onClear) {
                e.preventDefault();
                actions.onClear();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [actions, ...dependencies]);
};

export default useKeyboardShortcuts;
