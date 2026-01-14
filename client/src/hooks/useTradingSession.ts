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
  TradingSession,
  SessionStep,
} from "@/utils/session";

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

  // Always check for an existing trading session after wallet is connected by checking
  // session object from localStorage to track the status of the user's trading session
  useEffect(() => {
    if (!eoaAddress) {
      setTradingSession(null);
      setCurrentStep("idle");
      setSessionError(null);
      return;
    }

    const stored = loadSession(eoaAddress);

    // CRITICAL: Detect stale sessions that have credentials derived for EOA (or no tracking field)
    // These sessions MUST be cleared to force re-derivation with Safe-based credentials
    // This is a one-time migration for users who had sessions before the Safe credential fix
    if (stored && stored.hasApiCredentials && !stored.credentialsDerivedFor) {
      console.log(
        "[TradingSession] Detected stale session with EOA credentials - clearing to force re-initialization"
      );
      clearStoredSession(eoaAddress);
      setTradingSession(null);
      setCurrentStep("idle");
      setSessionError(null);
      return;
    }

    setTradingSession(stored);

    if (!stored) {
      setCurrentStep("idle");
      setSessionError(null);
      return;
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

      // Step 5: Get User API Credentials (derive or create) for the Safe address
      // IMPORTANT: Credentials must be derived for the Safe proxy address (not EOA)
      // because orders are signed with signatureType=2 where the Safe is the maker
      let apiCreds = tradingSession?.apiCredentials;

      // Check if credentials need re-derivation:
      // - No credentials stored
      // - Credentials were derived for wrong address (migration from EOA to Safe)
      const needsCredentials =
        !tradingSession?.hasApiCredentials ||
        !apiCreds ||
        !apiCreds.key ||
        !apiCreds.secret ||
        !apiCreds.passphrase ||
        (tradingSession?.credentialsDerivedFor &&
          tradingSession.credentialsDerivedFor.toLowerCase() !==
            safeAddress.toLowerCase()) ||
        !tradingSession?.credentialsDerivedFor; // Force re-derive if field is missing (old session)

      if (needsCredentials) {
        setCurrentStep("credentials");
        console.log(
          `[TradingSession] Deriving credentials for Safe address: ${safeAddress}`
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
        credentialsDerivedFor: safeAddress, // Track that credentials are for Safe address
        lastChecked: Date.now(),
      };

      setTradingSession(newSession);
      saveSession(eoaAddress, newSession);

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
