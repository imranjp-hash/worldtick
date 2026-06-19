import { cities } from "./cities.js";

export function countrySlug(countryName) {
  return countryName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getCitiesByCountry(countryName) {
  return cities
    .filter((city) => city.country === countryName)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const countryGroups = cities.reduce((groups, city) => {
  if (!groups.has(city.country)) {
    groups.set(city.country, []);
  }

  groups.get(city.country).push(city);
  return groups;
}, new Map());

export const countries = [...countryGroups.entries()]
  .filter(([, countryCities]) => countryCities.length >= 2)
  .map(([name, countryCities]) => ({
    name,
    slug: countrySlug(name),
    countryCode: countryCities[0].countryCode,
    region: countryCities[0].region,
    cities: [...countryCities].sort((a, b) => a.name.localeCompare(b.name)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const countrySlugs = countries.map((country) => country.slug);

if (new Set(countrySlugs).size !== countrySlugs.length) {
  throw new Error("Country slug collision detected in country data.");
}

export function getCountryBySlug(slug) {
  return countries.find((country) => country.slug === slug?.toLowerCase());
}
