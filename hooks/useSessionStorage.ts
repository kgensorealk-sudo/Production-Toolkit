import { useState, useEffect, useCallback } from 'react';

/**
 * useSessionStorage Hook
 * Persists state in sessionStorage to prevent data loss on refresh.
 * Cleared when the tab or window is closed.
 */
function useSessionStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
    const readValue = (): T => {
        if (typeof window === 'undefined') {
            return initialValue;
        }

        try {
            const item = window.sessionStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch (error) {
            console.warn(`Error reading sessionStorage key “${key}”:`, error);
            return initialValue;
        }
    };

    const [storedValue, setStoredValue] = useState<T>(readValue);

    const setValue = useCallback((value: T | ((prev: T) => T)) => {
        try {
            setStoredValue((prev) => {
                const valueToStore = value instanceof Function ? value(prev) : value;
                if (typeof window !== 'undefined') {
                    window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
                }
                return valueToStore;
            });
        } catch (error) {
            console.warn(`Error setting sessionStorage key “${key}”:`, error);
        }
    }, [key]);

    return [storedValue, setValue];
}

export default useSessionStorage;
