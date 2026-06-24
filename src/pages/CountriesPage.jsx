import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { countries } from "../data/countries";
import StructuredData from "../components/StructuredData";

export default function CountriesPage() {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredCountries = normalizedSearch
    ? countries.filter((country) =>
        [
          country.name,
          country.region,
          country.countryCode,
          ...country.cities.map((city) => city.name),
        ].some((value) => value.toLowerCase().includes(normalizedSearch))
      )
    : countries;
  const countryListStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "WorldTick Country Directory",
    url: "https://worldtick.site/countries",
    numberOfItems: countries.length,
    itemListElement: countries.map((country, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: country.name,
      url: `https://worldtick.site/country/${country.slug}`,
    })),
  };

  useEffect(() => {
    document.title = "Browse Countries and World Clocks | WorldTick";

    const description =
      "Explore current local times and time zones by country. Browse live city clocks across countries with multiple WorldTick locations.";
    let meta = document.querySelector('meta[name="description"]');

    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }

    meta.content = description;
  }, []);

  return (
    <main style={styles.page}>
      <StructuredData data={countryListStructuredData} />
      <section style={styles.hero}>
        <p style={styles.badge}>COUNTRY DIRECTORY</p>
        <h1 style={styles.title}>Browse Countries</h1>
        <p style={styles.subtitle}>
          Explore live local times in countries with multiple WorldTick cities.
        </p>
      </section>

      <section style={styles.searchSection}>
        <label htmlFor="country-search" style={styles.searchLabel}>
          Search available countries
        </label>
        <div style={styles.searchWrap}>
          <input
            id="country-search"
            type="search"
            aria-label="Search countries by name, region, country code, or city"
            placeholder="Search by country, region, code, or city..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={styles.searchInput}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={styles.clearButton}
              aria-label="Clear country search"
            >
              Clear
            </button>
          )}
        </div>
        <p style={styles.resultsText} aria-live="polite">
          {normalizedSearch
            ? `${filteredCountries.length} ${
                filteredCountries.length === 1 ? "country" : "countries"
              } found`
            : ""}
        </p>
      </section>

      {filteredCountries.length === 0 ? (
        <section style={styles.emptyState} aria-live="polite">
          <h2 style={styles.emptyTitle}>No countries found</h2>
          <p style={styles.emptyText}>
            No countries match “{search.trim()}”. Try a country, region, code,
            or city name.
          </p>
        </section>
      ) : (
      <section style={styles.grid}>
        {filteredCountries.map((country) => (
          <Link
            key={country.slug}
            to={`/country/${country.slug}`}
            style={styles.card}
          >
            <div style={styles.cardTop}>
              <span style={styles.code}>{country.countryCode}</span>
              <span style={styles.count}>
                {country.cities.length}{" "}
                {country.cities.length === 1 ? "city" : "cities"}
              </span>
            </div>

            <h2 style={styles.countryName}>{country.name}</h2>
            <p style={styles.region}>{country.region}</p>
          </Link>
        ))}
      </section>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "clamp(56px, 10vw, 80px) clamp(16px, 5vw, 22px)",
    background:
      "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
    color: "white",
    fontFamily: "Inter, Arial, sans-serif",
  },
  hero: {
    maxWidth: "820px",
    margin: "0 auto 52px",
    textAlign: "center",
  },
  badge: {
    color: "#67e8f9",
    letterSpacing: "0.2em",
    fontSize: "0.8rem",
    fontWeight: 800,
  },
  title: {
    margin: "16px 0",
    fontSize: "clamp(2.2rem, 6vw, 4.5rem)",
  },
  subtitle: {
    color: "#b8c1d1",
    fontSize: "1.15rem",
    lineHeight: 1.7,
  },
  grid: {
    width: "100%",
    maxWidth: "1180px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
    gap: "20px",
  },
  searchSection: {
    width: "100%",
    maxWidth: "680px",
    margin: "0 auto 38px",
  },
  searchLabel: {
    display: "block",
    marginBottom: "10px",
    color: "#cbd5e1",
    fontWeight: 800,
  },
  searchWrap: {
    position: "relative",
  },
  searchInput: {
    width: "100%",
    padding: "18px 92px 18px 20px",
    borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontSize: "1rem",
    outline: "none",
    boxSizing: "border-box",
    minWidth: 0,
  },
  clearButton: {
    position: "absolute",
    top: "50%",
    right: "12px",
    transform: "translateY(-50%)",
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid rgba(103,232,249,0.3)",
    background: "rgba(103,232,249,0.1)",
    color: "#67e8f9",
    fontWeight: 800,
    cursor: "pointer",
  },
  resultsText: {
    minHeight: "22px",
    margin: "10px 4px 0",
    color: "#94a3b8",
    fontSize: "0.92rem",
  },
  emptyState: {
    maxWidth: "680px",
    margin: "20px auto 0",
    padding: "clamp(24px, 7vw, 34px)",
    borderRadius: "22px",
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(103,232,249,0.2)",
    textAlign: "center",
  },
  emptyTitle: {
    margin: "0 0 10px",
    fontSize: "1.5rem",
  },
  emptyText: {
    margin: 0,
    color: "#9ca7ba",
    lineHeight: 1.7,
  },
  card: {
    display: "block",
    padding: "clamp(21px, 6vw, 26px)",
    borderRadius: "22px",
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 20px 50px rgba(0,0,0,0.22)",
    color: "white",
    textDecoration: "none",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  code: {
    color: "#67e8f9",
    fontWeight: 900,
    letterSpacing: "0.14em",
  },
  count: {
    color: "#94a3b8",
    fontSize: "0.9rem",
  },
  countryName: {
    margin: "28px 0 8px",
    fontSize: "1.45rem",
    overflowWrap: "anywhere",
  },
  region: {
    margin: 0,
    color: "#9ca7ba",
  },
};
