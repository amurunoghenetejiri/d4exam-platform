import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Search, X } from "lucide-react";

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no window"));
      return;
    }
    const w = window as any;
    if (w.L) {
      resolve(w.L);
      return;
    }
    if (!document.getElementById("leaflet-css-cdn")) {
      const link = document.createElement("link");
      link.id = "leaflet-css-cdn";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      const style = document.createElement("style");
      style.id = "leaflet-hide-attr";
      style.textContent = ".leaflet-control-attribution{display:none!important}";
      document.head.appendChild(style);
    }
    const existing = document.getElementById("leaflet-js-cdn") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      if ((window as any).L) resolve((window as any).L);
      return;
    }
    const script = document.createElement("script");
    script.id = "leaflet-js-cdn";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error("Leaflet failed"));
    document.head.appendChild(script);
  });
}

type NominatimHit = { display_name: string; lat: string; lon: string };

type Props = {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  city?: string;
  state?: string;
  country?: string;
  onError?: (msg: string) => void;
};

async function nominatimSearch(q: string): Promise<NominatimHit[]> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { Accept: "application/json", "Accept-Language": "en" },
  });
  const data = (await res.json()) as NominatimHit[];
  return Array.isArray(data) ? data : [];
}

function dedupeHits(hits: NominatimHit[]): NominatimHit[] {
  const seen = new Set<string>();
  const out: NominatimHit[] = [];
  for (const h of hits) {
    const key = `${Number(h.lat).toFixed(5)},${Number(h.lon).toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export function MapPinPicker({ lat, lng, onChange, city = "", state = "", country = "", onError }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
          markerRef.current = null;
        }
        const startLat = lat ?? 6.5244;
        const startLng = lng ?? 3.3792;
        const zoom = lat != null && lng != null ? 16 : 6;
        const map = L.map(containerRef.current, { attributionControl: false, zoomControl: true }).setView(
          [startLat, startLng],
          zoom,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
        mapRef.current = map;
        if (lat != null && lng != null) markerRef.current = L.marker([lat, lng]).addTo(map);
        map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
          const { lat: clat, lng: clng } = e.latlng;
          onChange(clat, clng);
          if (markerRef.current) markerRef.current.setLatLng([clat, clng]);
          else markerRef.current = L.marker([clat, clng]).addTo(map);
        });
        setReady(true);
        setTimeout(() => map.invalidateSize(), 80);
      } catch {
        setReady(false);
        onError?.("Map failed to load. You can still submit without a pin.");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== "undefined" ? (window as any).L : null;
    if (!map || !L || lat == null || lng == null) return;
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    else markerRef.current = L.marker([lat, lng]).addTo(map);
  }, [lat, lng]);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults([]);
    setHint("");
    onError?.("");
    try {
      const c = city.trim();
      const st = state.trim();
      const co = country.trim() || "Nigeria";

      // Progressive queries: exact → street+area → area only → free text
      const attempts: string[] = [];
      attempts.push([q, c, st, co].filter(Boolean).join(", "));
      if (c || st) attempts.push([q, c || st, co].filter(Boolean).join(", "));
      attempts.push([q, co].filter(Boolean).join(", "));
      attempts.push(q);
      if (c && st) attempts.push([c, st, co].filter(Boolean).join(", "));
      if (c) attempts.push([c, co].filter(Boolean).join(", "));

      let all: NominatimHit[] = [];
      let usedFallback = false;
      for (let i = 0; i < attempts.length; i++) {
        const hits = await nominatimSearch(attempts[i]);
        if (hits.length) {
          all = dedupeHits([...all, ...hits]);
          if (i > 0) usedFallback = true;
          if (all.length >= 6) break;
        }
        // small pause to respect Nominatim usage policy
        if (i < attempts.length - 1) await new Promise((r) => setTimeout(r, 350));
      }

      setResults(all.slice(0, 10));
      if (!all.length) {
        setHint("No exact match. Zoom the map and click the nearest street or landmark.");
        onError?.("No places found. Zoom the map and click the exact school location.");
      } else if (usedFallback) {
        setHint("Showing nearest / similar places. Pick one, then fine-tune by clicking the map.");
        onError?.("");
      } else {
        setHint("Select a result, or click the map for a more exact pin.");
        onError?.("");
      }
    } catch {
      setHint("");
      onError?.("Search failed. Zoom and click the map to pin the school.");
    } finally {
      setSearching(false);
    }
  }

  function pick(r: NominatimHit) {
    const clat = Number(r.lat);
    const clng = Number(r.lon);
    if (!Number.isFinite(clat) || !Number.isFinite(clng)) return;
    onChange(clat, clng);
    setResults([]);
    setQuery(r.display_name);
    setHint("Pin placed. Zoom and click the map if you need a more exact point.");
    onError?.("");
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <Label className="inline-flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        Pin school on map (optional)
      </Label>
      <p className="text-[11px] text-slate-500">
        Search street, school or area (uses city / state / country you entered). If the exact spot is missing,
        pick the nearest result, then <strong>click the map</strong> for the precise pin.
      </p>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10"
          placeholder="e.g. Akbar Road, school name, street…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 font-semibold"
          disabled={searching}
          onClick={() => void search()}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      {hint ? <p className="text-[11px] text-amber-700">{hint}</p> : null}
      {results.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-left">
          {results.map((r) => (
            <li key={r.lat + r.lon + r.display_name}>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-100 bg-white px-2 py-1.5 text-left text-xs hover:border-primary/40"
                onClick={() => pick(r)}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <div ref={containerRef} className="h-56 w-full cursor-crosshair" style={{ minHeight: 224 }} />
        {!ready ? (
          <div className="absolute inset-0 grid place-items-center bg-slate-100 text-xs text-slate-500">
            Loading map…
          </div>
        ) : null}
      </div>
      {lat != null && lng != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="font-mono">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
          <div className="flex items-center gap-3">
            <a
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Open full map
            </a>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-rose-600"
              onClick={() => {
                onChange(null, null);
                if (markerRef.current && mapRef.current) {
                  try {
                    mapRef.current.removeLayer(markerRef.current);
                  } catch {
                    /* ignore */
                  }
                  markerRef.current = null;
                }
              }}
            >
              <X className="h-3 w-3" /> Clear pin
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">No pin yet — search above or click the map to drop one.</p>
      )}
      <p className="text-[10px] text-slate-400">Map data © OpenStreetMap</p>
    </div>
  );
}
