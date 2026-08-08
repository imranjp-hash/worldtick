import { siteConfig } from "../config/site";

export default function TermsPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.badge}>TERMS OF SERVICE</p>

        <h1 style={styles.title}>Terms of Service</h1>

        <p style={styles.updated}>Last Updated: June 2026</p>

        <p style={styles.text}>
          By accessing or using {siteConfig.publicSiteName}, you agree to be bound by these Terms
          of Service.
        </p>

        <h2 style={styles.heading}>Use of the Website</h2>

        <p style={styles.text}>
          {siteConfig.publicSiteName} provides real-time time and timezone information for
          informational purposes only.
        </p>

        <p style={styles.text}>
          You agree to use the website in compliance with all applicable laws and
          regulations. You may not attempt to disrupt website operations, access
          the site through unauthorized automated methods, copy substantial
          portions of content without permission, or use the website for unlawful
          activities.
        </p>

        <h2 style={styles.heading}>Accuracy of Information</h2>

        <p style={styles.text}>
          We strive to provide accurate and up-to-date time and timezone
          information. However, {siteConfig.publicSiteName} does not guarantee the completeness,
          accuracy, or uninterrupted availability of all information displayed.
        </p>

        <p style={styles.text}>
          Users should independently verify critical scheduling, business, legal,
          travel, or operational decisions when necessary.
        </p>

        <h2 style={styles.heading}>Intellectual Property</h2>

        <p style={styles.text}>
          All website content, branding, design elements, logos, graphics, and
          software associated with {siteConfig.publicSiteName} are protected by applicable
          intellectual property laws and remain the property of {siteConfig.organizationName} unless
          otherwise stated.
        </p>

        <h2 style={styles.heading}>Limitation of Liability</h2>

        <p style={styles.text}>
          {siteConfig.publicSiteName} is provided on an "as is" and "as available" basis without
          warranties of any kind.
        </p>

        <p style={styles.text}>
          To the fullest extent permitted by law, {siteConfig.organizationName} shall not be liable
          for any direct, indirect, incidental, consequential, or special damages
          arising from the use of or inability to use the website.
        </p>

        <h2 style={styles.heading}>Changes to These Terms</h2>

        <p style={styles.text}>
          We reserve the right to modify these Terms of Service at any time.
          Continued use of the website following changes constitutes acceptance
          of the updated terms.
        </p>

        <h2 style={styles.heading}>Contact</h2>

        <p style={styles.text}>
          Questions regarding these Terms may be directed to:{" "}
          <strong>{siteConfig.contactEmail}</strong>
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
