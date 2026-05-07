function App() {
  return (
    <div
      style={{
        background: "#0b1020",
        color: "white",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Arial",
      }}
    >
      <h1 style={{ fontSize: "4rem", marginBottom: "10px" }}>
        WorldTick
      </h1>

      <p style={{ fontSize: "1.3rem", opacity: 0.8 }}>
        Global Time. Instantly.
      </p>
    </div>
  );
}

export default App;