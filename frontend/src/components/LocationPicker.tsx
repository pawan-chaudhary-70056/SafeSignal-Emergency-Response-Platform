import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Button, inputClass } from "./ui";

const DEFAULT_CENTER: [number, number] = [27.7172, 85.324];

const pickerIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#059669;border:4px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35)"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

interface SearchResult {
  placeId: number;
  displayName: string;
  latitude: number;
  longitude: number;
}

interface FocusRequest {
  coordinates: [number, number];
  token: number;
}

function ClickToPick({ onPick }: { onPick: (coordinates: [number, number]) => void }) {
  const map = useMapEvents({
    click(event) {
      onPick([event.latlng.lat, event.latlng.lng]);

      // A wide city-level view can be tens of metres per pixel. Zoom in after
      // the first click so the pin can be placed on the exact building.
      if (map.getZoom() < 18) {
        map.flyTo(event.latlng, 18, { animate: true, duration: 0.6 });
      }
    },
  });

  return null;
}

function FlyTo({ request }: { request: FocusRequest | null }) {
  const map = useMap();

  useEffect(() => {
    if (!request) return;
    map.flyTo(request.coordinates, 18, { animate: true, duration: 0.8 });
  }, [map, request]);

  return null;
}

function parseCoordinates(latitude: string, longitude: string): [number, number] | null {
  if (!latitude.trim() || !longitude.trim()) return null;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return [lat, lng];
}

export function LocationPicker({
  latitude,
  longitude,
  onPick,
  onClose,
}: {
  latitude: string;
  longitude: string;
  onPick: (latitude: string, longitude: string) => void;
  onClose: () => void;
}) {
  const initial = parseCoordinates(latitude, longitude);
  const [selected, setSelected] = useState<[number, number]>(initial ?? DEFAULT_CENTER);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  function pick(coordinates: [number, number]) {
    setSelected(coordinates);
    onPick(coordinates[0].toFixed(6), coordinates[1].toFixed(6));
  }

  async function search() {
    const value = query.trim();

    if (value.length < 3) {
      setSearchError("Type at least 3 characters, such as a street, hospital, or landmark.");
      setResults([]);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        q: value,
        limit: "5",
        "accept-language": "en",
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok) {
        throw new Error(`Location search failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
      }>;

      const matches = payload
        .map((item) => ({
          placeId: item.place_id,
          displayName: item.display_name,
          latitude: Number(item.lat),
          longitude: Number(item.lon),
        }))
        .filter(
          (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
        );

      setResults(matches);

      if (matches.length === 0) {
        setSearchError("No matching place found. Try a nearby landmark or click the map.");
      }
    } catch {
      setSearchError(
        "Address search is unavailable right now. Click the map or enter coordinates manually.",
      );
    } finally {
      setSearching(false);
    }
  }

  function selectResult(result: SearchResult) {
    const coordinates: [number, number] = [result.latitude, result.longitude];
    pick(coordinates);
    setFocusRequest((current) => ({
      coordinates,
      token: (current?.token ?? 0) + 1,
    }));
    setQuery(result.displayName);
    setResults([]);
  }

  return (
    <section
      aria-label="Location picker"
      className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Pick the exact location on the map
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Search an address or landmark, or click the map once to zoom in, then click again to
            place the pin on the exact building or spot.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close map
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <label className="min-w-0 flex-1 text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Search address or landmark
          </span>
          <input
            className={inputClass}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            placeholder="e.g. Bir Hospital, Kathmandu"
            aria-label="Search address or landmark"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={searching}
          onClick={() => void search()}
        >
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>

      {searchError && (
        <p role="status" className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {searchError}
        </p>
      )}

      {results.length > 0 && (
        <ul
          aria-label="Location search results"
          className="max-h-40 divide-y divide-slate-100 overflow-y-auto border-b border-slate-100 dark:divide-slate-800 dark:border-slate-800"
        >
          {results.map((result) => (
            <li key={result.placeId}>
              <button
                type="button"
                onClick={() => selectResult(result)}
                className="block w-full px-3 py-2 text-left text-xs leading-relaxed text-slate-700 transition hover:bg-emerald-50 dark:text-slate-300 dark:hover:bg-emerald-500/10"
              >
                {result.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only">
        The map is optional. You can also type coordinates or a landmark instead.
      </p>

      <div className="h-64 w-full sm:h-72">
        <MapContainer
          center={initial ?? DEFAULT_CENTER}
          zoom={initial ? 17 : 13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPick onPick={pick} />
          <FlyTo request={focusRequest} />
          <Marker
            position={selected}
            icon={pickerIcon}
            draggable
            eventHandlers={{
              dragend(event) {
                const marker = event.target as L.Marker;
                const position = marker.getLatLng();
                pick([position.lat, position.lng]);
              },
            }}
          />
        </MapContainer>
      </div>

      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Selected:{" "}
        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
          {selected[0].toFixed(6)}, {selected[1].toFixed(6)}
        </span>{" "}
        · Search results © OpenStreetMap contributors
      </p>
    </section>
  );
}
