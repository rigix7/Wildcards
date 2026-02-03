import { useCallback } from "react";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { checkAllApprovals, createAllApprovalTxs } from "../utils/approvals";

/**
 * Hook for checking and setting token approvals.
 * 
 * The Safe needs to approve the following contracts to trade:
 * - USDC.e → CTF Contract, CTF Exchange, Neg Risk Exchange, Neg Risk Adapter
 * - CTF (ERC1155) → CTF Exchange, Neg Risk Exchange, Neg Risk Adapter
 * 
 * Approvals are batched into a single Safe transaction via MultiSend.
 */
export default function useTokenApprovals() {
  const checkAllTokenApprovals = useCallback(async (safeAddress: string) => {
    try {
      return await checkAllApprovals(safeAddress);
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to check approvals");
    }
  }, []);

  const setAllTokenApprovals = useCallback(
    async (relayClient: RelayClient): Promise<boolean> => {
      try {
        console.log("Executing safe transactions...");
        const approvalTxs = createAllApprovalTxs();
        const response = await relayClient.execute(
          approvalTxs,
          "Set all token approvals for trading"
        );
        await response.wait();
        return true;
      } catch (err) {
        console.error("Failed to set all token approvals:", err);
        return false;
      }
    },
    []
  );

  return {
    checkAllTokenApprovals,
    setAllTokenApprovals,
  };
}
