import React from "react";
import { Link, useParams } from "react-router-dom";
import { cities } from "../data/cities";
import {
  formatTimeInZone,
  getTimeDifferenceMinutes,
  splitTimeDifference,
} from "../utils/dateTime";
import useNow from "../hooks/useNow";
import { siteConfig } from "../config/site";

export default function ComparisonPage() {
  const { fromCity, toCity } = useParams();
  const now = useNow();

  const cityA = cities.find((city) => city.slug === fromCity);
  const cityB = cities.find((city) => city.slug === toCity);

  if (!cityA || !cityB) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1>Comparison Not Found</h1>
          <p style={styles.muted}>
            One or both cities could not be found.
          </p>
          <Link to="/time-difference" style={styles.link}>
            Go back to Time Difference Calculator
          </Link>
        </div>
      </div>
    );
  }

  const timeA = formatTimeInZone(cityA.timezone, now, {
    hour: "numeric",
    minute: "2-digit",
    second: undefined,
    hour12: true,
  });

  const timeB = formatTimeInZone(cityB.timezone, now, {
    hour: "numeric",
    minute: "2-digit",
    second: undefined,
    hour12: true,
  });

  const differenceMinutes = getTimeDifferenceMinutes(
    cityA.timezone,
    cityB.timezone,
    now
  );
  const { hours, minutes } = splitTimeDifference(differenceMinutes);

  const direction =
    differenceMinutes > 0
      ? `${cityB.name} is ahead of ${cityA.name}`
      : differenceMinutes < 0
      ? `${cityB.name} is behind ${cityA.name}`
      : `${cityB.name} and ${cityA.name} are in the same time zone`;

  document.title = `Time Difference Between ${cityA.name} and ${cityB.name} | ${siteConfig.publicSiteName}`;

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.badge}>TIME DIFFERENCE</p>

        <h1 style={styles.title}>
          Time Difference Between {cityA.name} and {cityB.name}
        </h1>

        <p style={styles.subtitle}>
          Compare the current local time in {cityA.name}, {cityA.country} and{" "}
          {cityB.name}, {cityB.country}.
        </p>
      </section>

      <section style={styles.card}>
        <h2 style={styles.direction}>{direction}</h2>

        <div style={styles.difference}>
          {hours}h {minutes}m
        </div>

        <div style={styles.timeGrid}>
          <div style={styles.timeBox}>
            <p style={styles.cityName}>{cityA.name}</p>
            <p style={styles.country}>{cityA.country}</p>
            <p style={styles.time}>{timeA}</p>
          </div>

          <div style={styles.timeBox}>
            <p style={styles.cityName}>{cityB.name}</p>
            <p style={styles.country}>{cityB.country}</p>
            <p style={styles.time}>{timeB}</p>
          </div>
        </div>

        <div style={styles.actions}>
          <Link
            to={`/compare/${cityB.slug}/${cityA.slug}`}
            style={styles.button}
          >
            Swap Cities
          </Link>

          <Link to="/time-difference" style={styles.secondaryButton}>
            Compare Other Cities
          </Link>
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
    color: "white",
    padding: "140px 22px 80px",
    fontFamily: "Inter, Arial, sans-serif",
  },

  hero: {
    maxWidth: "900px",
    margin: "0 auto 42px",
    textAlign: "center",
  },

  badge: {
    color: "#67e8f9",
    letterSpacing: "0.22em",
    fontSize: "0.78rem",
    fontWeight: 800,
  },

  title: {
    fontSize: "clamp(2.4rem, 6vw, 4.8rem)",
    lineHeight: 1.05,
    margin: "18px 0",
  },

  subtitle: {
    color: "#b8c1d1",
    fontSize: "1.15rem",
    lineHeight: 1.7,
  },

  card: {
    maxWidth: "850px",
    margin: "0 auto",
    padding: "42px",
    borderRadius: "28px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.11)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
    textAlign: "center",
  },

  direction: {
    fontSize: "2rem",
    marginBottom: "18px",
  },

  difference: {
    fontSize: "3.2rem",
    fontWeight: 900,
    color: "#67e8f9",
    marginBottom: "34px",
  },

  timeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "22px",
    marginTop: "28px",
  },

  timeBox: {
    padding: "26px",
    borderRadius: "22px",
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.1)",
  },

  cityName: {
    fontSize: "1.35rem",
    fontWeight: 800,
    margin: 0,
  },

  country: {
    color: "#9ca7ba",
    marginTop: "8px",
  },

  time: {
    fontSize: "2rem",
    fontWeight: 900,
    marginTop: "20px",
  },

  actions: {
    marginTop: "34px",
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "16px",
  },

  button: {
    padding: "13px 22px",
    borderRadius: "14px",
    background: "#67e8f9",
    color: "#06101f",
    fontWeight: 900,
    textDecoration: "none",
  },

  secondaryButton: {
    padding: "13px 22px",
    borderRadius: "14px",
    border: "1px solid rgba(103,232,249,0.35)",
    color: "#67e8f9",
    textDecoration: "none",
    fontWeight: 800,
  },

  muted: {
    color: "#b8c1d1",
  },

  link: {
    color: "#67e8f9",
    fontWeight: 800,
  },
};
