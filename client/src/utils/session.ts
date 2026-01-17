// Bump this version to force all users to re-initialize their trading sessions
// v3: Reverted to EOA-only credential derivation (matching official Polymarket pattern)
// v4: Force complete session reset to test fresh credential derivation
// signatureType=2 is only used in trading ClobClient, not for credential derivation
export const TRADING_SESSION_VERSION = 4;

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
  // Track which EOA address credentials were derived for
  // Per official Polymarket pattern, credentials are derived with EOA-only client
  // If undefined or mismatched with eoaAddress, credentials need re-derivation
  credentialsDerivedFor?: string;
  // Session version for forced migrations
  sessionVersion?: number;
  lastChecked: number;
}

export type SessionStep =
  | "idle"
  | "auto_restore"
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

    // Validate session belongs to this address
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
