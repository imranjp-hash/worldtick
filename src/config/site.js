import youHoraLogo from "../assets/brand/youhora-logo.png";

export const siteConfig = Object.freeze({
  publicSiteName: "YouHora",
  organizationName: "YouHora",
  productionOrigin: "https://www.youhora.com",
  contactEmail: "info@youhora.com",
  analytics: Object.freeze({
    measurementId: "G-T6GM8CEHWX",
    consentStorageKey: "youhora-analytics-consent-v1",
    consentVersion: 1,
  }),
  brandAssets: Object.freeze({
    logo: youHoraLogo,
    favicon: "/favicon.png",
  }),
  storageKeys: Object.freeze({
    selectedCities: "worldtick-selected-cities",
  }),
});

export function getSiteUrl(path = "/") {
  return new URL(path, siteConfig.productionOrigin).toString();
}
