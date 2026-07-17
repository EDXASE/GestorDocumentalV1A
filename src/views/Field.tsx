import { useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  Navigation,
  Plus,
  Clock,
  Route,
  LocateFixed,
  X,
} from 'lucide-react';
import {
  supabase,
  type Checkin,
  type Client,
  type Activity,
} from '../lib/supabase';
import { useSession } from '../lib/store';
import { Card, EmptyState, Modal, Spinner } from '../components/ui';
import { timeAgo, formatDate } from '../lib/utils';
import { logAudit } from '../lib/audit';
import { isVendedor } from '../lib/permissions';

// Approximate Mexico coordinates for demo map rendering
const MX_BOUNDS = { minLat: 14, maxLat: 33, minLng: -118, maxLng: -86 };

export function Field() {
  const { user, advisors } = useSession();
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [routeClients, setRouteClients] = useState<string[]>([]);
  const vendedor = isVendedor(user?.role);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [ck, cl, ac] = await Promise.all([
      supabase.from('checkins').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*'),
      supabase.from('activities').select('*').eq('type', 'visita').eq('status', 'pendiente'),
    ]);
    let checkinsData = (ck.data as Checkin[]) ?? [];
    let clientsData = (cl.data as Client[]) ?? [];
    let activitiesData = (ac.data as Activity[]) ?? [];
    // Vendedores solo ven sus propios datos
    if (vendedor && user) {
      checkinsData = checkinsData.filter((c) => c.advisor_id === user.id);
      clientsData = clientsData.filter((c) => c.advisor_id === user.id);
      activitiesData = activitiesData.filter((a) => a.advisor_id === user.id);
    }
    setCheckins(checkinsData);
    setClients(clientsData);
    setActivities(activitiesData);
    setLoading(false);
  }

  function locate() {
    setLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
        },
        () => {
          // Fallback to a default location
          setCurrentPos({ lat: 19.4326, lng: -99.1332 });
          setLocating(false);
        },
        { timeout: 5000 }
      );
    } else {
      setCurrentPos({ lat: 19.4326, lng: -99.1332 });
      setLocating(false);
    }
  }

  async function doCheckin(data: { client_id: string; lat: number; lng: number; address: string; notes: string }) {
    const { error } = await supabase.from('checkins').insert({
      advisor_id: user?.id,
      client_id: data.client_id,
      latitude: data.lat,
      longitude: data.lng,
      address: data.address,
      notes: data.notes,
    });
    if (!error) {
      await logAudit({
        actor_id: user?.id,
        actor_name: user?.name,
        action: 'create',
        entity: 'checkin',
        entity_label: `Check-in ${data.address}`,
      });
      setCheckinOpen(false);
      load();
    }
  }

  // Clients with city coordinates (simulated)
  const clientCoords = useMemo(() => {
    const cityCoords: Record<string, { lat: number; lng: number }> = {
      'Monterrey': { lat: 25.6866, lng: -100.3161 },
      'CDMX': { lat: 19.4326, lng: -99.1332 },
      'Guadalajara': { lat: 20.6597, lng: -103.3496 },
      'Puebla': { lat: 19.0414, lng: -98.2063 },
      'Querétaro': { lat: 20.5888, lng: -100.3899 },
      'San Luis Potosí': { lat: 22.1565, lng: -100.9852 },
      'Toluca': { lat: 19.2826, lng: -99.6557 },
      'Morelia': { lat: 19.706, lng: -101.1943 },
      'Veracruz': { lat: 19.1738, lng: -96.1342 },
      'Saltillo': { lat: 25.4232, lng: -100.9956 },
      'León': { lat: 21.1169, lng: -101.6862 },
      'Tampico': { lat: 22.2555, lng: -97.8686 },
    };
    return clients
      .filter((c) => c.city && cityCoords[c.city])
      .map((c) => ({ client: c, ...cityCoords[c.city as string] }));
  }, [clients]);

  // Optimized route (nearest neighbor heuristic)
  const optimizedRoute = useMemo(() => {
    if (routeClients.length === 0) return [];
    const points = routeClients
      .map((id) => clientCoords.find((c) => c.client.id === id))
      .filter(Boolean) as { client: Client; lat: number; lng: number }[];
    if (points.length === 0) return [];
    const start = currentPos ?? { lat: 19.4326, lng: -99.1332 };
    const remaining = [...points];
    const route: { client: Client; lat: number; lng: number }[] = [];
    let current = start;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      remaining.forEach((p, i) => {
        const d = Math.hypot(p.lat - current.lat, p.lng - current.lng);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      const next = remaining.splice(bestIdx, 1)[0];
      route.push(next);
      current = { lat: next.lat, lng: next.lng };
    }
    return route;
  }, [routeClients, clientCoords, currentPos]);

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner className="h-6 w-6" /></div>;
  }

  return (
    <div className="grid grid-cols-12 gap-4 sm:gap-5">
      {/* Map */}
      <Card className="col-span-12 lg:col-span-8 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h3 className="font-display font-700 text-ink-900">Mapa de cartera</h3>
            <p className="text-xs text-ink-500">Ubicación de clientes y check-ins recientes</p>
          </div>
          <button onClick={locate} className="btn-outline text-xs">
            {locating ? <Spinner /> : <LocateFixed size={14} />} Mi ubicación
          </button>
        </div>
        <MapView
          clients={clientCoords}
          checkins={checkins}
          currentPos={currentPos}
          route={optimizedRoute}
          onSelectClient={(id) => setRouteClients((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
          selectedRoute={routeClients}
        />
      </Card>

      {/* Side panel */}
      <div className="col-span-12 lg:col-span-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-700 text-ink-900">Check-in GPS</h3>
            <button onClick={() => setCheckinOpen(true)} className="btn-primary text-xs">
              <Plus size={13} /> Registrar
            </button>
          </div>
          <p className="text-xs text-ink-500 mb-3">Verifica visitas físicas con geolocalización.</p>
          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
            {checkins.slice(0, 6).map((c) => {
              const client = clients.find((cl) => cl.id === c.client_id);
              const advisor = advisors.find((a) => a.id === c.advisor_id);
              return (
                <div key={c.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-ink-50 border border-ink-100">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <MapPin size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-600 text-ink-900 truncate">{client?.name ?? 'Cliente'}</p>
                    <p className="text-xs text-ink-500 truncate">{c.address ?? `${c.latitude}, ${c.longitude}`}</p>
                    <p className="text-[10px] text-ink-400 mt-0.5">{timeAgo(c.created_at)} · {advisor?.name.split(' ')[0]}</p>
                  </div>
                </div>
              );
            })}
            {checkins.length === 0 && <EmptyState icon={<MapPin size={20} />} title="Sin check-ins" />}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-700 text-ink-900">Optimización de ruta</h3>
            <button
              onClick={() => setRouteClients([])}
              className="text-xs text-ink-400 hover:text-ink-700"
              disabled={routeClients.length === 0}
            >
              Limpiar
            </button>
          </div>
          {routeClients.length === 0 ? (
            <p className="text-xs text-ink-500">Selecciona clientes en el mapa para generar una ruta optimizada.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-brand-700 font-600 mb-2">
                <Route size={14} /> Ruta optimizada · {optimizedRoute.length} paradas
              </div>
              {optimizedRoute.map((p, i) => (
                <div key={p.client.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-ink-100">
                  <div className="h-7 w-7 rounded-full bg-brand-600 text-white text-xs font-700 flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-ink-900 truncate">{p.client.name}</p>
                    <p className="text-xs text-ink-500 truncate">{p.client.city} · {p.client.company}</p>
                  </div>
                  <button
                    onClick={() => setRouteClients(routeClients.filter((x) => x !== p.client.id))}
                    className="text-ink-400 hover:text-rose-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button className="btn-outline w-full text-xs mt-2">
                <Navigation size={13} /> Iniciar ruta
              </button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-display font-700 text-ink-900 mb-3">Visitas pendientes</h3>
          <div className="space-y-2">
            {activities.length === 0 ? (
              <p className="text-xs text-ink-500">Sin visitas programadas.</p>
            ) : (
              activities.map((a) => {
                const client = clients.find((c) => c.id === a.client_id);
                return (
                  <div key={a.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-amber-50/50 border border-amber-100">
                    <Clock size={14} className="text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-ink-900 truncate">{a.title}</p>
                      <p className="text-xs text-ink-500 truncate">{client?.name ?? '—'} · {formatDate(a.scheduled_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <CheckinModal
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        onCheckin={doCheckin}
        clients={clients}
        currentPos={currentPos}
        onLocate={locate}
      />
    </div>
  );
}

function MapView({
  clients,
  checkins,
  currentPos,
  route,
  onSelectClient,
  selectedRoute,
}: {
  clients: { client: Client; lat: number; lng: number }[];
  checkins: Checkin[];
  currentPos: { lat: number; lng: number } | null;
  route: { client: Client; lat: number; lng: number }[];
  onSelectClient: (id: string) => void;
  selectedRoute: string[];
}) {
  const W = 800;
  const H = 460;
  const project = (lat: number, lng: number) => {
    const x = ((lng - MX_BOUNDS.minLng) / (MX_BOUNDS.maxLng - MX_BOUNDS.minLng)) * W;
    const y = H - ((lat - MX_BOUNDS.minLat) / (MX_BOUNDS.maxLat - MX_BOUNDS.minLat)) * H;
    return { x, y };
  };

  const routePath = route.length > 0
    ? [
        currentPos ? project(currentPos.lat, currentPos.lng) : null,
        ...route.map((r) => project(r.lat, r.lng)),
      ].filter(Boolean).map((p) => `${(p as any).x},${(p as any).y}`).join(' ')
    : '';

  return (
    <div className="relative bg-gradient-to-br from-brand-50 via-ink-50 to-emerald-50/30" style={{ height: 460 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
        {/* Grid */}
        {[0.2, 0.4, 0.6, 0.8].map((g) => (
          <g key={g}>
            <line x1={W * g} y1={0} x2={W * g} y2={H} stroke="#d5dae3" strokeWidth="0.5" strokeDasharray="4 4" />
            <line x1={0} y1={H * g} x2={W} y2={H * g} stroke="#d5dae3" strokeWidth="0.5" strokeDasharray="4 4" />
          </g>
        ))}
        {/* Mexico-ish outline (simplified) */}
        <path
          d="M 100 80 Q 200 60 320 90 Q 450 70 580 110 Q 680 130 720 200 Q 740 280 680 340 Q 600 380 500 360 Q 400 380 300 350 Q 200 360 130 300 Q 80 220 100 80 Z"
          fill="#ffffff"
          stroke="#b0bac9"
          strokeWidth="1.5"
          opacity="0.7"
        />
        {/* Route line */}
        {route.length > 0 && (
          <polyline
            points={routePath}
            fill="none"
            stroke="#1e6091"
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        )}
        {/* Checkins */}
        {checkins.slice(0, 8).map((c, i) => {
          const p = project(c.latitude, c.longitude);
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="5" fill="#10b981" opacity="0.7" />
              <circle cx={p.x} cy={p.y} r="2.5" fill="#059669" />
            </g>
          );
        })}
        {/* Clients */}
        {clients.map((c) => {
          const p = project(c.lat, c.lng);
          const selected = selectedRoute.includes(c.client.id);
          return (
            <g
              key={c.client.id}
              onClick={() => onSelectClient(c.client.id)}
              className="cursor-pointer"
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={selected ? 10 : 7}
                fill={selected ? '#1e6091' : '#3282b8'}
                opacity="0.85"
                className="transition-all"
              />
              <circle cx={p.x} cy={p.y} r="2.5" fill="white" />
              <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[10px] fill-ink-700 font-600 pointer-events-none">
                {c.client.name.split(' ')[0]}
              </text>
            </g>
          );
        })}
        {/* Current position */}
        {currentPos && (() => {
          const p = project(currentPos.lat, currentPos.lng);
          return (
            <g>
              <circle cx={p.x} cy={p.y} r="14" fill="#3282b8" opacity="0.2" className="animate-pulse-soft" />
              <circle cx={p.x} cy={p.y} r="6" fill="#1e6091" stroke="white" strokeWidth="2" />
            </g>
          );
        })()}
      </svg>
      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-lg px-3 py-2 text-xs text-ink-600 shadow-soft border border-ink-200">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-600" /> Cliente</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Check-in</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-700 ring-2 ring-brand-200" /> Mi posición</span>
        </div>
      </div>
    </div>
  );
}

function CheckinModal({
  open,
  onClose,
  onCheckin,
  clients,
  currentPos,
  onLocate,
}: {
  open: boolean;
  onClose: () => void;
  onCheckin: (data: { client_id: string; lat: number; lng: number; address: string; notes: string }) => void;
  clients: Client[];
  currentPos: { lat: number; lng: number } | null;
  onLocate: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar check-in"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button
            onClick={() => {
              if (!clientId || !currentPos) return;
              onCheckin({ client_id: clientId, lat: currentPos.lat, lng: currentPos.lng, address, notes });
            }}
            className="btn-primary"
            disabled={!clientId || !currentPos}
          >
            <MapPin size={14} /> Confirmar check-in
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Cliente *</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecciona…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.city ?? '—'}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Ubicación GPS</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg bg-ink-50 border border-ink-200 text-sm text-ink-700">
              {currentPos ? `${currentPos.lat.toFixed(4)}, ${currentPos.lng.toFixed(4)}` : 'Sin ubicación'}
            </div>
            <button onClick={onLocate} className="btn-outline text-xs">
              <LocateFixed size={13} /> Obtener
            </button>
          </div>
        </div>
        <div>
          <label className="label">Dirección (opcional)</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, ciudad" />
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones de la visita" />
        </div>
      </div>
    </Modal>
  );
}
