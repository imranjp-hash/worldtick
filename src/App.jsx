import { useEffect, useState } from "react";

const cities = [
  { name: "Toronto", country: "Canada", timeZone: "America/Toronto" },
  { name: "New York", country: "United States", timeZone: "America/New_York" },
  { name: "London", country: "United Kingdom", timeZone: "Europe/London" },
  { name: "Dubai", country: "United Arab Emirates", timeZone: "Asia/Dubai" },
  { name: "Tokyo", country: "Japan", timeZone: "Asia/Tokyo" },
  { name: "Sydney", country: "Australia", timeZone: "Australia/Sydney" },
];

function getTime(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());
}

function getDate(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function App() {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>WorldTick</div>
        <nav style={styles.nav}>
          <span>World Clock</span>
          <span>Compare Time</span>
          <span>Contact</span>
        </nav>
      </header>

      <main style={styles.main}>
        <section style={styles.hero}>
          <p style={styles.badge}>LIVE GLOBAL TIME</p>
          <h1 style={styles.title}>
            Global Time.
            <br />
            Simplified.
          </h1>
          <p style={styles.subtitle}>
            Track live time across the world instantly with beautiful real-time
            clocks and city comparisons.
          </p>
        </section>

        <section style={styles.featureCard}>
          <p style={styles.cityLabel}>Toronto</p>
          <h2 style={styles.mainClock}>{getTime("America/Toronto")}</h2>
          <p style={styles.dateText}>{getDate("America/Toronto")}</p>
        </section>

        <input
          style={styles.search}
          placeholder="Search cities..."
          type="text"
        />

        <section style={styles.grid}>
          {cities.map((city) => (
            <div key={city.name} style={styles.card}>
              <div>
                <h3 style={styles.cardTitle}>{city.name}</h3>
                <p style={styles.country}>{city.country}</p>
              </div>

              <div style={styles.cardTime}>{getTime(city.timeZone)}</div>

              <p style={styles.cardDate}>{getDate(city.timeZone)}</p>
              <p style={styles.zone}>{city.timeZone}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
    color: "white",
    fontFamily: "Inter, Arial, sans-serif",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "22px 42px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(7,17,32,0.86)",
    backdropFilter: "blur(14px)",
  },
  logo: {
    fontSize: "1.6rem",
    fontWeight: 800,
  },
  nav: {
    display: "flex",
    gap: "24px",
    color: "#aeb8ca",
    fontSize: "0.95rem",
  },
  main: {
    padding: "80px 22px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  hero: {
    textAlign: "center",
    maxWidth: "850px",
  },
  badge: {
    color: "#67e8f9",
    letterSpacing: "0.2em",
    fontSize: "0.8rem",
    fontWeight: 700,
  },
  title: {
    fontSize: "clamp(3rem, 7vw, 6rem)",
    lineHeight: 1,
    margin: "18px 0",
  },
  subtitle: {
    color: "#b8c1d1",
    fontSize: "1.25rem",
    lineHeight: 1.6,
    maxWidth: "680px",
  },
  featureCard: {
    marginTop: "60px",
    width: "100%",
    maxWidth: "620px",
    padding: "42px",
    borderRadius: "28px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    textAlign: "center",
    boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
  },
  cityLabel: {
    color: "#c5cad5",
    fontSize: "1.1rem",
    margin: 0,
  },
  mainClock: {
    fontSize: "clamp(3rem, 8vw, 5rem)",
    margin: "18px 0",
    letterSpacing: "0.03em",
  },
  dateText: {
    color: "#9ca7ba",
    margin: 0,
  },
  search: {
    marginTop: "44px",
    width: "100%",
    maxWidth: "620px",
    padding: "20px 24px",
    borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontSize: "1rem",
    outline: "none",
  },
  grid: {
    marginTop: "58px",
    width: "100%",
    maxWidth: "1180px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "22px",
  },
  card: {
    padding: "28px",
    borderRadius: "24px",
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
  },
  cardTitle: {
    fontSize: "1.35rem",
    margin: 0,
  },
  country: {
    color: "#9ca7ba",
    marginTop: "8px",
  },
  cardTime: {
    fontSize: "2.25rem",
    fontWeight: 800,
    marginTop: "30px",
    letterSpacing: "0.03em",
  },
  cardDate: {
    color: "#c5cad5",
    marginBottom: "8px",
  },
  zone: {
    color: "#6f7b91",
    fontSize: "0.85rem",
  },
};

export default App;