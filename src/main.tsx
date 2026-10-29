import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/globals.css";
import { App } from "./app/App";
import { initTheme } from "./lib/theme";

initTheme();

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
