import { useConsent } from "../context/consentContext";

export default function CookieConsent() {
  const {
    analyticsConsent,
    settingsOpen,
    acceptAnalytics,
    rejectAnalytics,
    closeSettings,
  } = useConsent();
  const visible = analyticsConsent === null || settingsOpen;

  if (!visible) {
    return null;
  }

  return (
    <div style={styles.backdrop} role="presentation">
      <section
        aria-label="Cookie settings"
        aria-modal={settingsOpen ? "true" : undefined}
        role={settingsOpen ? "dialog" : "region"}
        style={styles.panel}
      >
        <h2 style={styles.title}>Cookie settings</h2>
        <p style={styles.text}>
          YouHora uses optional Google Analytics cookies to understand site usage and improve the
          experience. Analytics stays off unless you accept. Advertising storage remains off.
        </p>
        {settingsOpen && analyticsConsent !== null && (
          <p style={styles.status} role="status">
            Current preference: Analytics is currently {analyticsConsent === "granted" ? "on" : "off"}.
          </p>
        )}
        <div style={styles.actions}>
          <button type="button" onClick={acceptAnalytics} style={styles.primaryButton}>
            Accept analytics
          </button>
          <button type="button" onClick={rejectAnalytics} style={styles.secondaryButton}>
            Reject
          </button>
          {settingsOpen && analyticsConsent !== null && (
            <button type="button" onClick={closeSettings} style={styles.textButton}>
              Cancel
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "18px",
    pointerEvents: "none",
  },
  panel: {
    width: "min(680px, 100%)",
    padding: "24px",
    border: "1px solid rgba(103,232,249,0.35)",
    borderRadius: "20px",
    background: "#0f172a",
    color: "white",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    pointerEvents: "auto",
  },
  title: { margin: "0 0 10px", fontSize: "1.35rem" },
  text: { margin: 0, color: "#cbd5e1", lineHeight: 1.6 },
  status: {
    margin: "16px 0 0",
    color: "#67e8f9",
    fontWeight: 800,
  },
  actions: { display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "20px" },
  primaryButton: {
    padding: "11px 18px",
    border: 0,
    borderRadius: "999px",
    background: "#67e8f9",
    color: "#071120",
    cursor: "pointer",
    fontWeight: 800,
  },
  secondaryButton: {
    padding: "11px 18px",
    border: "1px solid #64748b",
    borderRadius: "999px",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
  },
  textButton: {
    padding: "11px 12px",
    border: 0,
    background: "transparent",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 700,
  },
};
