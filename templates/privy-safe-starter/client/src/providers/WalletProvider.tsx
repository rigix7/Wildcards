import { useState, useEffect, type ReactNode } from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  type WalletClient,
} from "viem";
import { providers } from "ethers";
import { PrivyProvider, useWallets, usePrivy } from "@privy-io/react-auth";
import { polygonTransport } from "../constants/polymarket";
import { polygon } from "viem/chains";
import { WalletContext } from "./WalletContext";

const publicClient = createPublicClient({
  chain: polygon,
  transport: polygonTransport,
});

function WalletContextProvider({ children }: { children: ReactNode }) {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [ethersSigner, setEthersSigner] =
    useState<providers.JsonRpcSigner | null>(null);

  const { wallets, ready } = useWallets();
  const { authenticated, user, login, logout } = usePrivy();

  const wallet = wallets.find(w => w.address === user?.wallet?.address);
  const eoaAddress = authenticated && wallet 
    ? (wallet.address as `0x${string}`) 
    : undefined;

  useEffect(() => {
    async function init() {
      if (!wallet || !ready) {
        setWalletClient(null);
        setEthersSigner(null);
        return;
      }

      try {
        const provider = await wallet.getEthereumProvider();

        const client = createWalletClient({
          account: eoaAddress!,
          chain: polygon,
          transport: custom(provider),
        });

        setWalletClient(client);

        // CRITICAL: Use ethers v5 for Polymarket SDK compatibility
        const ethersProvider = new providers.Web3Provider(provider);
        setEthersSigner(ethersProvider.getSigner());
      } catch (err) {
        console.error("Failed to initialize wallet client:", err);
        setWalletClient(null);
        setEthersSigner(null);
      }
    }

    init();
  }, [wallet, ready, eoaAddress]);

  // Auto-switch to Polygon if on wrong chain
  useEffect(() => {
    async function ensurePolygonChain() {
      if (!wallet || !ready || !authenticated) return;
      
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
  }, [wallet, ready, authenticated]);

  return (
    <WalletContext.Provider
      value={{
        eoaAddress,
        walletClient,
        publicClient,
        ethersSigner,
        isReady: ready && authenticated && !!walletClient,
        authenticated,
        login,
        logout,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

interface WalletProviderProps {
  children: ReactNode;
  appId: string;
}

export default function WalletProvider({ children, appId }: WalletProviderProps) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: polygon,
        supportedChains: [polygon],
        loginMethods: ['email', 'wallet', 'google', 'apple', 'twitter'],
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
      <WalletContextProvider>{children}</WalletContextProvider>
    </PrivyProvider>
  );
}
