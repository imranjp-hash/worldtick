import { useEffect, useState } from "react";

function App() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();

      const formatted = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setTime(formatted);
    };

    updateClock();

    const interval = setInterval(updateClock, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        background: "#071120",
        minHeight: "100vh",
        color: "white",
        fontFamily: "Arial",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          padding: "20px 40px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          position: "sticky",
          top: 0,
          backdropFilter: "blur(10px)",
          background: "rgba(7,17,32,0.85)",
          zIndex: 100,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1.5rem",
            letterSpacing: "1px",
          }}
        >
          WorldTick
        </h2>
      </header>

      {/* HERO */}
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: "80px 20px",
        }}
      >
        <h1
          style={{
            fontSize: "4rem",
            marginBottom: "10px",
          }}
        >
          Global Time.
          <br />
          Simplified.
        </h1>

        <p
          style={{
            opacity: 0.7,
            fontSize: "1.2rem",
            maxWidth: "600px",
            lineHeight: 1.6,
          }}
        >
          Track live time across the world instantly with beautiful real-time
          clocks and city comparisons.
        </p>

        {/* LIVE CLOCK */}
        <div
          style={{
            marginTop: "50px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "40px",
            borderRadius: "24px",
            boxShadow: "0 0 40px rgba(0,0,0,0.4)",
            width: "100%",
            maxWidth: "500px",
          }}
        >
          <p
            style={{
              marginBottom: "10px",
              opacity: 0.7,
              fontSize: "1rem",
            }}
          >
            Toronto
          </p>

          <h2
            style={{
              fontSize: "4rem",
              margin: 0,
              letterSpacing: "2px",
            }}
          >
            {time}
          </h2>
        </div>

        {/* SEARCH */}
        <input
          type="text"
          placeholder="Search cities..."
          style={{
            marginTop: "40px",
            padding: "18px 24px",
            width: "100%",
            maxWidth: "500px",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            fontSize: "1rem",
            outline: "none",
          }}
        />

        {/* POPULAR CITIES */}
        <div
          style={{
            marginTop: "60px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "20px",
            width: "100%",
            maxWidth: "1000px",
          }}
        >
          {["New York", "London", "Dubai", "Tokyo"].map((city) => (
            <div
              key={city}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "20px",
                padding: "30px",
                transition: "0.3s",
              }}
            >
              <h3>{city}</h3>

              <p
                style={{
                  opacity: 0.7,
                }}
              >
                Live world time
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;