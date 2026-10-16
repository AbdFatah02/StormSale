import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadAffiliatePreferences,
  saveAffiliatePreferences,
  shouldDeliverAffiliateNotification,
  syncSystemThemeListener,
  DEFAULT_PREFERENCES,
  SETTINGS_STORAGE_KEY,
} from "../components/affiliate/AffiliateSettings";
import { ThemeToggle, resolveEffectiveTheme } from "../components/shared/ThemeToggle";

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

  const windowListeners: Record<string, Function[]> = {};

  beforeEach(() => {
    store = {};
    classListSet.clear();
    for (const key of Object.keys(windowListeners)) {
      delete windowListeners[key];
    }
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("document", mockDocument);
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      addEventListener: (type: string, listener: Function) => {
        windowListeners[type] = windowListeners[type] || [];
        windowListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: Function) => {
        if (!windowListeners[type]) return;
        windowListeners[type] = windowListeners[type].filter((l) => l !== listener);
      },
      dispatchEvent: (event: any) => {
        const type = event?.type || event;
        windowListeners[type]?.forEach((l) => l(event));
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("filters notification delivery based on frequency, delivery cadence, and granular channels", () => {
    // Muted suppresses all events across any cadence
    const mutedPrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "muted" as const,
    };
    expect(shouldDeliverAffiliateNotification("commission", mutedPrefs, "instant")).toBe(false);
    expect(shouldDeliverAffiliateNotification("clearing", mutedPrefs, "daily")).toBe(false);
    expect(shouldDeliverAffiliateNotification("payout", mutedPrefs, "weekly")).toBe(false);

    // Instant frequency delivery: delivers instant events, suppresses scheduled digests
    const instantPrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "instant" as const,
      notifyOnCommission: true,
      notifyOnClearingMaturity: true,
      notifyOnPayoutSettled: true,
    };
    expect(shouldDeliverAffiliateNotification("commission", instantPrefs, "instant")).toBe(true);
    expect(shouldDeliverAffiliateNotification("clearing", instantPrefs, "daily")).toBe(false);
    expect(shouldDeliverAffiliateNotification("payout", instantPrefs, "weekly")).toBe(false);

    // Daily digest frequency: suppresses instant notifications, delivers for daily cadence
    const dailyPrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "daily" as const,
      notifyOnCommission: true,
      notifyOnClearingMaturity: true,
      notifyOnPayoutSettled: true,
    };
    expect(shouldDeliverAffiliateNotification("commission", dailyPrefs, "instant")).toBe(false);
    expect(shouldDeliverAffiliateNotification("commission", dailyPrefs, "daily")).toBe(true);
    expect(shouldDeliverAffiliateNotification("commission", dailyPrefs, "weekly")).toBe(false);

    // Weekly digest frequency: suppresses instant & daily notifications, delivers for weekly cadence
    const weeklyPrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "weekly" as const,
      notifyOnCommission: true,
      notifyOnClearingMaturity: true,
      notifyOnPayoutSettled: true,
    };
    expect(shouldDeliverAffiliateNotification("payout", weeklyPrefs, "instant")).toBe(false);
    expect(shouldDeliverAffiliateNotification("payout", weeklyPrefs, "daily")).toBe(false);
    expect(shouldDeliverAffiliateNotification("payout", weeklyPrefs, "weekly")).toBe(true);

    // Granular channel toggles disable delivery even when cadence matches
    const selectivePrefs = {
      ...DEFAULT_PREFERENCES,
      notificationFrequency: "daily" as const,
      notifyOnCommission: true,
      notifyOnClearingMaturity: false,
      notifyOnPayoutSettled: true,
    };
    expect(shouldDeliverAffiliateNotification("commission", selectivePrefs, "daily")).toBe(true);
    expect(shouldDeliverAffiliateNotification("clearing", selectivePrefs, "daily")).toBe(false);
    expect(shouldDeliverAffiliateNotification("payout", selectivePrefs, "daily")).toBe(true);
  });

  it("subscribes to prefers-color-scheme media query changes and cleans up on unmount", () => {
    let changeHandler: (() => void) | null = null;
    const mockMediaQuery = {
      matches: false,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === "change") changeHandler = handler;
      }),
      removeEventListener: vi.fn((event: string, handler: any) => {
        if (event === "change" && changeHandler === handler) {
          changeHandler = null;
        }
      }),
    };

    // Initial subscribe when matches is false
    const cleanup = syncSystemThemeListener(mockMediaQuery);
    expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(false);
    expect(mockLocalStorage.getItem("darkMode")).toBe("false");

    // Media query updates to dark mode
    mockMediaQuery.matches = true;
    if (typeof changeHandler === "function") {
      (changeHandler as () => void)();
    }
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(true);
    expect(mockLocalStorage.getItem("darkMode")).toBe("true");

    // Media query updates back to light mode
    mockMediaQuery.matches = false;
    if (typeof changeHandler === "function") {
      (changeHandler as () => void)();
    }
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(false);
    expect(mockLocalStorage.getItem("darkMode")).toBe("false");

    // Cleanup should remove event listener
    cleanup();
    expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(changeHandler).toBeNull();
  });

  it("supports legacy addListener and removeListener media query fallbacks", () => {
    let legacyListener: (() => void) | null = null;
    const legacyMediaQuery = {
      matches: true,
      addListener: vi.fn((listener: any) => {
        legacyListener = listener;
      }),
      removeListener: vi.fn((listener: any) => {
        if (legacyListener === listener) legacyListener = null;
      }),
    };

    const cleanup = syncSystemThemeListener(legacyMediaQuery);
    expect(legacyMediaQuery.addListener).toHaveBeenCalledWith(expect.any(Function));
    expect(mockDocument.documentElement.classList.contains("dark")).toBe(true);

    cleanup();
    expect(legacyMediaQuery.removeListener).toHaveBeenCalledWith(expect.any(Function));
    expect(legacyListener).toBeNull();
  });

  it("evaluates system theme using window.matchMedia during save", () => {
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

  it("exercises ThemeToggle component directly to verify stored darkMode precedence over classList", () => {
    // 1. Verify resolveEffectiveTheme directly: stored "false" overrides document dark class
    mockDocument.documentElement.classList.toggle("dark", true);
    mockLocalStorage.setItem("darkMode", "false");
    expect(resolveEffectiveTheme()).toBe(false);

    // Stored "true" overrides missing dark class
    mockDocument.documentElement.classList.toggle("dark", false);
    mockLocalStorage.setItem("darkMode", "true");
    expect(resolveEffectiveTheme()).toBe(true);

    // Fallback to classList when no stored preference exists
    mockLocalStorage.removeItem("darkMode");
    mockDocument.documentElement.classList.toggle("dark", true);
    expect(resolveEffectiveTheme()).toBe(true);
    mockDocument.documentElement.classList.toggle("dark", false);
    expect(resolveEffectiveTheme()).toBe(false);

    // 2. Exercise ThemeToggle component lifecycle and toggle handler directly
    mockLocalStorage.setItem("darkMode", "false");
    mockDocument.documentElement.classList.toggle("dark", true);

    let effectCallback: (() => (() => void) | void) | undefined;
    let stateValue = false;
    const setStateMock = vi.fn((val) => {
      stateValue = typeof val === "function" ? val(stateValue) : val;
    });

    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals.H;
    internals.H = {
      useState: (init: any) => [stateValue || init, setStateMock],
      useEffect: (cb: any) => {
        effectCallback = cb;
      },
    };

    try {
      // Mount ThemeToggle component
      const rendered = ThemeToggle();
      expect(rendered).toBeDefined();

      // Execute effect (syncing theme from storage)
      const cleanup = effectCallback?.();
      expect(setStateMock).toHaveBeenCalledWith(false);
      expect(mockDocument.documentElement.classList.contains("dark")).toBe(false);

      // Toggle theme via button onClick
      rendered.props.onClick();
      expect(mockLocalStorage.getItem("darkMode")).toBe("true");
      expect(mockDocument.documentElement.classList.contains("dark")).toBe(true);

      // Cleanup unmount listener
      if (typeof cleanup === "function") cleanup();
    } finally {
      internals.H = prevDispatcher;
    }
  });
});
