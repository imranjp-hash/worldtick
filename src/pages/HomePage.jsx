import React from "react";
import { Link } from "react-router-dom";

export default function HomePage({
  cities,
  search,
  setSearch,
  suggestions,
  selectedCities,
  addCity,
  removeCity,
  getTime,
  getDate,
  navigate,
  styles,
}) {
  return (
    <div style={styles.page}>
      <main style={styles.main}>
        <section style={styles.hero}>
          <p style={styles.badge}>LIVE GLOBAL TIME</p>

          <h1 style={styles.title}>
            Global Time.
            <br />
            Simplified.
          </h1>

          <p style={styles.subtitle}>
            Track live time across the world instantly with beautiful
            real-time clocks and city comparisons.
          </p>
        </section>

        <section style={styles.featureCard}>
          <Link
            to="/city/toronto"
            style={{ ...styles.cityLabel, textDecoration: "none" }}
          >
            Toronto
          </Link>
          <h2 style={styles.mainClock}>{getTime("America/Toronto")}</h2>
          <p style={styles.dateText}>{getDate("America/Toronto")}</p>
        </section>
        <section
  style={{
    marginTop: "28px",
    width: "100%",
    maxWidth: "620px",
    padding: "28px",
    borderRadius: "24px",
    background: "rgba(103,232,249,0.06)",
    border: "1px solid rgba(103,232,249,0.22)",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(103,232,249,0.08)",
  }}
>
  <h3
    style={{
      margin: "0 0 10px",
      fontSize: "1.5rem",
    }}
  >
    Compare Any Two Cities
  </h3>

  <p
    style={{
      color: "#b8c1d1",
      marginBottom: "20px",
    }}
  >
    Instantly compare the time difference between any two cities.
  </p>

  <button
    onClick={() => navigate("/time-difference")}
    style={{
      padding: "14px 24px",
      borderRadius: "14px",
      border: "none",
      background: "#67e8f9",
      color: "#071120",
      fontWeight: 800,
      cursor: "pointer",
      fontSize: "1rem",
    }}
  >
    Open Time Difference Calculator
  </button>
</section>

        <section style={styles.searchWrap}>
  <input
    type="text"
    placeholder="Search cities..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    style={styles.search}
  />

  {suggestions.length > 0 && (
    <div style={styles.dropdown}>
      {suggestions.map((city) => (
        <button
          key={city.slug}
          style={styles.suggestion}
          onClick={() => navigate(`/city/${city.slug}`)}
        >
          <span>
            {city.name}
            <span style={styles.suggestionCountry}>{city.country}</span>
          </span>

          <span style={styles.suggestionTime}>{getTime(city.timezone)}</span>
        </button>
      ))}
    </div>
  )}
</section>

        <section style={styles.sectionHeader}>
          <p style={styles.sectionBadge}>POPULAR CITIES</p>
          <h2 style={styles.sectionTitle}>Explore world clocks</h2>
          <div style={directoryLinksStyle}>
            <Link to="/cities" style={directoryLinkStyle}>
              Browse all cities
            </Link>
            <Link to="/countries" style={directoryLinkStyle}>
              Browse countries
            </Link>
            <Link to="/time-difference" style={directoryLinkStyle}>
              Time difference
            </Link>
          </div>
        </section>

        <section style={styles.grid}>
          {cities.slice(0, 12).map((city) => (
            <div
              key={city.name}
              style={styles.card}
onMouseEnter={(e) => {
  e.currentTarget.style.transform = "translateY(-6px)";
  e.currentTarget.style.boxShadow = "0 28px 70px rgba(103,232,249,0.18)";
  e.currentTarget.style.border = "1px solid rgba(103,232,249,0.35)";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 20px 50px rgba(0,0,0,0.28)";
  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)";
}}
              onClick={() => navigate(`/city/${city.slug}`)}
            >
              <h3 style={styles.cardTitle}>
                <Link
                  to={`/city/${city.slug}`}
                  onClick={(event) => event.stopPropagation()}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  {city.name}
                </Link>
              </h3>
              <p style={styles.country}>{city.country}</p>
              <div style={styles.cardTime}>{getTime(city.timezone)}</div>
              <p style={styles.cardDate}>{getDate(city.timezone)}</p>
              <p style={styles.zone}>{city.timezone}</p>
              <button
  style={styles.addButton}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-2px)";
    e.currentTarget.style.background =
      "rgba(103,232,249,0.20)";
    e.currentTarget.style.boxShadow =
      "0 0 24px rgba(103,232,249,0.35)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.background =
      "rgba(103,232,249,0.12)";
    e.currentTarget.style.boxShadow =
      "0 0 18px rgba(103,232,249,0.18)";
  }}
  onClick={(e) => {
    e.stopPropagation();
    addCity(city);
  }}
>
  + Add City
</button>
            </div>
          ))}
        </section>
        {selectedCities.length > 0 && (
  <>
    <section style={styles.sectionHeader}>
      <p style={styles.sectionBadge}>SELECTED CITIES</p>
      <h2 style={styles.sectionTitle}>Your saved world clocks</h2>
    </section>

    <section style={styles.grid}>
      {selectedCities.map((city) => (
        <div
          key={city.name}
          style={styles.selectedCard}
onMouseEnter={(e) => {
  e.currentTarget.style.transform = "translateY(-6px)";
  e.currentTarget.style.boxShadow = "0 28px 70px rgba(103,232,249,0.22)";
  e.currentTarget.style.border = "1px solid rgba(103,232,249,0.45)";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "0 20px 70px rgba(103,232,249,0.12)";
  e.currentTarget.style.border = "1px solid rgba(103,232,249,0.3)";
}}
          onClick={() => navigate(`/city/${city.slug}`)}
        >
          <button
            style={styles.removeButton}
            onClick={(e) => {
              e.stopPropagation();
              removeCity(city.name);
            }}
          >
            ×
          </button>

          <h3 style={styles.cardTitle}>{city.name}</h3>
          <p style={styles.country}>{city.country}</p>
          <div style={styles.cardTime}>{getTime(city.timezone)}</div>
          <p style={styles.cardDate}>{getDate(city.timezone)}</p>
          <p style={styles.zone}>{city.timezone}</p>
        </div>
      ))}
    </section>
  </>
)}
      </main>
    </div>
  );
}

const directoryLinksStyle = {
  marginTop: "20px",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "16px",
};

const directoryLinkStyle = {
  color: "#67e8f9",
  fontWeight: 800,
  textDecoration: "none",
};
