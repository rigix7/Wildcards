import { useState, useCallback, useEffect } from "react";

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

interface WalletState {
  isConnected: boolean;
  address: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  hasInjectedProvider: boolean;
  signTypedData: (
    domain: Record<string, unknown>, 
    types: Record<string, Array<{ name: string; type: string }>>, 
    value: object,
    primaryType?: string
  ) => Promise<string | null>;
}

export function useWallet(): WalletState {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const hasInjectedProvider = typeof window !== "undefined" && !!window.ethereum;

  // Check for existing connection on mount
  useEffect(() => {
    if (!hasInjectedProvider) return;
    
    const checkConnection = async () => {
      try {
        const accounts = await window.ethereum!.request({ 
          method: "eth_accounts" 
        }) as string[];
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          setIsConnected(true);
        }
      } catch {
        // Silently fail - user hasn't connected yet
      }
    };
    
    checkConnection();
    
    // Listen for account changes
    const handleAccountsChanged = (accounts: unknown) => {
      const accts = accounts as string[];
      if (accts.length === 0) {
        setAddress("");
        setIsConnected(false);
      } else {
        setAddress(accts[0]);
        setIsConnected(true);
      }
    };
    
    window.ethereum!.on("accountsChanged", handleAccountsChanged);
    
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [hasInjectedProvider]);

  const login = useCallback(async () => {
    if (!hasInjectedProvider) {
      // Demo mode fallback
      const demoAddress = "0x" + Array.from({length: 40}, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      setAddress(demoAddress);
      setIsConnected(true);
      return;
    }
    
    setIsLoading(true);
    try {
      const accounts = await window.ethereum!.request({ 
        method: "eth_requestAccounts" 
      }) as string[];
      
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
      }
    } catch (err) {
      console.error("Failed to connect wallet:", err);
    } finally {
      setIsLoading(false);
    }
  }, [hasInjectedProvider]);
  
  const logout = useCallback(async () => {
    setAddress("");
    setIsConnected(false);
  }, []);
  
  const signTypedData = useCallback(async (
    domain: Record<string, unknown>, 
    types: Record<string, Array<{ name: string; type: string }>>, 
    value: object,
    primaryType?: string
  ): Promise<string | null> => {
    if (!hasInjectedProvider || !address) {
      console.error("No wallet connected for signing");
      return null;
    }
    
    try {
      // Build EIP712Domain dynamically based on the domain object
      const domainTypeMap: Record<string, string> = {
        name: "string",
        version: "string",
        chainId: "uint256",
        verifyingContract: "address",
        salt: "bytes32",
      };
      
      const eip712Domain = Object.keys(domain)
        .filter(key => domain[key] !== undefined)
        .map(key => ({
          name: key,
          type: domainTypeMap[key] || "string",
        }));
      
      // Determine primary type - use provided or first key in types
      const resolvedPrimaryType = primaryType || Object.keys(types)[0];
      
      const typedData = {
        types: {
          EIP712Domain: eip712Domain,
          ...types,
        },
        primaryType: resolvedPrimaryType,
        domain,
        message: value,
      };
      
      const signature = await window.ethereum!.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(typedData)],
      }) as string;
      
      return signature;
    } catch (err) {
      console.error("Failed to sign typed data:", err);
      return null;
    }
  }, [hasInjectedProvider, address]);
  
  return {
    isConnected,
    address,
    login,
    logout,
    isLoading,
    hasInjectedProvider,
    signTypedData,
  };
}
