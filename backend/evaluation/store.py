
import json
import os
from typing import Dict, Any, List
from datetime import datetime

# Path to store evaluation history
METRICS_FILE = "data/evaluation_metrics.json"

def save_metrics(metrics: Dict[str, Any]):
    """Save evaluation metrics to JSON file."""
    # Ensure directory exists
    os.makedirs(os.path.dirname(METRICS_FILE), exist_ok=True)
    
    current_data = load_metrics()
    
    # Add timestamp if not present
    if "timestamp" not in metrics:
        metrics["timestamp"] = datetime.now().isoformat()
    
    # Prepend new metrics (newest first)
    current_data.insert(0, metrics)
    
    # Keep only last 50 runs to avoid file growing too large
    current_data = current_data[:50]
    
    with open(METRICS_FILE, "w") as f:
        json.dump(current_data, f, indent=2)

def load_metrics() -> List[Dict[str, Any]]:
    """Load evaluation metrics from JSON file."""
    if not os.path.exists(METRICS_FILE):
        return []
    
    try:
        with open(METRICS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def get_latest_metrics() -> Dict[str, Any]:
    """Get the most recent evaluation metrics."""
    data = load_metrics()
    return data[0] if data else {}
