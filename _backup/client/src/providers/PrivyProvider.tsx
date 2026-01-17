import { createContext, useContext, type ReactNode, lazy, Suspense } from "react";

interface WalletContextType {
  eoaAddress: string | undefined;
  isReady: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  getProvider: () => Promise<unknown | null>;
}

export const WalletContext = createContext<WalletContextType>({
  eoaAddress: undefined,
  isReady: false,
  authenticated: false,
  login: () => {},
  logout: async () => {},
  isLoading: true,
  getProvider: async () => null,
});

export function useWallet() {
  return useContext(WalletContext);
}

const PrivyInnerProvider = lazy(() => import("./PrivyInnerProvider"));

function LoadingFallback({ children }: { children: ReactNode }) {
  return (
    <WalletContext.Provider
      value={{
        eoaAddress: undefined,
        isReady: false,
        authenticated: false,
        login: () => {},
        logout: async () => {},
        isLoading: true,
        getProvider: async () => null,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function PrivyWalletProvider({ children }: { children: ReactNode }) {
  const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;

  if (!privyAppId) {
    console.warn("VITE_PRIVY_APP_ID not configured");
    return (
      <WalletContext.Provider
        value={{
          eoaAddress: undefined,
          isReady: true,
          authenticated: false,
          login: () => console.warn("Privy not configured"),
          logout: async () => {},
          isLoading: false,
          getProvider: async () => null,
        }}
      >
        {children}
      </WalletContext.Provider>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback>{children}</LoadingFallback>}>
      <PrivyInnerProvider appId={privyAppId} WalletContext={WalletContext}>
        {children}
      </PrivyInnerProvider>
    </Suspense>
  );
}
