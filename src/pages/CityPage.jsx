import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { cities } from "../data/cities";
import { Link } from "react-router-dom";
import { countrySlug, getCountryBySlug } from "../data/countries";
import NotFoundPage from "./NotFoundPage";
import StructuredData from "../components/StructuredData";



function getTime(timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());
}

function getDate(timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function getOffsetMinutes(timezone) {
  const now = new Date();

  const utcDate = new Date(
    now.toLocaleString("en-US", { timeZone: "UTC" })
  );

  const cityDate = new Date(
    now.toLocaleString("en-US", { timeZone: timezone })
  );

  return (cityDate - utcDate) / 60000;
}

function getDifferenceText(fromCity, toCity) {
  const differenceMinutes =
    getOffsetMinutes(toCity.timezone) - getOffsetMinutes(fromCity.timezone);

  const absoluteMinutes = Math.abs(differenceMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  const differenceText =
    minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;

  if (differenceMinutes > 0) {
    return `${toCity.name} is ${differenceText} ahead of ${fromCity.name}`;
  }

  if (differenceMinutes < 0) {
    return `${toCity.name} is ${differenceText} behind ${fromCity.name}`;
  }

  return `${toCity.name} and ${fromCity.name} are in the same time zone`;
}

export default function CityPage() {
  const { city } = useParams();

  const cityData = cities.find(
  (c) => c.slug === city?.toLowerCase()
);

  useEffect(() => {
    if (!cityData) {
      return;
    }

    const cityUrl = `https://worldtick.site/city/${cityData.slug}`;
    let canonical = document.querySelector('link[rel="canonical"]');
    let openGraphUrl = document.querySelector('meta[property="og:url"]');

    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }

    if (!openGraphUrl) {
      openGraphUrl = document.createElement("meta");
      openGraphUrl.setAttribute("property", "og:url");
      document.head.appendChild(openGraphUrl);
    }

    canonical.href = cityUrl;
    openGraphUrl.content = cityUrl;
  }, [cityData]);

  if (!cityData) {
    return <NotFoundPage />;
  }

  const eligibleCountry = getCountryBySlug(countrySlug(cityData.country));
  const cityUrl = `https://worldtick.site/city/${cityData.slug}`;
  const cityStructuredData = {
    "@context": "https://schema.org",
    "@type": "City",
    name: cityData.name,
    url: cityUrl,
    containedInPlace: {
      "@type": "Country",
      name: cityData.country,
    },
    additionalProperty: {
      "@type": "PropertyValue",
      name: "Time zone",
      value: cityData.timezone,
    },
  };

  const relatedCities = [
    ...cities.filter(
      (city) =>
        city.country === cityData.country && city.slug !== cityData.slug
    ),
    ...cities.filter(
      (city) =>
        city.slug !== cityData.slug &&
        ["toronto", "new-york", "london", "dubai", "tokyo", "sydney"].includes(
          city.slug
        )
    ),
  ]
    .filter(
      (city, index, list) =>
        list.findIndex((candidate) => candidate.slug === city.slug) === index
    )
    .slice(0, 6);
  
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
        color: "white",
        padding: "clamp(38px, 8vw, 60px) clamp(16px, 5vw, 20px)",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <StructuredData data={cityStructuredData} />
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "#57e3ff",
            letterSpacing: "0.2em",
            fontSize: "0.85rem",
            textTransform: "uppercase",
          }}
        >
          Live City Time
        </p>

        <h1
          style={{
            fontSize: "clamp(2.2rem, 13vw, 4rem)",
            lineHeight: 1.05,
            marginTop: "20px",
            marginBottom: "10px",
            overflowWrap: "anywhere",
          }}
        >
          {cityData.name}
        </h1>

        <p
          style={{
            color: "#9db2ce",
            fontSize: "1.2rem",
          }}
        >
          {eligibleCountry ? (
            <Link
              to={`/country/${eligibleCountry.slug}`}
              style={{
                color: "#67e8f9",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              {cityData.country}
            </Link>
          ) : (
            cityData.country
          )}
        </p>

        <div
          style={{
            marginTop: "38px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "28px",
            padding: "clamp(26px, 7vw, 50px) clamp(14px, 5vw, 30px)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              fontSize: "clamp(2.15rem, 10vw, 5rem)",
              fontWeight: "800",
              letterSpacing: "0.02em",
              lineHeight: 1.1,
              overflowWrap: "anywhere",
            }}
          >
            {getTime(cityData.timezone)}
          </div>

          <div
            style={{
              marginTop: "20px",
              fontSize: "clamp(1rem, 4vw, 1.2rem)",
              color: "#c5d5ea",
            }}
          >
            {getDate(cityData.timezone)}
          </div>

          <div
          style={{
            marginTop: "20px",
            color: "#6f7b91",
            overflowWrap: "anywhere",
          }}
        >
            {cityData.timezone}
          </div>
        </div>
        <div
  style={{
    maxWidth: "1000px",
    margin: "60px auto 0",
    textAlign: "center",
  }}
>
  <h2 style={{ fontSize: "2rem", marginBottom: "24px" }}>
    Related Cities
  </h2>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
      gap: "18px",
    }}
  >
    {relatedCities.map((city) => (
        <Link
          key={city.slug}
          to={`/city/${city.slug}`}
          onMouseEnter={(e) => {
  e.currentTarget.style.transform = "translateY(-5px)";
  e.currentTarget.style.boxShadow = "0 14px 35px rgba(103,232,249,0.18)";
}}

onMouseLeave={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
}}
          style={{
            padding: "18px",
            borderRadius: "18px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "white",
            textDecoration: "none",
            fontWeight: 800,
            cursor: "pointer",
transition: "all 0.25s ease",
          }}
        >
          {city.name}
        </Link>
      ))}
  </div>
  {eligibleCountry && (
    <Link
      to={`/country/${eligibleCountry.slug}`}
      style={{
        display: "inline-block",
        marginTop: "24px",
        color: "#67e8f9",
        fontWeight: 800,
        textDecoration: "none",
      }}
    >
      View all cities in {cityData.country}
    </Link>
  )}
  <div
  style={{
    maxWidth: "1000px",
    margin: "55px auto 0",
    textAlign: "center",
  }}
>
  <h2 style={{ fontSize: "2rem", marginBottom: "12px" }}>
    Time Difference From {cityData.name}
  </h2>

  <p
    style={{
      color: "#9ca7ba",
      marginBottom: "26px",
      fontSize: "1.05rem",
    }}
  >
    See how {cityData.name} compares with major cities around the world.
  </p>

  <Link
    to="/time-difference"
    style={{
      display: "inline-block",
      marginBottom: "26px",
      color: "#67e8f9",
      fontWeight: 800,
      textDecoration: "none",
    }}
  >
    Open the time difference calculator
  </Link>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
      gap: "18px",
    }}
  >
    {cities
      .filter(
        (city) =>
          city.slug !== cityData.slug &&
          ["toronto", "new-york", "london", "dubai", "tokyo", "sydney"].includes(
            city.slug
          )
      )
      .slice(0, 6)
      .map((city) => (
        <Link
          key={city.slug}
          to={`/compare/${cityData.slug}/${city.slug}`}
          onMouseEnter={(e) => {
  e.currentTarget.style.transform = "translateY(-5px)";
  e.currentTarget.style.boxShadow = "0 14px 35px rgba(103,232,249,0.18)";
  e.currentTarget.style.borderColor = "rgba(103,232,249,0.45)";
}}

onMouseLeave={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.borderColor = "rgba(103,232,249,0.22)";
}}
          style={{
  padding: "18px",
  borderRadius: "18px",
  background: "rgba(103,232,249,0.08)",
  border: "1px solid rgba(103,232,249,0.22)",
  textDecoration: "none",
  color: "white",
  textAlign: "center",
  transition: "all 0.25s ease",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  minHeight: "90px",
  cursor: "pointer",
fontWeight: "700",
}}
        >
          <>
  <div
    style={{
      fontSize: "1rem",
      fontWeight: "800",
      marginBottom: "6px",
    }}
  >
    {city.name}
  </div>

  <div
    style={{
      fontSize: "0.9rem",
      color: "#9ca7ba",
      overflowWrap: "anywhere",
    }}
  >
    {getDifferenceText(cityData, city)
      .replace(`${city.name} is `, "")
      .replace(` ${cityData.name}`, "")}
    {" →"}
  </div>
</>
        </Link>
      ))}
  </div>
</div>
  <div
  style={{
    maxWidth: "1000px",
    margin: "55px auto 0",
    textAlign: "center",
  }}
>
  <h2 style={{ fontSize: "2rem", marginBottom: "12px" }}>
    Compare {cityData.name} With Other Cities
  </h2>

  <p
    style={{
      color: "#9ca7ba",
      marginBottom: "26px",
      fontSize: "1.05rem",
    }}
  >
    Quickly compare the time difference between {cityData.name} and popular world cities.
  </p>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
      gap: "18px",
    }}
  >
    {cities
      .filter(
        (city) =>
          city.slug !== cityData.slug &&
          ["toronto", "new-york", "london", "dubai", "tokyo", "sydney"].includes(city.slug)
      )
      .slice(0, 6)
      .map((city) => (
        <Link
          key={city.slug}
          to={`/compare/${cityData.slug}/${city.slug}`}
          onMouseEnter={(e) => {
  e.currentTarget.style.transform = "translateY(-5px)";
  e.currentTarget.style.boxShadow = "0 14px 35px rgba(103,232,249,0.18)";
  e.currentTarget.style.borderColor = "rgba(103,232,249,0.45)";
}}

onMouseLeave={(e) => {
  e.currentTarget.style.transform = "translateY(0)";
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.borderColor = "rgba(103,232,249,0.22)";
}}
          style={{
            padding: "18px",
            borderRadius: "18px",
            background: "rgba(103,232,249,0.07)",
            border: "1px solid rgba(103,232,249,0.22)",
            color: "#67e8f9",
            textDecoration: "none",
            fontWeight: 900,
            cursor: "pointer",
            transition: "all 0.25s ease",
            overflowWrap: "anywhere",
          }}
        >
          {cityData.name} → {city.name}
        </Link>
      ))}
  </div>
</div>
</div>
      </div>
    </div>
  );
}
