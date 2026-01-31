import { useState, useCallback, useEffect } from "react";
import useRelayClient from "@/hooks/useRelayClient";
import { useWallet } from "@/providers/WalletContext";
import useTokenApprovals from "@/hooks/useTokenApprovals";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import useUserApiCredentials from "@/hooks/useUserApiCredentials";
import {
  loadSession,
  saveSession,
  clearSession as clearStoredSession,
  forceSessionClearIfNeeded,
  TradingSession,
  SessionStep,
} from "@/utils/session";

// Run force session clear once on module load (one-time migration)
forceSessionClearIfNeeded();

// This is the coordination hook that manages the user's trading session
// It orchestrates the steps for initializing both the clob and relay clients
// It creates, stores, and loads the user's L2 credentials for the trading session (API credentials)
// It deploys the Safe and sets token approvals for the CTF Exchange

export default function useTradingSession() {
  const [currentStep, setCurrentStep] = useState<SessionStep>("idle");
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [tradingSession, setTradingSession] = useState<TradingSession | null>(
    null
  );

  const { eoaAddress, walletClient } = useWallet();
  const { createOrDeriveUserApiCredentials } = useUserApiCredentials();
  const { checkAllTokenApprovals, setAllTokenApprovals } = useTokenApprovals();
  const { derivedSafeAddressFromEoa, isSafeDeployed, deploySafe } =
    useSafeDeployment(eoaAddress);
  const { relayClient, initializeRelayClient, clearRelayClient } =
    useRelayClient();

  // Check for existing trading session in localStorage when wallet is connected
  // Note: We no longer auto-restore from database to guarantee fresh credential derivation
  useEffect(() => {
    if (!eoaAddress) {
      setTradingSession(null);
      setCurrentStep("idle");
      setSessionError(null);
      return;
    }

    const stored = loadSession(eoaAddress);

    // Validate that stored session has valid credentials for current EOA
    if (stored && stored.hasApiCredentials) {
      // Check if credentials were derived for this EOA
      if (!stored.credentialsDerivedFor || 
          stored.credentialsDerivedFor.toLowerCase() !== eoaAddress.toLowerCase()) {
        console.log(
          "[TradingSession] Session credentials mismatch - clearing to force re-initialization"
        );
        clearStoredSession(eoaAddress);
        setTradingSession(null);
        setCurrentStep("idle");
        return;
      }
      // Valid session with matching credentials
      setTradingSession(stored);
      return;
    }

    // No valid stored session - user will need to click Activate
    if (stored) {
      setTradingSession(stored);
    } else {
      setCurrentStep("idle");
    }
  }, [eoaAddress]);

  // Restores the relay client when session exists
  useEffect(() => {
    if (tradingSession && !relayClient && eoaAddress && walletClient) {
      initializeRelayClient().catch((err) => {
        console.error("Failed to restore relay client:", err);
      });
    }
  }, [
    tradingSession,
    relayClient,
    eoaAddress,
    walletClient,
    initializeRelayClient,
  ]);

  // Sync Safe address to server for WILD points tracking when session is restored
  useEffect(() => {
    if (tradingSession?.safeAddress && eoaAddress) {
      fetch(`/api/wallet/${eoaAddress}/safe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          safeAddress: tradingSession.safeAddress, 
          isSafeDeployed: tradingSession.isSafeDeployed ?? true
        }),
      })
        .then((res) => {
          if (!res.ok) {
            console.warn("[TradingSession] Server returned non-OK syncing Safe:", res.status);
          } else {
            console.log("[TradingSession] Safe address synced to server");
          }
        })
        .catch((err) => {
          console.warn("[TradingSession] Failed to sync Safe address to server:", err);
        });
    }
  }, [tradingSession?.safeAddress, tradingSession?.isSafeDeployed, eoaAddress]);

  // The core function that orchestrates the trading session initialization
  const initializeTradingSession = useCallback(async () => {
    if (!eoaAddress) throw new Error("Wallet not connected");

    setCurrentStep("checking");
    setSessionError(null);

    try {
      // Step 1: Initializes relayClient with the ethers signer and
      // Builder's credentials (via remote signing server) for authentication
      const initializedRelayClient = await initializeRelayClient();

      // Step 2: Get Safe address (already derived synchronously via useMemo in useSafeDeployment)
      // Uses official SDK deriveSafe function for correct address computation
      if (!derivedSafeAddressFromEoa) {
        throw new Error("Failed to derive Safe address");
      }
      const safeAddress = derivedSafeAddressFromEoa;
      console.log("[TradingSession] Using Safe address:", safeAddress);

      // Step 3: Check if Safe is deployed (skip if we already have a session)
      let isDeployed = tradingSession?.isSafeDeployed ?? false;
      if (!isDeployed) {
        isDeployed = await isSafeDeployed(initializedRelayClient, safeAddress);
      }

      // Step 4: Deploy Safe if not already deployed
      if (!isDeployed) {
        setCurrentStep("deploying");
        await deploySafe(initializedRelayClient);
      }

      // Step 5: Get User API Credentials (derive or create)
      // NOTE: Per official Polymarket example, credentials are derived with EOA-only client
      // The ClobClient with signatureType=2 handles Safe association for order building
      let apiCreds = tradingSession?.apiCredentials;

      // Check if credentials need re-derivation:
      // - No credentials stored
      // - Credentials were derived for wrong address
      // NOTE: Credentials are derived with EOA-only client, so credentialsDerivedFor should match EOA
      const needsCredentials =
        !tradingSession?.hasApiCredentials ||
        !apiCreds ||
        !apiCreds.key ||
        !apiCreds.secret ||
        !apiCreds.passphrase ||
        (tradingSession?.credentialsDerivedFor &&
          tradingSession.credentialsDerivedFor.toLowerCase() !==
            eoaAddress.toLowerCase()) ||
        !tradingSession?.credentialsDerivedFor; // Force re-derive if field is missing (old session)

      if (needsCredentials) {
        setCurrentStep("credentials");
        console.log(
          `[TradingSession] Deriving credentials with EOA: ${eoaAddress} (Safe: ${safeAddress})`
        );
        apiCreds = await createOrDeriveUserApiCredentials(safeAddress);
      }

      // Step 6: Set all required token approvals for trading
      setCurrentStep("approvals");
      const approvalStatus = await checkAllTokenApprovals(safeAddress);

      let hasApprovals = false;
      if (approvalStatus.allApproved) {
        hasApprovals = true;
      } else {
        hasApprovals = await setAllTokenApprovals(initializedRelayClient);
      }

      // Step 7: Create custom session object
      const newSession: TradingSession = {
        eoaAddress: eoaAddress,
        safeAddress: safeAddress,
        isSafeDeployed: true,
        hasApiCredentials: true,
        hasApprovals,
        apiCredentials: apiCreds,
        credentialsDerivedFor: eoaAddress, // Track EOA that derived credentials (EOA-only client)
        lastChecked: Date.now(),
      };

      setTradingSession(newSession);
      saveSession(eoaAddress, newSession);
      
      // Step 8: Update server with Safe address for WILD points tracking
      try {
        const res = await fetch(`/api/wallet/${eoaAddress}/safe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ safeAddress, isSafeDeployed: true }),
        });
        if (!res.ok) {
          console.warn("[TradingSession] Server returned non-OK saving Safe:", res.status);
        } else {
          console.log("[TradingSession] Updated server with Safe address for WILD tracking");
        }
      } catch (err) {
        console.warn("[TradingSession] Failed to update server with Safe address:", err);
        // Non-fatal - continue with session
      }

      setCurrentStep("complete");
    } catch (err) {
      console.error("Session initialization error:", err);
      const error = err instanceof Error ? err : new Error("Unknown error");
      setSessionError(error);
      setCurrentStep("idle");
    }
  }, [
    eoaAddress,
    relayClient,
    derivedSafeAddressFromEoa,
    isSafeDeployed,
    deploySafe,
    createOrDeriveUserApiCredentials,
    initializeRelayClient,
    tradingSession?.isSafeDeployed,
    tradingSession?.hasApiCredentials,
    tradingSession?.apiCredentials,
    checkAllTokenApprovals,
    setAllTokenApprovals,
  ]);


  // This function clears the trading session and resets the state
  const endTradingSession = useCallback(() => {
    if (!eoaAddress) return;

    clearStoredSession(eoaAddress);
    setTradingSession(null);
    clearRelayClient();
    setCurrentStep("idle");
    setSessionError(null);
  }, [eoaAddress, clearRelayClient]);

  return {
    tradingSession,
    currentStep,
    sessionError,
    isTradingSessionComplete:
      tradingSession?.isSafeDeployed &&
      tradingSession?.hasApiCredentials &&
      tradingSession?.hasApprovals,
    initializeTradingSession,
    endTradingSession,
    relayClient,
    // Expose the derived Safe address for components that need it before session is complete
    derivedSafeAddress: derivedSafeAddressFromEoa,
  };
}
