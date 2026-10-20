import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";

// Wake the Render backend the moment the app opens (free plan sleeps after ~15 min idle).
// Fire-and-forget: no waiting, errors ignored. no-cors so it never causes CORS noise.
const WAKE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
if (WAKE_URL) {
  fetch(`${WAKE_URL}/api/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);