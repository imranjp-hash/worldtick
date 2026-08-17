import { useCallback, useMemo, useState } from "react";
import { siteConfig } from "../config/site";
import { initializeConsentDefaults, setAnalyticsConsent } from "../utils/analytics";
import { ConsentContext } from "./consentContext";

const { consentStorageKey, consentVersion } = siteConfig.analytics;

function readStoredConsent() {
  try {
    const storedValue = localStorage.getItem(consentStorageKey);

    if (!storedValue) {
      return null;
    }

    const storedConsent = JSON.parse(storedValue);

    if (
      storedConsent.version === consentVersion
      && (storedConsent.analytics === "granted" || storedConsent.analytics === "denied")
    ) {
      return storedConsent.analytics;
    }
  } catch {
    // An unavailable or invalid preference is treated as no consent.
  }

  return null;
}

function persistConsent(analytics) {
  try {
    localStorage.setItem(
      consentStorageKey,
      JSON.stringify({ version: consentVersion, analytics }),
    );
  } catch {
    // The in-memory choice still applies for the current page session.
  }
}

export default function ConsentProvider({ children }) {
  const [analyticsConsent, setAnalyticsConsentState] = useState(() => {
    initializeConsentDefaults();
    const storedConsent = readStoredConsent();
    setAnalyticsConsent(storedConsent === "granted");
    return storedConsent;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const chooseAnalyticsConsent = useCallback((choice) => {
    persistConsent(choice);
    setAnalyticsConsent(choice === "granted");
    setAnalyticsConsentState(choice);
    setSettingsOpen(false);
  }, []);

  const value = useMemo(() => ({
    analyticsConsent,
    settingsOpen,
    acceptAnalytics: () => chooseAnalyticsConsent("granted"),
    rejectAnalytics: () => chooseAnalyticsConsent("denied"),
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
  }), [analyticsConsent, chooseAnalyticsConsent, settingsOpen]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
    </ConsentContext.Provider>
  );
}
