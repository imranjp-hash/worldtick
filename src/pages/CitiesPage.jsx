import React, { useState } from "react";
import { Link } from "react-router-dom";
import { cities } from "../data/cities";
import StructuredData from "../components/StructuredData";

export default function CitiesPage() {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredCities = normalizedSearch
    ? cities.filter((city) =>
        [city.name, city.country, city.timezone].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      )
    : cities;
  const cityListStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "WorldTick City Directory",
    url: "https://worldtick.site/cities",
    numberOfItems: cities.length,
    itemListElement: cities.map((city, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: city.name,
      url: `https://worldtick.site/city/${city.slug}`,
    })),
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
        color: "white",
        padding: "80px 22px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <StructuredData data={cityListStructuredData} />
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "50px" }}>
          <p
            style={{
              color: "#67e8f9",
              letterSpacing: "0.2em",
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            WORLD CITY DIRECTORY
          </p>

          <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", margin: "16px 0" }}>
            Browse World Clocks
          </h1>

          <p style={{ color: "#b8c1d1", fontSize: "1.15rem" }}>
            Explore live local time in cities across the world.
          </p>
        </div>

        <div style={styles.searchSection}>
          <label htmlFor="city-search" style={styles.searchLabel}>
            Search world clocks
          </label>
          <div style={styles.searchWrap}>
            <input
              id="city-search"
              type="search"
              aria-label="Search cities by city name, country, or timezone"
              placeholder="Search by city, country, or timezone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={styles.searchInput}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={styles.clearButton}
                aria-label="Clear city search"
              >
                Clear
              </button>
            )}
          </div>
          <p style={styles.resultsText} aria-live="polite">
            {normalizedSearch
              ? `${filteredCities.length} ${
                  filteredCities.length === 1 ? "city" : "cities"
                } found`
              : ""}
          </p>
        </div>

        {filteredCities.length === 0 ? (
          <div style={styles.emptyState} aria-live="polite">
            <h2 style={styles.emptyTitle}>No cities found</h2>
            <p style={styles.emptyText}>
              No cities match “{search.trim()}”. Try another city, country, or
              timezone.
            </p>
          </div>
        ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "20px",
          }}
        >
          {filteredCities.map((city) => (
            <Link
              key={city.slug}
              to={`/city/${city.slug}`}
              onMouseEnter={(e) => {
  e.currentTarget.style.transform = "translateY(-6px)";
  e.currentTarget.style.boxShadow = "0 28px 70px rgba(103,232,249,0.18)";
  e.currentTarget.style.border = "1px solid rgba(103,232,249,0.35)";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)";
}}
              style={{
                display: "block",
                padding: "24px",
                borderRadius: "20px",
                background: "rgba(255,255,255,0.055)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "white",
                textDecoration: "none",
                transition: "all 0.25s ease",
cursor: "pointer",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>{city.name}</h2>
              <p style={{ color: "#9ca7ba", marginTop: "8px" }}>{city.country}</p>
              <p style={{ color: "#67e8f9", fontSize: "0.85rem" }}>
                {city.timezone}
              </p>
            </Link>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

const styles = {
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
    padding: "34px",
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
};
