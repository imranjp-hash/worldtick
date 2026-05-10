import { useEffect, useState } from "react";
import "./App.css";

const cities = [
  { name: "Toronto", country: "Canada", timeZone: "America/Toronto" },
  { name: "Vancouver", country: "Canada", timeZone: "America/Vancouver" },
  { name: "Montreal", country: "Canada", timeZone: "America/Toronto" },
  { name: "Calgary", country: "Canada", timeZone: "America/Edmonton" },
  { name: "New York", country: "United States", timeZone: "America/New_York" },
  { name: "Los Angeles", country: "United States", timeZone: "America/Los_Angeles" },
  { name: "Chicago", country: "United States", timeZone: "America/Chicago" },
  { name: "Miami", country: "United States", timeZone: "America/New_York" },
  { name: "London", country: "United Kingdom", timeZone: "Europe/London" },
  { name: "Paris", country: "France", timeZone: "Europe/Paris" },
  { name: "Berlin", country: "Germany", timeZone: "Europe/Berlin" },
  { name: "Madrid", country: "Spain", timeZone: "Europe/Madrid" },
  { name: "Rome", country: "Italy", timeZone: "Europe/Rome" },
  { name: "Amsterdam", country: "Netherlands", timeZone: "Europe/Amsterdam" },
  { name: "Zurich", country: "Switzerland", timeZone: "Europe/Zurich" },
  { name: "Dubai", country: "United Arab Emirates", timeZone: "Asia/Dubai" },
  { name: "Doha", country: "Qatar", timeZone: "Asia/Qatar" },
  { name: "Riyadh", country: "Saudi Arabia", timeZone: "Asia/Riyadh" },
  { name: "Tokyo", country: "Japan", timeZone: "Asia/Tokyo" },
  { name: "Seoul", country: "South Korea", timeZone: "Asia/Seoul" },
  { name: "Beijing", country: "China", timeZone: "Asia/Shanghai" },
  { name: "Shanghai", country: "China", timeZone: "Asia/Shanghai" },
  { name: "Hong Kong", country: "Hong Kong", timeZone: "Asia/Hong_Kong" },
  { name: "Singapore", country: "Singapore", timeZone: "Asia/Singapore" },
  { name: "Bangkok", country: "Thailand", timeZone: "Asia/Bangkok" },
  { name: "Manila", country: "Philippines", timeZone: "Asia/Manila" },
  { name: "Mumbai", country: "India", timeZone: "Asia/Kolkata" },
  { name: "Delhi", country: "India", timeZone: "Asia/Kolkata" },
  { name: "Karachi", country: "Pakistan", timeZone: "Asia/Karachi" },
  { name: "Istanbul", country: "Turkey", timeZone: "Europe/Istanbul" },
  { name: "Sydney", country: "Australia", timeZone: "Australia/Sydney" },
  { name: "Melbourne", country: "Australia", timeZone: "Australia/Melbourne" },
  { name: "Auckland", country: "New Zealand", timeZone: "Pacific/Auckland" },
  { name: "Kingston", country: "Jamaica", timeZone: "America/Jamaica" },
  { name: "Montego Bay", country: "Jamaica", timeZone: "America/Jamaica" },
  { name: "George Town", country: "Cayman Islands", timeZone: "America/Cayman" },
  { name: "Nassau", country: "Bahamas", timeZone: "America/Nassau" },
  { name: "Bridgetown", country: "Barbados", timeZone: "America/Barbados" },
  { name: "Port of Spain", country: "Trinidad and Tobago", timeZone: "America/Port_of_Spain" },
  { name: "Mexico City", country: "Mexico", timeZone: "America/Mexico_City" },
  { name: "Bogota", country: "Colombia", timeZone: "America/Bogota" },
  { name: "Lima", country: "Peru", timeZone: "America/Lima" },
  { name: "Santiago", country: "Chile", timeZone: "America/Santiago" },
  { name: "Buenos Aires", country: "Argentina", timeZone: "America/Argentina/Buenos_Aires" },
  { name: "São Paulo", country: "Brazil", timeZone: "America/Sao_Paulo" },
  { name: "Rio de Janeiro", country: "Brazil", timeZone: "America/Sao_Paulo" },
  { name: "Lagos", country: "Nigeria", timeZone: "Africa/Lagos" },
  { name: "Accra", country: "Ghana", timeZone: "Africa/Accra" },
  { name: "Nairobi", country: "Kenya", timeZone: "Africa/Nairobi" },
  { name: "Johannesburg", country: "South Africa", timeZone: "Africa/Johannesburg" },
  { name: "Cairo", country: "Egypt", timeZone: "Africa/Cairo" },
  { name: "Casablanca", country: "Morocco", timeZone: "Africa/Casablanca" },
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
  const [search, setSearch] = useState("");
  const [selectedCities, setSelectedCities] = useState([]);
  const [, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredCities = cities.filter((city) =>
    `${city.name} ${city.country}`.toLowerCase().includes(search.toLowerCase())
  );

  const suggestions = search.trim() === "" ? [] : filteredCities.slice(0, 6);

  const addCity = (city) => {
    const alreadyAdded = selectedCities.find(
      (selected) => selected.name === city.name
    );

    if (!alreadyAdded) {
      setSelectedCities([...selectedCities, city]);
    }

    setSearch("");
  };

  const removeCity = (cityName) => {
    setSelectedCities(selectedCities.filter((city) => city.name !== cityName));
  };

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

        <div style={styles.searchWrap}>
          <input
            style={styles.search}
            placeholder="Search cities..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {suggestions.length > 0 && (
            <div style={styles.dropdown}>
              {suggestions.map((city) => (
                <button
                  key={city.name}
                  style={styles.suggestion}
                  onClick={() => addCity(city)}
                >
                  <span>
                    <strong>{city.name}</strong>
                    <small style={styles.suggestionCountry}>
                      {city.country}
                    </small>
                  </span>

                  <span style={styles.suggestionTime}>
                    {getTime(city.timeZone)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {search.trim() !== "" && suggestions.length === 0 && (
            <div style={styles.dropdown}>
              <div style={styles.noResult}>No cities found</div>
            </div>
          )}
        </div>

        {selectedCities.length > 0 && (
          <>
            <div style={styles.sectionHeader}>
              <p style={styles.sectionBadge}>SELECTED CITIES</p>
              <h2 style={styles.sectionTitle}>Your world clock dashboard</h2>
            </div>

            <section style={styles.grid}>
              {selectedCities.map((city) => (
                <div key={city.name} style={styles.selectedCard}>
                  <button
                    style={styles.removeButton}
                    onClick={() => removeCity(city.name)}
                  >
                    ×
                  </button>

                  <h3 style={styles.cardTitle}>{city.name}</h3>
                  <p style={styles.country}>{city.country}</p>
                  <div style={styles.cardTime}>{getTime(city.timeZone)}</div>
                  <p style={styles.cardDate}>{getDate(city.timeZone)}</p>
                  <p style={styles.zone}>{city.timeZone}</p>
                </div>
              ))}
            </section>
          </>
        )}

        <div style={styles.sectionHeader}>
          <p style={styles.sectionBadge}>POPULAR GLOBAL CITIES</p>
          <h2 style={styles.sectionTitle}>Explore live city times</h2>
        </div>

        <section style={styles.grid}>
          {filteredCities.map((city) => (
            <div
              key={city.name}
              style={styles.card}
              className="city-card"
              onClick={() => addCity(city)}
            >
              <div>
                <h3 style={styles.cardTitle} className="city-name">
                  {city.name}
                </h3>
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

  searchWrap: {
    position: "relative",
    width: "100%",
    maxWidth: "620px",
    marginTop: "44px",
  },

  search: {
    width: "100%",
    padding: "20px 24px",
    borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontSize: "1rem",
    outline: "none",
  },

  dropdown: {
    position: "absolute",
    top: "68px",
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: "hidden",
    borderRadius: "18px",
    border: "1px solid rgba(103,232,249,0.22)",
    background: "rgba(10,22,40,0.96)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
    backdropFilter: "blur(18px)",
  },

  suggestion: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    textAlign: "left",
  },

  suggestionCountry: {
    display: "block",
    marginTop: "4px",
    color: "#9ca7ba",
    fontSize: "0.85rem",
  },

  suggestionTime: {
    color: "#67e8f9",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  noResult: {
    padding: "18px 20px",
    color: "#9ca7ba",
  },

  sectionHeader: {
    marginTop: "70px",
    textAlign: "center",
  },

  sectionBadge: {
    color: "#67e8f9",
    letterSpacing: "0.18em",
    fontSize: "0.75rem",
    fontWeight: 700,
  },

  sectionTitle: {
    fontSize: "2rem",
    margin: "10px 0 0",
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

  selectedCard: {
    position: "relative",
    padding: "28px",
    borderRadius: "24px",
    background: "rgba(103,232,249,0.08)",
    border: "1px solid rgba(103,232,249,0.3)",
    boxShadow: "0 20px 70px rgba(103,232,249,0.12)",
  },

  removeButton: {
    position: "absolute",
    top: "18px",
    right: "18px",
    width: "30px",
    height: "30px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontSize: "1.3rem",
    cursor: "pointer",
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