import { ForecastSlider } from "./components/ForecastSlider";
import { Legend } from "./components/Legend";
import { MapView } from "./components/MapView";
import { Results } from "./components/Results";
import { TripForm } from "./components/TripForm";

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M6 22c4-8 6-12 10-12s6 4 10 12" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <circle cx="8" cy="22" r="2.2" fill="currentColor" />
              <circle cx="24" cy="22" r="2.2" fill="#e2a21a" />
            </svg>
          </span>
          <div>
            <strong>Weather-Aware Truck Routing</strong>
            <span>Safest path for the load, the clock, and the forecast</span>
          </div>
        </div>
        <p className="topbar-note">Routes, arrival weather, and a 48-hour corridor</p>
      </header>
      <div className="shell">
        <aside className="sidebar">
          <TripForm />
          <Results />
        </aside>
        <section className="map-pane">
          <MapView />
          <ForecastSlider />
          <Legend />
        </section>
      </div>
    </div>
  );
}
