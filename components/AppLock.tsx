import React from 'react';

interface AppLockProps {
    children: React.ReactNode;
}

export const PASSCODE_STORAGE_KEY = 'app_master_passcode_hash';

export const AppLock: React.FC<AppLockProps> = ({ children }) => {
    return <>{children}</>;
};

export default AppLock;
