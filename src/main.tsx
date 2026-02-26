import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "katex/dist/katex.min.css";
import "./style.css";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app element not found");

createRoot(appEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
