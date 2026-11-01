import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { geocodePlaces } from "../api";
import type { Place } from "../types";

interface PlaceFieldProps {
  label: string;
  place: Place | null;
  onSelect: (place: Place | null) => void;
}

export function PlaceField({ label, place, onSelect }: PlaceFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const [text, setText] = useState(place?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });

  const query = text.trim();
  const selectedText = text === (place?.label ?? "");
  const shown = useMemo(() => (selectedText ? [] : rankPlaces(results, query)), [results, query, selectedText]);

  useEffect(() => {
    setText(place?.label ?? "");
  }, [place]);

  useEffect(() => {
    if (query.length < 2 || text === place?.label) {
      setResults([]);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setBusy(true);
    const timer = window.setTimeout(() => {
      geocodePlaces(query, controller.signal)
        .then((found) => {
          if (requestId !== requestRef.current) return;
          setResults(found);
          setActive(0);
          setOpen(true);
        })
        .catch((error: unknown) => {
          if (requestId !== requestRef.current) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]);
        })
        .finally(() => {
          if (requestId === requestRef.current && !controller.signal.aborted) setBusy(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, text, place]);

  useEffect(() => {
    if (!open) return;
    const placeMenu = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      setBox({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(280, spaceBelow)),
      });
    };
    placeMenu();
    window.addEventListener("scroll", placeMenu, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      window.removeEventListener("scroll", placeMenu, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [open, shown.length, busy]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".suggestions")) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  function choose(next: Place) {
    requestRef.current += 1;
    onSelect(next);
    setText(next.label);
    setResults([]);
    setBusy(false);
    setOpen(false);
  }

  const menu = open && !selectedText
    ? createPortal(
        <ul
          id={`${listId}-list`}
          className="suggestions"
          role="listbox"
          style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
        >
          {query.length < 2 && <li className="suggestion-note">Type a city or address to filter places.</li>}
          {query.length >= 2 && busy && shown.length === 0 && <li className="suggestion-note">Searching places…</li>}
          {query.length >= 2 && !busy && shown.length === 0 && (
            <li className="suggestion-note">No places match “{query}”.</li>
          )}
          {shown.map((result, index) => {
            const parts = splitLabel(result.label);
            return (
              <li key={`${result.lat}-${result.lon}-${result.label}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? "active" : ""}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(result)}
                >
                  <strong>{highlight(parts.title, query)}</strong>
                  {parts.detail && <span>{highlight(parts.detail, query)}</span>}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div className={`field place-field${open ? " open" : ""}`} ref={rootRef}>
      <label htmlFor={listId}>{label}</label>
      <div className="place-control">
        <input
          ref={inputRef}
          id={listId}
          value={text}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${listId}-list`}
          placeholder="Search a city or address"
          autoComplete="off"
          onChange={(event) => {
            setText(event.target.value);
            onSelect(null);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            if (text !== (place?.label ?? "")) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, Math.max(shown.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open && shown[active]) {
              event.preventDefault();
              choose(shown[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="place-chevron"
          aria-label={open ? `Hide ${label} places` : `Show ${label} places`}
          tabIndex={-1}
          onClick={() => {
            setOpen((value) => !value);
            inputRef.current?.focus();
          }}
        />
      </div>
      {menu}
    </div>
  );
}

function splitLabel(label: string): { title: string; detail: string } {
  const [title, ...rest] = label.split(",");
  return { title: title.trim(), detail: rest.join(",").trim() };
}

function highlight(text: string, query: string) {
  const needle = query.trim();
  if (needle.length < 2) return text;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

function rankPlaces(places: Place[], query: string): Place[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length > 0);
  const unique = new Map<string, Place>();
  for (const place of places) {
    const key = place.label.toLowerCase();
    if (!unique.has(key)) unique.set(key, place);
  }
  const matched = [...unique.values()].filter((place) => {
    if (tokens.length === 0) return true;
    const label = place.label.toLowerCase();
    return tokens.every((token) => label.includes(token));
  });
  return matched.sort((a, b) => scorePlace(b, query) - scorePlace(a, query)).slice(0, 6);
}

function scorePlace(place: Place, query: string): number {
  const name = place.label.split(",")[0]?.trim().toLowerCase() ?? "";
  const label = place.label.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  if (name === q) score = 3;
  else if (name.startsWith(q)) score = 2;
  else if (label.includes(q)) score = 1;
  if (label.includes("united states")) score += 2;
  return score;
}
