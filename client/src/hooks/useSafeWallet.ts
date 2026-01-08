import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/providers/PrivyProvider";
import { 
  deploySafe, 
  getSafeStatus, 
  saveSession, 
  loadSession, 
  clearSession,
  type SafeSession 
} from "@/lib/safe";

export interface SafeWalletState {
  isLoading: boolean;
  isDeploying: boolean;
  safeAddress: string | null;
  isDeployed: boolean;
  error: string | null;
}

export function useSafeWallet() {
  const { authenticated, eoaAddress, isReady } = useWallet();
  const [state, setState] = useState<SafeWalletState>({
    isLoading: true,
    isDeploying: false,
    safeAddress: null,
    isDeployed: false,
    error: null,
  });

  const checkDeployment = useCallback(async () => {
    if (!eoaAddress) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const session = loadSession();
      if (session && session.eoaAddress === eoaAddress && session.isDeployed) {
        setState({
          isLoading: false,
          isDeploying: false,
          safeAddress: session.safeAddress,
          isDeployed: true,
          error: null,
        });
        return;
      }

      const status = await getSafeStatus(eoaAddress);
      
      if (status.deployed && status.safeAddress) {
        const newSession: SafeSession = {
          eoaAddress,
          safeAddress: status.safeAddress,
          isDeployed: true,
          createdAt: new Date().toISOString(),
        };
        saveSession(newSession);
        
        setState({
          isLoading: false,
          isDeploying: false,
          safeAddress: status.safeAddress,
          isDeployed: true,
          error: null,
        });
      } else {
        setState({
          isLoading: false,
          isDeploying: false,
          safeAddress: null,
          isDeployed: false,
          error: null,
        });
      }
    } catch (error) {
      console.error("Error checking Safe deployment:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Failed to check Safe status",
      }));
    }
  }, [eoaAddress]);

  useEffect(() => {
    if (isReady && authenticated && eoaAddress) {
      checkDeployment();
    } else if (isReady && !authenticated) {
      setState({
        isLoading: false,
        isDeploying: false,
        safeAddress: null,
        isDeployed: false,
        error: null,
      });
      clearSession();
    }
  }, [isReady, authenticated, eoaAddress, checkDeployment]);

  const deploy = useCallback(async (): Promise<boolean> => {
    if (!eoaAddress) {
      setState(prev => ({ ...prev, error: "No wallet connected" }));
      return false;
    }

    setState(prev => ({ ...prev, isDeploying: true, error: null }));

    try {
      const result = await deploySafe(eoaAddress);
      
      if (result.success && result.safeAddress) {
        const newSession: SafeSession = {
          eoaAddress,
          safeAddress: result.safeAddress,
          isDeployed: true,
          createdAt: new Date().toISOString(),
        };
        saveSession(newSession);
        
        setState({
          isLoading: false,
          isDeploying: false,
          safeAddress: result.safeAddress,
          isDeployed: true,
          error: null,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isDeploying: false,
          error: result.error || "Deployment failed",
        }));
        return false;
      }
    } catch (error) {
      console.error("Error deploying Safe:", error);
      setState(prev => ({
        ...prev,
        isDeploying: false,
        error: "Failed to deploy Safe wallet",
      }));
      return false;
    }
  }, [eoaAddress]);

  const reset = useCallback(() => {
    clearSession();
    setState({
      isLoading: false,
      isDeploying: false,
      safeAddress: null,
      isDeployed: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    deploy,
    reset,
    refresh: checkDeployment,
  };
}
