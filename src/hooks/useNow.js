import { useContext } from "react";
import { ClockContext } from "../context/clockContext";

export default function useNow() {
  const now = useContext(ClockContext);

  if (!now) {
    throw new Error("useNow must be used within a ClockProvider");
  }

  return now;
}
