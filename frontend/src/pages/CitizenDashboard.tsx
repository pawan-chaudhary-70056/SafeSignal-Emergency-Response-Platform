import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { DashboardHeader } from "../components/DashboardHeader";
import { IncidentEvidence } from "../components/IncidentEvidence";
import { IncidentListItem } from "../components/IncidentList";
import { IncidentReports } from "../components/IncidentReports";
import { IncidentSummary } from "../components/IncidentSummary";
import { ListFilters } from "../components/ListFilters";
import { LiveIncidentMap } from "../components/LiveIncidentMap";
import { LocationPicker } from "../components/LocationPicker";
import { ProfileSection } from "../components/ProfileSection";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  LiveBadge,
  PaginationControls,
  StatusBadge,
  formatDate,
  inputClass,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import type {
  Category,
  HistoryEntry,
  Incident,
  IncidentStatus,
  Pagination,
  Priority,
} from "../lib/types";

interface FormState {
  categoryId: string;
  description: string;
  contactInformation: string;
  latitude: string;
  longitude: string;
  locationDescription: string;
  priorityHint: string;
}

const emptyForm: FormState = {
  categoryId: "",
  description: "",
  contactInformation: "",
  latitude: "",
  longitude: "",
  locationDescription: "",
  priorityHint: "",
};

const PAGE_SIZE = 10;

const statusFilters: Array<{ label: string; value: "" | IncidentStatus }> = [
  { label: "All", value: "" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Under review", value: "UNDER_REVIEW" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "En route", value: "EN_ROUTE" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
  { label: "Rejected", value: "REJECTED" },
];

export function CitizenDashboard() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [filter, setFilter] = useState<"" | IncidentStatus>("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const locationWatchRef = useRef<number | null>(null);
  const locationTimerRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filter) query.set("status", filter);
    if (priority) query.set("priority", priority);
    if (search) query.set("search", search);

    const [categoryResponse, incidentResponse] = await Promise.all([
      api<{ categories: Category[] }>("/categories"),
      api<{ incidents: Incident[]; pagination: Pagination }>(`/incidents?${query.toString()}`),
    ]);
    setCategories(categoryResponse.categories);
    setIncidents(incidentResponse.incidents);
    setPagination(incidentResponse.pagination);
    setForm((current) =>
      current.categoryId === "" && categoryResponse.categories[0]
        ? { ...current, categoryId: categoryResponse.categories[0].id }
        : current,
    );

    if (page > incidentResponse.pagination.totalPages) {
      setPage(Math.max(1, incidentResponse.pagination.totalPages));
    }
  }, [filter, page, priority, search]);

  useEffect(() => {
    load().catch((caught) => setError(errorMessage(caught)));
  }, [load]);

  useEffect(
    () => () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
      if (locationTimerRef.current !== null) {
        window.clearTimeout(locationTimerRef.current);
      }
    },
    [],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function stopLocationWatch() {
    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    if (locationTimerRef.current !== null) {
      window.clearTimeout(locationTimerRef.current);
      locationTimerRef.current = null;
    }
  }

  function useCurrentLocation() {
    if (locating) return;

    if (!window.isSecureContext) {
      setLocationStatus(
        "Location access requires HTTPS or localhost. Open the app at http://localhost:5174, or use Pick on map.",
      );
      return;
    }

    if (!navigator.geolocation) {
      setLocationStatus(
        "This browser does not support geolocation. Use Pick on map or enter coordinates manually.",
      );
      return;
    }

    stopLocationWatch();
    setLocating(true);
    setLocationStatus("Getting your location… the first fix usually arrives within a few seconds.");

    let bestAccuracy = Number.POSITIVE_INFINITY;
    let gotFix = false;
    let fallbackStarted = false;
    let settled = false;

    function capturedMessage(accuracy: number | null): string {
      return accuracy !== null
        ? `Location captured (about ${accuracy} m accuracy). You can refine it with Pick on map before submitting.`
        : "Location captured. You can refine it with Pick on map before submitting.";
    }

    function finish(message: string) {
      if (settled) return;
      settled = true;
      stopLocationWatch();
      setLocationStatus(message);
      setLocating(false);
    }

    function applyPosition(position: GeolocationPosition, final: boolean) {
      if (settled) return;

      const rawAccuracy = position.coords.accuracy;
      const accuracy =
        Number.isFinite(rawAccuracy) && rawAccuracy > 0 ? Math.round(rawAccuracy) : null;

      // Keep improving: ignore fixes that are less accurate than the best one
      // already received.
      if (accuracy !== null && accuracy > bestAccuracy) return;
      if (accuracy !== null) bestAccuracy = accuracy;

      gotFix = true;
      setForm((current) => ({
        ...current,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      }));

      if (accuracy === null) {
        finish(capturedMessage(null));
        return;
      }

      if (accuracy <= 25) {
        finish(`High-accuracy location captured (about ${accuracy} m).`);
        return;
      }

      if (final) {
        finish(capturedMessage(Math.round(bestAccuracy)));
        return;
      }

      setLocationStatus(
        `Location found (about ${accuracy} m accuracy). Refining for a more precise fix…`,
      );
    }

    function tryApproximateLocation() {
      if (settled || gotFix || fallbackStarted) return;
      fallbackStarted = true;
      setLocationStatus("Precise GPS fix unavailable. Trying an approximate network location…");

      navigator.geolocation.getCurrentPosition(
        (position) => applyPosition(position, true),
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            finish(
              "Location permission is blocked. Allow location access for this site from your browser's address-bar settings, then try again — or use Pick on map.",
            );
            return;
          }

          finish(
            "Your device could not determine a location. Use Pick on map, enter coordinates manually, or provide a clear landmark.",
          );
        },
        { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
      );
    }

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => applyPosition(position, false),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          finish(
            "Location permission is blocked. Allow location access for this site from your browser's address-bar settings, then try again — or use Pick on map.",
          );
          return;
        }

        tryApproximateLocation();
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
    );

    // Stop watching quickly: return the first usable fix and keep the UI fast
    // instead of waiting a long time for GPS to improve.
    locationTimerRef.current = window.setTimeout(() => {
      if (gotFix) {
        finish(capturedMessage(Number.isFinite(bestAccuracy) ? Math.round(bestAccuracy) : null));
      } else {
        tryApproximateLocation();
      }
    }, 5_000);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.categoryId) {
      setError("Select an emergency category.");
      return;
    }

    if ((form.latitude && !form.longitude) || (!form.latitude && form.longitude)) {
      setError("Provide both latitude and longitude, or leave both empty.");
      return;
    }

    if (!form.latitude && !form.longitude && !form.locationDescription.trim()) {
      setError("Provide coordinates or a clear landmark for the emergency location.");
      return;
    }

    if (form.contactInformation.trim().length < 6) {
      setError("Add a contact number so responders can reach you.");
      return;
    }

    setBusy(true);
    try {
      const response = await api<{ incident: Incident }>("/incidents", {
        method: "POST",
        body: JSON.stringify({
          categoryId: form.categoryId,
          description: form.description,
          contactInformation: form.contactInformation.trim(),
          ...(form.latitude && form.longitude
            ? {
                location: {
                  latitude: Number(form.latitude),
                  longitude: Number(form.longitude),
                  ...(form.locationDescription.trim()
                    ? { description: form.locationDescription.trim() }
                    : {}),
                },
              }
            : { locationDescription: form.locationDescription.trim() }),
        }),
      });

      setSuccess(`Emergency report submitted. Reference: ${response.incident.referenceNumber}`);
      setForm({ ...emptyForm, categoryId: form.categoryId });
      setLocationStatus(null);

      if (page === 1) {
        await load();
      } else {
        setPage(1);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openIncident(id: string) {
    try {
      const [detail, historyResponse] = await Promise.all([
        api<{ incident: Incident }>(`/incidents/${id}`),
        api<{ history: HistoryEntry[] }>(`/incidents/${id}/history`),
      ]);
      setSelected(detail.incident);
      setHistory(historyResponse.history);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const { connected, lastEvent } = useRealtime(() => {
    void load();
    if (selected?.id) {
      void openIncident(selected.id);
    }
  });

  return (
    <div className="space-y-6">
      <DashboardHeader role="CITIZEN" id="overview" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
      <div className="min-w-0 space-y-6">
        <Card
          id="report"
          title="Report an emergency"
          subtitle="Provide what you can — location can be captured automatically or entered manually."
        >
          <form className="space-y-5" onSubmit={handleSubmit}>
            <Field label="Emergency category">
              <select
                className={inputClass}
                value={form.categoryId}
                onChange={(event) => update("categoryId", event.target.value)}
                required
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="What is happening?" hint="Minimum 5 characters.">
              <textarea
                className={`${inputClass} min-h-28 resize-y leading-relaxed`}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="A person has been injured in a road accident."
                required
                minLength={5}
                maxLength={2000}
              />
            </Field>

            <Field label="Contact number" hint="Required, so responders can reach you.">
              <input
                className={inputClass}
                required
                minLength={6}
                maxLength={255}
                value={form.contactInformation}
                onChange={(event) => update("contactInformation", event.target.value)}
                placeholder="+9779800000000"
              />
            </Field>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Emergency location</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Coordinates or a clear landmark.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMapPickerOpen((open) => !open)}
                    aria-expanded={mapPickerOpen}
                  >
                    {mapPickerOpen ? "Hide map picker" : "Pick on map"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={useCurrentLocation}
                    disabled={locating}
                  >
                    {locating ? "Locating…" : "Use my current location"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Latitude">
                  <input
                    className={inputClass}
                    value={form.latitude}
                    onChange={(event) => update("latitude", event.target.value)}
                    placeholder="27.7172"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    className={inputClass}
                    value={form.longitude}
                    onChange={(event) => update("longitude", event.target.value)}
                    placeholder="85.3240"
                    inputMode="decimal"
                  />
                </Field>
              </div>

              {mapPickerOpen && (
                <LocationPicker
                  latitude={form.latitude}
                  longitude={form.longitude}
                  onPick={(latitude, longitude) => {
                    update("latitude", latitude);
                    update("longitude", longitude);
                    setLocationStatus(
                      "Location set from the map. Adjust the pin or coordinates before submitting.",
                    );
                  }}
                  onClose={() => setMapPickerOpen(false)}
                />
              )}

              <div className="mt-3">
                <Field label="Landmark or location description">
                  <input
                    className={inputClass}
                    value={form.locationDescription}
                    onChange={(event) => update("locationDescription", event.target.value)}
                    placeholder="Near the main gate of the community hospital"
                  />
                </Field>
              </div>

              {locationStatus && (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  {locationStatus}
                </p>
              )}

              <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer font-semibold text-slate-600 transition hover:text-slate-800 dark:text-slate-300 dark:hover:text-white">
                  Location not working?
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
                  <li>
                    Allow location access for this site from your browser&apos;s address-bar
                    settings.
                  </li>
                  <li>
                    Open SafeSignal through <code>http://localhost:5174</code> or an HTTPS
                    address. Browsers block location on plain HTTP network addresses.
                  </li>
                  <li>Make sure location services are enabled on your device.</li>
                  <li>
                    If it still fails, use the <strong>Pick on map</strong> button, enter the
                    latitude and longitude manually, or provide a clear landmark.
                  </li>
                </ul>
              </details>
            </div>

            {error && <Alert tone="error" message={error} />}
            {success && <Alert tone="success" message={success} />}

            <Button type="submit" disabled={busy} className="w-full py-3">
              {busy ? "Submitting…" : "Submit emergency report"}
            </Button>

            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              SafeSignal coordinates reporting and response. It does not replace official emergency
              numbers.
            </p>
          </form>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card
          id="incidents"
          title="My incidents"
          subtitle="Status updates appear here as dispatchers and responders act."
          action={
            <div className="flex items-center gap-2">
              <LiveBadge connected={connected} />
              <Button variant="ghost" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          }
        >
          <ListFilters
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            status={filter}
            statusOptions={statusFilters}
            onStatusChange={(value) => {
              setFilter(value as "" | IncidentStatus);
              setPage(1);
            }}
            priority={priority}
            priorityOptions={[
              { label: "All priorities", value: "" },
              { label: "Low", value: "LOW" },
              { label: "Medium", value: "MEDIUM" },
              { label: "High", value: "HIGH" },
              { label: "Critical", value: "CRITICAL" },
            ]}
            onPriorityChange={(value) => {
              setPriority(value as "" | Priority);
              setPage(1);
            }}
            resultSummary={
              pagination
                ? `${pagination.totalItems} report${pagination.totalItems === 1 ? "" : "s"}`
                : undefined
            }
          />

          {lastEvent && (
            <div className="mb-3">
              <Alert tone="success" message={lastEvent} />
            </div>
          )}

          {incidents.length === 0 ? (
            <EmptyState
              message={
                search || filter || priority
                  ? "No reports match these filters."
                  : "You have not submitted any incidents yet."
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <IncidentListItem
                    incident={incident}
                    selected={selected?.id === incident.id}
                    onSelect={(id) => void openIncident(id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {pagination && <PaginationControls pagination={pagination} onChange={setPage} />}
        </Card>

        {selected ? (
          <Card
            title={`Incident ${selected.referenceNumber}`}
            subtitle={`${selected.category.name} · reported ${formatDate(selected.createdAt)}`}
            action={<StatusBadge status={selected.status} />}
          >
            <div className="space-y-4">
              <IncidentSummary incident={selected} />

              {selected.rejectionReason && (
                <Alert tone="error" message={`Rejected: ${selected.rejectionReason}`} />
              )}

              {selected.resolutionNotes && (
                <Alert tone="success" message={`Resolution: ${selected.resolutionNotes}`} />
              )}

              <IncidentEvidence incident={selected} canUpload canDelete />

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Status history
                </h3>

                {history.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No status changes yet.</p>
                ) : (
                  <ol className="mt-3 space-y-4 border-l border-slate-200 dark:border-slate-800 pl-4">
                    {history.map((entry) => (
                      <li key={entry.id} className="relative">
                        <span
                          aria-hidden
                          className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50 dark:ring-emerald-500/20"
                        />
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {entry.previousStatus ? `${entry.previousStatus} → ` : ""}
                          {entry.newStatus}
                        </p>
                        {entry.reason && (
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                            {entry.reason}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {formatDate(entry.createdAt)}
                          {entry.changedBy ? ` · ${entry.changedBy.fullName}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card title="Incident details">
            <EmptyState message="Select one of your reports to see its full timeline." />
          </Card>
        )}
      </div>
      </div>
      <LiveIncidentMap id="map" />
      <IncidentReports id="reports" />
      <ProfileSection id="profile" />
    </div>
  );
}
