import { Link } from "react-router-dom";
import { siteConfig } from "../config/site";

export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <div>
          <h2 style={styles.logo}>{siteConfig.publicSiteName}</h2>
          <p style={styles.tagline}>Global time made simple.</p>
        </div>

        <div style={styles.links}>
          <Link style={styles.link} to="/about">About</Link>
          <Link style={styles.link} to="/contact">Contact</Link>
          <Link style={styles.link} to="/privacy">Privacy</Link>
          <Link style={styles.link} to="/terms">Terms</Link>
          <Link style={styles.link} to="/cities">Browse Cities</Link>
          <Link style={styles.link} to="/countries">Browse Countries</Link>
          <Link style={styles.link} to="/time-difference">Time Difference</Link>
        </div>
      </div>

      <p style={styles.copy}>
        © 2026 {siteConfig.publicSiteName}. All rights reserved.
      </p>
    </footer>
  );
}

const styles = {
  footer: {
    background: "#050914",
    borderTop: "1px solid rgba(103,232,249,0.16)",
    padding: "clamp(42px, 8vw, 56px) clamp(16px, 5vw, 22px) 36px",
    color: "white",
    fontFamily: "Inter, Arial, sans-serif",
  },
  inner: {
    maxWidth: "1180px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    gap: "28px",
    flexWrap: "wrap",
    minWidth: 0,
  },
  logo: {
    margin: 0,
    fontSize: "1.8rem",
    color: "#94a3b8",
fontSize: "1rem",
  },
 tagline: {
  marginTop: "8px",
  color: "#94a3b8",
  fontSize: "1rem",
},
  links: {
    display: "flex",
    gap: "18px",
    flexWrap: "wrap",
    alignItems: "center",
    minWidth: 0,
  },
  link: {
    color: "#cbd5e1",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "0.95rem",
    overflowWrap: "anywhere",
  },
  copy: {
    maxWidth: "1180px",
    margin: "28px auto 0",
    paddingTop: "22px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    color: "#64748b",
    fontSize: "0.9rem",
  },
};
