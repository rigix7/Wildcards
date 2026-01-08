import { useState, useCallback } from "react";

interface WalletState {
  isConnected: boolean;
  address: string;
  login: () => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  isPrivyConfigured: boolean;
}

// Demo wallet - simple implementation without Privy hooks
// Privy hooks require being inside PrivyProvider and conditionally calling hooks breaks React rules
// For now, we use demo mode. When Privy is configured, it will work via the PrivyProvider in App.tsx

export function useWallet(): WalletState {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState("");
  
  const privyConfigured = !!import.meta.env.VITE_PRIVY_APP_ID;
  
  const login = useCallback(() => {
    // Generate demo address for now
    // When Privy modal integration is added, this will trigger Privy login
    const newAddress = "0xDemo" + Math.random().toString(36).substring(2, 10);
    setAddress(newAddress);
    setIsConnected(true);
  }, []);
  
  const logout = useCallback(async () => {
    setAddress("");
    setIsConnected(false);
  }, []);
  
  return {
    isConnected,
    address,
    login,
    logout,
    isLoading: false,
    isPrivyConfigured: privyConfigured,
  };
}
