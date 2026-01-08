import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface WalletContextType {
  isConnected: boolean;
  address: string;
  login: () => void;
  logout: () => void;
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  address: "",
  login: () => {},
  logout: () => {},
});

export function useWalletContext() {
  return useContext(WalletContext);
}

interface DemoWalletProviderProps {
  children: ReactNode;
}

export function DemoWalletProvider({ children }: DemoWalletProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState("");

  const login = useCallback(() => {
    setIsConnected(true);
    setAddress("0xDemoWallet" + Math.random().toString(36).substring(7));
  }, []);

  const logout = useCallback(() => {
    setIsConnected(false);
    setAddress("");
  }, []);

  return (
    <WalletContext.Provider value={{ isConnected, address, login, logout }}>
      {children}
    </WalletContext.Provider>
  );
}
