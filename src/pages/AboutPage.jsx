import { siteConfig } from "../config/site";

export default function AboutPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.badge}>ABOUT {siteConfig.publicSiteName.toUpperCase()}</p>

        <h1 style={styles.title}>About {siteConfig.publicSiteName}</h1>

        <p style={styles.text}>
          {siteConfig.publicSiteName} was built with one simple goal: to make global time easy to
          understand, accessible, and beautifully displayed.
        </p>

        <p style={styles.text}>
          In today's connected world, people work, communicate, and collaborate
          across multiple countries and time zones every day. Whether you're
          scheduling meetings, coordinating with international teams, planning
          travel, managing remote work, or staying connected with friends and
          family abroad, knowing the correct local time matters.
        </p>

        <p style={styles.text}>
          {siteConfig.publicSiteName} provides accurate, real-time clocks for cities around the
          world, helping users quickly compare time zones and stay synchronized
          across regions.
        </p>

        <h2 style={styles.heading}>Our Mission</h2>

        <p style={styles.text}>
          Our mission is to simplify global time awareness and make it
          effortless for anyone, anywhere, to understand time across the world.
        </p>

        <h2 style={styles.heading}>
          What You Can Do With {siteConfig.publicSiteName}
        </h2>

        <ul style={styles.list}>
          <li>View real-time local time in major cities worldwide</li>
          <li>Compare times across multiple locations</li>
          <li>Calculate time differences between cities</li>
          <li>Save frequently used cities for quick access</li>
          <li>Access accurate timezone information instantly</li>
        </ul>

        <p style={styles.text}>
          As {siteConfig.publicSiteName} continues to grow, we remain committed to building useful
          tools that help people navigate our increasingly connected world.
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
    marginBottom: "24px",
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
  list: {
    color: "#cbd5e1",
    fontSize: "1.05rem",
    lineHeight: 1.9,
    paddingLeft: "22px",
  },
};
