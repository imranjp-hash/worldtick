import youHoraLogo from "../assets/brand/youhora-logo.png";

export const siteConfig = Object.freeze({
  publicSiteName: "YouHora",
  organizationName: "YouHora",
  productionOrigin: "https://worldtick.site",
  contactEmail: "info@worldtick.site",
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
