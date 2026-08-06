import { siteConfig } from "../config/site";

export default function ContactPage() {
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.badge}>CONTACT US</div>

        <h1 style={styles.title}>Contact WorldTick</h1>

        <p style={styles.updated}>
          We'd love to hear from you.
        </p>

        <p style={styles.text}>
          Whether you have feedback, questions, feature suggestions, or notice
          an issue with the website, feel free to get in touch.
        </p>

        <h2 style={styles.heading}>Email</h2>

        <p style={styles.text}>
          {siteConfig.contactEmail}
        </p>

        <h2 style={styles.heading}>Response Time</h2>

        <p style={styles.text}>
          We typically respond within 24–48 hours.
        </p>

        <h2 style={styles.heading}>Feedback & Suggestions</h2>

        <p style={styles.text}>
          WorldTick is continuously improving. If you have ideas for new
          features, additional cities, time tools, or improvements to the user
          experience, we'd be happy to hear from you.
        </p>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
    padding: "120px 24px",
    display: "flex",
    justifyContent: "center",
  },

  card: {
    width: "100%",
    maxWidth: "760px",
    background: "rgba(10,20,40,0.75)",
    border: "1px solid rgba(103,232,249,0.18)",
    borderRadius: "28px",
    padding: "34px",
    backdropFilter: "blur(18px)",
  },

  badge: {
    color: "#67e8f9",
    fontSize: "0.78rem",
    letterSpacing: "0.18em",
    fontWeight: 800,
    marginBottom: "16px",
  },

  title: {
    fontSize: "clamp(2.2rem, 5vw, 4rem)",
    marginBottom: "24px",
    color: "white",
  },

  updated: {
    color: "#94a3b8",
    marginBottom: "26px",
  },

  heading: {
    fontSize: "1.55rem",
    marginTop: "34px",
    marginBottom: "14px",
    color: "#e0faff",
  },

  text: {
    color: "#cbd5e1",
    fontSize: "1.05rem",
    lineHeight: 1.8,
    marginBottom: "18px",
  },
};
