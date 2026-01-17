export interface SafeSession {
  eoaAddress: string;
  safeAddress: string;
  isDeployed: boolean;
  createdAt: string;
}

const SESSION_KEY = "wildcard_safe_session";

export async function getSafeStatus(eoaAddress: string): Promise<{ deployed: boolean; safeAddress: string }> {
  try {
    const response = await fetch("/api/polymarket/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "GET",
        path: `/safe/${eoaAddress}`,
        body: null,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return { 
        deployed: data.deployed || data.isDeployed || false, 
        safeAddress: data.safeAddress || data.address || "" 
      };
    }

    return { deployed: false, safeAddress: "" };
  } catch (error) {
    console.error("Error getting Safe status:", error);
    return { deployed: false, safeAddress: "" };
  }
}

export async function deploySafe(eoaAddress: string): Promise<{ success: boolean; safeAddress?: string; error?: string }> {
  try {
    const response = await fetch("/api/polymarket/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "POST",
        path: "/safe",
        body: { ownerAddress: eoaAddress },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || data.message || "Deployment failed" };
    }

    const safeAddress = data.proxyAddress || data.safeAddress || data.address;
    if (safeAddress) {
      return { success: true, safeAddress };
    }

    return { success: false, error: "No Safe address returned" };
  } catch (error) {
    console.error("Error deploying Safe:", error);
    return { success: false, error: "Failed to deploy Safe wallet" };
  }
}

export function saveSession(session: SafeSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

export function loadSession(): SafeSession | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Error loading session:", error);
  }
  return null;
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Error clearing session:", error);
  }
}
