
/**
 * Generates or retrieves a unique persistent identifier for this device.
 * For the .exe version, this identifier stays constant across app restarts.
 */
export const getDeviceId = (): string => {
    const STORAGE_KEY = 'prod_toolkit_device_fingerprint';
    let deviceId = localStorage.getItem(STORAGE_KEY);
    
    if (!deviceId) {
        // Generate a random UUID-like string
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + 
                   '_' + Date.now().toString(36) + 
                   '_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(STORAGE_KEY, deviceId);
    }
    
    return deviceId;
};
