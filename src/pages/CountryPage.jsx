import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getCountryBySlug } from "../data/countries";
import NotFoundPage from "./NotFoundPage";
import StructuredData from "../components/StructuredData";
import { formatDateInZone, formatTimeInZone } from "../utils/dateTime";
import useNow from "../hooks/useNow";

export default function CountryPage() {
  const { countrySlug } = useParams();
  const country = getCountryBySlug(countrySlug);
  const now = useNow();

  useEffect(() => {
    if (!country) {
      document.title = "Country Not Found | WorldTick";
      return;
    }

    document.title = `Current Time in ${country.name} – Live City Clocks | WorldTick`;

    const cityNames = country.cities
      .slice(0, 3)
      .map((city) => city.name)
      .join(", ");
    const description = `View the current local time in ${country.name}. Check live clocks, dates, and time zones for ${cityNames} and other available cities.`;
    let meta = document.querySelector('meta[name="description"]');

    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }

    meta.content = description;
  }, [country]);

  if (!country) {
    return <NotFoundPage />;
  }

  const countryStructuredData = {
    "@context": "https://schema.org",
    "@type": "Country",
    name: country.name,
    url: `https://worldtick.site/country/${country.slug}`,
    containsPlace: country.cities.map((city) => ({
      "@type": "City",
      name: city.name,
      url: `https://worldtick.site/city/${city.slug}`,
    })),
  };

  return (
    <main style={styles.page}>
      <StructuredData data={countryStructuredData} />
      <nav aria-label="Breadcrumb" style={styles.breadcrumb}>
        <Link to="/" style={styles.breadcrumbLink}>
          Home
        </Link>
        <span>›</span>
        <Link to="/countries" style={styles.breadcrumbLink}>
          Countries
        </Link>
        <span>›</span>
        <span>{country.name}</span>
      </nav>

      <section style={styles.hero}>
        <p style={styles.badge}>LIVE COUNTRY TIME</p>
        <h1 style={styles.title}>{country.name}</h1>
        <p style={styles.subtitle}>
          {country.region} · {country.countryCode} · {country.cities.length}{" "}
          available cities
        </p>
      </section>

      <section style={styles.grid}>
        {country.cities.map((city) => (
          <Link
            key={city.slug}
            to={`/city/${city.slug}`}
            style={styles.card}
          >
            <h2 style={styles.cityName}>{city.name}</h2>
            <p style={styles.time}>{formatTimeInZone(city.timezone, now)}</p>
            <p style={styles.date}>
              {formatDateInZone(city.timezone, now, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <p style={styles.timezone}>{city.timezone}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "clamp(44px, 8vw, 58px) clamp(16px, 5vw, 22px) clamp(70px, 12vw, 90px)",
    background:
      "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
    color: "white",
    fontFamily: "Inter, Arial, sans-serif",
  },
  breadcrumb: {
    maxWidth: "1180px",
    margin: "0 auto 48px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    color: "#94a3b8",
    fontSize: "0.95rem",
  },
  breadcrumbLink: {
    color: "#67e8f9",
    textDecoration: "none",
  },
  hero: {
    maxWidth: "860px",
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
    fontSize: "clamp(2.2rem, 6vw, 4.7rem)",
    overflowWrap: "anywhere",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
    gap: "22px",
  },
  card: {
    display: "block",
    padding: "clamp(22px, 6vw, 28px)",
    borderRadius: "24px",
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
    color: "white",
    textDecoration: "none",
  },
  cityName: {
    margin: 0,
    fontSize: "1.4rem",
  },
  time: {
    margin: "28px 0 10px",
    color: "#67e8f9",
    fontSize: "clamp(1.9rem, 9vw, 2.2rem)",
    fontWeight: 900,
  },
  date: {
    margin: 0,
    color: "#c5cad5",
  },
  timezone: {
    margin: "12px 0 0",
    color: "#6f7b91",
    fontSize: "0.86rem",
    overflowWrap: "anywhere",
  },
};
