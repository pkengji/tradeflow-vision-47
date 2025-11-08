import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

window.addEventListener("error", (e) => console.error("window error:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("unhandled rejection:", e.reason));

ReactDOM.createRoot(document.getElementById("root")!).render(
  // <React.StrictMode> optional – bei flakey Code vorübergehend entfernen
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
  // </React.StrictMode>
);
