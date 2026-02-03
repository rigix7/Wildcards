export interface TradingSession {
  eoaAddress: string;
  safeAddress: string;
  isSafeDeployed: boolean;
  hasApiCredentials: boolean;
  hasApprovals: boolean;
  apiCredentials?: {
    key: string;
    secret: string;
    passphrase: string;
  };
  credentialsDerivedFor?: string;
  lastChecked: number;
}

export type SessionStep =
  | "idle"
  | "checking"
  | "deploying"
  | "credentials"
  | "approvals"
  | "complete";

export const loadSession = (address: string): TradingSession | null => {
  const stored = localStorage.getItem(
    `polymarket_trading_session_${address.toLowerCase()}`
  );
  if (!stored) return null;

  try {
    const session = JSON.parse(stored) as TradingSession;

    if (session.eoaAddress.toLowerCase() !== address.toLowerCase()) {
      console.warn("Session address mismatch, clearing invalid session");
      clearSession(address);
      return null;
    }

    return session;
  } catch (e) {
    console.error("Failed to parse session:", e);
    return null;
  }
};

export const saveSession = (address: string, session: TradingSession): void => {
  localStorage.setItem(
    `polymarket_trading_session_${address.toLowerCase()}`,
    JSON.stringify(session)
  );
};

export const clearSession = (address: string): void => {
  localStorage.removeItem(
    `polymarket_trading_session_${address.toLowerCase()}`
  );
};

// Force clear ALL trading sessions (one-time migration)
const SESSION_CLEAR_VERSION = "v1";

export const forceSessionClearIfNeeded = (): boolean => {
  const clearKey = "polymarket_session_clear_version";
  const currentVersion = localStorage.getItem(clearKey);
  
  if (currentVersion === SESSION_CLEAR_VERSION) {
    return false;
  }
  
  console.log("[Session] Force clearing all trading sessions...");
  
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("polymarket_trading_session_")) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
  
  localStorage.setItem(clearKey, SESSION_CLEAR_VERSION);
  
  console.log(`[Session] Cleared ${keysToRemove.length} session(s)`);
  return keysToRemove.length > 0;
};
