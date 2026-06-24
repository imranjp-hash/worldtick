import TimeDifferencePage from "./pages/TimeDifferencePage";
import ComparisonPage from "./pages/ComparisonPage";
import CitiesPage from "./pages/CitiesPage";
import HomePage from "./pages/HomePage";
import { useState, useEffect } from "react";
import { Navigate, Routes, Route, useNavigate, useParams } from "react-router-dom";
import "./App.css";
import CityPage from "./pages/CityPage";
import Header from "./components/Header";
import { cities } from "./data/cities";
import AboutPage from "./pages/AboutPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import ContactPage from "./pages/ContactPage";
import Footer from "./components/Footer";
import CountriesPage from "./pages/CountriesPage";
import CountryPage from "./pages/CountryPage";
import NotFoundPage from "./pages/NotFoundPage";

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

function LegacyCityRedirect() {
  const { city } = useParams();

  return <Navigate to={`/city/${city}`} replace />;
}

function App() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  
  const [selectedCities, setSelectedCities] = useState(() => {
  const savedCities = localStorage.getItem('worldtick-selected-cities');

  return savedCities ? JSON.parse(savedCities) : [];
});
  const [, setTick] = useState(Date.now());

useEffect(() => {
  const timer = setInterval(() => setTick(Date.now()), 1000);
  return () => clearInterval(timer);
}, []);

useEffect(() => {
  localStorage.setItem(
    "worldtick-selected-cities",
    JSON.stringify(selectedCities)
  );
}, [selectedCities]);

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
  <>
    <Header />
    <Routes>
    <Route
  path="/"
  element={
    <HomePage
      cities={cities}
      search={search}
      setSearch={setSearch}
      suggestions={suggestions}
      selectedCities={selectedCities}
      addCity={addCity}
      removeCity={removeCity}
      getTime={getTime}
      getDate={getDate}
      navigate={navigate}
      styles={styles}
    />
  }
/>
<Route
  path="/cities"
  element={<CitiesPage />}
/>
<Route
  path="/countries"
  element={<CountriesPage />}
/>
<Route
  path="/country/:countrySlug"
  element={<CountryPage />}
/>

<Route
  path="/time-in/:city"
  element={<LegacyCityRedirect />}
/>

<Route
  path="/city/:city"
  element={<CityPage />}
/>
<Route
  path="/time-difference"
  element={<TimeDifferencePage />}
/>
<Route
  path="/compare/:fromCity/:toCity"
  element={<ComparisonPage />}
/>
<Route path="/about" element={<AboutPage />} />
<Route path="/privacy" element={<PrivacyPage />} />
<Route path="/terms" element={<TermsPage />} />
<Route path="/contact" element={<ContactPage />} />
<Route path="*" element={<NotFoundPage />} />
       </Routes>
       <Footer />
  </>
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
 

  main: {
    padding: "clamp(56px, 10vw, 80px) clamp(16px, 5vw, 22px)",
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
    fontSize: "clamp(2.45rem, 7vw, 6rem)",
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
    padding: "clamp(28px, 8vw, 42px)",
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
    fontSize: "clamp(2.55rem, 8vw, 5rem)",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
    gap: "22px",
  },

  card: {
  padding: "clamp(22px, 6vw, 28px)",
  borderRadius: "24px",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
  transition: "all 0.25s ease",
  cursor: "pointer",
},

  selectedCard: {
    position: "relative",
    padding: "clamp(22px, 6vw, 28px)",
    borderRadius: "24px",
    background: "rgba(103,232,249,0.08)",
    border: "1px solid rgba(103,232,249,0.3)",
    boxShadow: "0 20px 70px rgba(103,232,249,0.12)",
    transition: "all 0.25s ease",
    cursor: "pointer",
  },
addButton: {
  marginTop: "16px",
  padding: "8px 14px",
  borderRadius: "999px",
  border: "1px solid rgba(103,232,249,0.35)",
  background: "rgba(103,232,249,0.12)",
  color: "#67e8f9",
  fontSize: "0.9rem",
  fontWeight: "700",
  cursor: "pointer",
  transition: "all 0.25s ease",
  boxShadow: "0 0 18px rgba(103,232,249,0.18)",
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
    fontSize: "clamp(1.9rem, 9vw, 2.25rem)",
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
  searchSection: {
  width: "100%",
  maxWidth: "700px",
  marginTop: "28px",
  display: "flex",
  justifyContent: "center",
},

searchInput: {
  width: "100%",
  padding: "18px 22px",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontSize: "1rem",
  outline: "none",
  backdropFilter: "blur(12px)",
},
};

export default App;
