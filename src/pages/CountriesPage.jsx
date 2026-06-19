import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { countries } from "../data/countries";

export default function CountriesPage() {
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
      <section style={styles.hero}>
        <p style={styles.badge}>COUNTRY DIRECTORY</p>
        <h1 style={styles.title}>Browse Countries</h1>
        <p style={styles.subtitle}>
          Explore live local times in countries with multiple WorldTick cities.
        </p>
      </section>

      <section style={styles.grid}>
        {countries.map((country) => (
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
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "80px 22px",
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
    fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "20px",
  },
  card: {
    display: "block",
    padding: "26px",
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
  },
  region: {
    margin: 0,
    color: "#9ca7ba",
  },
};
