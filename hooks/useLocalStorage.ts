import { useState, useEffect, useCallback } from 'react';

/**
 * useLocalStorage Hook
 * Persists state in localStorage to prevent data loss on refresh or tab switch.
 */
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
    // Get from local storage then
    // parse stored json or return initialValue
    const readValue = (): T => {
        if (typeof window === 'undefined') {
            return initialValue;
        }

        try {
            const item = window.localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch (error) {
            console.warn(`Error reading localStorage key “${key}”:`, error);
            return initialValue;
        }
    };

    const [storedValue, setStoredValue] = useState<T>(readValue);

    const setValue = useCallback((value: T | ((prev: T) => T)) => {
        try {
            // Allow value to be a function so we have same API as useState
            setStoredValue((prev) => {
                const valueToStore = value instanceof Function ? value(prev) : value;
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(key, JSON.stringify(valueToStore));
                }
                return valueToStore;
            });
        } catch (error) {
            console.warn(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key]);

    return [storedValue, setValue];
}

export default useLocalStorage;
