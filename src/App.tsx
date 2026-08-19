import { AppRouter } from "./router";
import { SessionsProvider } from "./context/SessionsContext";
import { SettingsProvider } from "./context/SettingsContext";
import { LanguageProvider } from "./context/LanguageContext";
import "./App.css";

export default function App() {
  return (
    <SettingsProvider>
      <LanguageProvider>
        <SessionsProvider>
          <AppRouter />
        </SessionsProvider>
      </LanguageProvider>
    </SettingsProvider>
  );
}
