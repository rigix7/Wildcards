// Polymarket API URLs
export const RELAYER_URL = "https://relayer-v2.polymarket.com/";
export const CLOB_API_URL = "https://clob.polymarket.com";

// RPC - use your own Polygon RPC for better reliability
export const POLYGON_RPC_URL =
  import.meta.env.VITE_POLYGON_RPC_URL || "https://polygon-rpc.com";

// Remote signing endpoint - points to your server
export const REMOTE_SIGNING_URL = () =>
  typeof window !== "undefined"
    ? `${window.location.origin}/api/polymarket/sign`
    : "/api/polymarket/sign";

// Chain configuration
export const POLYGON_CHAIN_ID = 137;

// Session storage key prefix
export const SESSION_STORAGE_KEY = "polymarket_trading_session";
