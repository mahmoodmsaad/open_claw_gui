import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

function showBootError(message: string): void {
  const root = document.getElementById("root") ?? document.body;
  root.innerHTML = `
    <div style="padding:16px;color:#ffb4a0;background:#120f12;font-family:Segoe UI, sans-serif;">
      <h2 style="margin:0 0 8px;">OpenClaw Desktop failed to load</h2>
      <pre style="white-space:pre-wrap;word-break:break-word;margin:0;">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  showBootError(String(event.error ?? event.message ?? "Unknown renderer error"));
});

window.addEventListener("unhandledrejection", (event) => {
  showBootError(String(event.reason ?? "Unhandled promise rejection"));
});

try {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  showBootError(String(error));
}
