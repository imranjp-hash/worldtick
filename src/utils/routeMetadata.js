import { matchPath } from "react-router-dom";
import { cities } from "../data/cities.js";
import { getCountryBySlug } from "../data/countries.js";
import { siteConfig } from "../config/site.js";

const defaultMetadata = Object.freeze({
  title: `${siteConfig.publicSiteName} — Accurate Global Time and Time Zone Information`,
  description:
    `Explore accurate local times, time zones, city information, and global time differences with ${siteConfig.publicSiteName}.`,
});

const staticRoutes = Object.freeze({
  "/": defaultMetadata,
  "/cities": {
    title: `Browse World Clocks by City | ${siteConfig.publicSiteName}`,
    description:
      "Browse live local times, dates, and time zones for cities around the world.",
  },
  "/countries": {
    title: `Browse Countries and World Clocks | ${siteConfig.publicSiteName}`,
    description:
      `Explore current local times and time zones by country with ${siteConfig.publicSiteName}.`,
  },
  "/time-difference": {
    title: `Time Difference Calculator | ${siteConfig.publicSiteName}`,
    description:
      "Compare the current time difference between cities around the world.",
  },
  "/about": {
    title: `About ${siteConfig.publicSiteName} | Global Time Made Simple`,
    description:
      `Learn how ${siteConfig.publicSiteName} makes global time, time zones, and city comparisons easy to understand.`,
  },
  "/contact": {
    title: `Contact ${siteConfig.publicSiteName} | Support and Feedback`,
    description:
      `Contact ${siteConfig.publicSiteName} with questions, feedback, feature suggestions, or website issues.`,
  },
  "/privacy": {
    title: `Privacy Policy | ${siteConfig.publicSiteName}`,
    description: `Read the ${siteConfig.publicSiteName} privacy policy.`,
  },
  "/terms": {
    title: `Terms of Service | ${siteConfig.publicSiteName}`,
    description: `Read the ${siteConfig.publicSiteName} terms of service.`,
  },
});

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "") || "/";
}

function notFoundMetadata(pathname) {
  return {
    title: `Page Not Found | ${siteConfig.publicSiteName}`,
    description:
      `The requested page could not be found. Continue exploring global time with ${siteConfig.publicSiteName}.`,
    canonicalPath: pathname,
    robots: "noindex, follow",
  };
}

function cityMetadata(city, canonicalPath) {
  return {
    title: `Current Time in ${city.name}, ${city.country} | ${siteConfig.publicSiteName}`,
    description:
      `View the current local time, date, and time zone in ${city.name}, ${city.country}.`,
    canonicalPath,
  };
}

export function resolveRouteMetadata(rawPathname) {
  const pathname = normalizePathname(rawPathname);
  const staticMetadata = staticRoutes[pathname];

  if (staticMetadata) {
    return { ...staticMetadata, canonicalPath: pathname };
  }

  const cityMatch = matchPath({ path: "/city/:city", end: true }, pathname);

  if (cityMatch) {
    const city = cities.find(
      (candidate) => candidate.slug === cityMatch.params.city?.toLowerCase(),
    );

    return city
      ? cityMetadata(city, `/city/${city.slug}`)
      : notFoundMetadata(pathname);
  }

  const legacyCityMatch = matchPath(
    { path: "/time-in/:city", end: true },
    pathname,
  );

  if (legacyCityMatch) {
    const city = cities.find(
      (candidate) => candidate.slug === legacyCityMatch.params.city?.toLowerCase(),
    );

    return city
      ? cityMetadata(city, `/city/${city.slug}`)
      : notFoundMetadata(pathname);
  }

  const countryMatch = matchPath(
    { path: "/country/:countrySlug", end: true },
    pathname,
  );

  if (countryMatch) {
    const country = getCountryBySlug(countryMatch.params.countrySlug);

    return country
      ? {
          title: `Current Time in ${country.name} – Live City Clocks | ${siteConfig.publicSiteName}`,
          description:
            `View current local times, dates, and time zones for cities across ${country.name}.`,
          canonicalPath: `/country/${country.slug}`,
        }
      : notFoundMetadata(pathname);
  }

  const comparisonMatch = matchPath(
    { path: "/compare/:fromCity/:toCity", end: true },
    pathname,
  );

  if (comparisonMatch) {
    const fromCity = cities.find(
      (city) => city.slug === comparisonMatch.params.fromCity,
    );
    const toCity = cities.find(
      (city) => city.slug === comparisonMatch.params.toCity,
    );

    return fromCity && toCity
      ? {
          title: `Time Difference Between ${fromCity.name} and ${toCity.name} | ${siteConfig.publicSiteName}`,
          description:
            `Compare the current local time and time difference between ${fromCity.name}, ${fromCity.country} and ${toCity.name}, ${toCity.country}.`,
          canonicalPath: `/compare/${fromCity.slug}/${toCity.slug}`,
        }
      : notFoundMetadata(pathname);
  }

  return notFoundMetadata(pathname);
}
