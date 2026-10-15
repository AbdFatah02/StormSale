import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import {
  createCampaignContractCall,
  claimPayoutContractCall,
  approveTokenAllowance,
  fetchAssetBalances,
} from "../lib/stellar";

describe("Multi-Asset Escrow Support for Stellar USDC & EURC Suite", () => {
  const advertiserWallet = Keypair.random().publicKey();
  const affiliateWallet = Keypair.random().publicKey();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers supported escrow assets (XLM, USDC, EURC) with valid metadata", () => {
    expect(SUPPORTED_ESCROW_ASSETS.XLM).toBeDefined();
    expect(SUPPORTED_ESCROW_ASSETS.USDC).toBeDefined();
    expect(SUPPORTED_ESCROW_ASSETS.EURC).toBeDefined();

    expect(SUPPORTED_ESCROW_ASSETS.XLM.contractAddress).toBe("native");
    expect(SUPPORTED_ESCROW_ASSETS.USDC.name).toContain("Circle SAC");
    expect(SUPPORTED_ESCROW_ASSETS.EURC.name).toContain("Circle SAC");
  });

  it("deploys campaign escrow with USDC Circle SAC token", async () => {
    const res = await createCampaignContractCall(
      advertiserWallet,
      10, // 10% commission
      604800, // 7 days
      500, // 500 USDC
      "mock",
      "USDC",
    );

    expect(res.success).toBe(true);
    expect(res.campaignId).toBeGreaterThan(0);
    expect(res.asset).toBe("USDC");
    expect(res.assetAddress).toBe(SUPPORTED_ESCROW_ASSETS.USDC.contractAddress);
  });

  it("deploys campaign escrow with EURC Circle SAC token", async () => {
    const res = await createCampaignContractCall(
      advertiserWallet,
      15, // 15% commission
      1209600, // 14 days
      750, // 750 EURC
      "mock",
      "EURC",
    );

    expect(res.success).toBe(true);
    expect(res.asset).toBe("EURC");
    expect(res.assetAddress).toBe(SUPPORTED_ESCROW_ASSETS.EURC.contractAddress);
  });

  it("disburses commission payouts in the exact specified asset", async () => {
    const usdcPayout = await claimPayoutContractCall(affiliateWallet, 101, "mock", "USDC");
    expect(usdcPayout.success).toBe(true);
    expect(usdcPayout.asset).toBe("USDC");

    const eurcPayout = await claimPayoutContractCall(affiliateWallet, 102, "mock", "EURC");
    expect(eurcPayout.success).toBe(true);
    expect(eurcPayout.asset).toBe("EURC");
  });

  it("handles token allowance delegation for SAC stablecoins", async () => {
    const spenderEscrow = Keypair.random().publicKey();
    const approval = await approveTokenAllowance(
      advertiserWallet,
      SUPPORTED_ESCROW_ASSETS.USDC.contractAddress,
      spenderEscrow,
      1000,
      "mock",
    );

    expect(approval.success).toBe(true);
    expect(approval.txHash).toContain("SIM_ALLOWANCE_");
  });

  it("fetches multi-asset balances from Horizon account data", async () => {
    const mockHorizonResponse = {
      balances: [
        { asset_type: "native", balance: "1234.5678" },
        { asset_code: "USDC", balance: "250.00" },
        { asset_code: "EURC", balance: "180.50" },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockHorizonResponse,
      }),
    );

    const balances = await fetchAssetBalances(advertiserWallet);
    expect(balances.XLM).toBe("1234.5678");
    expect(balances.USDC).toBe("250.00");
    expect(balances.EURC).toBe("180.50");
  });
});
