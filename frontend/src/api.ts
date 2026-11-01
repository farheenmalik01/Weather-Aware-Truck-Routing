import type { Analysis, AnalyzeRequest, Place } from "./types";

interface ErrorBody {
  message?: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorBody;
    if (body.message) return body.message;
  } catch {
    // The body was not JSON.
  }
  return "The request could not be completed.";
}

export async function geocodePlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const response = await fetch(`/api/geocode/?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { results: Place[] };
  return body.results;
}

export async function analyzeTrip(request: AnalyzeRequest, signal?: AbortSignal): Promise<Analysis> {
  const response = await fetch("/api/routes/analyze/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as Analysis;
}
