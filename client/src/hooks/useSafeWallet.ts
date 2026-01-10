import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/providers/PrivyProvider";
import { 
  saveSession, 
  loadSession, 
  clearSession,
  type SafeSession 
} from "@/lib/safe";
import {
  deploySafeWithProvider,
  checkSafeWithProvider,
  clearRelayClient,
} from "@/lib/polymarket";

export interface SafeWalletState {
  isLoading: boolean;
  isDeploying: boolean;
  safeAddress: string | null;
  isDeployed: boolean;
  error: string | null;
}

export function useSafeWallet() {
  const { authenticated, eoaAddress, isReady, getProvider } = useWallet();
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

      const provider = await getProvider();
      if (!provider) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const status = await checkSafeWithProvider(eoaAddress as `0x${string}`, provider);
      
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
          safeAddress: status.safeAddress || null,
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
  }, [eoaAddress, getProvider]);

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
      clearRelayClient();
    }
  }, [isReady, authenticated, eoaAddress, checkDeployment]);

  const deploy = useCallback(async (): Promise<boolean> => {
    if (!eoaAddress) {
      setState(prev => ({ ...prev, error: "No wallet connected" }));
      return false;
    }

    setState(prev => ({ ...prev, isDeploying: true, error: null }));

    try {
      const provider = await getProvider();
      if (!provider) {
        setState(prev => ({ ...prev, isDeploying: false, error: "No wallet provider" }));
        return false;
      }

      const result = await deploySafeWithProvider(eoaAddress as `0x${string}`, provider);
      
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
          error: result.error || "Activation failed",
        }));
        return false;
      }
    } catch (error) {
      console.error("Error deploying Safe:", error);
      setState(prev => ({
        ...prev,
        isDeploying: false,
        error: "Failed to activate wallet",
      }));
      return false;
    }
  }, [eoaAddress, getProvider]);

  const reset = useCallback(() => {
    clearSession();
    clearRelayClient();
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
