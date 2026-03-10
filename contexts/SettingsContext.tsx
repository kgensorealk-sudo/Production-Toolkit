import React, { createContext, useContext, useState, useEffect } from 'react';

interface SettingsContextType {
    isHardwareAccelerated: boolean;
    setHardwareAccelerated: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isHardwareAccelerated, setHardwareAccelerated] = useState(() => {
        const saved = localStorage.getItem('hardware_acceleration');
        return saved === 'true';
    });

    useEffect(() => {
        localStorage.setItem('hardware_acceleration', isHardwareAccelerated.toString());
        if (isHardwareAccelerated) {
            document.documentElement.classList.add('hardware-accelerated');
        } else {
            document.documentElement.classList.remove('hardware-accelerated');
        }
    }, [isHardwareAccelerated]);

    return (
        <SettingsContext.Provider value={{ isHardwareAccelerated, setHardwareAccelerated }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
