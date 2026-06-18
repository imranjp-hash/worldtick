import React, { useState } from "react";
import { Link } from "react-router-dom";
import { cities } from "../data/cities";

export default function TimeDifferencePage() {
  const [fromCity, setFromCity] = useState(cities[0]);
  const [toCity, setToCity] = useState(cities[1]);

  const getOffsetMinutes = (timezone) => {
    const now = new Date();

    const utcDate = new Date(
      now.toLocaleString("en-US", { timeZone: "UTC" })
    );

    const cityDate = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    );

    return (cityDate - utcDate) / 60000;
  };

  const differenceMinutes =
    getOffsetMinutes(toCity.timezone) - getOffsetMinutes(fromCity.timezone);

  const absoluteMinutes = Math.abs(differenceMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  const direction =
    differenceMinutes > 0
      ? `${toCity.name} is ahead of ${fromCity.name}`
      : differenceMinutes < 0
      ? `${toCity.name} is behind ${fromCity.name}`
      : `${toCity.name} and ${fromCity.name} are in the same time zone`;
const fromCityTime = new Date().toLocaleTimeString("en-US", {
  timeZone: fromCity.timezone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const toCityTime = new Date().toLocaleTimeString("en-US", {
  timeZone: toCity.timezone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
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
      <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
        <p style={{ color: "#67e8f9", letterSpacing: "0.2em", fontWeight: 700 }}>
          TIME DIFFERENCE CALCULATOR
        </p>

        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", margin: "18px 0" }}>
          Compare Time Between Cities
        </h1>

        <p style={{ color: "#b8c1d1", fontSize: "1.15rem", marginBottom: "45px" }}>
          Quickly calculate the time difference between two cities anywhere in the world.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "22px",
            marginBottom: "38px",
          }}
        >
          <div>
            <label style={{ display: "block", marginBottom: "10px", color: "#c5cad5" }}>
              From
            </label>
            <select
              value={fromCity.slug}
              onChange={(e) =>
                setFromCity(cities.find((city) => city.slug === e.target.value))
              }
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "14px",
                background: "#0f1d33",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {cities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}, {city.country}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "10px", color: "#c5cad5" }}>
              To
            </label>
            <select
              value={toCity.slug}
              onChange={(e) =>
                setToCity(cities.find((city) => city.slug === e.target.value))
              }
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "14px",
                background: "#0f1d33",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {cities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}, {city.country}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
  onClick={() => {
    const temp = fromCity;
    setFromCity(toCity);
    setToCity(temp);
  }}
  style={{
    marginTop: "20px",
    padding: "12px 24px",
    borderRadius: "12px",
    border: "1px solid rgba(103,232,249,0.3)",
    background: "rgba(103,232,249,0.08)",
    color: "#67e8f9",
    fontWeight: 700,
    cursor: "pointer",
  }}
>
  ⇄ Swap Cities
</button>
        <div
          style={{
            padding: "42px",
            borderRadius: "28px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(103,232,249,0.25)",
            boxShadow: "0 28px 80px rgba(103,232,249,0.12)",
          }}
        >
          <h2 style={{ fontSize: "2rem", marginBottom: "16px" }}>{direction}</h2>

          <p style={{ fontSize: "3rem", fontWeight: 800, color: "#67e8f9" }}>
            {hours}h {minutes}m
          </p>

          <p style={{ color: "#9ca7ba" }}>
            {fromCity.name} → {toCity.name}
          </p>
          <div
  style={{
    marginTop: "24px",
    color: "#cfd8e3",
    fontSize: "1.05rem",
    lineHeight: "1.9",
  }}
>
  <div>
    <strong>{fromCity.name}:</strong> {fromCityTime}
  </div>

  <div>
    <strong>{toCity.name}:</strong> {toCityTime}
  </div>
  <Link
  to={`/compare/${fromCity.slug}/${toCity.slug}`}
  style={{
    display: "inline-block",
    marginTop: "28px",
    padding: "13px 22px",
    borderRadius: "14px",
    background: "#67e8f9",
    color: "#06101f",
    fontWeight: 900,
    textDecoration: "none",
  }}
>
  View Full Comparison Page
</Link>
</div>
        </div>
      </div>
    </div>
  );
}