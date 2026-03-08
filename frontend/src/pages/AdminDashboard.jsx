/**
 * Admin Dashboard — Compact Teal & White Redesign
 * Consolidated from 6 tabs → 3 tabs: Overview, Supply Chain, Intelligence
 * All features preserved, more visual and compact layout
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, BarChart2, ShoppingCart, RefreshCw, Package, Activity,
  Phone, Brain, Loader2, ThumbsUp, ThumbsDown, CheckCircle,
  X, Search, MessageSquare, TrendingUp, Truck, Users, AlertTriangle,
  ChevronDown, ChevronUp, Eye, Plus, ArrowRight, Grid, Filter, Layers, Trash2
} from 'lucide-react';

const API_BASE = '/api';

function parsePackageSize(packageSize) {
  if (!packageSize) return { count: null, unit: 'unit' };
  const match = String(packageSize).match(/(\d+)\s*(st|stk|stück|tab|tablets?|caps?|capsules?|ml|mg|g|pcs?|pieces?|units?)?/i);
  if (!match) return { count: null, unit: 'unit' };
  return { count: parseInt(match[1], 10), unit: match[2]?.toLowerCase() || 'unit' };
}

function suggestedReorderForMed(med) {
  const parsed = parsePackageSize(med.package_size);
  const unitsPerPack = parsed.count || 1;
  const avgDaily = med.avg_daily_consumption || null;
  if (avgDaily && avgDaily > 0) {
    const daysOfStock = med.stock_quantity / avgDaily;
    const threshold = Math.max(Math.ceil(avgDaily * 7), 5);
    const reorderQty = Math.max(Math.ceil(avgDaily * 30 / unitsPerPack), 2) * unitsPerPack;
    return { threshold, reorderQty, daysOfStock: Math.round(daysOfStock) };
  }
  const threshold = Math.max(Math.ceil(unitsPerPack * 0.3), 5);
  const reorderQty = unitsPerPack * 3;
  return { threshold, reorderQty, daysOfStock: null };
}

/* ─── SVG Progress Ring for Admin ─── */
function AdminRing({ pct, size = 56, strokeWidth = 5, color = '#14B8A6', children }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  // Safeguard against NaN/invalid values
  const safePct = isNaN(pct) || pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const offset = circ - (safePct / 100) * circ;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/* ─── Mini Horizontal Bar for inline visuals ─── */
function MiniBar({ value, max, color = 'teal', showLabel = true }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colorMap = { teal: 'bg-teal-500', red: 'bg-red-500', amber: 'bg-amber-400', blue: 'bg-blue-500', green: 'bg-green-500', purple: 'bg-purple-500' };
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorMap[color] || colorMap.teal} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-[9px] font-mono text-gray-400 w-8 text-right">{Math.round(pct)}%</span>}
    </div>
  );
}

function TrendBars({ title, subtitle, values = [], labels = [], tone = 'teal' }) {
  const safeValues = values.map(v => Number(v) || 0);
  const max = Math.max(...safeValues, 1);
  const toneMap = {
    teal: 'from-teal-500 to-cyan-400',
    indigo: 'from-indigo-500 to-blue-400',
    amber: 'from-amber-500 to-orange-400',
    rose: 'from-rose-500 to-pink-400'
  };

  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-xl p-5 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
        <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
      </div>
      <div className="h-36 flex items-end gap-2">
        {safeValues.map((value, idx) => {
          const height = Math.max(8, (value / max) * 100);
          return (
            <div key={`${title}-${idx}`} className="flex-1 flex flex-col items-center justify-end gap-2 min-w-0">
              <div
                className={`w-full rounded-t-xl bg-gradient-to-t ${toneMap[tone] || toneMap.teal} shadow-[0_8px_16px_-8px_rgba(15,23,42,0.45)] transition-all duration-500 hover:opacity-90`}
                style={{ height: `${height}%` }}
                title={`${labels[idx] || `#${idx + 1}`}: ${value}`}
              />
              <span className="text-[10px] text-slate-400 font-medium truncate w-full text-center">{labels[idx] || idx + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Stat Card Component (Enhanced with Ring Visual) ─── */
function StatCard({ icon, label, value, sub, color = 'teal', ringPct, ringMax }) {
  const colorMap = {
    teal: { text: 'text-teal-600', ring: '#14B8A6', iconBg: 'bg-teal-100', glow: 'bg-teal-400' },
    red: { text: 'text-red-600', ring: '#DC2626', iconBg: 'bg-red-100', glow: 'bg-red-400' },
    amber: { text: 'text-amber-600', ring: '#F59E0B', iconBg: 'bg-amber-100', glow: 'bg-amber-400' },
    blue: { text: 'text-blue-600', ring: '#3B82F6', iconBg: 'bg-blue-100', glow: 'bg-blue-400' },
    purple: { text: 'text-purple-600', ring: '#8B5CF6', iconBg: 'bg-purple-100', glow: 'bg-purple-400' },
  };
  const c = colorMap[color] || colorMap.teal;
  // Calculate percentage with safeguards against NaN
  let pct = null;
  if (ringPct != null) {
    pct = isNaN(ringPct) ? 0 : ringPct;
  } else if (ringMax) {
    const numValue = Number(value);
    pct = isNaN(numValue) || ringMax === 0 ? 0 : Math.min(100, (numValue / ringMax) * 100);
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-[1.5rem] border border-white/60 p-5 shadow-[0_4px_10px_-2px_rgba(0,0,0,0.02),0_15px_25px_-5px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_20px_-3px_rgba(0,0,0,0.04),0_25px_30px_-8px_rgba(0,0,0,0.04)] transition-all duration-400 ease-out hover:-translate-y-1.5 relative overflow-hidden group">
      <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full blur-[40px] opacity-0 group-hover:opacity-15 transition-opacity duration-700 pointer-events-none ${c.glow}`} />
      <div className="flex items-center gap-4 relative z-10">
        {/* Ring or Icon */}
        {pct != null ? (
          <AdminRing pct={pct} size={52} strokeWidth={4.5} color={c.ring}>
            <span className={`text-sm font-bold ${c.text}`}>{typeof value === 'number' ? value : '—'}</span>
          </AdminRing>
        ) : (
          <div className={`w-12 h-12 rounded-[1rem] ${c.iconBg} ${c.text} flex items-center justify-center shadow-inner`}>{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5`}>{label}</div>
          {pct == null && <div className={`text-[1.35rem] font-bold ${c.text}`}>{value}</div>}
          {sub && <div className="text-[11px] font-medium text-gray-500 mt-0.5 truncate">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Collapsible Section Wrapper ─── */
function Section({ id, title, icon, badge, children, actions, isExpanded, onToggle }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-[1.5rem] border border-white/60 shadow-[0_4px_10px_-2px_rgba(0,0,0,0.02),0_15px_25px_-5px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-400 ease-out hover:shadow-[0_10px_20px_-3px_rgba(0,0,0,0.04)] hover:-translate-y-1 group">
      <div className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/50 transition-colors">
        <button onClick={() => onToggle(id)} className="flex items-center gap-3 flex-1 text-left">
          <span className="text-teal-600 bg-teal-50/50 p-2 rounded-xl group-hover:scale-110 transition-transform">{icon}</span>
          <span className="font-bold text-[0.95rem] text-[#2C2C2C] tracking-tight">{title}</span>
          {badge != null && <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-teal-100/50">{badge}</span>}
        </button>
        <div className="flex items-center gap-3">
          {actions && <div className="mr-1">{actions}</div>}
          <button onClick={() => onToggle(id)} className="p-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-gray-50/50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {isExpanded && <div className="border-t border-gray-100/50 bg-white/40">{children}</div>}
    </div>
  );
}

export default function AdminDashboard({ onSwitchToUser, user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [medications, setMedications] = useState([]);
  const [lowStockPredictions, setLowStockPredictions] = useState([]);
  const [procurementQueue, setProcurementQueue] = useState([]);
  const [refillAlerts, setRefillAlerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const setScopedMessage = useCallback((next) => {
    const payload = typeof next === 'string' ? { type: 'success', text: next } : next;
    setMessage({ ...payload, tab: payload.tab ?? activeTab });
  }, [activeTab]);

  const [observabilityStatus, setObservabilityStatus] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [safetyDecisions, setSafetyDecisions] = useState([]);
  const [workflowTraces, setWorkflowTraces] = useState([]);
  const [traces, setTraces] = useState([]);
  const [ragMetrics, setRagMetrics] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [newMed, setNewMed] = useState({ brand_name: '', generic_name: '', dosage: '', stock_quantity: 0, rx_required: false, active_ingredient: '', base_price_eur: '', form: 'tablet', unit_type: 'tablet' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRx, setFilterRx] = useState('all'); // all | rx | otc
  const [showFilterOptions, setShowFilterOptions] = useState(false);
  const [showPatientDataModal, setShowPatientDataModal] = useState(false);
  const [patientData, setPatientData] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ events: true, webhook: false, inventory: true, forecast: true, procurement: true, refills: true, logs: false });

  const toggleSection = (key) => setExpandedSections(p => ({ ...p, [key]: !p[key] }));

  // ═══ Data Fetchers ═══
  const safeFetchJson = async (url) => {
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const detail = body ? ` ${body.slice(0, 180)}` : '';
      throw new Error(`${r.status} ${r.statusText}${detail}`);
    }
    return r.json();
  };
  const fetchMedications = async () => {
    try {
      const d = await safeFetchJson(`${API_BASE}/admin/medications`);
      setMedications(d.medications || []);
      if (message?.tab === 'inventory' && message?.type === 'error') setMessage(null);
    } catch (e) {
      console.error('fetchMedications:', e);
      setScopedMessage({ type: 'error', text: `Failed to load inventory: ${e.message}`, tab: 'inventory' });
    }
  };
  const fetchLowStockPredictions = async () => { try { const d = await safeFetchJson(`${API_BASE}/refill/predictions`); setLowStockPredictions(d.predictions || []); } catch (e) { console.error('fetchLowStockPredictions:', e); } };
  const fetchProcurementQueue = async () => { try { const d = await safeFetchJson(`${API_BASE}/procurement/queue`); setProcurementQueue(d.orders || []); } catch (e) { console.error('fetchProcurementQueue:', e); } };
  const fetchRefillAlerts = async () => { try { const d = await safeFetchJson(`${API_BASE}/refill/alerts?days_ahead=14`); setRefillAlerts(d.alerts || []); } catch (e) { console.error('fetchRefillAlerts:', e); } };
  const fetchEvents = async () => { try { const d = await safeFetchJson(`${API_BASE}/events?limit=30`); setEvents(d.events || []); } catch (e) { console.error('fetchEvents:', e); } };
  const fetchWebhookLogs = async () => { try { const d = await safeFetchJson(`${API_BASE}/webhooks/logs?limit=10`); setWebhookLogs(d.logs || []); } catch (e) { console.error('fetchWebhookLogs:', e); } };
  const fetchObservabilityData = async () => {
    try {
      const [s, l, sf, w, t] = await Promise.all([
        fetch(`${API_BASE}/observability/status`),
        fetch(`${API_BASE}/observability/execution-logs?limit=30`),
        fetch(`${API_BASE}/observability/safety-decisions?limit=20`),
        fetch(`${API_BASE}/observability/workflow-traces?limit=20`),
        fetch(`${API_BASE}/observability/traces?limit=20`),
      ]);
      for (const resp of [s, l, sf, w, t]) { if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`); }
      const [status, logs, safety, workflows, traceList] = await Promise.all([s.json(), l.json(), sf.json(), w.json(), t.json()]);
      setObservabilityStatus(status);
      setExecutionLogs(logs.logs || []);
      setSafetyDecisions(safety.decisions || []);
      setWorkflowTraces(workflows.traces || []);
      setTraces(traceList.traces || []);
    } catch (e) { console.error(e); }
  };
  const fetchRagMetrics = async () => { try { const d = await safeFetchJson(`${API_BASE}/observability/rag-metrics`); setRagMetrics(d); } catch (e) { console.error('fetchRagMetrics:', e); } };
  const fetchPatientData = async () => { setLoadingPatients(true); try { const d = await safeFetchJson(`${API_BASE}/data/export/orders`); setPatientData(d.orders || []); } catch (e) { console.error('fetchPatientData:', e); } finally { setLoadingPatients(false); } };

  // ═══ Actions ═══
  const refreshAllData = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([fetchMedications(), fetchLowStockPredictions(), fetchProcurementQueue(), fetchRefillAlerts(), fetchEvents(), fetchWebhookLogs()]); if (activeTab === 'intelligence') await Promise.all([fetchObservabilityData(), fetchRagMetrics()]); } finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => {
    refreshAllData();
    const i = setInterval(() => {
      fetchEvents();
      fetchWebhookLogs();
      fetchMedications();
      if (activeTab === 'supply') { fetchLowStockPredictions(); fetchProcurementQueue(); }
      if (activeTab === 'intelligence') { fetchObservabilityData(); fetchRagMetrics(); }
    }, 5000);
    return () => clearInterval(i);
  }, [activeTab]);

  const generateProcurementOrders = async () => { setLoading(true); try { const r = await fetch(`${API_BASE}/procurement/generate?urgency=attention`, { method: 'POST' }); const d = await r.json(); setScopedMessage({ type: 'success', text: d.message || 'Procurement orders generated.' }); await Promise.all([fetchProcurementQueue(), fetchEvents()]); } catch { setScopedMessage({ type: 'error', text: 'Failed to generate orders' }); } finally { setLoading(false); } };
  const sendOrderToSupplier = async (orderId) => { try { const r = await fetch(`${API_BASE}/procurement/${orderId}/send`, { method: 'POST' }); const d = await r.json(); if (d.error) throw new Error(d.error); setScopedMessage({ type: 'success', text: `Order sent to supplier. Status updated to ordered.` }); await Promise.all([fetchProcurementQueue(), fetchEvents(), fetchWebhookLogs()]); } catch (e) { setScopedMessage({ type: 'error', text: e.message || 'Failed to send order' }); } };
  const markOrderReceived = async (orderId) => { try { const r = await fetch(`${API_BASE}/procurement/${orderId}/receive`, { method: 'POST' }); const d = await r.json(); if (d.success) { setScopedMessage({ type: 'success', text: `Stock updated: +${d.quantity_received ?? ''} units received. Inventory refreshed.` }); await refreshAllData(); } else { setScopedMessage({ type: 'error', text: d.error || 'Failed to mark received' }); } } catch { setScopedMessage({ type: 'error', text: 'Failed to mark received' }); } };
  const handleRunEval = async () => {
    setIsEvaluating(true);
    try {
      const r = await fetch(`${API_BASE}/observability/run-eval`, { method: 'POST' });
      const d = await r.json();
      if (d.status === 'complete' && d.metrics) {
        // Evaluation returned results directly — update UI immediately
        setRagMetrics(prev => ({
          ...prev,
          latest: d.metrics,
          history: [d.metrics, ...(prev?.history || [])].slice(0, 10),
          count: (prev?.count || 0) + 1
        }));
        setScopedMessage({ type: 'success', text: d.message, tab: 'intelligence' });
      } else if (d.status === 'error') {
        setScopedMessage({ type: 'error', text: d.message || 'Evaluation failed', tab: 'intelligence' });
      } else {
        setScopedMessage({ type: 'success', text: d.message || 'Evaluation started', tab: 'intelligence' });
        // Fallback: poll for results
        await fetchRagMetrics();
      }
    } catch {
      setScopedMessage({ type: 'error', text: 'Failed to trigger evaluation', tab: 'intelligence' });
    } finally {
      setIsEvaluating(false);
    }
  };
  const submitFeedback = async (traceId, rating) => { try { await fetch(`${API_BASE}/observability/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trace_id: traceId, rating }) }); setScopedMessage({ type: 'success', text: 'Feedback recorded', tab: 'intelligence' }); } catch { setScopedMessage({ type: 'error', text: 'Failed to submit feedback', tab: 'intelligence' }); } };
  const handleCreateMedication = async (e) => {
    e.preventDefault();
    try {
      const descParts = [];
      if (newMed.generic_name) descParts.push(`Generic: ${newMed.generic_name}`);
      if (newMed.active_ingredient) descParts.push(`Active: ${newMed.active_ingredient}`);
      const r = await fetch(`${API_BASE}/admin/medications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_name: newMed.brand_name, package_size: newMed.dosage, description: descParts.join('; ') || undefined, base_price_eur: newMed.base_price_eur ? parseFloat(newMed.base_price_eur) : undefined, rx_required: newMed.rx_required }) });
      if (!r.ok) throw new Error('Failed');
      const d = await r.json();
      if (newMed.stock_quantity > 0) await fetch(`${API_BASE}/admin/inventory/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_quantity: parseInt(newMed.stock_quantity) }) });
      setScopedMessage({ type: 'success', text: 'Medication added', tab: 'supply' });
      setShowAddMedModal(false); setNewMed({ brand_name: '', generic_name: '', dosage: '', stock_quantity: 0, rx_required: false, active_ingredient: '', base_price_eur: '', form: 'tablet', unit_type: 'tablet' });
      fetchMedications(); fetchLowStockPredictions();
    } catch { setScopedMessage({ type: 'error', text: 'Failed to add medication', tab: 'supply' }); }
  };

  const handleDeleteMedication = async (medId) => {
    if (!confirm('Delete this medication? This will remove it from the catalog.')) return;
    try {
      const r = await fetch(`${API_BASE}/admin/medications/${medId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Delete failed');
      setScopedMessage({ type: 'success', text: 'Medication deleted', tab: 'inventory' });
      await fetchMedications();
    } catch (e) { setScopedMessage({ type: 'error', text: e.message || 'Failed to delete medication', tab: 'inventory' }); }
  };
  const handleUpdateStock = async (id, qty) => { try { await fetch(`${API_BASE}/admin/inventory/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_quantity: parseInt(qty) }) }); setScopedMessage({ type: 'success', text: 'Stock updated', tab: 'supply' }); fetchMedications(); } catch { setScopedMessage({ type: 'error', text: 'Failed to update stock', tab: 'supply' }); } };

  const getUrgencyColor = (u) => ({ critical: 'bg-red-100 text-red-700 border-red-200', warning: 'bg-amber-100 text-amber-700 border-amber-200', attention: 'bg-blue-100 text-blue-700 border-blue-200' }[u] || 'bg-green-100 text-green-700 border-green-200');
  const getStatusColor = (s) => ({ pending: 'bg-amber-100 text-amber-800', ordered: 'bg-blue-100 text-blue-800', received: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800' }[s] || 'bg-gray-100 text-gray-800');

  const lowStockCount = medications.filter(m => m.stock_quantity <= 10).length;
  const criticalPreds = lowStockPredictions.filter(p => p.urgency === 'critical').length;
  const pendingOrders = procurementQueue.filter(o => o.status === 'pending').length;
  const stockHealthBands = [
    medications.filter(m => m.stock_quantity > 30).length,
    medications.filter(m => m.stock_quantity > 10 && m.stock_quantity <= 30).length,
    medications.filter(m => m.stock_quantity <= 10).length,
  ];
  const stockHealthLabels = ['Healthy', 'Watch', 'Critical'];
  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyEventLoad = weekLabels.map((_, day) =>
    events.filter((ev) => {
      const date = new Date(ev.created_at || Date.now());
      return date.getDay() === day;
    }).length
  );
  const riskTop = [...lowStockPredictions]
    .sort((a, b) => (a.days_until_stockout ?? 999) - (b.days_until_stockout ?? 999))
    .slice(0, 5);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <Activity size={18} /> },
    { id: 'inventory', label: 'Inventory', icon: <Grid size={18} /> },
    { id: 'supply', label: 'Supply Chain', icon: <Package size={18} /> },
    { id: 'intelligence', label: 'Intelligence', icon: <Brain size={18} /> },
  ];



  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(99,102,241,0.15),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(14,165,233,0.14),transparent_35%),radial-gradient(circle_at_40%_90%,rgba(16,185,129,0.14),transparent_38%),#f8fafc] font-sans text-slate-900">
      <main className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-5 md:py-7">
        {/* Apple-like top glass bar */}
        <header className="sticky top-4 z-30 mb-5">
          <div className="rounded-[1.75rem] border border-white/70 bg-white/65 backdrop-blur-2xl shadow-[0_20px_40px_-20px_rgba(15,23,42,0.35)] px-4 md:px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 text-white flex items-center justify-center shadow-lg">
                    <BarChart2 size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-semibold">Pharmacy Operations</p>
                    <h1 className="text-lg md:text-xl font-bold tracking-tight">Intelligence Dashboard</h1>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-xs font-semibold text-slate-600">
                    {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <button onClick={refreshAllData} className={`p-2 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-xl transition-all ${loading ? 'animate-spin' : ''}`}>
                    <RefreshCw size={16} />
                  </button>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-2 shadow">
                    <span className="w-5 h-5 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold">{user?.name?.[0] || 'A'}</span>
                    <span className="max-w-[120px] truncate">{user?.name || 'Admin'}</span>
                  </div>
                  <button onClick={onSwitchToUser} className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:shadow-sm transition-all active:scale-95 flex items-center gap-1.5">
                    <Users size={14} /> User View
                  </button>
                </div>
              </div>

              <div className="bg-slate-100/80 rounded-2xl p-1.5 border border-white/70 inline-flex gap-1.5 flex-wrap w-full md:w-auto">
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setActiveTab(t.id); setMessage(null); }}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 inline-flex items-center gap-2 ${activeTab === t.id
                      ? 'bg-white text-slate-900 shadow-[0_6px_16px_-8px_rgba(15,23,42,0.45)]'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'
                      }`}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="rounded-[2rem] border border-white/70 bg-white/45 backdrop-blur-xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.45)]">
          {/* Toast */}
          {message && (
            <div className={`mx-6 mt-5 p-3 rounded-xl flex items-center justify-between text-sm shadow-sm animate-fade-in-up ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <span className="font-medium">{message.text}</span>
              <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100"><X size={16} /></button>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="p-4 md:p-6 lg:p-7 space-y-4">


          {/* ═══════════ OVERVIEW TAB ═══════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in-up px-2 pb-6">
              {/* Dashboard Graph Row */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <TrendBars
                  title="Inventory Distribution"
                  subtitle="Healthy vs warning vs critical products"
                  values={stockHealthBands}
                  labels={stockHealthLabels}
                  tone="teal"
                />
                <TrendBars
                  title="Weekly Event Activity"
                  subtitle="Operational load by weekday"
                  values={weeklyEventLoad}
                  labels={weekLabels}
                  tone="indigo"
                />
                <div className="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-xl p-5 shadow-sm">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Critical Risk Queue</p>
                    <p className="text-sm text-slate-600 mt-1">Top medications by days to stockout</p>
                  </div>
                  <div className="space-y-3">
                    {riskTop.length === 0 ? (
                      <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100 px-4 py-5 text-sm font-semibold text-emerald-700">No immediate depletion risk detected.</div>
                    ) : riskTop.map((item, idx) => {
                      const daysLeft = item.days_until_stockout ?? 0;
                      const barColor = daysLeft <= 3 ? 'red' : daysLeft <= 7 ? 'amber' : 'blue';
                      return (
                        <div key={`${item.brand_name}-${idx}`} className="rounded-2xl border border-slate-100 bg-white/70 px-3.5 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-800 truncate pr-2">{item.brand_name}</span>
                            <span className="text-[11px] font-bold text-slate-500">{daysLeft}d</span>
                          </div>
                          <MiniBar value={30 - Math.max(0, daysLeft)} max={30} color={barColor} showLabel={false} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ★ Priority Procurement Section (High Visibility) */}
              <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[1.5rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden mb-2 group transition-all duration-500 hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] hover:-translate-y-1">
                {/* Decorative Elements */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-400/10 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                <div className="absolute top-1/2 -right-6 -translate-y-1/2 p-3 text-amber-500/10 group-hover:text-amber-500/20 transition-colors duration-700 pointer-events-none">
                  <Truck size={160} strokeWidth={1} />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between relative z-10 gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-amber-50 text-amber-600 rounded-xl shadow-[inset_0_2px_4px_0_rgba(245,158,11,0.05)]">
                        <Zap size={20} className="fill-amber-500/20" />
                      </div>
                      <h3 className="font-brand font-bold text-xl text-[#2C2C2C] tracking-tight">Priority Procurement</h3>
                    </div>
                    <p className="text-[#6B6B6B] text-sm max-w-md font-medium leading-relaxed">
                      AI-driven restocking. <span className="text-gray-900 font-bold">{procurementQueue.length} orders</span> pending approval.
                      {procurementQueue.length > 0 && <span className="text-amber-600 font-bold ml-1.5 px-2 py-0.5 bg-amber-50 rounded-md border border-amber-100/50 text-xs">Action required</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-6 sm:pl-6 sm:border-l sm:border-gray-100">
                    <div className="text-right hidden sm:block">
                      <div className="text-3xl font-mono font-bold leading-none text-[#2C2C2C]">{procurementQueue.filter(o => o.status === 'ordered').length}</div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">On Order</div>
                    </div>

                    <button
                      onClick={generateProcurementOrders}
                      disabled={loading}
                      className="px-6 py-3.5 bg-[#294056] text-white rounded-[1.25rem] font-bold text-sm shadow-[0_8px_20px_-6px_rgba(41,64,86,0.4)] hover:shadow-[0_12px_25px_-8px_rgba(41,64,86,0.5)] transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 group/btn min-w-[160px]"
                    >
                      {loading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} className="fill-white/20 group-hover/btn:fill-white/40 transition-colors" />}
                      Auto-Generate
                    </button>
                  </div>
                </div>
              </div>

              {/* Stat Cards Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={<Package size={16} />} label="Total Products" value={medications.length} sub={`${lowStockCount} low stock`} ringMax={Math.max(medications.length, 50)} />
                <StatCard icon={<AlertTriangle size={16} />} label="Critical Forecasts" value={criticalPreds} sub={`of ${lowStockPredictions.length} predictions`} color={criticalPreds > 0 ? 'red' : 'teal'} ringMax={Math.max(lowStockPredictions.length, 1)} />
                <StatCard icon={<Truck size={16} />} label="Pending Orders" value={pendingOrders} sub={`${procurementQueue.length} total`} color={pendingOrders > 0 ? 'amber' : 'teal'} ringMax={Math.max(procurementQueue.length, 1)} />
                <StatCard icon={<RefreshCw size={16} />} label="Refill Alerts" value={refillAlerts.length} sub="Upcoming depletions" color={refillAlerts.length > 0 ? 'blue' : 'teal'} ringMax={20} />
              </div>

              {/* Two-column: Events + Forecast */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Live Events */}
                <Section id="events" title="Live Events" icon={<Zap size={16} />} badge={events.length} isExpanded={expandedSections.events} onToggle={toggleSection}>
                  <div className="divide-y divide-gray-100/50">
                    {events.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">No events yet</div> : events.slice(0, 15).map((ev, i) => (
                      <div key={i} className="flex gap-4 px-6 py-4 hover:bg-teal-50/30 transition-colors text-sm group">
                        <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap pt-0.5">{new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[9px] font-bold uppercase rounded-md border border-teal-100/50">{ev.agent}</span>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{ev.event_type}</span>
                          </div>
                          <p className="text-xs text-[#6B6B6B] font-medium leading-relaxed group-hover:text-gray-900 transition-colors">{ev.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Stock Forecast Preview */}
                <Section id="forecast" title="Stock Forecasts" icon={<TrendingUp size={16} />} badge={lowStockPredictions.length} isExpanded={expandedSections.forecast} onToggle={toggleSection}>
                  <div className="p-4 space-y-3">
                    {lowStockPredictions.length === 0 ? (
                      <div className="py-8 text-center"><CheckCircle size={32} className="mx-auto text-green-400/50 mb-3" /><p className="text-sm font-bold text-[#6B6B6B]">All stocks healthy</p></div>
                    ) : lowStockPredictions.slice(0, 8).map((pred, i) => {
                      const uc = getUrgencyColor(pred.urgency);
                      const daysLeft = pred.days_until_stockout || 0;
                      const ringColor = daysLeft <= 3 ? '#DC2626' : daysLeft <= 7 ? '#F59E0B' : '#14B8A6';
                      const pct = Math.max(0, Math.min(100, ((30 - Math.max(0, daysLeft)) / 30) * 100));
                      return (
                        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/50 border border-gray-100/50 hover:bg-white hover:border-teal-100/50 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.05)] transition-all duration-300 group">
                          <AdminRing pct={pct} size={48} strokeWidth={4} color={ringColor}>
                            <span className="text-[11px] font-bold" style={{ color: ringColor }}>{daysLeft}d</span>
                          </AdminRing>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-[#2C2C2C] truncate mb-0.5" title={pred.brand_name}>{pred.brand_name}</div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-medium text-gray-400">Stock: <span className="font-bold text-gray-600">{pred.current_stock}</span></span>
                              <span className="w-1 h-1 rounded-full bg-gray-200" />
                              <span className="text-[10px] font-medium text-gray-400"><span className="font-bold text-gray-600">{pred.units_per_day}</span>/day</span>
                            </div>
                            <div className="opacity-70 group-hover:opacity-100 transition-opacity"><MiniBar value={30 - daysLeft} max={30} color={daysLeft <= 3 ? 'red' : daysLeft <= 7 ? 'amber' : 'teal'} showLabel={false} /></div>
                          </div>
                          <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded-md border border-current/20 flex-shrink-0 ${uc}`}>{pred.urgency}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </div>

              {/* Webhook Logs */}
              <Section id="webhook" title="Webhook Traffic" icon={<MessageSquare size={16} />} badge={webhookLogs.length} isExpanded={expandedSections.webhook} onToggle={toggleSection}>
                <div>
                  {webhookLogs.length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No logs</div> : (
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50/50 text-gray-500 font-bold uppercase tracking-wider sticky top-0 backdrop-blur-md"><tr><th className="px-6 py-3">Time</th><th className="px-6 py-3">Method</th><th className="px-6 py-3">Endpoint</th><th className="px-6 py-3 text-right">Payload</th></tr></thead>
                      <tbody className="divide-y divide-gray-100/50">{webhookLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-teal-50/30 font-mono transition-colors">
                          <td className="px-6 py-3 text-gray-400 text-[10px] whitespace-nowrap">{new Date(log.created_at).toLocaleTimeString()}</td>
                          <td className="px-6 py-3"><span className={`px-2 py-1 rounded-md text-[9px] font-bold tracking-widest uppercase border ${log.direction === 'outgoing' ? 'bg-purple-50 text-purple-700 border-purple-100/50' : 'bg-green-50 text-green-700 border-green-100/50'}`}>{log.direction === 'outgoing' ? 'POST' : 'RECV'}</span></td>
                          <td className="px-6 py-3 text-[#6B6B6B] truncate max-w-[200px] font-medium">{log.endpoint}</td>
                          <td className="px-6 py-3 text-right"><details className="inline-block relative"><summary className="text-teal-600 hover:text-teal-800 cursor-pointer font-bold bg-teal-50 px-2 py-1 rounded-md border border-teal-100/50 transition-colors">JSON</summary><div className="absolute right-0 mt-2 w-80 bg-gray-900/95 backdrop-blur-xl border border-white/10 text-green-400 p-4 rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)] z-50 text-[10px] overflow-auto max-h-72 custom-scrollbar"><pre>{JSON.stringify(log.payload, null, 2)}</pre></div></details></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              </Section>
            </div>
          )}

          {/* ═══════════ INVENTORY TAB ═══════════ */}
          {activeTab === 'inventory' && (
            <div className="space-y-6 animate-fade-in-up px-2 pb-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative max-w-sm w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} type="text" placeholder="Search medications..." className="w-full bg-white/70 backdrop-blur-xl border border-white/50 hover:border-teal-200/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] rounded-[1.25rem] pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-[#2C2C2C] transition-all placeholder:text-gray-400 font-medium" />
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative">
                    <button onClick={() => setShowFilterOptions(s => !s)} className="flex items-center justify-center gap-2 px-4 py-3 bg-white/70 backdrop-blur-xl rounded-[1.25rem] text-sm font-semibold text-[#6B6B6B] shadow-[0_4px_15px_-3px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_-6px_rgba(0,0,0,0.06)] hover:bg-white border border-white/50 transition-all hover:-translate-y-0.5"><Filter size={16} /> Filter</button>
                    {showFilterOptions && (
                      <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl border border-gray-100 shadow-lg p-2 z-20">
                        <button onClick={() => { setFilterRx('all'); setShowFilterOptions(false); }} className={`w-full text-left px-3 py-2 rounded-md ${filterRx==='all'?'bg-teal-50':''}`}>All</button>
                        <button onClick={() => { setFilterRx('rx'); setShowFilterOptions(false); }} className={`w-full text-left px-3 py-2 rounded-md ${filterRx==='rx'?'bg-teal-50':''}`}>Prescription only</button>
                        <button onClick={() => { setFilterRx('otc'); setShowFilterOptions(false); }} className={`w-full text-left px-3 py-2 rounded-md ${filterRx==='otc'?'bg-teal-50':''}`}>OTC only</button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setShowAddMedModal(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-[#294056] text-white rounded-[1.25rem] text-sm font-bold shadow-[0_8px_20px_-6px_rgba(41,64,86,0.4)] hover:shadow-[0_12px_25px_-8px_rgba(41,64,86,0.5)] transition-all hover:-translate-y-1"><Plus size={16} /> Add Medication</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {medications.filter(med => {
                  const q = searchQuery.trim().toLowerCase();
                  if (q) {
                    const hay = `${med.product_name || ''} ${med.description || ''} ${med.package_size || ''}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                  }
                  if (filterRx === 'rx' && !med.rx_required) return false;
                  if (filterRx === 'otc' && med.rx_required) return false;
                  return true;
                }).map(med => {
                  const sg = suggestedReorderForMed(med);
                  const threshold = med.reorder_threshold > 0 ? med.reorder_threshold : sg.threshold;
                  const isLow = med.stock_quantity <= threshold;
                  const isCritical = med.stock_quantity <= 10;
                  const ringColor = isCritical ? '#EF4444' : isLow ? '#F59E0B' : '#14B8A6';
                  const maxDisplay = Math.max(med.stock_quantity, threshold * 2);
                  const pct = maxDisplay > 0 ? Math.min(100, (med.stock_quantity / maxDisplay) * 100) : 0;

                  return (
                    <div key={med.id} className="bg-white/80 backdrop-blur-xl rounded-[1.5rem] p-5 shadow-[0_4px_10px_-2px_rgba(0,0,0,0.02),0_15px_25px_-5px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_20px_-3px_rgba(0,0,0,0.04),0_25px_30px_-8px_rgba(14,165,233,0.06)] transition-all duration-400 ease-out hover:-translate-y-1.5 relative group overflow-hidden border border-white flex flex-col min-h-[190px]">
                      {isCritical && <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none before:absolute before:inset-0 before:bg-red-500/5 before:rounded-bl-[4rem] before:transition-all group-hover:before:bg-red-500/10 transition-colors" />}

                      <div className="flex justify-between items-start mb-5 relative z-10">
                        <div className="flex-1 min-w-0 pr-3">
                          <h4 className="text-base font-bold text-[#2C2C2C] truncate mb-0.5" title={med.product_name}>{med.product_name}</h4>
                          <p className="text-[#6B6B6B] text-[11px] font-medium tracking-wide uppercase">{med.package_size || 'N/A'} • {med.form || 'UNIT'}</p>
                          {med.description && <div className="text-[11px] text-gray-500 mt-1 truncate">{med.description}</div>}
                          {med.base_price_eur != null && <div className="text-[13px] font-semibold text-gray-800 mt-1">€{Number(med.base_price_eur).toFixed(2)}</div>}
                        </div>
                        <div className="flex items-start gap-2">
                          {med.rx_required ? <span className="px-2 py-1 bg-[#FEF3C7] text-[#B45309] text-[9px] font-bold uppercase tracking-wider rounded-md border border-[#FDE68A] shadow-[0_2px_4px_-1px_rgba(245,158,11,0.1)] flex-shrink-0">RX</span> : <span className="px-2 py-1 bg-green-50 text-green-700 text-[9px] font-bold uppercase tracking-wider rounded-md border border-green-100 flex-shrink-0">OTC</span>}
                          <button onClick={() => handleDeleteMedication(med.id)} title="Delete" className="w-8 h-8 rounded-md bg-white/50 hover:bg-red-50 text-red-600 flex items-center justify-center border border-gray-100 ml-1"><Trash2 size={14} /></button>
                        </div>
                      </div>

                      <div className="flex items-end gap-4 mt-auto">
                        <AdminRing pct={pct} size={52} strokeWidth={4.5} color={ringColor}>
                          <span className="text-sm font-bold" style={{ color: ringColor }}>{med.stock_quantity}</span>
                        </AdminRing>

                        <div className="flex-1">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 flex justify-between">
                            <span>Balance</span>
                            <span>Min {threshold}</span>
                          </div>
                          <div className="flex items-center gap-1 bg-white/50 backdrop-blur-md rounded-xl shadow-[inset_0_2px_4px_0_rgba(0,0,0,0.02)] p-1 border border-gray-100/60 transition-colors group-hover:bg-white">
                            <button onClick={() => handleUpdateStock(med.id, Math.max(0, med.stock_quantity - 1))} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer active:scale-90">-</button>
                            <input
                              type="number"
                              className="flex-1 w-full min-w-0 bg-transparent text-center text-sm font-bold text-[#2C2C2C] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors"
                              value={med.stock_quantity}
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) handleUpdateStock(med.id, val);
                              }}
                            />
                            <button onClick={() => handleUpdateStock(med.id, med.stock_quantity + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-teal-50 hover:text-teal-600 transition-colors cursor-pointer active:scale-90">+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════ SUPPLY CHAIN TAB ═══════════ */}
          {activeTab === 'supply' && (
            <div className="space-y-4 animate-fade-in-up">
              {/* Stat Row */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard icon={<Package size={16} />} label="Products" value={medications.length} sub={`${lowStockCount} need attention`} />
                <StatCard icon={<ShoppingCart size={16} />} label="Orders" value={procurementQueue.length} sub={`${pendingOrders} pending`} color={pendingOrders > 0 ? 'amber' : 'teal'} />
                <StatCard icon={<RefreshCw size={16} />} label="Customer Refills" value={refillAlerts.length} sub="Due within 14 days" color={refillAlerts.length > 0 ? 'blue' : 'teal'} />
              </div>

              {/* Procurement */}
              <Section id="procurement" title="Procurement Orders" icon={<Truck size={16} />} badge={procurementQueue.length}
                isExpanded={expandedSections.procurement} onToggle={toggleSection}
                actions={<div role="button" tabIndex={0} onClick={() => !loading && generateProcurementOrders()} onKeyDown={e => e.key === 'Enter' && !loading && generateProcurementOrders()} className={`px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[11px] font-semibold hover:bg-gray-800 transition-colors flex items-center gap-1 cursor-pointer select-none ${loading ? 'opacity-50 pointer-events-none' : ''}`}>{loading ? <Loader2 className="animate-spin" size={12} /> : <Zap size={12} />} Auto-Generate</div>}>
                <div className="max-h-[350px] overflow-auto">
                  {procurementQueue.length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No active orders</div> : (
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 text-gray-500 uppercase font-semibold sticky top-0"><tr><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-gray-50">{procurementQueue.map(order => (
                        <tr key={order.order_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getStatusColor(order.status)}`}>{order.status}</span></td>
                          <td className="px-4 py-2.5"><div className="font-semibold text-gray-800">{order.brand_name}</div><div className="text-gray-400">{order.quantity || order.order_quantity} units</div></td>
                          <td className="px-4 py-2.5 text-gray-600">{order.supplier_name || order.supplier?.name}</td>
                          <td className="px-4 py-2.5 text-right">
                            {order.status === 'pending' && <button onClick={() => sendOrderToSupplier(order.order_id)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-semibold hover:bg-blue-700">Send</button>}
                            {order.status === 'ordered' && <button onClick={() => markOrderReceived(order.order_id)} className="px-3 py-1 bg-green-600 text-white rounded-lg text-[10px] font-semibold hover:bg-green-700">Received</button>}
                            {order.status === 'received' && <span className="text-[10px] text-gray-400">Done</span>}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              </Section>

              {/* Customer Refills */}
              <Section id="refills" title="Customer Refills" icon={<RefreshCw size={16} />} badge={refillAlerts.length}
                isExpanded={expandedSections.refills} onToggle={toggleSection}
                actions={<div role="button" tabIndex={0} onClick={() => { setShowPatientDataModal(true); fetchPatientData(); }} onKeyDown={e => { if (e.key === 'Enter') { setShowPatientDataModal(true); fetchPatientData(); } }} className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-[11px] font-semibold hover:bg-teal-100 transition-colors flex items-center gap-1 border border-teal-200 cursor-pointer select-none"><Users size={12} /> Patients</div>}>
                <div className="max-h-[350px] overflow-y-auto p-3">
                  {refillAlerts.length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No refills due</div> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {refillAlerts.map((alert, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-teal-200 transition-all">
                          <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${alert.days_until_depletion <= 3 ? 'bg-red-500' : 'bg-amber-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{alert.customer_name}</div>
                            <div className="text-[10px] text-gray-400">{alert.brand_name} · {alert.dosage}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${alert.days_until_depletion <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {alert.days_until_depletion <= 0 ? 'EMPTY' : `${alert.days_until_depletion}d`}
                            </span>
                          </div>
                          <a href={`tel:${alert.customer_phone}`} className="w-7 h-7 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100 flex-shrink-0"><Phone size={12} /></a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
            </div>
          )}

          {/* ═══════════ INTELLIGENCE TAB ═══════════ */}
          {activeTab === 'intelligence' && (
            <div className="space-y-4 animate-fade-in-up">
              {/* Status + RAG Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_4px_10px_-2px_rgba(0,0,0,0.02),0_15px_25px_-5px_rgba(0,0,0,0.02)] rounded-[1.5rem] p-6 transition-all duration-400 hover:shadow-[0_10px_20px_-3px_rgba(0,0,0,0.04)] hover:-translate-y-1">
                  <div className="flex justify-between items-center mb-5">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Observability</span>
                    <div className="w-8 h-8 rounded-full bg-blue-50/50 flex items-center justify-center"><Activity size={14} className="text-blue-500" /></div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-white/50 rounded-xl border border-gray-100/50">
                      <div className={`w-2.5 h-2.5 rounded-full ${observabilityStatus?.langfuse_enabled ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-gray-300'}`} />
                      <span className="text-sm font-bold text-[#2C2C2C]">{observabilityStatus?.langfuse_enabled ? 'Langfuse Active' : 'Local Only'}</span>
                    </div>
                    <div className="px-1 text-[11px] font-medium text-gray-500 flex flex-col gap-2">
                      <span className="flex justify-between"><span>Traces</span> <span className="font-bold text-gray-700">{traces.length}</span></span>
                      <span className="flex justify-between"><span>Events</span> <span className="font-bold text-gray-700">{executionLogs.length}</span></span>
                      <span className="flex justify-between"><span>Safety Logs</span> <span className="font-bold text-gray-700">{safetyDecisions.length}</span></span>
                    </div>
                  </div>
                </div>

                {/* RAG Quality */}
                <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_4px_10px_-2px_rgba(0,0,0,0.02),0_15px_25px_-5px_rgba(0,0,0,0.02)] rounded-[1.5rem] p-6 lg:col-span-2 transition-all duration-400 hover:shadow-[0_10px_20px_-3px_rgba(0,0,0,0.04)] hover:-translate-y-1">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shadow-inner"><Brain size={18} className="text-purple-600" /></div>
                      <div>
                        <span className="text-sm font-bold text-[#2C2C2C]">RAG Quality</span>
                        <div className="text-[10px] text-gray-400 font-medium">Auto-evaluations powered by React Framework</div>
                      </div>
                    </div>
                    <button onClick={handleRunEval} disabled={loading || isEvaluating} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_15px_-3px_rgba(79,70,229,0.3)] hover:shadow-[0_8px_20px_-5px_rgba(79,70,229,0.4)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group min-w-[120px]">
                      {isEvaluating ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} className="fill-white/20 group-hover:fill-white/40 transition-colors" />}
                      {isEvaluating ? 'Evaluating...' : 'Run Evaluation'}
                    </button>
                  </div>
                  {isEvaluating ? (
                    <div className="text-center py-8 space-y-3">
                      <Loader2 className="animate-spin mx-auto text-indigo-600" size={40} />
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-gray-700">Evaluating RAG Quality...</div>
                        <div className="text-xs text-gray-500">Running 3 metrics on samples (~15-30 seconds)</div>
                        <div className="text-xs text-gray-400">Check backend terminal for progress</div>
                      </div>
                      <div className="flex justify-center gap-2 pt-2">
                        <div className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-[10px] font-medium">Faithfulness</div>
                        <div className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">Precision</div>
                        <div className="px-2 py-1 bg-green-50 text-green-700 rounded text-[10px] font-medium">Relevancy</div>
                      </div>
                    </div>
                  ) : ragMetrics?.latest ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      {[{ name: 'Faithfulness', score: ragMetrics.latest.faithfulness_score, ring: '#22C55E' }, { name: 'Precision', score: ragMetrics.latest.context_precision_score, ring: '#3B82F6' }, { name: 'Relevancy', score: ragMetrics.latest.answer_relevancy_score, ring: '#8B5CF6' }].map(m => (
                        <div key={m.name} className="flex flex-col items-center justify-center p-4 bg-white/50 rounded-2xl border border-gray-100/50 hover:bg-white transition-colors">
                          <AdminRing pct={m.score * 100} size={70} strokeWidth={5.5} color={m.ring}>
                            <span className="text-lg font-bold" style={{ color: m.ring }}>{(m.score * 100).toFixed(0)}%</span>
                          </AdminRing>
                          <span className="text-[11px] font-bold text-[#6B6B6B] uppercase tracking-wider mt-4 text-center">{m.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-center py-10 bg-white/50 rounded-2xl border border-transparent border-dashed hover:border-gray-200 transition-colors flex flex-col items-center"><Brain size={32} className="text-gray-300 mb-3" /><p className="text-sm font-semibold text-[#6B6B6B]">No metrics yet</p><p className="text-xs font-medium text-gray-400 mt-1 max-w-xs">Chat with the assistant first to generate samples. Current trace count: {ragMetrics?.history?.length || 0}</p></div>}
                </div>
              </div>

              {/* Chain of Thought (CoT) */}
              <Section id="logs" title="Chain of Thought (CoT)" icon={<Activity size={16} />} badge={traces.length || executionLogs.length} isExpanded={expandedSections.logs} onToggle={toggleSection}>
                <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100/50">
                  {traces.map((trace, i) => (
                    <div key={`trace-${i}`} className="px-6 py-4 hover:bg-teal-50/30 transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-gray-400">{new Date(trace.created_at || trace.timestamp || Date.now()).toLocaleTimeString()}</span>
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 font-bold text-[9px] tracking-wider uppercase rounded-md border border-purple-100/50">TRACE</span>
                          {trace.latency_ms != null && <span className="text-[10px] text-gray-400 font-medium">{trace.latency_ms} ms</span>}
                        </div>
                        {trace.public_url && <a href={trace.public_url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 hover:underline px-2 py-1 bg-indigo-50 rounded-md transition-colors">Open Trace</a>}
                      </div>
                      <p className="text-sm text-[#2C2C2C] font-bold truncate mb-1">{trace.name || 'Agent Turn'}</p>
                      <p className="text-xs text-[#6B6B6B] font-medium truncate">{trace.input_text || trace.metadata_json || ''}</p>
                    </div>
                  ))}
                  {executionLogs.map((log, i) => (
                    <div key={i} className="px-6 py-4 hover:bg-teal-50/30 transition-colors group">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</span>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold text-[9px] tracking-wider uppercase rounded-md border border-blue-100/50">{log.agent}</span>
                        </div>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => submitFeedback(log.trace_id || log.id, 'positive')} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-100 text-gray-400 hover:text-green-600 hover:bg-green-50 hover:border-green-200 transition-colors shadow-sm"><ThumbsUp size={12} /></button>
                          <button onClick={() => submitFeedback(log.trace_id || log.id, 'negative')} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-100 text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm"><ThumbsDown size={12} /></button>
                        </div>
                      </div>
                      <p className="text-sm text-[#6B6B6B] font-medium leading-relaxed group-hover:text-gray-900 transition-colors">{log.message}</p>
                      {log.metadata && (
                        <details className="mt-2 text-[10px] text-gray-500"><summary className="cursor-pointer font-bold hover:text-teal-600 inline-block px-2 py-1 bg-gray-50 rounded-md border border-gray-100 transition-colors">View Metadata</summary><pre className="mt-2 bg-gray-900/95 backdrop-blur-xl border border-white/10 text-gray-300 p-4 rounded-xl overflow-x-auto text-[10px] custom-scrollbar shadow-inner">{JSON.stringify(log.metadata, null, 2)}</pre></details>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
          </div>
        </div>
      </main>

      {/* ═══ Add Medication Modal ═══ */}
      {showAddMedModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-100 animate-zoom-in">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Add Medication</h3>
              <button onClick={() => setShowAddMedModal(false)} className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateMedication} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Brand</label><input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" value={newMed.brand_name} onChange={e => setNewMed({ ...newMed, brand_name: e.target.value })} /></div>
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Generic</label><input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" value={newMed.generic_name} onChange={e => setNewMed({ ...newMed, generic_name: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Dosage</label><input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" value={newMed.dosage} onChange={e => setNewMed({ ...newMed, dosage: e.target.value })} /></div>
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Stock</label><input type="number" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" value={newMed.stock_quantity} onChange={e => setNewMed({ ...newMed, stock_quantity: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Active Ingredient</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" value={newMed.active_ingredient} onChange={e => setNewMed({ ...newMed, active_ingredient: e.target.value })} /></div>
                <div><label className="text-[10px] font-bold text-gray-500 uppercase">Price (EUR)</label><input type="number" step="0.01" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" value={newMed.base_price_eur} onChange={e => setNewMed({ ...newMed, base_price_eur: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                <input type="checkbox" id="rx" className="w-4 h-4 rounded text-teal-600" checked={newMed.rx_required} onChange={e => setNewMed({ ...newMed, rx_required: e.target.checked })} />
                <label htmlFor="rx" className="text-sm font-medium text-gray-700 cursor-pointer">Prescription Required</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddMedModal(false)} className="px-4 py-2.5 text-gray-500 text-sm font-semibold hover:bg-gray-50 rounded-xl">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl shadow-lg hover:bg-teal-700 transition-all active:scale-95">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Patient Data Modal ═══ */}
      {showPatientDataModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-gray-100 animate-zoom-in" style={{ maxHeight: '85vh' }}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center"><Users size={16} /></div>
                <div><h3 className="text-base font-bold text-gray-800">Patient Orders</h3><p className="text-xs text-gray-400">{patientData.length} records</p></div>
              </div>
              <button onClick={() => setShowPatientDataModal(false)} className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              {loadingPatients ? <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-teal-600" size={32} /></div> : patientData.length === 0 ? (
                <div className="text-center py-16"><Users size={28} className="mx-auto text-gray-300 mb-2" /><p className="text-sm font-semibold text-gray-600">No data</p></div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-500 uppercase font-semibold sticky top-0">
                    <tr>
                      <th className="px-5 py-3 rounded-tl-xl">Customer</th>
                      <th className="px-5 py-3">Contact & Address</th>
                      <th className="px-5 py-3">Date & Time</th>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3 text-right">Qty / Total</th>
                      <th className="px-5 py-3 rounded-tr-xl">RX & Freq</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {patientData.map((row, idx) => (
                      <tr key={row.order_id + '-' + idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-bold text-gray-800 text-sm whitespace-nowrap">{row.customer_name || 'Anonymous'}</div>
                          <div className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-1">ID: {row.customer_id || '-'}</div>
                          {row.customer_age && <div className="text-[10px] text-gray-400 mt-0.5">{row.customer_age} y/o • {row.customer_gender}</div>}
                        </td>
                        <td className="px-5 py-4 text-[11px] text-gray-600 min-w-[150px]">
                          {row.customer_email && <div className="font-medium">{row.customer_email}</div>}
                          {row.phone && <div>{row.phone}</div>}
                          {row.address && <div className="text-gray-400 truncate max-w-[180px] mt-0.5" title={`${row.address}, ${row.city || ''}`}>{row.address}{row.city ? `, ${row.city}` : ''}</div>}
                        </td>
                        <td className="px-5 py-4 text-[11px] text-gray-600 whitespace-nowrap">
                          {row.purchase_date && <div><span className="font-semibold text-gray-700">Date:</span> {new Date(row.purchase_date).toLocaleDateString()}</div>}
                          {row.order_created_at && <div className="mt-0.5 text-gray-400">Time: {new Date(row.order_created_at).toLocaleTimeString()}</div>}
                        </td>
                        <td className="px-5 py-4 font-bold text-[#2C2C2C] text-sm max-w-[200px]" title={row.product_name}>
                          <div className="line-clamp-2">{row.product_name || '-'}</div>
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <div className="font-bold text-gray-800 text-sm">{row.quantity ?? '-'} items</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">Item: €{row.line_total_eur != null ? Number(row.line_total_eur).toFixed(2) : '-'}</div>
                          {row.order_total_eur != null && <div className="text-[10px] text-gray-400">Order: €{Number(row.order_total_eur).toFixed(2)}</div>}
                        </td>
                        <td className="px-5 py-4 text-[11px]">
                          {row.prescription_required ? <span className="px-1.5 py-0.5 bg-red-50 text-red-600 font-bold uppercase tracking-wider rounded border border-red-100/50 text-[9px] mb-1 inline-block">RX REQ</span> : <span className="px-1.5 py-0.5 bg-green-50 text-green-600 font-bold uppercase tracking-wider rounded border border-green-100/50 text-[9px] mb-1 inline-block">OTC</span>}
                          <div className="text-gray-600 font-medium capitalize">{row.dosage_frequency || '-'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
