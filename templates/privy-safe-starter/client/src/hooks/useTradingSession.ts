import { useState, useCallback, useEffect } from "react";
import useRelayClient from "./useRelayClient";
import { useWallet } from "../providers/WalletContext";
import useTokenApprovals from "./useTokenApprovals";
import useSafeDeployment from "./useSafeDeployment";
import useUserApiCredentials from "./useUserApiCredentials";
import {
  loadSession,
  saveSession,
  clearSession as clearStoredSession,
  forceSessionClearIfNeeded,
  TradingSession,
  SessionStep,
} from "../utils/session";

// Run force session clear once on module load
forceSessionClearIfNeeded();

/**
 * Main coordination hook for the trading session.
 * 
 * Orchestrates the complete flow:
 * 1. Initialize RelayClient with remote signing
 * 2. Derive Safe address from EOA
 * 3. Deploy Safe if needed (gasless via Builder Program)
 * 4. Get/create User API credentials
 * 5. Set token approvals
 * 
 * The session is persisted to localStorage for returning users.
 */
export default function useTradingSession() {
  const [currentStep, setCurrentStep] = useState<SessionStep>("idle");
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [tradingSession, setTradingSession] = useState<TradingSession | null>(null);

  const { eoaAddress, walletClient } = useWallet();
  const { createOrDeriveUserApiCredentials } = useUserApiCredentials();
  const { checkAllTokenApprovals, setAllTokenApprovals } = useTokenApprovals();
  const { derivedSafeAddressFromEoa, isSafeDeployed, deploySafe } =
    useSafeDeployment(eoaAddress);
  const { relayClient, initializeRelayClient, clearRelayClient } =
    useRelayClient();

  // Load existing session from localStorage when wallet connects
  useEffect(() => {
    if (!eoaAddress) {
      setTradingSession(null);
      setCurrentStep("idle");
      setSessionError(null);
      return;
    }

    const stored = loadSession(eoaAddress);

    if (stored && stored.hasApiCredentials) {
      if (!stored.credentialsDerivedFor || 
          stored.credentialsDerivedFor.toLowerCase() !== eoaAddress.toLowerCase()) {
        console.log("[TradingSession] Session credentials mismatch - clearing");
        clearStoredSession(eoaAddress);
        setTradingSession(null);
        setCurrentStep("idle");
        return;
      }
      setTradingSession(stored);
      return;
    }

    if (stored) {
      setTradingSession(stored);
    } else {
      setCurrentStep("idle");
    }
  }, [eoaAddress]);

  // Restore relay client when session exists
  useEffect(() => {
    if (tradingSession && !relayClient && eoaAddress && walletClient) {
      initializeRelayClient().catch((err) => {
        console.error("Failed to restore relay client:", err);
      });
    }
  }, [tradingSession, relayClient, eoaAddress, walletClient, initializeRelayClient]);

  // Main initialization function
  const initializeTradingSession = useCallback(async () => {
    if (!eoaAddress) throw new Error("Wallet not connected");

    setCurrentStep("checking");
    setSessionError(null);

    try {
      // Step 1: Initialize RelayClient
      const initializedRelayClient = await initializeRelayClient();

      // Step 2: Get Safe address
      if (!derivedSafeAddressFromEoa) {
        throw new Error("Failed to derive Safe address");
      }
      const safeAddress = derivedSafeAddressFromEoa;
      console.log("[TradingSession] Using Safe address:", safeAddress);

      // Step 3: Check if Safe is deployed
      let isDeployed = tradingSession?.isSafeDeployed ?? false;
      if (!isDeployed) {
        isDeployed = await isSafeDeployed(initializedRelayClient, safeAddress);
      }

      // Step 4: Deploy Safe if needed
      if (!isDeployed) {
        setCurrentStep("deploying");
        await deploySafe(initializedRelayClient);
      }

      // Step 5: Get User API Credentials
      let apiCreds = tradingSession?.apiCredentials;

      const needsCredentials =
        !tradingSession?.hasApiCredentials ||
        !apiCreds ||
        !apiCreds.key ||
        !apiCreds.secret ||
        !apiCreds.passphrase ||
        (tradingSession?.credentialsDerivedFor &&
          tradingSession.credentialsDerivedFor.toLowerCase() !==
            eoaAddress.toLowerCase()) ||
        !tradingSession?.credentialsDerivedFor;

      if (needsCredentials) {
        setCurrentStep("credentials");
        console.log(`[TradingSession] Deriving credentials with EOA: ${eoaAddress} (Safe: ${safeAddress})`);
        apiCreds = await createOrDeriveUserApiCredentials(safeAddress);
      }

      // Step 6: Set token approvals
      setCurrentStep("approvals");
      const approvalStatus = await checkAllTokenApprovals(safeAddress);

      let hasApprovals = false;
      if (approvalStatus.allApproved) {
        hasApprovals = true;
      } else {
        hasApprovals = await setAllTokenApprovals(initializedRelayClient);
      }

      // Step 7: Save session
      const newSession: TradingSession = {
        eoaAddress: eoaAddress,
        safeAddress: safeAddress,
        isSafeDeployed: true,
        hasApiCredentials: true,
        hasApprovals,
        apiCredentials: apiCreds,
        credentialsDerivedFor: eoaAddress,
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

  // End session and clear state
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
    derivedSafeAddress: derivedSafeAddressFromEoa,
  };
}
