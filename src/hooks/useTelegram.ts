import { useState, useEffect, useCallback } from "react";
import type {
  TelegramUser,
  TelegramThemeParams,
  HapticImpactStyle,
  HapticNotificationType,
} from "../lib/telegram";
import {
  getTelegramWebApp,
  isTelegramMiniApp,
  getTelegramUser,
  getTelegramPlatform,
  initTelegramWebApp,
  syncTelegramTheme,
  triggerHaptic,
  openTelegramShareLink,
  copyReferralLinkWithHaptic,
} from "../lib/telegram";

export interface UseTelegramReturn {
  isTelegram: boolean;
  user: TelegramUser | null;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  triggerHaptic: (type: HapticImpactStyle | HapticNotificationType | "selection") => boolean;
  shareReferral: (referralUrl: string, shareText?: string) => void;
  copyReferralLink: (referralUrl: string) => Promise<boolean>;
}

export function useTelegram(): UseTelegramReturn {
  const [isTelegram, setIsTelegram] = useState<boolean>(() => isTelegramMiniApp());
  const [user, setUser] = useState<TelegramUser | null>(() => getTelegramUser());
  const [platform, setPlatform] = useState<string>(() => getTelegramPlatform());
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(() => {
    const wa = getTelegramWebApp();
    return wa?.colorScheme || "dark";
  });
  const [themeParams, setThemeParams] = useState<TelegramThemeParams>(() => {
    const wa = getTelegramWebApp();
    return wa?.themeParams || {};
  });
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    const wa = getTelegramWebApp();
    return wa?.isExpanded ?? false;
  });

  useEffect(() => {
    const inTMA = isTelegramMiniApp();
    setIsTelegram(inTMA);

    if (inTMA) {
      initTelegramWebApp();
      setUser(getTelegramUser());
      setPlatform(getTelegramPlatform());

      const wa = getTelegramWebApp();
      if (wa) {
        setIsExpanded(wa.isExpanded);
        setThemeParams(wa.themeParams || {});
      }

      // Sync theme dynamically
      const unsubscribe = syncTelegramTheme((isDark) => {
        setColorScheme(isDark ? "dark" : "light");
        const activeWa = getTelegramWebApp();
        if (activeWa) {
          setThemeParams(activeWa.themeParams || {});
        }
      });

      return () => {
        unsubscribe();
      };
    }
  }, []);

  const handleShareReferral = useCallback((referralUrl: string, shareText?: string) => {
    openTelegramShareLink(referralUrl, shareText);
  }, []);

  const handleCopyReferral = useCallback(async (referralUrl: string) => {
    return await copyReferralLinkWithHaptic(referralUrl);
  }, []);

  return {
    isTelegram,
    user,
    platform,
    colorScheme,
    themeParams,
    isExpanded,
    triggerHaptic,
    shareReferral: handleShareReferral,
    copyReferralLink: handleCopyReferral,
  };
}
