import React from "react";
import { Link } from "react-router-dom";
import { cities } from "../data/cities";

export default function CitiesPage() {
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "20px",
          }}
        >
          {cities.map((city) => (
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
      </div>
    </div>
  );
}