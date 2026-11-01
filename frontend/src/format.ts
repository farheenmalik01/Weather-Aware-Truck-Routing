export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

export function formatMiles(miles: number, digits = 1): string {
  return `${miles.toFixed(digits)} mi`;
}

export function formatEta(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function forecastStamp(departureIso: string, hour: number): string {
  const moment = new Date(new Date(departureIso).getTime() + hour * 3_600_000);
  return moment.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRate(value: number | null, unit: string): string {
  if (value === null) return "—";
  return `${value.toFixed(2)} ${unit}`;
}

export function formatWind(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)} mph`;
}

export function defaultDepartureLocal(): string {
  const moment = new Date();
  moment.setMinutes(0, 0, 0);
  moment.setHours(moment.getHours() + 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}T${pad(moment.getHours())}:00`;
}
