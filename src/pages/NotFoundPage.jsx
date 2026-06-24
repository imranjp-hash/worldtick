import { useEffect } from "react";
import { Link } from "react-router-dom";

const destinations = [
  { label: "Home", to: "/" },
  { label: "Browse Cities", to: "/cities" },
  { label: "Browse Countries", to: "/countries" },
  { label: "Time Difference", to: "/time-difference" },
];

export default function NotFoundPage() {
  useEffect(() => {
    document.title = "Page Not Found | WorldTick";
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.code}>404</p>
        <h1 style={styles.title}>Page not found</h1>
        <p style={styles.message}>
          The page you’re looking for may have moved, or the address may be
          incorrect. Choose a destination below to keep exploring WorldTick.
        </p>

        <nav aria-label="404 page navigation" style={styles.links}>
          {destinations.map((destination, index) => (
            <Link
              key={destination.to}
              to={destination.to}
              style={
                index === 0
                  ? { ...styles.link, ...styles.primaryLink }
                  : styles.link
              }
            >
              {destination.label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "clamp(54px, 10vw, 72px) clamp(16px, 5vw, 22px)",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
    color: "white",
    fontFamily: "Inter, Arial, sans-serif",
  },
  card: {
    position: "relative",
    width: "100%",
    maxWidth: "760px",
    padding: "clamp(34px, 8vw, 76px) clamp(18px, 6vw, 58px)",
    overflow: "hidden",
    border: "1px solid rgba(103,232,249,0.18)",
    borderRadius: "30px",
    background:
      "radial-gradient(circle at top, rgba(103,232,249,0.12), rgba(255,255,255,0.045) 46%, rgba(255,255,255,0.025) 100%)",
    boxShadow:
      "0 32px 90px rgba(0,0,0,0.42), 0 0 55px rgba(103,232,249,0.08)",
    textAlign: "center",
    backdropFilter: "blur(18px)",
  },
  code: {
    margin: 0,
    color: "#67e8f9",
    fontSize: "clamp(4rem, 18vw, 9rem)",
    fontWeight: 900,
    lineHeight: 0.9,
    letterSpacing: "-0.06em",
    textShadow: "0 0 38px rgba(103,232,249,0.32)",
  },
  title: {
    margin: "26px 0 14px",
    fontSize: "clamp(1.8rem, 6vw, 3.4rem)",
    lineHeight: 1.1,
    overflowWrap: "anywhere",
  },
  message: {
    maxWidth: "590px",
    margin: "0 auto",
    color: "#b8c1d1",
    fontSize: "1.08rem",
    lineHeight: 1.75,
  },
  links: {
    marginTop: "34px",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "13px",
  },
  link: {
    padding: "13px 19px",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.055)",
    color: "white",
    fontWeight: 800,
    textDecoration: "none",
    textAlign: "center",
  },
  primaryLink: {
    borderColor: "#67e8f9",
    background: "#67e8f9",
    color: "#06101f",
    boxShadow: "0 0 28px rgba(103,232,249,0.2)",
  },
};
