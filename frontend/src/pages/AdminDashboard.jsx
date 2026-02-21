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
  ChevronDown, ChevronUp, Eye, Plus, ArrowRight
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

/* ─── Stat Card Component (Enhanced with Ring Visual) ─── */
function StatCard({ icon, label, value, sub, color = 'teal', ringPct, ringMax }) {
  const colorMap = {
    teal: { bg: 'bg-gradient-to-br from-teal-50 to-white', border: 'border-teal-100', text: 'text-teal-600', ring: '#14B8A6', iconBg: 'bg-teal-100' },
    red: { bg: 'bg-gradient-to-br from-red-50 to-white', border: 'border-red-100', text: 'text-red-600', ring: '#DC2626', iconBg: 'bg-red-100' },
    amber: { bg: 'bg-gradient-to-br from-amber-50 to-white', border: 'border-amber-100', text: 'text-amber-600', ring: '#F59E0B', iconBg: 'bg-amber-100' },
    blue: { bg: 'bg-gradient-to-br from-blue-50 to-white', border: 'border-blue-100', text: 'text-blue-600', ring: '#3B82F6', iconBg: 'bg-blue-100' },
    purple: { bg: 'bg-gradient-to-br from-purple-50 to-white', border: 'border-purple-100', text: 'text-purple-600', ring: '#8B5CF6', iconBg: 'bg-purple-100' },
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
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4 transition-all hover:shadow-md hover:-translate-y-0.5`}>
      <div className="flex items-center gap-3">
        {/* Ring or Icon */}
        {pct != null ? (
          <AdminRing pct={pct} size={48} strokeWidth={4} color={c.ring}>
            <span className={`text-xs font-bold ${c.text}`}>{typeof value === 'number' ? value : '—'}</span>
          </AdminRing>
        ) : (
          <div className={`w-10 h-10 rounded-xl ${c.iconBg} ${c.text} flex items-center justify-center`}>{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] font-bold uppercase tracking-wider ${c.text} opacity-80`}>{label}</div>
          {pct == null && <div className={`text-2xl font-bold ${c.text}`}>{value}</div>}
          {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Collapsible Section Wrapper (defined outside AdminDashboard to prevent scroll-reset on re-renders) ─── */
function Section({ id, title, icon, badge, children, actions, isExpanded, onToggle }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
      <div className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
        <button onClick={() => onToggle(id)} className="flex items-center gap-2.5 flex-1">
          <span className="text-teal-600">{icon}</span>
          <span className="font-bold text-sm text-gray-800">{title}</span>
          {badge != null && <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded-full">{badge}</span>}
        </button>
        <div className="flex items-center gap-2">
          {actions && <div className="mr-2">{actions}</div>}
          <button onClick={() => onToggle(id)} className="p-1">
            {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
        </div>
      </div>
      {isExpanded && <div className="border-t border-gray-100">{children}</div>}
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
  const [newMed, setNewMed] = useState({ brand_name: '', generic_name: '', dosage: '', stock_quantity: 0, rx_required: false, active_ingredient: '', form: 'tablet', unit_type: 'tablet' });
  const [showPatientDataModal, setShowPatientDataModal] = useState(false);
  const [patientData, setPatientData] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ events: true, webhook: false, inventory: true, forecast: true, procurement: true, refills: true, logs: false });

  const toggleSection = (key) => setExpandedSections(p => ({ ...p, [key]: !p[key] }));

  // ═══ Data Fetchers ═══
  const fetchMedications = async () => { try { const r = await fetch(`${API_BASE}/admin/medications`); const d = await r.json(); setMedications(d.medications || []); } catch (e) { console.error(e); } };
  const fetchLowStockPredictions = async () => { try { const r = await fetch(`${API_BASE}/refill/predictions`); const d = await r.json(); setLowStockPredictions(d.predictions || []); } catch (e) { console.error(e); } };
  const fetchProcurementQueue = async () => { try { const r = await fetch(`${API_BASE}/procurement/queue`); const d = await r.json(); setProcurementQueue(d.orders || []); } catch (e) { console.error(e); } };
  const fetchRefillAlerts = async () => { try { const r = await fetch(`${API_BASE}/refill/alerts?days=14`); const d = await r.json(); setRefillAlerts(d.alerts || []); } catch (e) { console.error(e); } };
  const fetchEvents = async () => { try { const r = await fetch(`${API_BASE}/events?limit=30`); const d = await r.json(); setEvents(d.events || []); } catch (e) { console.error(e); } };
  const fetchWebhookLogs = async () => { try { const r = await fetch(`${API_BASE}/webhooks/logs?limit=10`); const d = await r.json(); setWebhookLogs(d.logs || []); } catch (e) { console.error(e); } };
  const fetchObservabilityData = async () => {
    try {
      const [s, l, sf, w, t] = await Promise.all([
        fetch(`${API_BASE}/observability/status`),
        fetch(`${API_BASE}/observability/execution-logs?limit=30`),
        fetch(`${API_BASE}/observability/safety-decisions?limit=20`),
        fetch(`${API_BASE}/observability/workflow-traces?limit=20`),
        fetch(`${API_BASE}/observability/traces?limit=20`),
      ]);
      const [status, logs, safety, workflows, traceList] = await Promise.all([s.json(), l.json(), sf.json(), w.json(), t.json()]);
      setObservabilityStatus(status);
      setExecutionLogs(logs.logs || []);
      setSafetyDecisions(safety.decisions || []);
      setWorkflowTraces(workflows.traces || []);
      setTraces(traceList.traces || []);
    } catch (e) { console.error(e); }
  };
  const fetchRagMetrics = async () => { try { const r = await fetch(`${API_BASE}/observability/rag-metrics`); const d = await r.json(); setRagMetrics(d); } catch (e) { console.error(e); } };
  const fetchPatientData = async () => { setLoadingPatients(true); try { const r = await fetch(`${API_BASE}/data/export/orders`); const d = await r.json(); setPatientData(d.orders || []); } catch (e) { console.error(e); } finally { setLoadingPatients(false); } };

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
      const r = await fetch(`${API_BASE}/admin/medications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_name: newMed.brand_name, package_size: newMed.dosage, description: newMed.generic_name ? `Generic: ${newMed.generic_name}` : undefined }) });
      if (!r.ok) throw new Error('Failed');
      const d = await r.json();
      if (newMed.stock_quantity > 0) await fetch(`${API_BASE}/admin/inventory/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_quantity: parseInt(newMed.stock_quantity) }) });
      setScopedMessage({ type: 'success', text: 'Medication added', tab: 'supply' });
      setShowAddMedModal(false); setNewMed({ brand_name: '', generic_name: '', dosage: '', stock_quantity: 0, rx_required: false, active_ingredient: '', form: 'tablet', unit_type: 'tablet' });
      fetchMedications(); fetchLowStockPredictions();
    } catch { setScopedMessage({ type: 'error', text: 'Failed to add medication', tab: 'supply' }); }
  };
  const handleUpdateStock = async (id, qty) => { try { await fetch(`${API_BASE}/admin/inventory/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_quantity: parseInt(qty) }) }); setScopedMessage({ type: 'success', text: 'Stock updated', tab: 'supply' }); fetchMedications(); } catch { setScopedMessage({ type: 'error', text: 'Failed to update stock', tab: 'supply' }); } };

  const getUrgencyColor = (u) => ({ critical: 'bg-red-100 text-red-700 border-red-200', warning: 'bg-amber-100 text-amber-700 border-amber-200', attention: 'bg-blue-100 text-blue-700 border-blue-200' }[u] || 'bg-green-100 text-green-700 border-green-200');
  const getStatusColor = (s) => ({ pending: 'bg-amber-100 text-amber-800', ordered: 'bg-blue-100 text-blue-800', received: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800' }[s] || 'bg-gray-100 text-gray-800');

  const lowStockCount = medications.filter(m => m.stock_quantity <= 10).length;
  const criticalPreds = lowStockPredictions.filter(p => p.urgency === 'critical').length;
  const pendingOrders = procurementQueue.filter(o => o.status === 'pending').length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <Activity size={18} /> },
    { id: 'supply', label: 'Supply Chain', icon: <Package size={18} /> },
    { id: 'intelligence', label: 'Intelligence', icon: <Brain size={18} /> },
  ];



  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* ═══ Slim Sidebar ═══ */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col shadow-sm">
        <div className="p-4 flex items-center justify-center border-b border-gray-100">
          <img
            src="/admin_logo.png"
            alt="Mediloon Admin"
            className="w-48 h-48 object-contain pointer-events-none transform scale-110"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/mediloon-logo.webp'; }}
          />
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setActiveTab(t.id); setMessage(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${activeTab === t.id ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm ring-1 ring-teal-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100 space-y-2">
          <div className="px-3 py-2 bg-gray-50 rounded-xl">
            <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Logged in</div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-[10px]">{user?.name?.[0] || 'A'}</div>
              <span className="text-xs font-medium text-gray-700 truncate">{user?.name || 'Admin'}</span>
            </div>
          </div>
          <button onClick={onSwitchToUser} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors shadow active:scale-95">
            <Users size={14} /> User View
          </button>
        </div>
      </aside>

      {/* ═══ Main Content ═══ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-12 bg-white border-b border-gray-100 px-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            {tabs.find(t => t.id === activeTab)?.icon}
            <h2 className="text-lg font-bold text-gray-800">{tabs.find(t => t.id === activeTab)?.label}</h2>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refreshAllData} className={`p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all ${loading ? 'animate-spin' : ''}`}>
              <RefreshCw size={16} />
            </button>
            <span className="text-xs text-gray-400">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        </header>

        {/* Toast */}
        {message && (
          <div className={`mx-6 mt-3 p-3 rounded-xl flex items-center justify-between text-sm shadow-sm animate-fade-in-up ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <span className="font-medium">{message.text}</span>
            <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100"><X size={16} /></button>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ═══════════ OVERVIEW TAB ═══════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-4 animate-fade-in-up">
              {/* ★ Priority Procurement Section (High Visibility) */}
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden mb-2 group">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Truck size={120} />
                </div>
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-sm">
                        <Zap size={18} className="text-yellow-400" />
                      </div>
                      <h3 className="font-brand font-bold text-lg">Priority Procurement</h3>
                    </div>
                    <p className="text-gray-400 text-sm max-w-md">
                      AI-driven restocking. {procurementQueue.length} orders pending approval.
                      {procurementQueue.length > 0 && <span className="text-white font-semibold ml-1">Action required.</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <div className="text-2xl font-mono font-bold leading-none">{procurementQueue.filter(o => o.status === 'ordered').length}</div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">On Order</div>
                    </div>
                    <div className="w-px h-8 bg-white/10 hidden sm:block" />
                    <button
                      onClick={generateProcurementOrders}
                      disabled={loading}
                      className="px-5 py-2.5 bg-white text-gray-900 rounded-xl font-bold text-sm hover:bg-gray-100 active:scale-95 transition-all flex items-center gap-2 shadow-xl shadow-white/5"
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} className="fill-gray-900" />}
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
                  <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
                    {events.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">No events yet</div> : events.slice(0, 15).map((ev, i) => (
                      <div key={i} className="flex gap-3 px-5 py-2.5 hover:bg-gray-50/50 transition-colors text-sm">
                        <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap pt-0.5">{new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="px-1.5 py-0.5 bg-teal-50 text-teal-600 text-[9px] font-bold uppercase rounded">{ev.agent}</span>
                            <span className="text-[10px] font-semibold text-gray-600 uppercase">{ev.event_type}</span>
                          </div>
                          <p className="text-xs text-gray-600 truncate">{ev.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Stock Forecast Preview */}
                <Section id="forecast" title="Stock Forecasts" icon={<TrendingUp size={16} />} badge={lowStockPredictions.length} isExpanded={expandedSections.forecast} onToggle={toggleSection}>
                  <div className="max-h-[400px] overflow-y-auto p-3 space-y-2">
                    {lowStockPredictions.length === 0 ? (
                      <div className="py-8 text-center"><CheckCircle size={28} className="mx-auto text-green-400 mb-2" /><p className="text-sm font-semibold text-gray-600">All stocks healthy</p></div>
                    ) : lowStockPredictions.slice(0, 8).map((pred, i) => {
                      const uc = getUrgencyColor(pred.urgency);
                      const daysLeft = pred.days_until_stockout || 0;
                      const ringColor = daysLeft <= 3 ? '#DC2626' : daysLeft <= 7 ? '#F59E0B' : '#14B8A6';
                      const pct = Math.max(0, Math.min(100, ((30 - Math.max(0, daysLeft)) / 30) * 100));
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-teal-200 transition-all hover:-translate-y-0.5">
                          <AdminRing pct={pct} size={40} strokeWidth={3.5} color={ringColor}>
                            <span className="text-[10px] font-bold" style={{ color: ringColor }}>{daysLeft}d</span>
                          </AdminRing>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-800 truncate">{pred.brand_name}</div>
                            <div className="text-[10px] text-gray-400 mb-1">Stock: {pred.current_stock} · {pred.units_per_day}/day</div>
                            <MiniBar value={30 - daysLeft} max={30} color={daysLeft <= 3 ? 'red' : daysLeft <= 7 ? 'amber' : 'teal'} showLabel={false} />
                          </div>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${uc}`}>{pred.urgency}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </div>

              {/* Webhook Logs */}
              <Section id="webhook" title="Webhook Traffic" icon={<MessageSquare size={16} />} badge={webhookLogs.length} isExpanded={expandedSections.webhook} onToggle={toggleSection}>
                <div className="max-h-[300px] overflow-y-auto">
                  {webhookLogs.length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No logs</div> : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 font-semibold uppercase"><tr><th className="px-4 py-2 text-left">Time</th><th className="px-4 py-2 text-left">Method</th><th className="px-4 py-2 text-left">Endpoint</th><th className="px-4 py-2 text-right">Payload</th></tr></thead>
                      <tbody className="divide-y divide-gray-50">{webhookLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-gray-50 font-mono">
                          <td className="px-4 py-2 text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                          <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded font-bold ${log.direction === 'outgoing' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{log.direction === 'outgoing' ? 'POST' : 'Recv'}</span></td>
                          <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{log.endpoint}</td>
                          <td className="px-4 py-2 text-right"><details className="inline-block"><summary className="text-teal-600 hover:text-teal-800 cursor-pointer font-medium">JSON</summary><div className="fixed right-8 mt-1 w-80 bg-gray-900 text-green-400 p-3 rounded-xl shadow-2xl z-50 text-xs overflow-auto max-h-72"><pre>{JSON.stringify(log.payload, null, 2)}</pre></div></details></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              </Section>
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

              {/* Inventory */}
              <Section id="inventory" title="Inventory" icon={<Package size={16} />} badge={medications.length}
                isExpanded={expandedSections.inventory} onToggle={toggleSection}
                actions={<div role="button" tabIndex={0} onClick={() => setShowAddMedModal(true)} onKeyDown={e => e.key === 'Enter' && setShowAddMedModal(true)} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-[11px] font-semibold hover:bg-teal-700 transition-colors flex items-center gap-1 cursor-pointer select-none"><Plus size={12} /> Add</div>}>
                <div className="max-h-[400px] overflow-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 text-gray-500 uppercase font-semibold sticky top-0"><tr><th className="px-4 py-2.5">Medication</th><th className="px-4 py-2.5">Package</th><th className="px-4 py-2.5 text-center">Stock</th><th className="px-4 py-2.5 text-center">Threshold</th><th className="px-4 py-2.5 text-center">RX</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">{medications.map(med => {
                      const sg = suggestedReorderForMed(med);
                      const threshold = med.reorder_threshold > 0 ? med.reorder_threshold : sg.threshold;
                      return (
                        <tr key={med.id} className={`hover:bg-teal-50/30 transition-colors ${med.stock_quantity <= 10 ? 'bg-red-50/40' : ''}`}>
                          <td className="px-4 py-2.5 font-medium text-gray-800">{med.product_name || '-'}</td>
                          <td className="px-4 py-2.5 text-gray-500"><span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">{med.package_size || '-'}</span></td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <input key={`stock-${med.id}-${med.stock_quantity}`} type="number" className={`w-16 px-2 py-1 rounded-lg border text-center text-xs ${med.stock_quantity <= 10 ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-700'}`} defaultValue={med.stock_quantity} onBlur={e => handleUpdateStock(med.id, e.target.value)} />
                              {med.stock_quantity <= 10 && <span className="text-red-500 text-[9px] font-bold animate-pulse">LOW</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-500">{threshold}</td>
                          <td className="px-4 py-2.5 text-center">{med.rx_required ? <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold">RX</span> : <span className="text-gray-300">—</span>}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </Section>

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
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Observability</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3 h-3 rounded-full ${observabilityStatus?.langfuse_enabled ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-gray-300'}`} />
                      <span className="text-sm font-medium text-gray-700">{observabilityStatus?.langfuse_enabled ? 'Langfuse Active' : 'Local Only'}</span>
                    </div>
                    <div className="text-xs text-gray-400">{traces.length} CoT traces • {executionLogs.length} events • {safetyDecisions.length} safety logs</div>
                  </div>
                </div>

                {/* RAG Quality */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:col-span-2">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2"><Brain size={16} className="text-purple-600" /><span className="text-xs font-semibold text-gray-500 uppercase">RAG Quality</span></div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleRunEval} disabled={loading || isEvaluating} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[11px] font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">{isEvaluating ? <><Loader2 className="animate-spin" size={12} /> Evaluating...</> : <><Zap size={12} /> Evaluate</>}</button>
                      <span className="text-[10px] text-gray-400 italic">ReAct eval coming soon</span>
                    </div>
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
                    <div className="grid grid-cols-3 gap-4">
                      {[{ name: 'Faithfulness', score: ragMetrics.latest.faithfulness_score, ring: '#22C55E' }, { name: 'Precision', score: ragMetrics.latest.context_precision_score, ring: '#3B82F6' }, { name: 'Relevancy', score: ragMetrics.latest.answer_relevancy_score, ring: '#8B5CF6' }].map(m => (
                        <div key={m.name} className="flex flex-col items-center text-center">
                          <AdminRing pct={m.score * 100} size={56} strokeWidth={5} color={m.ring}>
                            <span className="text-sm font-bold" style={{ color: m.ring }}>{(m.score * 100).toFixed(0)}%</span>
                          </AdminRing>
                          <span className="text-[10px] font-semibold text-gray-500 mt-2">{m.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-center py-4 bg-gray-50 rounded-xl text-xs text-gray-400">No metrics yet. Chat with the assistant first, then run evaluation. Need {ragMetrics?.history?.length || 0} samples.</div>}
                </div>
              </div>

              {/* Chain of Thought (CoT) */}
              <Section id="logs" title="Chain of Thought (CoT)" icon={<Activity size={16} />} badge={traces.length || executionLogs.length} isExpanded={expandedSections.logs} onToggle={toggleSection}>
                <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50">
                  {traces.map((trace, i) => (
                    <div key={`trace-${i}`} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-400">{new Date(trace.created_at || trace.timestamp || Date.now()).toLocaleTimeString()}</span>
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 font-bold text-[9px] uppercase rounded">TRACE</span>
                          {trace.latency_ms != null && <span className="text-[10px] text-gray-400">{trace.latency_ms} ms</span>}
                        </div>
                        {trace.public_url && <a href={trace.public_url} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 hover:underline">Open</a>}
                      </div>
                      <p className="text-xs text-gray-700 font-semibold truncate">{trace.name || 'Agent Turn'}</p>
                      <p className="text-[11px] text-gray-500 truncate">{trace.input_text || trace.metadata_json || ''}</p>
                    </div>
                  ))}
                  {executionLogs.map((log, i) => (
                    <div key={i} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</span>
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 font-bold text-[9px] uppercase rounded">{log.agent}</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => submitFeedback(log.trace_id || log.id, 'positive')} className="text-gray-300 hover:text-green-500 px-1"><ThumbsUp size={13} /></button>
                          <button onClick={() => submitFeedback(log.trace_id || log.id, 'negative')} className="text-gray-300 hover:text-red-500 px-1"><ThumbsDown size={13} /></button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-700">{log.message}</p>
                      {log.metadata && (
                        <details className="mt-1 text-[10px] text-gray-500"><summary className="cursor-pointer hover:text-teal-600">Metadata</summary><pre className="mt-1 bg-gray-900 text-gray-300 p-2 rounded-lg overflow-x-auto text-[10px]">{JSON.stringify(log.metadata, null, 2)}</pre></details>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
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
                  <thead className="bg-gray-50 text-gray-500 uppercase font-semibold sticky top-0"><tr><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Total (EUR)</th><th className="px-4 py-3">Frequency</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">{patientData.map((row, idx) => (
                    <tr key={row.order_id || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{row.customer_id || '-'}</span></td>
                      <td className="px-4 py-3 text-gray-600">{row.purchase_date ? new Date(row.purchase_date).toLocaleDateString() : '-'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{row.product_name || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.quantity ?? '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.line_total_eur != null ? Number(row.line_total_eur).toFixed(2) : '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{row.dosage_frequency || '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
