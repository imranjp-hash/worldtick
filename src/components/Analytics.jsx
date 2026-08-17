import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useConsent } from "../context/consentContext";
import { resolveRouteMetadata } from "../utils/routeMetadata";
import { loadAnalytics, trackPageView } from "../utils/analytics";

const legacyCityPath = /^\/time-in\/[^/]+\/?$/i;

export default function Analytics() {
  const { pathname } = useLocation();
  const { analyticsConsent } = useConsent();

  useEffect(() => {
    if (analyticsConsent !== "granted" || legacyCityPath.test(pathname)) {
      return undefined;
    }

    let active = true;
    const metadata = resolveRouteMetadata(pathname);
    const analyticsPath = metadata.robots === "noindex, follow"
      ? "/404"
      : metadata.canonicalPath;

    loadAnalytics()
      .then((loaded) => {
        if (active && loaded) {
          trackPageView({ path: analyticsPath, title: metadata.title });
        }
      })
      .catch(() => {
        // Analytics failures must never affect the application experience.
      });

    return () => {
      active = false;
    };
  }, [analyticsConsent, pathname]);

  return null;
}
