import React, { useState } from "react";
import { Link } from "react-router-dom";
import { cities } from "../data/cities";
import StructuredData from "../components/StructuredData";
import {
  formatTimeInZone,
  getTimeDifferenceMinutes,
  splitTimeDifference,
} from "../utils/dateTime";

export default function TimeDifferencePage() {
  const [fromCity, setFromCity] = useState(cities[0]);
  const [toCity, setToCity] = useState(cities[1]);
  const calculatorStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "WorldTick Time Difference Calculator",
    url: "https://worldtick.site/time-difference",
    description:
      "Compare the current time difference between cities around the world.",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
  };

  const now = new Date();
  const differenceMinutes = getTimeDifferenceMinutes(
    fromCity.timezone,
    toCity.timezone,
    now
  );
  const { hours, minutes } = splitTimeDifference(differenceMinutes);

  const direction =
    differenceMinutes > 0
      ? `${toCity.name} is ahead of ${fromCity.name}`
      : differenceMinutes < 0
      ? `${toCity.name} is behind ${fromCity.name}`
      : `${toCity.name} and ${fromCity.name} are in the same time zone`;
const fromCityTime = formatTimeInZone(fromCity.timezone, now, {
  hour: "numeric",
  minute: "2-digit",
  second: undefined,
  hour12: true,
});

const toCityTime = formatTimeInZone(toCity.timezone, now, {
  hour: "numeric",
  minute: "2-digit",
  second: undefined,
  hour12: true,
});
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
        color: "white",
        padding: "clamp(56px, 10vw, 80px) clamp(16px, 5vw, 22px)",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <StructuredData data={calculatorStructuredData} />
      <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
        <p style={{ color: "#67e8f9", letterSpacing: "0.2em", fontWeight: 700 }}>
          TIME DIFFERENCE CALCULATOR
        </p>

        <h1 style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", margin: "18px 0" }}>
          Compare Time Between Cities
        </h1>

        <p style={{ color: "#b8c1d1", fontSize: "1.15rem", marginBottom: "45px" }}>
          Quickly calculate the time difference between two cities anywhere in the world.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
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
                minWidth: 0,
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
                minWidth: 0,
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
            padding: "clamp(28px, 7vw, 42px)",
            borderRadius: "28px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(103,232,249,0.25)",
            boxShadow: "0 28px 80px rgba(103,232,249,0.12)",
          }}
        >
          <h2 style={{ fontSize: "clamp(1.45rem, 7vw, 2rem)", marginBottom: "16px", overflowWrap: "anywhere" }}>{direction}</h2>

          <p style={{ fontSize: "clamp(2.25rem, 12vw, 3rem)", fontWeight: 800, color: "#67e8f9" }}>
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
    whiteSpace: "normal",
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
