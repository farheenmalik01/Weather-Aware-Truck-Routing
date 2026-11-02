import { useEffect } from "react";

import { forecastStamp } from "../format";
import { useTripStore } from "../store";

export function ForecastSlider() {
  const result = useTripStore((state) => state.result);
  const hour = useTripStore((state) => state.forecastHour);
  const showHeatmap = useTripStore((state) => state.showHeatmap);
  const playing = useTripStore((state) => state.playing);
  const setHour = useTripStore((state) => state.setForecastHour);
  const setShow = useTripStore((state) => state.setShowHeatmap);
  const setPlaying = useTripStore((state) => state.setPlaying);

  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setInterval(() => {
      const state = useTripStore.getState();
      const max = (state.result?.hour_count ?? 1) - 1;
      if (state.forecastHour >= max) {
        state.setPlaying(false);
        return;
      }
      state.setForecastHour(state.forecastHour + 1);
    }, 480);
    return () => window.clearInterval(timer);
  }, [playing, result]);

  if (!result) return null;
  const max = result.hour_count - 1;
  return (
    <div className="forecast">
      <div className="forecast-top">
        <label htmlFor="forecast-hour">Weather at this hour</label>
        <strong>+{hour}h</strong>
        <span>{forecastStamp(result.departure, hour)}</span>
        <button type="button" className="text-button" onClick={() => setPlaying(!playing)} disabled={!showHeatmap}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="text-button" aria-pressed={showHeatmap} onClick={() => setShow(!showHeatmap)}>
          {showHeatmap ? "Hide heat" : "Show heat"}
        </button>
      </div>
      <input
        id="forecast-hour"
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(hour, max)}
        disabled={!showHeatmap}
        onChange={(event) => {
          setPlaying(false);
          setHour(Number(event.target.value));
        }}
      />
    </div>
  );
}
