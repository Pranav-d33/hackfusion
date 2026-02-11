/**
 * Admin Dashboard - Professional Redesign (White & Teal Theme)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, BarChart2, ShoppingCart, RefreshCw, Package, Activity,
  Phone, Brain, Loader2, ThumbsUp, ThumbsDown, CheckCircle,
  X, Search, MessageSquare, TrendingUp, Truck, Users, AlertTriangle
} from 'lucide-react';

const API_BASE = '/api';

export default function AdminDashboard({ onSwitchToUser, user }) {
  const [activeTab, setActiveTab] = useState('activity');
  const [medications, setMedications] = useState([]);
  const [lowStockPredictions, setLowStockPredictions] = useState([]);
  const [procurementQueue, setProcurementQueue] = useState([]);
  const [refillAlerts, setRefillAlerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Observability state
  const [observabilityStatus, setObservabilityStatus] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [safetyDecisions, setSafetyDecisions] = useState([]);
  const [workflowTraces, setWorkflowTraces] = useState([]);
  const [ragMetrics, setRagMetrics] = useState(null);

  // New Medication Form State
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [newMed, setNewMed] = useState({
    brand_name: '',
    generic_name: '',
    dosage: '',
    stock_quantity: 0,
    rx_required: false,
    active_ingredient: '',
    form: 'tablet',
    unit_type: 'tablet'
  });

  // Refresh all data
  const refreshAllData = useCallback(() => {
    fetchMedications();
    fetchLowStockPredictions();
    fetchProcurementQueue();
    fetchRefillAlerts();
    fetchEvents();
    fetchWebhookLogs();
    if (activeTab === 'observability') {
      fetchObservabilityData();
      fetchRagMetrics();
    }
  }, [activeTab]);

  // Fetch data on mount and refresh events periodically
  useEffect(() => {
    refreshAllData();

    // Auto-refresh every 3 seconds
    const interval = setInterval(() => {
      fetchEvents();
      fetchWebhookLogs();
      if (activeTab === 'observability') {
        fetchObservabilityData();
        fetchRagMetrics();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchMedications = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/medications`);
      const data = await res.json();
      setMedications(data.medications || []);
    } catch (err) {
      console.error('Failed to fetch medications:', err);
    }
  };

  const fetchLowStockPredictions = async () => {
    try {
      const res = await fetch(`${API_BASE}/forecast/low-stock`);
      const data = await res.json();
      setLowStockPredictions(data.predictions || []);
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
    }
  };

  const fetchProcurementQueue = async () => {
    try {
      const res = await fetch(`${API_BASE}/procurement/queue`);
      const data = await res.json();
      setProcurementQueue(data.orders || []);
    } catch (err) {
      console.error('Failed to fetch procurement queue:', err);
    }
  };

  const fetchRefillAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/refill/alerts?days=14`);
      const data = await res.json();
      setRefillAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch refill alerts:', err);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/events?limit=30`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

  const fetchWebhookLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/webhooks/logs?limit=10`);
      const data = await res.json();
      setWebhookLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch webhook logs:', err);
    }
  };

  const fetchObservabilityData = async () => {
    try {
      const [statusRes, logsRes, safetyRes, workflowRes] = await Promise.all([
        fetch(`${API_BASE}/observability/status`),
        fetch(`${API_BASE}/observability/execution-logs?limit=30`),
        fetch(`${API_BASE}/observability/safety-decisions?limit=20`),
        fetch(`${API_BASE}/observability/workflow-traces?limit=20`),
      ]);

      const [status, logs, safety, workflows] = await Promise.all([
        statusRes.json(),
        logsRes.json(),
        safetyRes.json(),
        workflowRes.json(),
      ]);

      setObservabilityStatus(status);
      setExecutionLogs(logs.logs || []);
      setSafetyDecisions(safety.decisions || []);
      setWorkflowTraces(workflows.traces || []);
    } catch (err) {
      console.error('Failed to fetch observability data:', err);
    }
  };

  const generateProcurementOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/procurement/generate?urgency=attention`, {
        method: 'POST',
      });
      const data = await res.json();
      setMessage({ type: 'success', text: data.message });
      fetchProcurementQueue();
      fetchEvents();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to generate orders' });
    }
    setLoading(false);
  };

  const sendOrderToSupplier = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/procurement/${orderId}/send`, {
        method: 'POST',
      });
      const data = await res.json();
      setMessage({ type: 'success', text: data.message });
      fetchProcurementQueue();
      fetchEvents();
      fetchWebhookLogs();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to send order' });
    }
  };

  const markOrderReceived = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/procurement/${orderId}/receive`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: `${data.message} - Stock updated`
        });
        refreshAllData();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to mark received' });
    }
  };

  const fetchRagMetrics = async () => {
    try {
      const res = await fetch(`${API_BASE}/observability/rag-metrics`);
      const data = await res.json();
      setRagMetrics(data);
    } catch (err) {
      console.error('Failed to fetch RAG metrics:', err);
    }
  };

  const handleRunEval = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/observability/run-eval`, { method: 'POST' });
      const data = await res.json();
      setMessage({ type: 'success', text: data.message });
      // Poll for updates a few times
      let checks = 0;
      const interval = setInterval(() => {
        fetchRagMetrics();
        checks++;
        if (checks > 5) clearInterval(interval);
      }, 2000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to trigger evaluation' });
    }
    setLoading(false);
  };

  const submitFeedback = async (traceId, rating) => {
    try {
      await fetch(`${API_BASE}/observability/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trace_id: traceId, rating }),
      });
      setMessage({ type: 'success', text: 'Feedback recorded' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to submit feedback' });
    }
  };

  const handleCreateMedication = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/medications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: newMed.brand_name,
          generic_name: newMed.generic_name,
          active_ingredient: newMed.active_ingredient || newMed.generic_name,
          dosage: newMed.dosage,
          form: newMed.form,
          unit_type: newMed.unit_type,
          rx_required: newMed.rx_required,
          notes: "Added manually via Admin Panel"
        })
      });

      if (!res.ok) throw new Error("Failed to create medication");
      const data = await res.json();

      if (newMed.stock_quantity > 0) {
        await fetch(`${API_BASE}/admin/inventory/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock_quantity: parseInt(newMed.stock_quantity) })
        });
      }

      setMessage({ type: 'success', text: 'Medication added successfully' });
      setShowAddMedModal(false);
      setNewMed({
        brand_name: '',
        generic_name: '',
        dosage: '',
        stock_quantity: 0,
        rx_required: false,
        active_ingredient: '',
        form: 'tablet',
        unit_type: 'tablet'
      });
      fetchMedications();
      if (activeTab === 'inventory') fetchMedications();
      if (activeTab === 'forecast') fetchLowStockPredictions();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to add medication' });
    }
  };

  const handleUpdateStock = async (id, qty) => {
    try {
      await fetch(`${API_BASE}/admin/inventory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_quantity: parseInt(qty) })
      });
      setMessage({ type: 'success', text: 'Stock updated' });
      fetchMedications();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update stock' });
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'attention': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-800';
      case 'ordered': return 'bg-blue-100 text-blue-800';
      case 'received': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const menus = [
    { id: 'activity', label: 'Activity Feed', icon: <Zap size={20} />, count: events.length },
    { id: 'forecast', label: 'Forecast', icon: <TrendingUp size={20} />, count: lowStockPredictions.length },
    { id: 'procurement', label: 'Procurement', icon: <ShoppingCart size={20} />, count: procurementQueue.length > 0 ? procurementQueue.length : null },
    { id: 'refills', label: 'Customer Refills', icon: <RefreshCw size={20} />, count: refillAlerts.length > 0 ? refillAlerts.length : null },
    { id: 'inventory', label: 'Inventory', icon: <Package size={20} /> },
    { id: 'observability', label: 'Observability', icon: <Activity size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg">
        <div className="p-6 flex items-center gap-3 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xl">M</div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Mediloon Admin</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menus.map(menu => (
            <button
              key={menu.id}
              onClick={() => setActiveTab(menu.id)}
              className={`
                        w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group
                        ${activeTab === menu.id
                  ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm ring-1 ring-teal-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
                    `}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg opacity-80 group-hover:scale-110 transition-transform">{menu.icon}</span>
                <span>{menu.label}</span>
              </div>
              {menu.count && (
                <span className={`
                            px-2 py-0.5 rounded-full text-xs font-bold
                            ${activeTab === menu.id ? 'bg-teal-200 text-teal-800' : 'bg-gray-100 text-gray-600'}
                        `}>
                  {menu.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-2">
          <div className="px-4 py-3 bg-gray-50 rounded-xl mb-2">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Logged in as</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs">
                {user?.name?.[0] || 'A'}
              </div>
              <span className="text-sm font-medium text-gray-700">{user?.name || 'Admin User'}</span>
            </div>
          </div>
          <button
            onClick={onSwitchToUser}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors shadow-lg hover:shadow-xl active:scale-95"
          >
            <span>Switch to User View</span>
            <Users className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-50/50">

        {/* Top Header for Context */}
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shadow-sm z-0">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            {menus.find(m => m.id === activeTab)?.icon}
            {menus.find(m => m.id === activeTab)?.label}
          </h2>
          <div className="flex items-center gap-4">
            <button
              onClick={refreshAllData}
              className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
              title="Refresh Data"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <div className="h-6 w-px bg-gray-200"></div>
            <span className="text-sm text-gray-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {message && (
            <div className={`mb-6 p-4 rounded-xl flex items-center justify-between shadow-sm animate-fade-in-up ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              <span className="font-medium">{message.text}</span>
              <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100"><X size={18} /></button>
            </div>
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                <div>
                  <h3 className="font-bold text-gray-800">Inventory Overview</h3>
                  <p className="text-sm text-gray-500">Manage stock levels and add new products</p>
                </div>
                <button
                  onClick={() => setShowAddMedModal(true)}
                  className="px-6 py-2.5 bg-teal-600 text-white rounded-xl shadow-lg shadow-teal-200 hover:bg-teal-700 hover:shadow-xl transition-all active:scale-95 font-medium flex items-center gap-2"
                >
                  <span>+</span> Add Medication
                </button>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                      <th className="px-6 py-4">Medication</th>
                      <th className="px-6 py-4">Generic</th>
                      <th className="px-6 py-4">Dosage</th>
                      <th className="px-6 py-4 text-center">Stock Level</th>
                      <th className="px-6 py-4 text-center">RX Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {medications.map((med) => (
                      <tr key={med.id} className={`hover:bg-teal-50/30 transition-colors ${med.stock_quantity <= 10 ? 'bg-red-50/50' : ''}`}>
                        <td className="px-6 py-4 font-medium text-gray-900">{med.brand_name}</td>
                        <td className="px-6 py-4 text-gray-600">{med.generic_name}</td>
                        <td className="px-6 py-4 text-gray-500">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">{med.dosage}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="inline-flex items-center gap-2">
                            <input
                              type="number"
                              className={`w-20 px-3 py-1.5 rounded-lg border text-center transition-all focus:ring-2 focus:ring-teal-500/20 ${med.stock_quantity <= 10 ? 'border-red-300 text-red-600 bg-white' : 'border-gray-200 text-gray-800 bg-gray-50'}`}
                              defaultValue={med.stock_quantity}
                              onBlur={(e) => handleUpdateStock(med.id, e.target.value)}
                            />
                            {med.stock_quantity <= 10 && <span className="text-red-500 text-xs font-bold animate-pulse">LOW</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {med.rx_required ? (
                            <span className="inline-flex px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">YES</span>
                          ) : (
                            <span className="inline-flex px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">NO</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Other Tabs Placeholder to be filled... reusing logic from previous implementation but with new UI */}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in-up">
              <div className="bg-white rounded-3xl shadow-md border border-gray-200 overflow-hidden flex flex-col h-[600px]">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    Live Events Feed
                  </h3>
                  <span className="text-xs font-mono text-gray-400">REALTIME</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {events.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">No events recorded yet.</div>
                  ) : (
                    events.map((event, i) => (
                      <div key={i} className="flex gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                        <div className="text-xs font-mono text-gray-400 whitespace-nowrap pt-1">
                          {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider">{event.agent}</span>
                            <span className="text-xs font-semibold text-gray-900 uppercase">{event.event_type}</span>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed font-norma">{event.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-md border border-gray-200 overflow-hidden flex flex-col h-[600px]">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-gray-800">Webhook Traffic</h3>
                  <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-mono">HTTP/1.1</span>
                </div>
                <div className="flex-1 overflow-y-auto p-0">
                  {webhookLogs.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">No webhook logs available.</div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Method</th>
                          <th className="px-4 py-3">Endpoint</th>
                          <th className="px-4 py-3 text-right">Payload</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {webhookLogs.map((log, i) => (
                          <tr key={i} className="hover:bg-gray-50 font-mono text-xs">
                            <td className="px-4 py-3 text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                            <td className="px-4 py-3">
                              <span className={`px-1.5 py-0.5 rounded font-bold ${log.direction === 'outgoing' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                {log.direction === 'outgoing' ? 'POST' : 'Recv'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700 truncate max-w-[150px]" title={log.endpoint}>{log.endpoint}</td>
                            <td className="px-4 py-3 text-right">
                              <details className="cursor-pointer group relative inline-block text-left">
                                <summary className="list-none text-teal-600 hover:text-teal-800 font-medium">View JSON</summary>
                                <div className="fixed right-10 mt-2 w-96 bg-gray-900 text-green-400 p-4 rounded-xl shadow-2xl z-50 text-xs overflow-auto max-h-96 hidden group-open:block">
                                  <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                                </div>
                              </details>
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

          {/* Forecast Tab */}
          {activeTab === 'forecast' && (
            <div className="animate-fade-in-up">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {lowStockPredictions.map((pred, i) => {
                  const colorClass = getUrgencyColor(pred.urgency);
                  return (
                    <div key={i} className={`bg-white p-6 rounded-3xl shadow-sm border-l-4 hover:shadow-md transition-shadow ${colorClass.split(' ')[2]}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-bold text-lg text-gray-900">{pred.brand_name}</h4>
                          <p className="text-sm text-gray-500">Predicted Stockout</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${colorClass.split(' ')[0]} ${colorClass.split(' ')[1]}`}>
                          {pred.urgency}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Current Stock</span>
                          <span className="font-mono font-medium">{pred.current_stock}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Velocity</span>
                          <span className="font-mono font-medium">{pred.units_per_day}/day</span>
                        </div>
                        <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-400 uppercase">Empty In</span>
                          <span className="text-xl font-bold text-gray-900">{pred.days_until_stockout} days</span>
                        </div>
                        <div className="text-xs text-center text-teal-600 bg-teal-50 py-2 rounded-lg font-medium">
                          Expected: {pred.predicted_stockout_date}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {lowStockPredictions.length === 0 && (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle size={32} /></div>
                  <h3 className="text-xl font-bold text-gray-800">No Risk Detected</h3>
                  <p className="text-gray-500">Inventory levels are healthy for the next 14 days.</p>
                </div>
              )}
            </div>
          )}

          {/* Procurement */}
          {activeTab === 'procurement' && (
            <div className="animate-fade-in-up space-y-6">
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                <div>
                  <h3 className="font-bold text-gray-800">Procurement Orders</h3>
                  <p className="text-sm text-gray-500">Manage supplier orders and deliveries</p>
                </div>
                <button
                  onClick={generateProcurementOrders}
                  disabled={loading}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-xl shadow-lg hover:bg-gray-800 transition-all font-medium flex items-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />} Auto-Generate Orders
                </button>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Order Details</th>
                      <th className="px-6 py-4">Supplier</th>
                      <th className="px-6 py-4">Est. Delivery</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {procurementQueue.map((order) => {
                      const statusClass = getStatusColor(order.status);
                      return (
                        <tr key={order.order_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusClass}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{order.brand_name}</div>
                            <div className="text-sm text-gray-500">{order.quantity || order.order_quantity} units</div>
                          </td>
                          <td className="px-6 py-4 font-medium text-gray-700">{order.supplier_name || order.supplier?.name}</td>
                          <td className="px-6 py-4 text-gray-600">{order.estimated_delivery || '-'}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {order.status === 'pending' && (
                                <button onClick={() => sendOrderToSupplier(order.order_id)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">Send</button>
                              )}
                              {order.status === 'ordered' && (
                                <button onClick={() => markOrderReceived(order.order_id)} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm">Received</button>
                              )}
                              {order.status === 'received' && (
                                <span className="text-xs text-gray-400 font-mono">Completed</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {procurementQueue.length === 0 && (
                  <div className="text-center py-12 text-gray-400">No active orders</div>
                )}
              </div>
            </div>
          )}

          {/* Refills */}
          {activeTab === 'refills' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
              {refillAlerts.map((alert, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-all relative overflow-hidden group">
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${alert.days_until_depletion <= 3 ? 'bg-red-500' : 'bg-amber-400'}`}></div>
                  <div className="pl-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-lg text-gray-900">{alert.customer_name}</h4>
                      <a href={`tel:${alert.customer_phone}`} className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100">
                        <Phone size={16} />
                      </a>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">{alert.customer_phone}</p>

                    <div className="bg-gray-50 rounded-xl p-3 mb-4">
                      <div className="font-medium text-gray-800">{alert.brand_name}</div>
                      <div className="text-xs text-gray-500">{alert.dosage}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${alert.days_until_depletion <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {alert.days_until_depletion <= 0 ? 'EMPTY' : `${alert.days_until_depletion} days left`}
                      </span>
                      <span className="text-xs text-gray-400">Due: {alert.depletion_date}</span>
                    </div>
                  </div>
                </div>
              ))}
              {refillAlerts.length === 0 && (
                <div className="col-span-full text-center py-20 text-gray-400">No customer refills due.</div>
              )}
            </div>
          )}

          {/* Observability */}
          {activeTab === 'observability' && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-800 mb-4">Execution Status</h3>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${observabilityStatus?.langfuse_enabled ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-gray-300'}`}></div>
                    <span className="font-medium text-gray-700">{observabilityStatus?.langfuse_enabled ? 'Langfuse Connected' : 'Langfuse Disconnected'}</span>
                  </div>
                </div>

                {/* RAG Intelligence Card */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 lg:col-span-2">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Brain className="text-purple-600" size={24} /> RAG Intelligence & Quality
                      </h3>
                      <p className="text-sm text-gray-500">Automated evaluation of retrieval quality and hallucination using RAGAS.</p>
                    </div>
                    <button
                      onClick={handleRunEval}
                      disabled={loading}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl transition-all active:scale-95 text-sm font-bold flex items-center gap-2"
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />} Run Quality Check
                    </button>
                  </div>

                  {ragMetrics?.latest ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-gray-600">Faithfulness</span>
                          <span className={`${ragMetrics.latest.faithfulness_score >= 0.8 ? 'text-green-600' : 'text-amber-600'}`}>
                            {(ragMetrics.latest.faithfulness_score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${ragMetrics.latest.faithfulness_score >= 0.8 ? 'bg-green-500' : 'bg-amber-500'}`}
                            style={{ width: `${ragMetrics.latest.faithfulness_score * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-400">Measures if answer is derived from context (Anti-Hallucination)</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-gray-600">Context Precision</span>
                          <span className={`${ragMetrics.latest.context_precision_score >= 0.7 ? 'text-blue-600' : 'text-amber-600'}`}>
                            {(ragMetrics.latest.context_precision_score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${ragMetrics.latest.context_precision_score >= 0.7 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${ragMetrics.latest.context_precision_score * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-400">Measures if retrieved documents are relevant to the query</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-gray-600">Answer Relevancy</span>
                          <span className={`${ragMetrics.latest.answer_relevancy_score >= 0.8 ? 'text-purple-600' : 'text-amber-600'}`}>
                            {(ragMetrics.latest.answer_relevancy_score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${ragMetrics.latest.answer_relevancy_score >= 0.8 ? 'bg-purple-500' : 'bg-amber-500'}`}
                            style={{ width: `${ragMetrics.latest.answer_relevancy_score * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-400">Measures if the answer directly addresses the user question</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <p className="text-gray-500 mb-2">No evaluation data available yet.</p>
                      <p className="text-xs text-gray-400">Run a quality check to generate baseline metrics.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h3 className="font-bold text-gray-800">Agent Execution Logs</h3>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {executionLogs.map((log, i) => (
                    <div key={i} className="p-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</span>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] uppercase tracking-wide">{log.agent}</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => submitFeedback(log.trace_id || log.id, 'positive')} className="text-gray-300 hover:text-green-500 px-2"><ThumbsUp size={16} /></button>
                          <button onClick={() => submitFeedback(log.trace_id || log.id, 'negative')} className="text-gray-300 hover:text-red-500 px-2"><ThumbsDown size={16} /></button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 font-medium">{log.message}</p>
                      {log.metadata && (
                        <details className="mt-2 text-xs text-gray-500">
                          <summary className="cursor-pointer hover:text-teal-600">Show Metadata</summary>
                          <pre className="mt-2 bg-gray-900 text-gray-300 p-2 rounded-lg overflow-x-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main >

      {/* Add Medication Modal */}
      {showAddMedModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg border border-gray-100 animate-zoom-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-800">Add New Medication</h3>
              <button onClick={() => setShowAddMedModal(false)} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateMedication} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Brand Name</label>
                  <input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all" value={newMed.brand_name} onChange={e => setNewMed({ ...newMed, brand_name: e.target.value })} placeholder="e.g. Panado" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Generic</label>
                  <input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all" value={newMed.generic_name} onChange={e => setNewMed({ ...newMed, generic_name: e.target.value })} placeholder="e.g. Paracetamol" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Dosage</label>
                  <input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all" value={newMed.dosage} onChange={e => setNewMed({ ...newMed, dosage: e.target.value })} placeholder="e.g. 500mg" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Stock Qty</label>
                  <input type="number" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all" value={newMed.stock_quantity} onChange={e => setNewMed({ ...newMed, stock_quantity: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <input type="checkbox" id="rx" className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500" checked={newMed.rx_required} onChange={e => setNewMed({ ...newMed, rx_required: e.target.checked })} />
                <label htmlFor="rx" className="font-medium text-gray-700 cursor-pointer select-none">Prescription Required (RX)</label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowAddMedModal(false)} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transiton-colors">Cancel</button>
                <button type="submit" className="px-8 py-3 bg-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-teal-700 transition-all active:scale-95">Add Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div >
  );
}
