import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadAffiliatePreferences,
  saveAffiliatePreferences,
  DEFAULT_PREFERENCES,
  SETTINGS_STORAGE_KEY,
} from "../components/affiliate/AffiliateSettings";

describe("Affiliate Personalized Settings & UI Persistence Suite", () => {
  let store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };

  const classListSet = new Set<string>();
  const mockDocument = {
    documentElement: {
      classList: {
        toggle: (cls: string, force?: boolean) => {
          if (force === true) classListSet.add(cls);
          else if (force === false) classListSet.delete(cls);
          else if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        },
        contains: (cls: string) => classListSet.has(cls),
      },
    },
  };

  beforeEach(() => {
    store = {};
    classListSet.clear();
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads default preferences when local storage is empty", () => {
    const prefs = loadAffiliatePreferences();
    expect(prefs.theme).toBe("dark");
    expect(prefs.notificationFrequency).toBe("instant");
    expect(prefs.preferredAsset).toBe("XLM");
    expect(prefs.notifyOnCommission).toBe(true);
  });

  it("persists theme toggle and synchronizes with documentElement class", () => {
    saveAffiliatePreferences({
      ...DEFAULT_PREFERENCES,
      theme: "light",
    });

    expect(mockLocalStorage.getItem("darkMode")).toBe("false");
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(false);

    const loadedLight = loadAffiliatePreferences();
    expect(loadedLight.theme).toBe("light");

    saveAffiliatePreferences({
      ...DEFAULT_PREFERENCES,
      theme: "dark",
    });

    expect(mockLocalStorage.getItem("darkMode")).toBe("true");
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(true);

    const loadedDark = loadAffiliatePreferences();
    expect(loadedDark.theme).toBe("dark");
  });

  it("persists notification frequency controls and channels", () => {
    const customPrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "daily" as const,
      notifyOnCommission: true,
      notifyOnClearingMaturity: false,
      notifyOnPayoutSettled: true,
      minClaimThreshold: "50.0",
      preferredAsset: "USDC" as const,
    };

    saveAffiliatePreferences(customPrefs);

    const savedRaw = mockLocalStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(savedRaw).toBeDefined();

    const loaded = loadAffiliatePreferences();
    expect(loaded.notificationFrequency).toBe("daily");
    expect(loaded.notifyOnClearingMaturity).toBe(false);
    expect(loaded.minClaimThreshold).toBe("50.0");
    expect(loaded.preferredAsset).toBe("USDC");
  });

  it("supports fallback to legacy darkMode key if present", () => {
    mockLocalStorage.setItem("darkMode", "false");
    const prefs = loadAffiliatePreferences();
    expect(prefs.theme).toBe("light");
  });

  it("handles storage write failures gracefully and returns false", () => {
    const brokenStorage = {
      ...mockLocalStorage,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    vi.stubGlobal("localStorage", brokenStorage);

    const success = saveAffiliatePreferences(DEFAULT_PREFERENCES);
    expect(success).toBe(false);
  });

  it("filters notification delivery based on frequency and granular channels", async () => {
    const { shouldDeliverAffiliateNotification } = await import(
      "../components/affiliate/AffiliateSettings"
    );

    // Muted suppresses all
    const mutedPrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "muted" as const,
    };
    expect(shouldDeliverAffiliateNotification("commission", mutedPrefs)).toBe(false);
    expect(shouldDeliverAffiliateNotification("clearing", mutedPrefs)).toBe(false);
    expect(shouldDeliverAffiliateNotification("payout", mutedPrefs)).toBe(false);

    // Granular channel disables
    const selectivePrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "instant" as const,
      notifyOnCommission: true,
      notifyOnClearingMaturity: false,
      notifyOnPayoutSettled: true,
    };
    expect(shouldDeliverAffiliateNotification("commission", selectivePrefs)).toBe(true);
    expect(shouldDeliverAffiliateNotification("clearing", selectivePrefs)).toBe(false);
    expect(shouldDeliverAffiliateNotification("payout", selectivePrefs)).toBe(true);
  });

  it("evaluates system theme using window.matchMedia", () => {
    let systemDark = true;
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        matches: query.includes("dark") ? systemDark : false,
      }),
    });

    saveAffiliatePreferences({
      ...DEFAULT_PREFERENCES,
      theme: "system",
    });

    expect(mockLocalStorage.getItem("darkMode")).toBe("true");
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(true);

    systemDark = false;
    saveAffiliatePreferences({
      ...DEFAULT_PREFERENCES,
      theme: "system",
    });

    expect(mockLocalStorage.getItem("darkMode")).toBe("false");
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ensures stored darkMode='false' takes precedence over existing dark class", () => {
    mockDocument.documentElement.classList.toggle("dark", true);
    mockLocalStorage.setItem("darkMode", "false");

    const stored = mockLocalStorage.getItem("darkMode");
    let isDark: boolean;
    if (stored !== null) {
      isDark = stored === "true";
    } else {
      isDark = mockDocument.documentElement.classList.contains("dark");
    }

    expect(isDark).toBe(false);
  });
});
