export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.badge}>PRIVACY POLICY</p>

        <h1 style={styles.title}>Privacy Policy</h1>

        <p style={styles.updated}>Last Updated: June 2026</p>

        <p style={styles.text}>
          At WorldTick, we respect your privacy and are committed to protecting
          any information collected through our website.
        </p>

        <h2 style={styles.heading}>Information We Collect</h2>

        <p style={styles.text}>
          WorldTick does not require users to create accounts or submit personal
          information to access core features.
        </p>

        <p style={styles.text}>
          We may collect limited non-personal information such as browser type,
          device information, general geographic region, pages visited, usage
          statistics, and performance data.
        </p>

        <h2 style={styles.heading}>Cookies</h2>

        <p style={styles.text}>
          WorldTick may use cookies and similar technologies to improve user
          experience, remember preferences, analyze website traffic, and support
          future advertising or analytics services.
        </p>

        <h2 style={styles.heading}>Analytics</h2>

        <p style={styles.text}>
          We may use third-party analytics services to understand how visitors
          interact with the website. These services may collect anonymized usage
          information to help us improve our content and user experience.
        </p>

        <h2 style={styles.heading}>Data Security</h2>

        <p style={styles.text}>
          We take reasonable technical and organizational measures to protect
          information collected through the website. However, no method of
          internet transmission or electronic storage is completely secure.
        </p>

        <h2 style={styles.heading}>Third-Party Links</h2>

        <p style={styles.text}>
          WorldTick may contain links to third-party websites. We are not
          responsible for the privacy practices or content of external websites.
        </p>

        <h2 style={styles.heading}>Contact</h2>

        <p style={styles.text}>
          If you have questions regarding this Privacy Policy, please contact us
          at: <strong>info@worldtick.site</strong>
        </p>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #10213d 0%, #071120 45%, #050914 100%)",
    color: "white",
    padding: "100px 22px",
    fontFamily: "Inter, Arial, sans-serif",
  },
  card: {
    maxWidth: "860px",
    margin: "0 auto",
    padding: "42px",
    borderRadius: "28px",
    background: "rgba(15, 23, 42, 0.72)",
    border: "1px solid rgba(103, 232, 249, 0.22)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
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
    marginBottom: "14px",
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