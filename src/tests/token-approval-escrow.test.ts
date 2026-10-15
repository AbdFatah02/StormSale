import { describe, it, expect, beforeEach } from "vitest";
import {
  getTokenAllowanceQuery,
  approveTokenContractCall,
  createCampaignContractCall,
} from "../lib/stellar";
import { CONTRACT_ADDRESSES } from "../config/contracts";

describe("[Advertiser] Token Approval & Escrow Flow (#33)", () => {
  const testAdvertiser = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = {};
    const mockStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, val: string) => {
        storage[key] = val;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        storage = {};
      },
      length: 0,
      key: () => null,
    };
    (globalThis as any).window = { localStorage: mockStorage };
    (globalThis as any).localStorage = mockStorage;
  });

  describe("Real-time Allowance Checking", () => {
    it("returns zero allowance when none has been granted", async () => {
      const allowance = await getTokenAllowanceQuery(testAdvertiser);
      expect(allowance).toBe(0);
    });

    it("returns zero if caller address is empty", async () => {
      const allowance = await getTokenAllowanceQuery("");
      expect(allowance).toBe(0);
    });

    it("detects insufficient allowance when budget exceeds current allowance", async () => {
      const budgetRequired = 2500;
      const currentAllowance = await getTokenAllowanceQuery(testAdvertiser);
      const isSufficient = currentAllowance >= budgetRequired;
      const deficit = Math.max(0, budgetRequired - currentAllowance);

      expect(isSufficient).toBe(false);
      expect(deficit).toBe(2500);
    });
  });

  describe("Token Approval Logic", () => {
    it("rejects approval with non-positive amount", async () => {
      await expect(
        approveTokenContractCall(testAdvertiser, 0, undefined, "mock"),
      ).rejects.toThrow("Approval amount must be greater than zero");

      await expect(
        approveTokenContractCall(testAdvertiser, -100, undefined, "mock"),
      ).rejects.toThrow("Approval amount must be greater than zero");
    });

    it("rejects approval when wallet address is missing", async () => {
      await expect(
        approveTokenContractCall("", 500, undefined, "mock"),
      ).rejects.toThrow("Wallet not connected");
    });

    it("successfully approves token allowance and updates on-chain state", async () => {
      const approvalAmount = 5000;
      const result = await approveTokenContractCall(
        testAdvertiser,
        approvalAmount,
        CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
        "mock",
      );

      expect(result.success).toBe(true);
      expect(result.allowance).toBe(approvalAmount);
      expect(result.txHash).toBeDefined();

      // Real-time allowance check should now reflect 5000 XLM
      const updatedAllowance = await getTokenAllowanceQuery(testAdvertiser);
      expect(updatedAllowance).toBe(5000);
    });
  });

  describe("Sequential 'Approve' -> 'Create' Flow", () => {
    it("executes Step 1 (Approve) followed by Step 2 (Create Escrow)", async () => {
      const budgetXlm = 1200;
      const commissionRate = 15;
      const clearingPeriod = 604800;

      // 1. Initial State: Allowance is 0, so allowance < budget
      const initialAllowance = await getTokenAllowanceQuery(testAdvertiser);
      expect(initialAllowance < budgetXlm).toBe(true);

      // 2. Sequential Step 1: Approve exact budget allowance
      const step1Result = await approveTokenContractCall(
        testAdvertiser,
        budgetXlm,
        CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
        "mock",
      );
      expect(step1Result.success).toBe(true);
      expect(step1Result.allowance).toBe(budgetXlm);

      // Verify real-time check immediately passes
      const midAllowance = await getTokenAllowanceQuery(testAdvertiser);
      expect(midAllowance >= budgetXlm).toBe(true);

      // 3. Sequential Step 2: Create Campaign Escrow and lock budget
      const step2Result = await createCampaignContractCall(
        testAdvertiser,
        commissionRate,
        clearingPeriod,
        budgetXlm,
        "mock",
      );

      expect(step2Result.success).toBe(true);
      expect(step2Result.campaignId).toBeGreaterThan(0);
      expect(step2Result.txHash).toBeDefined();
    });

    it("allows direct escrow creation if allowance is already sufficient", async () => {
      // Pre-approve 10,000 XLM
      await approveTokenContractCall(testAdvertiser, 10000, undefined, "mock");

      const budgetXlm = 2000;
      const currentAllowance = await getTokenAllowanceQuery(testAdvertiser);
      expect(currentAllowance >= budgetXlm).toBe(true);

      // Direct Step 2 execution succeeds without needing re-approval
      const result = await createCampaignContractCall(
        testAdvertiser,
        10,
        604800,
        budgetXlm,
        "mock",
      );

      expect(result.success).toBe(true);
      expect(result.campaignId).toBeDefined();
    });
  });
});
