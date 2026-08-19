import "./i18n/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import "./tokens.css";
import "./App.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
