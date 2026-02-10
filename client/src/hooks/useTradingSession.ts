/**
 * useTradingSession – Unified trading session hook
 *
 * Based on PolyHouse version (cleaner, post-rollback stable) with automatic
 * Safe address tracking from Wildcards (Task 5 integration).
 *
 * Key changes from base PolyHouse version:
 * - Automatic Safe address sync to server after session init and restore
 *   (from Wildcards' explicit POST to /api/wallet/:address/safe)
 * - No callback approach needed – Safe tracking is built-in
 *
 * Both Wildcards and PolyHouse import this hook directly. No wrapper needed.
 */

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

// ---------------------------------------------------------------------------
// Safe address sync helper
// From Wildcards: ensures server knows the EOA → Safe mapping for points tracking.
// Non-fatal – if the POST fails, betting still works; only points tracking
// may be affected until next successful sync.
// ---------------------------------------------------------------------------

async function syncSafeAddressToServer(
  eoaAddress: string,
  safeAddress: string,
  isSafeDeployed: boolean,
): Promise<void> {
  const res = await fetch(`/api/wallet/${eoaAddress}/safe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ safeAddress, isSafeDeployed }),
  });
  if (!res.ok) {
    console.warn("[TradingSession] Server returned non-OK syncing Safe:", res.status);
  } else {
    console.log("[TradingSession] Safe address synced to server for points tracking");
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// This is the coordination hook that manages the user's trading session
// It orchestrates the steps for initializing both the clob and relay clients
// It creates, stores, and loads the user's L2 credentials for the trading session (API credentials)
// It deploys the Safe and sets token approvals for the CTF Exchange

export default function useTradingSession() {
  const [currentStep, setCurrentStep] = useState<SessionStep>("idle");
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const [tradingSession, setTradingSession] = useState<TradingSession | null>(
    null,
  );

  const { eoaAddress, walletClient } = useWallet();
  const { createOrDeriveUserApiCredentials } = useUserApiCredentials();
  const { checkAllTokenApprovals, setAllTokenApprovals } = useTokenApprovals();
  const { derivedSafeAddressFromEoa, isSafeDeployed, deploySafe } =
    useSafeDeployment(eoaAddress);
  const { relayClient, initializeRelayClient, clearRelayClient } =
    useRelayClient();

  // -------------------------------------------------------------------------
  // Restore session from localStorage when wallet connects
  // Note: We no longer auto-restore from database to guarantee fresh
  // credential derivation (from PolyHouse, post-rollback stable approach)
  // -------------------------------------------------------------------------
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
      if (
        !stored.credentialsDerivedFor ||
        stored.credentialsDerivedFor.toLowerCase() !== eoaAddress.toLowerCase()
      ) {
        console.log(
          "[TradingSession] Session credentials mismatch – clearing to force re-initialization",
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

    // No valid stored session – user will need to click Activate
    if (stored) {
      setTradingSession(stored);
    } else {
      setCurrentStep("idle");
    }
  }, [eoaAddress]);

  // -------------------------------------------------------------------------
  // Restore relay client when session exists (from PolyHouse)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // From Wildcards: Automatically sync Safe address to server when session
  // is restored from cache. This ensures points tracking stays up-to-date
  // even without a full re-initialization.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (tradingSession?.safeAddress && eoaAddress) {
      syncSafeAddressToServer(
        eoaAddress,
        tradingSession.safeAddress,
        tradingSession.isSafeDeployed ?? true,
      ).catch((err) => {
        console.warn("[PointsTracking] Failed to sync Safe address:", err);
        // Non-fatal – points may not track but betting still works
      });
    }
  }, [tradingSession?.safeAddress, tradingSession?.isSafeDeployed, eoaAddress]);

  // -------------------------------------------------------------------------
  // Core session initialization (from PolyHouse, with Safe sync from Wildcards)
  // -------------------------------------------------------------------------
  const initializeTradingSession = useCallback(async () => {
    if (!eoaAddress) throw new Error("Wallet not connected");

    setCurrentStep("checking");
    setSessionError(null);

    try {
      // Step 1: Initialize relayClient with ethers signer and Builder's credentials
      const initializedRelayClient = await initializeRelayClient();

      // Step 2: Get Safe address (already derived synchronously via useMemo)
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

      // Step 4: Deploy Safe if not already deployed
      if (!isDeployed) {
        setCurrentStep("deploying");
        await deploySafe(initializedRelayClient);
      }

      // Step 5: Get User API Credentials (derive or create)
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
        console.log(
          `[TradingSession] Deriving credentials with EOA: ${eoaAddress} (Safe: ${safeAddress})`,
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

      // Step 7: Create session object
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

      // Step 8: From Wildcards – sync Safe address to server for points tracking
      try {
        await syncSafeAddressToServer(eoaAddress, safeAddress, true);
      } catch (err) {
        console.warn("[TradingSession] Failed to update server with Safe address:", err);
        // Non-fatal – continue with session
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

  // -------------------------------------------------------------------------
  // End session
  // -------------------------------------------------------------------------
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
