import { useEffect, useState } from "react";
import { ClockContext } from "./clockContext";

const initialNow = new Date();

export default function ClockProvider({ children }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}
