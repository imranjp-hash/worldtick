import { siteConfig } from "../config/site";

const { measurementId } = siteConfig.analytics;
const scriptId = "youhora-google-analytics";

let analyticsLoadPromise;
let consentDefaultsSet = false;
let analyticsConsentGranted = false;
let lastTrackedPage;

function getGtag() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  return window.gtag;
}

export function initializeConsentDefaults() {
  if (consentDefaultsSet) {
    return;
  }

  getGtag()("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  consentDefaultsSet = true;
  window[`ga-disable-${measurementId}`] = true;
}

export function setAnalyticsConsent(granted) {
  initializeConsentDefaults();
  analyticsConsentGranted = granted;
  window[`ga-disable-${measurementId}`] = !granted;

  getGtag()("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

  if (!granted) {
    lastTrackedPage = undefined;
  }
}

export function loadAnalytics() {
  if (!import.meta.env.PROD || !analyticsConsentGranted) {
    return Promise.resolve(false);
  }

  if (analyticsLoadPromise) {
    return analyticsLoadPromise;
  }

  analyticsLoadPromise = new Promise((resolve, reject) => {
    const configureAnalytics = () => {
      const gtag = getGtag();
      gtag("js", new Date());
      gtag("config", measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      resolve(true);
    };

    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        configureAnalytics();
      } else {
        existingScript.addEventListener("load", configureAnalytics, { once: true });
        existingScript.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      configureAnalytics();
    }, { once: true });
    script.addEventListener("error", (error) => {
      analyticsLoadPromise = undefined;
      reject(error);
    }, { once: true });
    document.head.appendChild(script);
  });

  return analyticsLoadPromise;
}

export function trackPageView({ path, title }) {
  if (!import.meta.env.PROD || !analyticsConsentGranted || lastTrackedPage === path) {
    return;
  }

  lastTrackedPage = path;
  getGtag()("event", "page_view", {
    page_title: title,
    page_location: new URL(path, siteConfig.productionOrigin).toString(),
    page_path: path,
  });
}
