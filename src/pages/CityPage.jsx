import React from "react";
import { useParams } from "react-router-dom";
import { cities } from "../data/cities";



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

export default function CityPage() {
  const { city } = useParams();

  const cityData = cities.find(
  (c) => c.slug === city?.toLowerCase()
);

  if (!cityData) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#071120",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2rem",
        }}
      >
        City not found
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
        color: "white",
        padding: "60px 20px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
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
            fontSize: "4rem",
            marginTop: "20px",
            marginBottom: "10px",
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
          {cityData.country}
        </p>

        <div
          style={{
            marginTop: "50px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "28px",
            padding: "50px 30px",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              fontSize: "5rem",
              fontWeight: "800",
              letterSpacing: "0.05em",
            }}
          >
            {getTime(cityData.timezone)}
          </div>

          <div
            style={{
              marginTop: "25px",
              fontSize: "1.2rem",
              color: "#c5d5ea",
            }}
          >
            {getDate(cityData.timezone)}
          </div>

          <div
            style={{
              marginTop: "20px",
              color: "#6f7b91",
            }}
          >
            {cityData.timezone}
          </div>
        </div>
      </div>
    </div>
  );
}