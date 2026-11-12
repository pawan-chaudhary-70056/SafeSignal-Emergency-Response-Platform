import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { api, errorMessage } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import type { Incident, IncidentStatus, Pagination } from "../lib/types";
import { Alert, Button, Card, EmptyState, LiveBadge, StatusBadge, formatDate } from "./ui";

const DEFAULT_CENTER: [number, number] = [27.7172, 85.324];

const priorityColor: Record<Incident["priority"], string> = {
  LOW: "#64748b",
  MEDIUM: "#0284c7",
  HIGH: "#d97706",
  CRITICAL: "#e11d48",
};

const RESPONSE_STAGES: IncidentStatus[] = [
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

function markerIcon(priority: Incident["priority"]) {
  const color = priorityColor[priority];

  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 0 0 4px ${color}33"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
}

function MapFocus({
  incidents,
  selectedId,
}: {
  incidents: Incident[];
  selectedId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const selected = incidents.find((incident) => incident.id === selectedId);
    if (selected && selected.latitude !== null && selected.longitude !== null) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), {
        duration: 0.6,
      });
      return;
    }

    if (incidents.length > 0) {
      const bounds = L.latLngBounds(
        incidents.map((incident) => [incident.latitude ?? 0, incident.longitude ?? 0]),
      );
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }
  }, [incidents, map, selectedId]);

  return null;
}

export function LiveIncidentMap() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const { connected } = useRealtime(() => setReloadKey((key) => key + 1));

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await api<{ incidents: Incident[]; pagination: Pagination }>(
          "/incidents?limit=50",
        );
        if (!active) return;

        setIncidents(response.incidents);
        setSelectedId((current) => {
          if (current && response.incidents.some((incident) => incident.id === current)) {
            return current;
          }

          const firstMapped = response.incidents.find(
            (incident) => incident.latitude !== null && incident.longitude !== null,
          );
          return firstMapped?.id ?? response.incidents[0]?.id ?? null;
        });
        setError(null);
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setReloadKey((key) => key + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const mappedIncidents = useMemo(
    () =>
      incidents.filter(
        (incident) => incident.latitude !== null && incident.longitude !== null,
      ),
    [incidents],
  );
  const selected = incidents.find((incident) => incident.id === selectedId) ?? null;

  const stageIndex = selected ? RESPONSE_STAGES.indexOf(selected.status) : -1;
  const progress = stageIndex >= 0 ? ((stageIndex + 1) / RESPONSE_STAGES.length) * 100 : 0;

  return (
    <Card
      title="Live incident map"
      subtitle="Map pins show incident locations. Status and responder progress update in real time."
      action={
        <div className="flex items-center gap-2">
          <LiveBadge connected={connected} />
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
          >
            Reload map
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error" message={error} />
        </div>
      )}

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {mappedIncidents.length} mapped ·{" "}
        {incidents.length - mappedIncidents.length} without coordinates · latest{" "}
        {incidents.length} records in your access scope
      </p>

      {incidents.length === 0 && !loading ? (
        <EmptyState message="No incidents are available to map yet." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <div
            role="region"
            aria-label="Map of emergency incident locations"
            className="relative h-72 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 sm:h-96"
          >
            <p className="sr-only">
              The map is visual. The incident list next to it contains the same location and
              status information.
            </p>
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={7}
              scrollWheelZoom={false}
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapFocus incidents={mappedIncidents} selectedId={selectedId} />
              {mappedIncidents.map((incident) => (
                <Marker
                  key={incident.id}
                  position={[incident.latitude as number, incident.longitude as number]}
                  icon={markerIcon(incident.priority)}
                  eventHandlers={{ click: () => setSelectedId(incident.id) }}
                >
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-mono text-[11px] text-slate-500">
                        {incident.referenceNumber}
                      </p>
                      <p className="text-sm font-semibold">{incident.category.name}</p>
                      <p className="text-xs">
                        {incident.status.replace(/_/g, " ")} · {incident.priority}
                      </p>
                      {incident.locationDescription && (
                        <p className="text-xs text-slate-600">
                          {incident.locationDescription}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1 sm:max-h-96">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <button
                    type="button"
                    aria-pressed={incident.id === selectedId}
                    onClick={() => setSelectedId(incident.id)}
                    className={`w-full rounded-lg border p-2.5 text-left transition ${
                      incident.id === selectedId
                        ? "border-emerald-400 bg-emerald-50/70 ring-1 ring-emerald-200 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:ring-emerald-500/30"
                        : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {incident.referenceNumber}
                      </span>
                      <StatusBadge status={incident.status} />
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {incident.category.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {incident.latitude !== null && incident.longitude !== null
                        ? (incident.locationDescription ??
                          `${incident.latitude.toFixed(3)}, ${incident.longitude.toFixed(3)}`)
                        : "No coordinates provided"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {selected.referenceNumber}
              </p>
              <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {selected.category.name}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selected.locationDescription ??
                  (selected.latitude !== null && selected.longitude !== null
                    ? `${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}`
                    : "Location not provided")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {selected.priority}
              </span>
              <StatusBadge status={selected.status} />
            </div>
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {selected.description}
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span>Responder progress</span>
              <span>{selected.status.replace(/_/g, " ")}</span>
            </div>
            <div
              role="progressbar"
              aria-label="Responder progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-valuetext={selected.status.replace(/_/g, " ")}
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {selected.assignments && selected.assignments.length > 0
                ? `Assignment ${selected.assignments
                    .at(-1)
                    ?.status.replace(/_/g, " ")} · reported ${formatDate(selected.createdAt)}`
                : `Awaiting responder assignment · reported ${formatDate(selected.createdAt)}`}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
