/**
 * Admin Dashboard - Professional Redesign
 * Dedicated admin page with inventory, forecast, procurement, and observability management.
 */
import React, { useState, useEffect, useCallback } from 'react';

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
        // Refresh all data after receiving order
        refreshAllData();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to mark received' });
    }
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
      // 1. Create Medication
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

      // 2. Update Inventory
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
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to add medication' });
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'critical': return '#dc2626';
      case 'warning': return '#d97706';
      case 'attention': return '#2563eb';
      default: return '#16a34a';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#d97706';
      case 'ordered': return '#2563eb';
      case 'received': return '#16a34a';
      case 'cancelled': return '#dc2626';
      default: return '#6b7280';
    }
  };

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="header-left">
          <h1>Mediloon Admin</h1>
          <span className="user-badge admin">Admin: {user?.name || 'Admin'}</span>
        </div>
        <div className="header-actions">
          <button className="refresh-btn" onClick={refreshAllData}>
            Refresh
          </button>
          <button className="switch-view-btn" onClick={onSwitchToUser}>
            Switch to User View
          </button>
        </div>
      </header>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      <nav className="admin-tabs">
        <button
          className={activeTab === 'activity' ? 'active' : ''}
          onClick={() => setActiveTab('activity')}
        >
          Activity Feed {events.length > 0 && <span className="badge">{events.length}</span>}
        </button>
        <button
          className={activeTab === 'forecast' ? 'active' : ''}
          onClick={() => setActiveTab('forecast')}
        >
          Forecast
        </button>
        <button
          className={activeTab === 'procurement' ? 'active' : ''}
          onClick={() => setActiveTab('procurement')}
        >
          Procurement
        </button>
        <button
          className={activeTab === 'refills' ? 'active' : ''}
          onClick={() => setActiveTab('refills')}
        >
          Customer Refills
        </button>
        <button
          className={activeTab === 'inventory' ? 'active' : ''}
          onClick={() => setActiveTab('inventory')}
        >
          Inventory
        </button>
        <button
          className={activeTab === 'observability' ? 'active' : ''}
          onClick={() => { setActiveTab('observability'); fetchObservabilityData(); }}
        >
          Observability
        </button>
      </nav>

      <main className="admin-content">
        {/* Activity Feed Tab */}
        {activeTab === 'activity' && (
          <div className="activity-section">
            <div className="section-header">
              <h2>Live Activity Feed</h2>
              <p>Real-time agent actions and system events</p>
            </div>

            <div className="activity-grid">
              <div className="events-panel">
                <h3>Events Log</h3>
                {events.length === 0 ? (
                  <div className="empty-state">No events yet. Generate some orders to see activity.</div>
                ) : (
                  <div className="events-list">
                    {events.map((event, i) => (
                      <div key={i} className={`event-item ${event.event_type.toLowerCase()}`}>
                        <div className="event-time">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </div>
                        <div className="event-content">
                          <span className="event-agent">[{event.agent}]</span>
                          <span className="event-message">{event.message.replace(/[^\w\s:→\-+]/g, '')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="webhooks-panel">
                <h3>Webhook Traffic</h3>
                {webhookLogs.length === 0 ? (
                  <div className="empty-state">No webhooks yet. Send an order to see HTTP traffic.</div>
                ) : (
                  <div className="webhook-list">
                    {webhookLogs.map((log, i) => (
                      <div key={i} className={`webhook-item ${log.direction}`}>
                        <div className="webhook-header">
                          <span className={`direction-badge ${log.direction}`}>
                            {log.direction === 'outgoing' ? 'OUT' : 'IN'}
                          </span>
                          <span className="webhook-time">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="webhook-endpoint">{log.endpoint}</div>
                        <details className="webhook-details">
                          <summary>View Payload</summary>
                          <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                        </details>
                        {log.response && (
                          <details className="webhook-details">
                            <summary>View Response</summary>
                            <pre>{JSON.stringify(log.response, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Forecast Tab */}
        {activeTab === 'forecast' && (
          <div className="forecast-section">
            <div className="section-header">
              <h2>Stock Depletion Forecast</h2>
              <p>Medications predicted to run out within 14 days</p>
            </div>

            {lowStockPredictions.length === 0 ? (
              <div className="empty-state">
                All stock levels healthy. No predicted shortages.
              </div>
            ) : (
              <div className="forecast-grid">
                {lowStockPredictions.map((pred, i) => (
                  <div key={i} className="forecast-card" style={{ borderLeftColor: getUrgencyColor(pred.urgency) }}>
                    <div className="forecast-header">
                      <span className="medication-name">{pred.brand_name}</span>
                      <span className="urgency-badge" style={{ backgroundColor: getUrgencyColor(pred.urgency) }}>
                        {pred.urgency}
                      </span>
                    </div>
                    <div className="forecast-details">
                      <div className="detail-row">
                        <span>Current Stock:</span>
                        <strong>{pred.current_stock} units</strong>
                      </div>
                      <div className="detail-row">
                        <span>Daily Sales:</span>
                        <strong>{pred.units_per_day} units/day</strong>
                      </div>
                      <div className="detail-row">
                        <span>Depletes in:</span>
                        <strong>{pred.days_until_stockout} days</strong>
                      </div>
                      <div className="detail-row">
                        <span>Predicted Date:</span>
                        <strong>{pred.predicted_stockout_date}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Procurement Tab */}
        {activeTab === 'procurement' && (
          <div className="procurement-section">
            <div className="section-header">
              <h2>Procurement Queue</h2>
              <button
                className="generate-btn"
                onClick={generateProcurementOrders}
                disabled={loading}
              >
                {loading ? 'Generating...' : 'Auto-Generate Orders'}
              </button>
            </div>

            {procurementQueue.length === 0 ? (
              <div className="empty-state">
                No procurement orders yet. Click "Auto-Generate Orders" to create orders for low-stock items.
              </div>
            ) : (
              <table className="procurement-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Medication</th>
                    <th>Quantity</th>
                    <th>Supplier</th>
                    <th>Status</th>
                    <th>Est. Delivery</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {procurementQueue.map((order) => (
                    <tr key={order.order_id}>
                      <td><code>{order.order_id}</code></td>
                      <td>{order.brand_name}</td>
                      <td>{order.quantity || order.order_quantity} units</td>
                      <td>{order.supplier_name || order.supplier?.name}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: getStatusColor(order.status) }}>
                          {order.status}
                        </span>
                      </td>
                      <td>{order.estimated_delivery || '-'}</td>
                      <td className="actions-cell">
                        {order.status === 'pending' && (
                          <button
                            className="action-btn send"
                            onClick={() => sendOrderToSupplier(order.order_id)}
                          >
                            Send
                          </button>
                        )}
                        {order.status === 'ordered' && (
                          <button
                            className="action-btn receive"
                            onClick={() => markOrderReceived(order.order_id)}
                          >
                            Mark Received
                          </button>
                        )}
                        {order.status === 'received' && order.stock_before !== undefined && (
                          <span className="stock-change">
                            {order.stock_before} → {order.stock_after}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Customer Refills Tab */}
        {activeTab === 'refills' && (
          <div className="refills-section">
            <div className="section-header">
              <h2>Customer Refill Alerts</h2>
              <p>Customers whose medications are running low</p>
            </div>

            {refillAlerts.length === 0 ? (
              <div className="empty-state">
                No refill alerts at this time.
              </div>
            ) : (
              <div className="refill-list">
                {refillAlerts.map((alert, i) => (
                  <div key={i} className="refill-card" style={{ borderLeftColor: getUrgencyColor(alert.urgency) }}>
                    <div className="refill-customer">
                      <strong>{alert.customer_name}</strong>
                      <span>{alert.customer_phone}</span>
                    </div>
                    <div className="refill-medication">
                      {alert.brand_name} ({alert.dosage})
                    </div>
                    <div className="refill-timing">
                      <span className="urgency-badge" style={{ backgroundColor: getUrgencyColor(alert.urgency) }}>
                        {alert.days_until_depletion <= 0 ? 'OUT' : `${alert.days_until_depletion} days`}
                      </span>
                      <span className="depletion-date">Depletes: {alert.depletion_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="inventory-section">
            <div className="section-header">
              <h2>Inventory Management</h2>
              <button
                className="generate-btn"
                onClick={() => setShowAddMedModal(true)}
              >
                + Add Medication
              </button>
            </div>

            {showAddMedModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-bold mb-4 text-white">Add New Medication</h3>
                  <form onSubmit={handleCreateMedication} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Brand Name</label>
                        <input
                          type="text"
                          required
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                          value={newMed.brand_name}
                          onChange={e => setNewMed({ ...newMed, brand_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Generic Name</label>
                        <input
                          type="text"
                          required
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                          value={newMed.generic_name}
                          onChange={e => setNewMed({ ...newMed, generic_name: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Dosage</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 500mg"
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                          value={newMed.dosage}
                          onChange={e => setNewMed({ ...newMed, dosage: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Stock Qty</label>
                        <input
                          type="number"
                          required
                          min="0"
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                          value={newMed.stock_quantity}
                          onChange={e => setNewMed({ ...newMed, stock_quantity: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                          checked={newMed.rx_required}
                          onChange={e => setNewMed({ ...newMed, rx_required: e.target.checked })}
                        />
                        <span className="text-sm text-gray-300">Prescription Required (RX)</span>
                      </label>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                      <button
                        type="button"
                        onClick={() => setShowAddMedModal(false)}
                        className="px-4 py-2 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 font-medium"
                      >
                        Add Medication
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Generic Name</th>
                  <th>Dosage</th>
                  <th>Stock</th>
                  <th>RX Required</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((med) => (
                  <tr key={med.id} className={med.stock_quantity <= 10 ? 'low-stock' : ''}>
                    <td>{med.brand_name}</td>
                    <td>{med.generic_name}</td>
                    <td>{med.dosage}</td>
                    <td>
                      <span className={med.stock_quantity <= 10 ? 'stock-warning' : ''}>
                        <input
                          type="number"
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-20 text-center text-white"
                          defaultValue={med.stock_quantity}
                          onBlur={(e) => handleUpdateStock(med.id, e.target.value)}
                        />
                        <span className="text-xs text-gray-500 ml-2">units</span>
                      </span>
                    </td>
                    <td>{med.rx_required ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Observability Tab */}
        {activeTab === 'observability' && (
          <div className="observability-section">
            <div className="section-header">
              <h2>Observability Dashboard</h2>
              <div className="obs-status">
                {observabilityStatus && (
                  <span className={`status-indicator ${observabilityStatus.langfuse_enabled ? 'enabled' : 'disabled'}`}>
                    Langfuse: {observabilityStatus.langfuse_enabled ? 'Connected' : 'Not Configured'}
                  </span>
                )}
              </div>
            </div>

            <div className="observability-grid">
              {/* Execution Logs */}
              <div className="obs-panel execution-logs">
                <h3>Agent Execution Log</h3>
                <p className="panel-subtitle">Trace agent steps and tool calls</p>
                {executionLogs.length === 0 ? (
                  <div className="empty-state">No execution logs yet.</div>
                ) : (
                  <div className="log-list">
                    {executionLogs.map((log, i) => (
                      <div key={i} className="log-item">
                        <div className="log-header">
                          <span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span>
                          <span className="log-type">{log.event_type}</span>
                        </div>
                        <div className="log-agent">{log.agent}</div>
                        <div className="log-message">{log.message.replace(/[^\w\s:→\-+.]/g, '')}</div>
                        {log.metadata && (
                          <details className="log-metadata">
                            <summary>Metadata</summary>
                            <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                          </details>
                        )}
                        <div className="feedback-buttons">
                          <button
                            className="feedback-btn positive"
                            onClick={() => submitFeedback(log.id?.toString() || `log-${i}`, 'positive')}
                            title="Good response"
                          >
                            +
                          </button>
                          <button
                            className="feedback-btn negative"
                            onClick={() => submitFeedback(log.id?.toString() || `log-${i}`, 'negative')}
                            title="Poor response"
                          >
                            -
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Safety Decisions */}
              <div className="obs-panel safety-decisions">
                <h3>RX Safety Decisions</h3>
                <p className="panel-subtitle">Prescription validation audit log</p>
                {safetyDecisions.length === 0 ? (
                  <div className="empty-state">No safety decisions logged yet.</div>
                ) : (
                  <div className="safety-list">
                    {safetyDecisions.map((decision, i) => (
                      <div key={i} className="safety-item">
                        <div className="safety-header">
                          <span className="safety-time">{new Date(decision.created_at).toLocaleTimeString()}</span>
                          <span className="safety-type">{decision.event_type}</span>
                        </div>
                        <div className="safety-message">{decision.message.replace(/[^\w\s:→\-+.]/g, '')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Workflow Traces */}
              <div className="obs-panel workflow-traces">
                <h3>Workflow Traces</h3>
                <p className="panel-subtitle">Procurement and refill workflow tracking</p>
                {workflowTraces.length === 0 ? (
                  <div className="empty-state">No workflow traces yet.</div>
                ) : (
                  <div className="workflow-list">
                    {workflowTraces.map((trace, i) => (
                      <div key={i} className="workflow-item">
                        <div className="workflow-header">
                          <span className="workflow-time">{new Date(trace.created_at).toLocaleTimeString()}</span>
                          <span className="workflow-agent">{trace.agent}</span>
                        </div>
                        <div className="workflow-message">{trace.message.replace(/[^\w\s:→\-+.]/g, '')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Langfuse Link */}
            {observabilityStatus?.langfuse_enabled && observabilityStatus?.langfuse_host && (
              <div className="langfuse-link">
                <a
                  href={observabilityStatus.langfuse_host}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="external-link"
                >
                  Open Langfuse Dashboard
                </a>
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        .admin-dashboard {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #e2e8f0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background: rgba(15, 23, 42, 0.8);
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          backdrop-filter: blur(8px);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-left h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #f1f5f9;
        }

        .header-actions {
          display: flex;
          gap: 0.75rem;
        }

        .user-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .user-badge.admin {
          background: linear-gradient(135deg, #4f46e5, #3730a3);
          color: #fff;
        }

        .refresh-btn {
          padding: 0.5rem 1rem;
          background: rgba(71, 85, 105, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 6px;
          color: #e2e8f0;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: rgba(71, 85, 105, 0.7);
        }

        .switch-view-btn {
          padding: 0.5rem 1rem;
          background: rgba(71, 85, 105, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 6px;
          color: #e2e8f0;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .switch-view-btn:hover {
          background: rgba(71, 85, 105, 0.7);
        }

        .message {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          margin: 1rem 2rem;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .message.success { 
          background: rgba(22, 163, 74, 0.15); 
          border: 1px solid rgba(22, 163, 74, 0.4);
          color: #4ade80;
        }
        .message.error { 
          background: rgba(220, 38, 38, 0.15); 
          border: 1px solid rgba(220, 38, 38, 0.4);
          color: #f87171;
        }

        .message button {
          background: none;
          border: none;
          color: inherit;
          font-size: 1.2rem;
          cursor: pointer;
          padding: 0 0.5rem;
        }

        .admin-tabs {
          display: flex;
          gap: 0.25rem;
          padding: 1rem 2rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          background: rgba(15, 23, 42, 0.5);
        }

        .admin-tabs button {
          padding: 0.625rem 1.25rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: #94a3b8;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .admin-tabs button:hover {
          background: rgba(71, 85, 105, 0.3);
          color: #e2e8f0;
        }

        .admin-tabs button.active {
          background: rgba(79, 70, 229, 0.2);
          border-color: #4f46e5;
          color: #a5b4fc;
        }

        .admin-content {
          padding: 2rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .section-header h2 { 
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #f1f5f9;
        }
        .section-header p { 
          margin: 0.25rem 0 0;
          color: #64748b;
          font-size: 0.875rem;
        }

        .generate-btn {
          padding: 0.625rem 1.25rem;
          background: linear-gradient(135deg, #4f46e5, #3730a3);
          border: none;
          border-radius: 6px;
          color: #fff;
          cursor: pointer;
          font-weight: 500;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .generate-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }

        .generate-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .empty-state {
          padding: 2.5rem;
          text-align: center;
          background: rgba(30, 41, 59, 0.5);
          border-radius: 8px;
          color: #64748b;
          font-size: 0.875rem;
        }

        .forecast-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .forecast-card {
          background: rgba(30, 41, 59, 0.6);
          border-radius: 8px;
          padding: 1rem;
          border-left: 4px solid;
        }

        .forecast-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .medication-name {
          font-weight: 600;
          font-size: 1rem;
          color: #f1f5f9;
        }

        .urgency-badge, .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          text-transform: uppercase;
          font-weight: 600;
          color: #fff;
        }

        .forecast-details .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          font-size: 0.875rem;
        }

        .forecast-details .detail-row:last-child {
          border-bottom: none;
        }

        .forecast-details .detail-row span {
          color: #94a3b8;
        }

        .forecast-details .detail-row strong {
          color: #e2e8f0;
        }

        .procurement-table, .inventory-table {
          width: 100%;
          border-collapse: collapse;
          background: rgba(30, 41, 59, 0.5);
          border-radius: 8px;
          overflow: hidden;
        }

        .procurement-table th, .inventory-table th {
          background: rgba(15, 23, 42, 0.8);
          padding: 0.875rem 1rem;
          text-align: left;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
        }

        .procurement-table td, .inventory-table td {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          font-size: 0.875rem;
        }

        .procurement-table code {
          background: rgba(15, 23, 42, 0.8);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
          color: #a5b4fc;
        }

        .action-btn {
          padding: 0.375rem 0.75rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .action-btn.send {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #fff;
        }

        .action-btn.receive {
          background: linear-gradient(135deg, #16a34a, #15803d);
          color: #fff;
        }

        .stock-change {
          font-size: 0.85rem;
          color: #4ade80;
          font-weight: 500;
        }

        .refill-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .refill-card {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 1rem;
          align-items: center;
          padding: 1rem;
          background: rgba(30, 41, 59, 0.5);
          border-radius: 8px;
          border-left: 4px solid;
        }

        .refill-customer strong { 
          display: block;
          color: #f1f5f9;
        }
        .refill-customer span { 
          color: #64748b;
          font-size: 0.85rem;
        }

        .refill-timing {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }

        .depletion-date { 
          font-size: 0.8rem;
          color: #64748b;
        }

        .low-stock { 
          background: rgba(220, 38, 38, 0.1);
        }
        .stock-warning { 
          color: #f87171;
          font-weight: 600;
        }

        /* Activity Feed Styles */
        .activity-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .events-panel, .webhooks-panel {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 8px;
          padding: 1rem;
          max-height: 500px;
          overflow-y: auto;
        }

        .events-panel h3, .webhooks-panel h3 {
          margin: 0 0 1rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: #e2e8f0;
        }

        .events-list, .webhook-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .event-item {
          display: flex;
          gap: 0.75rem;
          padding: 0.5rem;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 4px;
          font-size: 0.8rem;
        }

        .event-time {
          color: #64748b;
          min-width: 70px;
        }

        .event-agent {
          color: #a5b4fc;
          font-weight: 500;
          margin-right: 0.5rem;
        }

        .event-message {
          color: #cbd5e1;
        }

        .event-item.stock_received { border-left: 3px solid #16a34a; }
        .event-item.order_generated { border-left: 3px solid #2563eb; }
        .event-item.webhook_sent { border-left: 3px solid #d97706; }
        .event-item.webhook_received { border-left: 3px solid #16a34a; }
        .event-item.low_stock_detected { border-left: 3px solid #dc2626; }
        .event-item.customer_order { border-left: 3px solid #0891b2; }

        .webhook-item {
          padding: 0.75rem;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 6px;
          margin-bottom: 0.5rem;
        }

        .webhook-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .direction-badge {
          padding: 0.2rem 0.5rem;
          border-radius: 3px;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .direction-badge.outgoing { background: #2563eb; color: #fff; }
        .direction-badge.incoming { background: #16a34a; color: #fff; }

        .webhook-time {
          font-size: 0.75rem;
          color: #64748b;
        }

        .webhook-endpoint {
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 0.75rem;
          color: #64748b;
          margin-bottom: 0.5rem;
        }

        .webhook-details {
          margin-top: 0.5rem;
        }

        .webhook-details summary {
          cursor: pointer;
          color: #a5b4fc;
          font-size: 0.8rem;
        }

        .webhook-details pre {
          background: rgba(15, 23, 42, 0.8);
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          overflow-x: auto;
          margin: 0.5rem 0 0 0;
          max-height: 150px;
          overflow-y: auto;
          color: #94a3b8;
        }

        .badge {
          background: #dc2626;
          color: #fff;
          font-size: 0.65rem;
          padding: 0.125rem 0.375rem;
          border-radius: 10px;
          margin-left: 0.5rem;
        }

        .actions-cell {
          min-width: 120px;
        }

        /* Observability Tab Styles */
        .observability-section .section-header {
          flex-wrap: wrap;
          gap: 1rem;
        }

        .obs-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-indicator {
          padding: 0.375rem 0.75rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .status-indicator.enabled {
          background: rgba(22, 163, 74, 0.2);
          color: #4ade80;
          border: 1px solid rgba(22, 163, 74, 0.4);
        }

        .status-indicator.disabled {
          background: rgba(100, 116, 139, 0.2);
          color: #94a3b8;
          border: 1px solid rgba(100, 116, 139, 0.4);
        }

        .observability-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-top: 1rem;
        }

        .obs-panel {
          background: rgba(30, 41, 59, 0.5);
          border-radius: 8px;
          padding: 1rem;
          max-height: 450px;
          overflow-y: auto;
        }

        .obs-panel h3 {
          margin: 0 0 0.25rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: #e2e8f0;
        }

        .panel-subtitle {
          margin: 0 0 1rem 0;
          font-size: 0.75rem;
          color: #64748b;
        }

        .log-list, .safety-list, .workflow-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .log-item, .safety-item, .workflow-item {
          padding: 0.625rem;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 4px;
          font-size: 0.8rem;
          position: relative;
        }

        .log-header, .safety-header, .workflow-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.375rem;
        }

        .log-time, .safety-time, .workflow-time {
          color: #64748b;
          font-size: 0.7rem;
        }

        .log-type, .safety-type {
          background: rgba(79, 70, 229, 0.2);
          color: #a5b4fc;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          font-size: 0.65rem;
          font-weight: 500;
        }

        .log-agent, .workflow-agent {
          color: #a5b4fc;
          font-size: 0.7rem;
          margin-bottom: 0.25rem;
        }

        .log-message, .safety-message, .workflow-message {
          color: #cbd5e1;
          line-height: 1.4;
        }

        .log-metadata {
          margin-top: 0.5rem;
        }

        .log-metadata summary {
          cursor: pointer;
          color: #94a3b8;
          font-size: 0.7rem;
        }

        .log-metadata pre {
          background: rgba(15, 23, 42, 0.8);
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.65rem;
          overflow-x: auto;
          margin: 0.25rem 0 0 0;
          max-height: 100px;
          overflow-y: auto;
          color: #94a3b8;
        }

        .feedback-buttons {
          display: flex;
          gap: 0.25rem;
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
        }

        .feedback-btn {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .feedback-btn.positive {
          background: rgba(22, 163, 74, 0.2);
          color: #4ade80;
        }

        .feedback-btn.positive:hover {
          background: rgba(22, 163, 74, 0.4);
        }

        .feedback-btn.negative {
          background: rgba(220, 38, 38, 0.2);
          color: #f87171;
        }

        .feedback-btn.negative:hover {
          background: rgba(220, 38, 38, 0.4);
        }

        .langfuse-link {
          margin-top: 1.5rem;
          text-align: center;
        }

        .external-link {
          display: inline-block;
          padding: 0.625rem 1.25rem;
          background: rgba(79, 70, 229, 0.15);
          border: 1px solid rgba(79, 70, 229, 0.4);
          border-radius: 6px;
          color: #a5b4fc;
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .external-link:hover {
          background: rgba(79, 70, 229, 0.25);
          border-color: rgba(79, 70, 229, 0.6);
        }

        @media (max-width: 1024px) {
          .observability-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 768px) {
          .activity-grid { grid-template-columns: 1fr; }
          .refill-card { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
