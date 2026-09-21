import "./i18n/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import "./tokens.css";
import "./App.css";
import App from "./App";
import { TrayPopover } from "./tray/TrayPopover";

// The menu-bar popover window loads the same bundle at `#/tray`. It renders a
// standalone page outside the app's providers and router.
const isTrayPopover = window.location.hash.startsWith("#/tray");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isTrayPopover ? <TrayPopover /> : <App />}
  </React.StrictMode>,
);
