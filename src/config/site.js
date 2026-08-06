export const siteConfig = Object.freeze({
  publicSiteName: "YouHora",
  organizationName: "YouHora",
  productionOrigin: "https://worldtick.site",
  contactEmail: "info@worldtick.site",
  brandAssets: Object.freeze({
    logo:
      "https://res.cloudinary.com/dguinb6up/image/upload/v1775780861/worldtick-logo-premium_dkh2gu.svg",
    favicon: "/favicon.svg",
  }),
  storageKeys: Object.freeze({
    selectedCities: "worldtick-selected-cities",
  }),
});

export function getSiteUrl(path = "/") {
  return new URL(path, siteConfig.productionOrigin).toString();
}
