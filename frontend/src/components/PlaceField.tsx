import { useEffect, useId, useRef, useState } from "react";

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
  const [text, setText] = useState(place?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setText(place?.label ?? "");
  }, [place]);

  useEffect(() => {
    if (text.trim().length < 2 || text === place?.label) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      geocodePlaces(text.trim(), controller.signal)
        .then((found) => {
          setResults(found);
          setActive(0);
          setOpen(found.length > 0);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, place]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  function choose(next: Place) {
    onSelect(next);
    setText(next.label);
    setOpen(false);
  }

  return (
    <div className="field" ref={rootRef}>
      <label htmlFor={listId}>{label}</label>
      <input
        id={listId}
        value={text}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${listId}-list`}
        placeholder="City, address, or place"
        autoComplete="off"
        onChange={(event) => {
          setText(event.target.value);
          onSelect(null);
          setOpen(true);
        }}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && results[active]) {
            event.preventDefault();
            choose(results[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul id={`${listId}-list`} className="suggestions" role="listbox">
          {results.map((result, index) => (
            <li key={`${result.lat}-${result.lon}-${result.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "active" : ""}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
