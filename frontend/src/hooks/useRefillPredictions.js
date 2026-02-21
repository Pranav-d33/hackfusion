/**
 * useRefillPredictions Hook
 * Fetches and caches prediction timeline, consumption frequency,
 * and refill alerts for a customer.
 */
import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export function useRefillPredictions(customerId) {
  const [timeline, setTimeline] = useState([]);
  const [consumption, setConsumption] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const [timelineRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE}/refill/customer/${customerId}/timeline`),
        fetch(`${API_BASE}/refill/customer/${customerId}/alerts?days_ahead=30`),
      ]);

      const timelineData = await timelineRes.json();
      const alertsData = await alertsRes.json();

      setTimeline(timelineData.timeline || []);
      setConsumption(timelineData.consumption || []);
      setRecentOrders(timelineData.recent_orders || []);
      setStats(timelineData.stats || null);
      setAlerts(alertsData.alerts || []);
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchAll();
    // Refresh every 5 minutes
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    timeline,
    consumption,
    recentOrders,
    stats,
    alerts,
    loading,
    error,
    refresh: fetchAll,
  };
}
