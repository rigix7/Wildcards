import { useEffect, useState, type ReactNode } from "react";
import { PrivyProvider as PrivyProviderBase, usePrivy, useWallets } from "@privy-io/react-auth";
import { polygon } from "viem/chains";

interface WalletContextType {
  eoaAddress: string | undefined;
  isReady: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  getProvider: () => Promise<unknown | null>;
}

interface PrivyInnerProviderProps {
  children: ReactNode;
  appId: string;
  WalletContext: React.Context<WalletContextType>;
}

function WalletContextProvider({ 
  children, 
  WalletContext 
}: { 
  children: ReactNode; 
  WalletContext: React.Context<WalletContextType>;
}) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [isLoading, setIsLoading] = useState(true);

  const wallet = wallets.find(w => w.address === user?.wallet?.address);
  const eoaAddress = authenticated && wallet ? wallet.address : undefined;

  useEffect(() => {
    if (ready && walletsReady) {
      setIsLoading(false);
    }
  }, [ready, walletsReady]);

  useEffect(() => {
    async function ensurePolygonChain() {
      if (!wallet || !walletsReady || !authenticated) return;

      try {
        const chainId = wallet.chainId;
        if (chainId !== `eip155:${polygon.id}`) {
          await wallet.switchChain(polygon.id);
        }
      } catch (err) {
        console.error("Failed to switch chain:", err);
      }
    }
    ensurePolygonChain();
  }, [wallet, walletsReady, authenticated]);

  const getProvider = async (): Promise<unknown | null> => {
    if (!wallet) return null;
    try {
      return await wallet.getEthereumProvider();
    } catch (error) {
      console.error("Failed to get provider:", error);
      return null;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        eoaAddress,
        isReady: ready && walletsReady,
        authenticated,
        login,
        logout,
        isLoading,
        getProvider,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export default function PrivyInnerProvider({ children, appId, WalletContext }: PrivyInnerProviderProps) {
  return (
    <PrivyProviderBase
      appId={appId}
      config={{
        defaultChain: polygon,
        supportedChains: [polygon],
        appearance: {
          theme: "dark",
          accentColor: "#f43f5e",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <WalletContextProvider WalletContext={WalletContext}>{children}</WalletContextProvider>
    </PrivyProviderBase>
  );
}
