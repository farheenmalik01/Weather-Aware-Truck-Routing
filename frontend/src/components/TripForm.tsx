import { EXAMPLES } from "../examples";
import { useTripStore } from "../store";
import type { SampleInterval } from "../types";
import { PlaceField } from "./PlaceField";

const INTERVALS: SampleInterval[] = [10, 25, 50];

export function TripForm() {
  const origin = useTripStore((state) => state.origin);
  const destination = useTripStore((state) => state.destination);
  const departureLocal = useTripStore((state) => state.departureLocal);
  const loadLb = useTripStore((state) => state.loadLb);
  const interval = useTripStore((state) => state.interval);
  const loading = useTripStore((state) => state.loading);
  const error = useTripStore((state) => state.error);
  const setOrigin = useTripStore((state) => state.setOrigin);
  const setDestination = useTripStore((state) => state.setDestination);
  const setDepartureLocal = useTripStore((state) => state.setDepartureLocal);
  const setLoadLb = useTripStore((state) => state.setLoadLb);
  const setInterval = useTripStore((state) => state.setInterval);
  const applyExample = useTripStore((state) => state.applyExample);
  const submit = useTripStore((state) => state.submit);

  return (
    <form
      className="panel trip-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="panel-head">
        <h2>Trip</h2>
        <div className="examples">
          {EXAMPLES.map((example) => (
            <button key={example.name} type="button" className="chip" onClick={() => applyExample(example)}>
              {example.name}
            </button>
          ))}
        </div>
      </div>
      <PlaceField label="Origin" place={origin} onSelect={setOrigin} />
      <PlaceField label="Destination" place={destination} onSelect={setDestination} />
      <div className="split">
        <div className="field">
          <label htmlFor="departure">Departure</label>
          <input
            id="departure"
            type="datetime-local"
            value={departureLocal}
            onChange={(event) => setDepartureLocal(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="load">Load (lb)</label>
          <input
            id="load"
            type="number"
            min={0}
            max={200000}
            step={500}
            value={loadLb}
            onChange={(event) => setLoadLb(event.target.value)}
            required
          />
        </div>
      </div>
      <div className="field">
        <span id="interval-label">Weather sample</span>
        <div className="segmented" role="group" aria-labelledby="interval-label">
          {INTERVALS.map((miles) => (
            <button key={miles} type="button" aria-pressed={interval === miles} onClick={() => setInterval(miles)}>
              {miles} mi
            </button>
          ))}
        </div>
      </div>
      <ul className="rules">
        <li>
          <b>55 mph</b> wind stops every load
        </li>
        <li>
          <b>45 mph</b> and over 30,000 lb is no-travel
        </li>
        <li>
          <b>35 mph</b> and over 40,000 lb is severe
        </li>
      </ul>
      {error && <p className="form-error">{error}</p>}
      <button className="primary" type="submit" disabled={loading}>
        {loading ? "Analyzing routes…" : "Compare routes"}
      </button>
    </form>
  );
}
