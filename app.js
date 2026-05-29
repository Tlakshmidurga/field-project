// ==========================================
// STATE MANAGEMENT & INITIALIZATION
// ==========================================

// Constants for storage targets
const STORAGE_ZONES = {
  "Ambient Cabinet": { tempMin: 15.0, tempMax: 25.0, humidityMin: 30, humidityMax: 60, desc: "Shelf Block A & B" },
  "Refrigerated coldroom": { tempMin: 2.0, tempMax: 8.0, humidityMin: 45, humidityMax: 65, desc: "Pharmacy Room Fridge A" },
  "Deep Freezer": { tempMin: -25.0, tempMax: -10.0, humidityMin: 10, humidityMax: 30, desc: "Laboratory Lab Freezer A" }
};

// Default State (Initial seed data for demonstration)
const defaultInventory = [
  {
    id: "prod-1",
    name: "Insulin Glargine 100 U/mL",
    category: "Injection",
    reorderLevel: 50,
    unit: "vials",
    storageZone: "Refrigerated coldroom",
    batches: [
      { id: "batch-ins-1", batchId: "INS-2601", qty: 45, expiry: "2026-08-20", unitPrice: 24.50 },
      { id: "batch-ins-2", batchId: "INS-2512", qty: 15, expiry: "2026-05-15", unitPrice: 24.50 } // Expired (relative to current date 2026-05-29)
    ]
  },
  {
    id: "prod-2",
    name: "Paracetamol 500mg",
    category: "Tablet",
    reorderLevel: 200,
    unit: "tablets",
    storageZone: "Ambient Cabinet",
    batches: [
      { id: "batch-para-1", batchId: "PCT-2402", qty: 650, expiry: "2026-06-02", unitPrice: 0.08 }, // Expiring soon (< 30 days)
      { id: "batch-para-2", batchId: "PCT-2408", qty: 1200, expiry: "2027-04-10", unitPrice: 0.08 }
    ]
  },
  {
    id: "prod-3",
    name: "Pfizer-BioNTech COVID-19 Vaccine",
    category: "Vaccine",
    reorderLevel: 100,
    unit: "vials",
    storageZone: "Deep Freezer",
    batches: [
      { id: "batch-pfz-1", batchId: "PFZ-9908", qty: 120, expiry: "2026-11-30", unitPrice: 19.90 }
    ]
  },
  {
    id: "prod-4",
    name: "Amoxicillin Oral Suspension 250mg/5mL",
    category: "Syrup",
    reorderLevel: 80,
    unit: "bottles",
    storageZone: "Ambient Cabinet",
    batches: [
      { id: "batch-amx-1", batchId: "AMX-8812", qty: 35, expiry: "2026-06-25", unitPrice: 5.20 } // Low stock (35 < 80) & expiring soon
    ]
  },
  {
    id: "prod-5",
    name: "Epinephrine 1 mg/mL Injection",
    category: "Injection",
    reorderLevel: 40,
    unit: "ampoules",
    storageZone: "Refrigerated coldroom",
    batches: [
      { id: "batch-epi-1", batchId: "EPI-4499", qty: 15, expiry: "2026-06-15", unitPrice: 12.00 } // Low stock (15 < 40)
    ]
  }
];

const defaultWasteLog = [
  {
    id: "waste-1",
    name: "Insulin Glargine 100 U/mL",
    batchId: "INS-2512",
    qty: 10,
    lossValue: 245.00,
    reason: "Expired",
    actionTaken: "Incinerated and logged under Bio-waste Certificate #W-1049",
    dateLogged: "2026-05-20T10:30:00+05:30"
  },
  {
    id: "waste-2",
    name: "Pfizer-BioNTech COVID-19 Vaccine",
    batchId: "PFZ-9908",
    qty: 15,
    lossValue: 298.50,
    reason: "Temperature Excursion",
    actionTaken: "Discarded due to cold chain cabinet power failure on 2026-05-27",
    dateLogged: "2026-05-27T16:45:00+05:30"
  }
];

const defaultSensorLogs = [
  { time: "2026-05-29T14:30:00+05:30", zone: "Ambient Cabinet", temp: 22.4, humidity: 45, status: "Normal", operator: "Auto Sensor" },
  { time: "2026-05-29T14:45:00+05:30", zone: "Refrigerated coldroom", temp: 4.2, humidity: 55, status: "Normal", operator: "Auto Sensor" },
  { time: "2026-05-29T15:00:00+05:30", zone: "Deep Freezer", temp: -18.5, humidity: 20, status: "Normal", operator: "Auto Sensor" }
];

// App State
let inventory = JSON.parse(localStorage.getItem("medi_inventory")) || defaultInventory;
let wasteLog = JSON.parse(localStorage.getItem("medi_waste_log")) || defaultWasteLog;
let sensorLogs = JSON.parse(localStorage.getItem("medi_sensor_logs")) || defaultSensorLogs;
let currentZoneBreaches = JSON.parse(localStorage.getItem("medi_zone_breaches")) || {}; // e.g. { "Deep Freezer": true }
let systemAlerts = [];

// App Settings
let currentTheme = localStorage.getItem("medi_theme") || "dark-theme";

// Current Date for computation (Simulated to lock into system date: 2026-05-29)
const CURRENT_DATE = new Date("2026-05-29T15:10:23+05:30");

// ==========================================
// CORE COMPUTATION & CORE LOGIC
// ==========================================

// Days difference helper
function getDaysDiff(dateStr) {
  const expiry = new Date(dateStr);
  const diffTime = expiry - CURRENT_DATE;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Calculate status of a batch
function getBatchStatus(batch, zoneBreached) {
  if (zoneBreached) return "Storage Compromised";
  const daysLeft = getDaysDiff(batch.expiry);
  if (daysLeft <= 0) return "Expired";
  if (daysLeft <= 30) return "Expiring Soon";
  return "Safe";
}

// Compute aggregate metrics for dashboard
function computeMetrics() {
  let totalValue = 0;
  let totalCount = 0;
  let expiredLoss = 0;
  let expiredCount = 0;
  let expiringSoonCount = 0;
  let expiringSoonValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  
  // Calculate from inventory
  inventory.forEach(product => {
    let totalProdQty = 0;
    let isStorageBreached = currentZoneBreaches[product.storageZone] || false;
    
    product.batches.forEach(batch => {
      const daysLeft = getDaysDiff(batch.expiry);
      const batchVal = batch.qty * batch.unitPrice;
      
      if (batch.qty > 0) {
        totalProdQty += batch.qty;
        totalValue += batchVal;
        
        if (daysLeft <= 0) {
          expiredLoss += batchVal;
          expiredCount++;
        } else if (daysLeft <= 30) {
          expiringSoonCount++;
          expiringSoonValue += batchVal;
        }
      }
    });

    if (totalProdQty === 0) {
      outOfStockCount++;
      lowStockCount++; // out of stock is also low stock
    } else if (totalProdQty < product.reorderLevel) {
      lowStockCount++;
    }
    
    if (product.batches.some(b => b.qty > 0)) {
      totalCount++;
    }
  });

  // Calculate stats from waste logs
  let totalDisposedUnits = 0;
  let totalWastageLoss = 0;
  let lossByReason = { "Expired": 0, "Temperature Excursion": 0, "Physical Damage": 0, "Dispensing Error": 0 };

  wasteLog.forEach(log => {
    totalDisposedUnits += log.qty;
    totalWastageLoss += log.lossValue;
    if (lossByReason[log.reason] !== undefined) {
      lossByReason[log.reason] += log.lossValue;
    }
  });

  return {
    totalValue,
    totalCount,
    expiredLoss,
    expiredCount,
    expiringSoonCount,
    expiringSoonValue,
    lowStockCount,
    outOfStockCount,
    totalDisposedUnits,
    totalWastageLoss,
    lossByReason
  };
}

// Generate alerts list
function compileAlerts() {
  systemAlerts = [];

  // Expiry alerts
  inventory.forEach(prod => {
    const isZoneBreached = currentZoneBreaches[prod.storageZone];
    prod.batches.forEach(b => {
      if (b.qty > 0) {
        const daysLeft = getDaysDiff(b.expiry);
        if (daysLeft <= 0) {
          systemAlerts.push({
            type: "critical",
            title: `Batch Expired: ${prod.name}`,
            message: `Batch #${b.batchId} (${b.qty} ${prod.unit}) expired on ${b.expiry}. Must be discarded.`,
            time: "Immediate disposal required"
          });
        } else if (daysLeft <= 15) {
          systemAlerts.push({
            type: "warning",
            title: `Critical Expiry Warning: ${prod.name}`,
            message: `Batch #${b.batchId} expires in ${daysLeft} days (${b.expiry}). Prioritize FEFO dispensing!`,
            time: `${daysLeft} days left`
          });
        }
      }
    });

    // Stockout or low stock alerts
    const totalQty = prod.batches.reduce((sum, b) => sum + b.qty, 0);
    if (totalQty === 0) {
      systemAlerts.push({
        type: "critical",
        title: `Stock Out Alert: ${prod.name}`,
        message: `Product is completely out of stock. Immediate reorder needed.`,
        time: "Reorder immediately"
      });
    } else if (totalQty < prod.reorderLevel) {
      systemAlerts.push({
        type: "warning",
        title: `Low Stock Warning: ${prod.name}`,
        message: `Current stock (${totalQty} ${prod.unit}) is below reorder level of ${prod.reorderLevel}.`,
        time: `Reorder recommended`
      });
    }
  });

  // Storage Breaches alerts
  Object.keys(currentZoneBreaches).forEach(zoneName => {
    if (currentZoneBreaches[zoneName]) {
      systemAlerts.push({
        type: "critical",
        title: `Environmental Failure: ${zoneName}`,
        message: `Temperature breach alert active! Medicines stored here may be compromised.`,
        time: "Action required"
      });
    }
  });
}

// ==========================================
// FEFO (FIRST-EXPIRED, FIRST-OUT) DISPENSING ENGINE
// ==========================================

// Get FEFO batch recommendation for a product
function getFEFORecommendation(productId) {
  const product = inventory.find(p => p.id === productId);
  if (!product) return null;

  // Filter batches: must have stock, must not be expired, must not be in breached zone
  const isZoneBreached = currentZoneBreaches[product.storageZone];
  const activeBatches = product.batches.filter(b => {
    const daysLeft = getDaysDiff(b.expiry);
    return b.qty > 0 && daysLeft > 0 && !isZoneBreached;
  });

  if (activeBatches.length === 0) return null;

  // Sort by expiry date ascending (earliest expiry first)
  activeBatches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

  return activeBatches[0];
}

// Execute Dispensing with FEFO selection
function dispenseProduct(productId, requestQty, operator) {
  const product = inventory.find(p => p.id === productId);
  if (!product) return { success: false, message: "Medicine not found." };

  const totalQty = product.batches.reduce((sum, b) => sum + b.qty, 0);
  if (totalQty < requestQty) {
    return { success: false, message: `Insufficient total stock. Requested ${requestQty}, but only ${totalQty} available.` };
  }

  // Get active safe batches sorted by FEFO (earliest expiry first)
  // Even if some batches are expired, FEFO dispenser strictly takes from non-expired ones
  const activeBatches = product.batches.filter(b => {
    const daysLeft = getDaysDiff(b.expiry);
    return daysLeft > 0 && b.qty > 0 && !currentZoneBreaches[product.storageZone];
  });

  // If cold chain is breached, block standard dispensing
  if (currentZoneBreaches[product.storageZone]) {
    return { success: false, message: `Storage zone [${product.storageZone}] is currently compromised. Dispensation blocked until temperature is verified.` };
  }

  activeBatches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  
  const totalSafeQty = activeBatches.reduce((sum, b) => sum + b.qty, 0);
  if (totalSafeQty < requestQty) {
    return { 
      success: false, 
      message: `Cannot dispense. Requested ${requestQty}, but only ${totalSafeQty} units are in non-expired, safe storage batches.` 
    };
  }

  // Deduct quantities in FEFO order
  let remainingToDispense = requestQty;
  const dispensedDetails = [];

  for (let i = 0; i < activeBatches.length; i++) {
    const batch = activeBatches[i];
    const originalBatch = product.batches.find(b => b.id === batch.id);

    if (remainingToDispense <= originalBatch.qty) {
      originalBatch.qty -= remainingToDispense;
      dispensedDetails.push({ batchId: originalBatch.batchId, qty: remainingToDispense });
      remainingToDispense = 0;
      break;
    } else {
      dispensedDetails.push({ batchId: originalBatch.batchId, qty: originalBatch.qty });
      remainingToDispense -= originalBatch.qty;
      originalBatch.qty = 0;
    }
  }

  saveState();
  return { 
    success: true, 
    details: dispensedDetails,
    message: `Successfully dispensed ${requestQty} ${product.unit}. Batches deducted: ${dispensedDetails.map(d => `#${d.batchId} (${d.qty})`).join(', ')}` 
  };
}

// Add a new batch to inventory
function addStockItem(name, category, batchId, qty, unit, unitPrice, expiry, storageZone, reorderLevel) {
  // Try to find if product already exists
  let product = inventory.find(p => p.name.toLowerCase() === name.toLowerCase() && p.storageZone === storageZone);

  if (!product) {
    product = {
      id: "prod-" + Date.now(),
      name,
      category,
      reorderLevel: parseInt(reorderLevel),
      unit,
      storageZone,
      batches: []
    };
    inventory.push(product);
  }

  // Check if batch code already exists in this product
  let batch = product.batches.find(b => b.batchId.toLowerCase() === batchId.toLowerCase());
  if (batch) {
    batch.qty += parseInt(qty);
  } else {
    product.batches.push({
      id: "batch-" + Date.now() + Math.random().toString(36).substr(2, 5),
      batchId,
      qty: parseInt(qty),
      expiry,
      unitPrice: parseFloat(unitPrice)
    });
  }

  saveState();
  return { success: true, message: `Received and cataloged ${qty} ${unit} of ${name} (Batch #${batchId})` };
}

// Log wastage for a specific product batch
function logWastage(productId, batchId, qtyToWaste, reason, actionTaken) {
  const product = inventory.find(p => p.id === productId);
  if (!product) return { success: false, message: "Medicine not found." };

  const batch = product.batches.find(b => b.id === batchId);
  if (!batch) return { success: false, message: "Batch not found." };

  if (batch.qty < qtyToWaste) {
    return { success: false, message: `Cannot waste ${qtyToWaste} units. Only ${batch.qty} units left in batch.` };
  }

  // Deduct from batch qty
  batch.qty -= qtyToWaste;
  const lossValue = qtyToWaste * batch.unitPrice;

  // Add to waste log
  const wasteEntry = {
    id: "waste-" + Date.now(),
    name: product.name,
    batchId: batch.batchId,
    qty: qtyToWaste,
    lossValue,
    reason,
    actionTaken,
    dateLogged: CURRENT_DATE.toISOString()
  };

  wasteLog.unshift(wasteEntry);
  saveState();

  return { success: true, message: `Logged wastage of ${qtyToWaste} units. Financial loss registered: $${lossValue.toFixed(2)}` };
}

// Save state to LocalStorage
function saveState() {
  localStorage.setItem("medi_inventory", JSON.stringify(inventory));
  localStorage.setItem("medi_waste_log", JSON.stringify(wasteLog));
  localStorage.setItem("medi_sensor_logs", JSON.stringify(sensorLogs));
  localStorage.setItem("medi_zone_breaches", JSON.stringify(currentZoneBreaches));
}

// ==========================================
// RENDER & CHART GENERATION UTILITIES
// ==========================================

// Create custom SVG charts to represent waste reasons
function renderWasteReasonChart(lossByReason) {
  const chartDiv = document.getElementById("waste-reason-chart");
  if (!chartDiv) return;

  const reasons = Object.keys(lossByReason);
  const values = Object.values(lossByReason);
  const total = values.reduce((sum, v) => sum + v, 0);

  if (total === 0) {
    chartDiv.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem 0;">
        <p>No financial losses logged yet.</p>
      </div>
    `;
    return;
  }

  // Drawing a beautiful SVG Horizontal Bar Chart
  const svgWidth = 420;
  const svgHeight = 180;
  const barHeight = 22;
  const barSpacing = 16;
  const startX = 140;
  const maxBarWidth = 220;

  // Find max value for scaling
  const maxValue = Math.max(...values) || 1;

  let svgContent = `<svg class="chart-container-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">`;
  
  // Render grid lines
  for (let i = 1; i <= 4; i++) {
    const x = startX + (maxBarWidth / 4) * i;
    svgContent += `<line x1="${x}" y1="0" x2="${x}" y2="${svgHeight - 30}" class="chart-grid-line" />`;
    const valLabel = ((maxValue / 4) * i).toFixed(0);
    svgContent += `<text x="${x}" y="${svgHeight - 15}" class="chart-text" text-anchor="middle">$${valLabel}</text>`;
  }

  // Render bars
  reasons.forEach((reason, index) => {
    const value = lossByReason[reason];
    const barWidth = (value / maxValue) * maxBarWidth;
    const y = 15 + index * (barHeight + barSpacing);
    let barClass = "chart-bar";
    
    if (reason === "Expired") barClass += " waste-expire";
    else if (reason === "Temperature Excursion") barClass += " waste-temp";
    else if (reason === "Physical Damage") barClass += " waste-damage";
    else if (reason === "Dispensing Error") barClass += " waste-dispense";

    // Text Label for reason (truncated if too long)
    svgContent += `<text x="10" y="${y + barHeight/2 + 4}" class="chart-text" font-weight="600">${reason}</text>`;
    
    // Bar
    svgContent += `<rect x="${startX}" y="${y}" width="${Math.max(barWidth, 4)}" height="${barHeight}" class="${barClass}" />`;
    
    // Value Label inside or next to the bar
    svgContent += `<text x="${startX + barWidth + 8}" y="${y + barHeight/2 + 4}" class="chart-text" font-weight="700" fill="var(--text-primary)">$${value.toFixed(2)}</text>`;
  });

  // Base Axis Line
  svgContent += `<line x1="${startX}" y1="0" x2="${startX}" y2="${svgHeight - 30}" class="chart-axis-line" />`;
  svgContent += `</svg>`;

  chartDiv.innerHTML = svgContent;
}

// Create custom SVG Expiry profile chart
function renderExpiryProfileChart() {
  const chartDiv = document.getElementById("expiry-profile-chart");
  if (!chartDiv) return;

  // Let's count items expiring in:
  // 1: Already Expired
  // 2: Nearing Expiry (< 30 days)
  // 3: Mid Term (30 - 90 days)
  // 4: Safe (> 90 days)
  let expired = 0;
  let soon = 0;
  let mid = 0;
  let safe = 0;

  inventory.forEach(prod => {
    prod.batches.forEach(b => {
      if (b.qty > 0) {
        const days = getDaysDiff(b.expiry);
        if (days <= 0) expired += b.qty;
        else if (days <= 30) soon += b.qty;
        else if (days <= 90) mid += b.qty;
        else safe += b.qty;
      }
    });
  });

  const total = expired + soon + mid + safe;
  if (total === 0) {
    chartDiv.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem 0;">
        <p>No inventory items to display.</p>
      </div>
    `;
    return;
  }

  // Draw a beautiful vertical bar chart of expiry profile
  const svgWidth = 240;
  const svgHeight = 180;
  const chartHeight = 120;
  const startY = 130;
  const barWidth = 32;
  const spacing = 18;
  const startX = 25;

  const categories = ["Expired", "< 30d", "< 90d", "Safe"];
  const values = [expired, soon, mid, safe];
  const maxVal = Math.max(...values) || 1;
  const colors = ["var(--color-error)", "var(--color-warning)", "var(--color-info)", "var(--color-success)"];

  let svgContent = `<svg class="chart-container-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%">`;

  // Draw bars
  values.forEach((val, idx) => {
    const valHeight = (val / maxVal) * chartHeight;
    const x = startX + idx * (barWidth + spacing);
    const y = startY - valHeight;

    // Bar
    svgContent += `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(valHeight, 2)}" fill="${colors[idx]}" rx="4" />`;
    
    // Qty Text on top of bar
    svgContent += `<text x="${x + barWidth/2}" y="${y - 6}" class="chart-text" font-weight="700" text-anchor="middle" fill="var(--text-primary)">${val}</text>`;
    
    // Category label below axis
    svgContent += `<text x="${x + barWidth/2}" y="${startY + 18}" class="chart-text" font-weight="600" text-anchor="middle">${categories[idx]}</text>`;
  });

  // Base line
  svgContent += `<line x1="10" y1="${startY}" x2="${svgWidth - 10}" y2="${startY}" class="chart-axis-line" />`;
  svgContent += `</svg>`;

  chartDiv.innerHTML = svgContent;
}

// ==========================================
// TOAST NOTIFICATIONS & ALERT AUDIO
// ==========================================

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`;
  } else if (type === "warning") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  toast.innerHTML = `
    ${iconSvg}
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);

  // Auto remove after 3s
  setTimeout(() => {
    toast.style.animation = "fadeIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// DOM RENDERING CONTROLLER
// ==========================================

// Refresh the entire user interface
function updateUI() {
  const metrics = computeMetrics();
  compileAlerts();
  
  // 1. Render Dashboard Metrics
  document.getElementById("val-total-value").textContent = `$${metrics.totalValue.toFixed(2)}`;
  document.getElementById("val-total-count").textContent = `${metrics.totalCount} unique products in stock`;
  
  document.getElementById("val-expired-loss").textContent = `$${metrics.expiredLoss.toFixed(2)}`;
  document.getElementById("val-expired-count").textContent = `${metrics.expiredCount} batches expired (must discard)`;

  document.getElementById("val-expiring-soon").textContent = metrics.expiringSoonCount;
  document.getElementById("val-expiring-value").textContent = `Value at risk: $${metrics.expiringSoonValue.toFixed(2)}`;

  document.getElementById("val-low-stock").textContent = metrics.lowStockCount;
  document.getElementById("val-stockout-count").textContent = `${metrics.outOfStockCount} items fully out of stock`;

  // Render waste metrics in tab
  document.getElementById("waste-total-loss").textContent = `$${metrics.totalWastageLoss.toFixed(2)}`;
  document.getElementById("waste-total-units").textContent = `${metrics.totalDisposedUnits} units`;
  
  const expiryPct = metrics.totalWastageLoss > 0 ? (metrics.lossByReason["Expired"] / metrics.totalWastageLoss) * 100 : 0;
  const storagePct = metrics.totalWastageLoss > 0 ? (metrics.lossByReason["Temperature Excursion"] / metrics.totalWastageLoss) * 100 : 0;
  document.getElementById("waste-pct-expiry").textContent = `${expiryPct.toFixed(0)}%`;
  document.getElementById("waste-pct-storage").textContent = `${storagePct.toFixed(0)}%`;

  // 2. Render System Alert Badges
  const alertBadge = document.getElementById("bell-alert-count");
  const alertBadgeMenu = document.getElementById("storage-alert-badge");
  
  const criticalCount = systemAlerts.filter(a => a.type === "critical").length;
  const totalCountAlerts = systemAlerts.length;

  if (totalCountAlerts > 0) {
    alertBadge.textContent = totalCountAlerts;
    alertBadge.classList.remove("hidden");
  } else {
    alertBadge.classList.add("hidden");
  }

  const activeBreachesCount = Object.values(currentZoneBreaches).filter(Boolean).length;
  if (activeBreachesCount > 0) {
    alertBadgeMenu.classList.remove("hidden");
  } else {
    alertBadgeMenu.classList.add("hidden");
  }

  // 3. Render Dashboard Critical alerts panel
  const alertsPanel = document.getElementById("dashboard-critical-alerts");
  document.getElementById("total-alerts-count").textContent = `${totalCountAlerts} Alerts`;

  if (systemAlerts.length === 0) {
    alertsPanel.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
        <p>System clean. No critical stock-outs, expiry threats, or temperature alerts.</p>
      </div>
    `;
  } else {
    alertsPanel.innerHTML = systemAlerts.map(alert => {
      const isCritical = alert.type === "critical";
      const icon = isCritical 
        ? `<svg class="alert-strip-icon error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
        : `<svg class="alert-strip-icon warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      
      return `
        <div class="alert-strip alert-strip-${alert.type}">
          ${icon}
          <div class="alert-strip-content">
            <div class="alert-strip-title">${alert.title}</div>
            <div class="alert-strip-desc">${alert.message}</div>
          </div>
          <span class="badge badge-${isCritical ? 'error' : 'warning'}">${alert.time}</span>
        </div>
      `;
    }).join("");
  }

  // 4. Render Notifications Bell Dropdown
  const alertsList = document.getElementById("alerts-list");
  if (systemAlerts.length === 0) {
    alertsList.innerHTML = `<div class="empty-dropdown">No active critical alerts</div>`;
  } else {
    alertsList.innerHTML = systemAlerts.map(alert => `
      <div class="dropdown-item ${alert.type}">
        <div class="dropdown-item-header">${alert.title}</div>
        <p style="margin: 0.15rem 0; color: var(--text-secondary); line-height:1.3;">${alert.message}</p>
        <span class="dropdown-item-time">${alert.time}</span>
      </div>
    `).join("");
  }

  // 5. Render Inventory Table (with filters)
  renderInventoryTable();

  // 6. Render Storage Monitor Page
  renderStorageZones();

  // 7. Render Waste Analysis Logs
  renderWasteLogsTable();

  // 8. Load select fields in modals
  populateModalDropdowns();

  // 9. Render charts
  renderWasteReasonChart(metrics.lossByReason);
  renderExpiryProfileChart();
}

// Render Inventory Table
function renderInventoryTable() {
  const tbody = document.getElementById("inventory-tbody");
  if (!tbody) return;

  const searchQuery = document.getElementById("inv-search").value.toLowerCase();
  const categoryFilter = document.getElementById("filter-category").value;
  const statusFilter = document.getElementById("filter-status").value;
  const storageFilter = document.getElementById("filter-storage").value;

  let filtered = inventory.map(product => {
    // Determine condition for each batch
    const batchesWithStatus = product.batches.map(batch => {
      const isBreached = currentZoneBreaches[product.storageZone] || false;
      const status = getBatchStatus(batch, isBreached);
      return { ...batch, status };
    });

    const totalQty = batchesWithStatus.reduce((sum, b) => sum + b.qty, 0);
    
    // Find earliest expiring active batch (qty > 0)
    const activeBatches = batchesWithStatus.filter(b => b.qty > 0);
    activeBatches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    const earliestExpiry = activeBatches.length > 0 ? activeBatches[0].expiry : "N/A";
    const daysLeft = activeBatches.length > 0 ? getDaysDiff(activeBatches[0].expiry) : 9999;

    // Overall product health
    let health = "Safe";
    if (totalQty === 0) health = "Out of Stock";
    else if (batchesWithStatus.some(b => b.qty > 0 && b.status === "Storage Compromised")) health = "Storage Compromised";
    else if (batchesWithStatus.some(b => b.qty > 0 && b.status === "Expired")) health = "Expired";
    else if (daysLeft <= 30) health = "Expiring Soon";
    else if (totalQty < product.reorderLevel) health = "Low Stock";

    return {
      ...product,
      batches: batchesWithStatus,
      totalQty,
      earliestExpiry,
      daysLeft,
      health
    };
  });

  // Apply filters
  filtered = filtered.filter(p => {
    // Search query
    const matchesSearch = p.name.toLowerCase().includes(searchQuery) || 
                          p.batches.some(b => b.batchId.toLowerCase().includes(searchQuery));
    
    // Category filter
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;

    // Storage filter
    const matchesStorage = storageFilter === "all" || p.storageZone === storageFilter;

    // Health filter
    let matchesStatus = true;
    if (statusFilter === "safe") matchesStatus = p.health === "Safe";
    else if (statusFilter === "expiring") matchesStatus = p.health === "Expiring Soon";
    else if (statusFilter === "expired") matchesStatus = p.health === "Expired" || p.health === "Storage Compromised";
    else if (statusFilter === "low") matchesStatus = p.health === "Low Stock" || p.health === "Out of Stock";
    else if (statusFilter === "out") matchesStatus = p.health === "Out of Stock";

    return matchesSearch && matchesCategory && matchesStorage && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <p>No inventory records found matching your filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    // Stock level indicators
    let fillPct = (p.totalQty / (p.reorderLevel * 2)) * 100;
    if (fillPct > 100) fillPct = 100;
    
    let fillClass = "";
    if (p.totalQty === 0) fillClass = "critical";
    else if (p.totalQty < p.reorderLevel) fillClass = "low";

    // Build batch bubbles HTML
    const batchListHTML = p.batches.map(b => {
      let bClass = "badge-success";
      if (b.status === "Expired") bClass = "badge-error";
      else if (b.status === "Expiring Soon") bClass = "badge-warning";
      else if (b.status === "Storage Compromised") bClass = "badge-error";

      return b.qty > 0 ? `
        <div style="display:flex; justify-content:space-between; margin-bottom: 0.35rem; font-size:0.78rem;">
          <span>#${b.batchId} (${b.qty} ${p.unit})</span>
          <span class="badge ${bClass}">${b.status}</span>
        </div>
      ` : "";
    }).join("");

    // Health Badge
    let healthClass = "pill-success";
    if (p.health === "Expired") healthClass = "pill-error";
    else if (p.health === "Storage Compromised") healthClass = "pill-error";
    else if (p.health === "Expiring Soon") healthClass = "pill-warning";
    else if (p.health === "Low Stock") healthClass = "pill-warning";
    else if (p.health === "Out of Stock") healthClass = "pill-error";

    // Earliest expiry label
    let expiryLabel = p.earliestExpiry;
    if (p.daysLeft !== 9999) {
      if (p.daysLeft <= 0) expiryLabel = `<span class="text-error" font-weight="600">${p.earliestExpiry} (Expired)</span>`;
      else if (p.daysLeft <= 30) expiryLabel = `<span class="text-warning" font-weight="600">${p.earliestExpiry} (${p.daysLeft}d left)</span>`;
    }

    // Storage Zone Label classes
    let zoneClass = "pill-info";
    if (p.storageZone.includes("Freezer")) zoneClass = "pill-accent";
    else if (p.storageZone.includes("Cabinet")) zoneClass = "pill-success";

    return `
      <tr>
        <td>
          <div class="med-name">${p.name}</div>
          <div class="med-desc">ID: ${p.id}</div>
          <div style="margin-top: 0.5rem; border-top:1px dashed var(--border-color); padding-top:0.4rem;">
            ${batchListHTML || '<span class="text-muted" style="font-size:0.75rem;">No active batches</span>'}
          </div>
        </td>
        <td><span class="badge" style="background-color:var(--border-color);">${p.category}</span></td>
        <td>
          <div class="storage-spec">
            <span class="pill ${zoneClass}" style="width:fit-content; margin-bottom:0.25rem;">${p.storageZone}</span>
            <span class="storage-zone-label">${STORAGE_ZONES[p.storageZone]?.desc || ''}</span>
          </div>
        </td>
        <td>
          <div class="stock-progress-container">
            <span style="font-weight:600;">${p.totalQty}</span> <span style="font-size:0.75rem; color:var(--text-secondary);">${p.unit}</span>
            <div class="stock-progress-bar">
              <div class="stock-progress-fill ${fillClass}" style="width: ${fillPct}%"></div>
            </div>
            <span style="font-size:0.7rem; color:var(--text-muted);">Reorder: ${p.reorderLevel}</span>
          </div>
        </td>
        <td>${expiryLabel}</td>
        <td><span class="pill ${healthClass}">${p.health}</span></td>
        <td class="actions-col">
          <div class="btn-action-group">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem 0.75rem; font-size:0.75rem;" onclick="openDispenseModalFor('${p.id}')" ${p.totalQty === 0 || currentZoneBreaches[p.storageZone] ? 'disabled' : ''}>
              Dispense
            </button>
            <button class="btn btn-outline" style="padding:0.4rem 0.6rem; font-size:0.75rem;" onclick="openWasteModalFor('${p.id}')">
              Waste
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Render Storage Zones details
function renderStorageZones() {
  // Update Ambient Cabinet
  const ambComp = currentZoneBreaches["Ambient Cabinet"] || false;
  document.getElementById("zone-ambient").className = `zone-card glass ${ambComp ? 'compromised' : ''}`;
  document.getElementById("ambient-status-badge").className = `badge ${ambComp ? 'badge-error' : 'badge-success'}`;
  document.getElementById("ambient-status-badge").textContent = ambComp ? "Breach Active!" : "Normal";
  
  // Update Refrigerator
  const fridgeComp = currentZoneBreaches["Refrigerated coldroom"] || false;
  document.getElementById("zone-refrigerator").className = `zone-card glass ${fridgeComp ? 'compromised' : ''}`;
  document.getElementById("fridge-status-badge").className = `badge ${fridgeComp ? 'badge-error' : 'badge-success'}`;
  document.getElementById("fridge-status-badge").textContent = fridgeComp ? "Breach Active!" : "Normal";
  
  // Update Freezer
  const freezComp = currentZoneBreaches["Deep Freezer"] || false;
  document.getElementById("zone-freezer").className = `zone-card glass ${freezComp ? 'compromised' : ''}`;
  document.getElementById("freezer-status-badge").className = `badge ${freezComp ? 'badge-error' : 'badge-success'}`;
  document.getElementById("freezer-status-badge").textContent = freezComp ? "Breach Active!" : "Normal";

  // Render items counts stored in each zone
  Object.keys(STORAGE_ZONES).forEach(zoneName => {
    let count = 0;
    inventory.forEach(prod => {
      if (prod.storageZone === zoneName) {
        count += prod.batches.reduce((sum, b) => sum + b.qty, 0);
      }
    });

    let elId = "";
    if (zoneName === "Ambient Cabinet") elId = "ambient-items-count";
    else if (zoneName === "Refrigerated coldroom") elId = "fridge-items-count";
    else if (zoneName === "Deep Freezer") elId = "freezer-items-count";

    if (elId) {
      document.getElementById(elId).textContent = `${count} total units stored`;
    }
  });

  // Render Sensor log table
  const tbody = document.getElementById("sensor-logs-tbody");
  if (!tbody) return;

  if (sensorLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No sensor logs logged.</td></tr>`;
    return;
  }

  tbody.innerHTML = sensorLogs.slice(0, 10).map(log => {
    const isError = log.status === "Breach Alert";
    const dateFormatted = new Date(log.time).toLocaleTimeString() + " " + new Date(log.time).toLocaleDateString();
    return `
      <tr>
        <td style="font-family:monospace; font-size:0.8rem;">${dateFormatted}</td>
        <td style="font-weight:600;">${log.zone}</td>
        <td class="${isError ? 'text-error' : ''}" style="font-weight:700;">${log.temp.toFixed(1)}°C</td>
        <td>${log.humidity ? log.humidity.toFixed(0) + '%' : 'N/A'}</td>
        <td><span class="badge ${isError ? 'badge-error' : 'badge-success'}">${log.status}</span></td>
        <td style="font-size:0.8rem; color:var(--text-secondary);">${log.operator}</td>
      </tr>
    `;
  }).join("");
}

// Render Waste Logs
function renderWasteLogsTable() {
  const tbody = document.getElementById("waste-tbody");
  if (!tbody) return;

  if (wasteLog.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <p>Perfect record! No waste or expired inventory logged yet.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = wasteLog.map(log => {
    const logDate = new Date(log.dateLogged);
    const formattedDate = logDate.toLocaleDateString() + " " + logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let reasonPill = "pill-warning";
    if (log.reason === "Temperature Excursion") reasonPill = "pill-error";
    else if (log.reason === "Expired") reasonPill = "pill-error";
    else if (log.reason === "Physical Damage") reasonPill = "pill-info";

    return `
      <tr>
        <td style="font-family:monospace; font-size:0.78rem;">${formattedDate}</td>
        <td><span class="med-name">${log.name}</span></td>
        <td><code class="batch-bubble" style="margin-top:0;">#${log.batchId}</code></td>
        <td style="font-weight:600;">${log.qty} units</td>
        <td class="text-error" style="font-weight:700;">$${log.lossValue.toFixed(2)}</td>
        <td><span class="pill ${reasonPill}">${log.reason}</span></td>
        <td>
          <div style="font-size:0.82rem; color:var(--text-primary);">${log.actionTaken}</div>
        </td>
      </tr>
    `;
  }).join("");
}

// Populate Dropdowns in Modals dynamically
function populateModalDropdowns() {
  // Dispense Modal Selection
  const dispSelect = document.getElementById("dispense-product-select");
  if (dispSelect) {
    const previousVal = dispSelect.value;
    dispSelect.innerHTML = `<option value="">-- Choose Medicine --</option>` + 
      inventory
        .filter(p => p.batches.some(b => b.qty > 0))
        .map(p => `<option value="${p.id}">${p.name} (${p.storageZone})</option>`).join("");
    dispSelect.value = previousVal;
  }

  // Waste Modal Product Selection
  const wasteSelect = document.getElementById("waste-product-select");
  if (wasteSelect) {
    const previousVal = wasteSelect.value;
    wasteSelect.innerHTML = `<option value="">-- Choose Medicine --</option>` + 
      inventory.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
    wasteSelect.value = previousVal;
  }
}

// ==========================================
// INTERACTIVE EVENT LISTENERS & ROUTING
// ==========================================

// Global Tab Router
document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    const targetTab = button.getAttribute("data-tab");
    
    // Toggle active nav
    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");
    
    // Toggle tab visibility
    document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
    const activeTab = document.getElementById(`tab-${targetTab}`);
    if (activeTab) {
      activeTab.classList.add("active");
    }
  });
});

// Theme Switcher
const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  // Apply stored theme on load
  document.body.className = currentTheme;
  updateThemeButtonUI();

  themeBtn.addEventListener("click", () => {
    if (currentTheme === "dark-theme") {
      currentTheme = "light-theme";
    } else {
      currentTheme = "dark-theme";
    }
    document.body.className = currentTheme;
    localStorage.setItem("medi_theme", currentTheme);
    updateThemeButtonUI();
  });
}

function updateThemeButtonUI() {
  const sunIcon = document.querySelector(".sun-icon");
  const moonIcon = document.querySelector(".moon-icon");
  const themeText = document.querySelector(".theme-text");
  
  if (currentTheme === "dark-theme") {
    sunIcon.classList.add("hidden");
    moonIcon.classList.remove("hidden");
    themeText.textContent = "Toggle Light Mode";
  } else {
    sunIcon.classList.remove("hidden");
    moonIcon.classList.add("hidden");
    themeText.textContent = "Toggle Dark Mode";
  }
}

// Notification Dropdown Toggle
const bellIcon = document.getElementById("bell-icon");
const notifMenu = document.getElementById("notifications-menu");
if (bellIcon && notifMenu) {
  bellIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    notifMenu.classList.toggle("hidden");
  });
  
  document.addEventListener("click", () => {
    notifMenu.classList.add("hidden");
  });
  
  notifMenu.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// Clear Alerts Button
const clearAlertsBtn = document.getElementById("clear-alerts");
if (clearAlertsBtn) {
  clearAlertsBtn.addEventListener("click", () => {
    systemAlerts = [];
    document.getElementById("bell-alert-count").classList.add("hidden");
    document.getElementById("alerts-list").innerHTML = `<div class="empty-dropdown">No active critical alerts</div>`;
    showToast("Notifications cleared", "info");
  });
}

// Clear Sensor Logs
const clearSensorLogsBtn = document.getElementById("clear-sensor-logs");
if (clearSensorLogsBtn) {
  clearSensorLogsBtn.addEventListener("click", () => {
    sensorLogs = [];
    saveState();
    updateUI();
    showToast("Sensor readings log cleared", "info");
  });
}

// ==========================================
// MODAL CONTROLLERS & SUBMISSIONS
// ==========================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    // Trigger animations
    const card = modal.querySelector(".modal-card");
    card.classList.remove("animate-in");
    void card.offsetWidth; // trigger reflow
    card.classList.add("animate-in");
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("active");
}

// Dispense quick modal launcher
function openDispenseModalFor(productId) {
  openModal("dispense-medicine-modal");
  const selectEl = document.getElementById("dispense-product-select");
  if (selectEl) {
    selectEl.value = productId;
    triggerFEFORendering(productId);
  }
}

// Waste quick modal launcher
function openWasteModalFor(productId) {
  openModal("waste-medicine-modal");
  const selectEl = document.getElementById("waste-product-select");
  if (selectEl) {
    selectEl.value = productId;
    triggerWasteBatchesPopulate(productId);
  }
}

// Monitor changes in dispense select to trigger FEFO calculation
const dispenseProductSelect = document.getElementById("dispense-product-select");
if (dispenseProductSelect) {
  dispenseProductSelect.addEventListener("change", (e) => {
    triggerFEFORendering(e.target.value);
  });
}

function triggerFEFORendering(productId) {
  const fefoBox = document.getElementById("fefo-box");
  if (!productId) {
    fefoBox.classList.add("hidden");
    return;
  }

  const recBatch = getFEFORecommendation(productId);
  const product = inventory.find(p => p.id === productId);

  if (recBatch && product) {
    document.getElementById("fefo-batch-code").textContent = `#${recBatch.batchId}`;
    document.getElementById("fefo-expiry-date").textContent = `${recBatch.expiry} (${getDaysDiff(recBatch.expiry)} days left)`;
    document.getElementById("fefo-available-qty").textContent = `${recBatch.qty} ${product.unit}`;
    document.getElementById("fefo-storage-zone").textContent = product.storageZone;
    
    // Set max bounds on input
    const dispenseQtyInput = document.getElementById("dispense-qty");
    const totalSafeUnits = product.batches
      .filter(b => getDaysDiff(b.expiry) > 0 && b.qty > 0 && !currentZoneBreaches[product.storageZone])
      .reduce((sum, b) => sum + b.qty, 0);

    dispenseQtyInput.max = totalSafeUnits;
    dispenseQtyInput.placeholder = `Max safe: ${totalSafeUnits}`;

    fefoBox.classList.remove("hidden");
  } else {
    document.getElementById("fefo-batch-code").textContent = "-";
    document.getElementById("fefo-expiry-date").textContent = "No valid batch (expired or compromised storage)";
    document.getElementById("fefo-available-qty").textContent = "0";
    document.getElementById("fefo-storage-zone").textContent = product ? product.storageZone : "-";
    fefoBox.classList.remove("hidden");
  }
}

// Monitor changes in waste product select to populate batches dropdown
const wasteProductSelect = document.getElementById("waste-product-select");
const wasteBatchSelect = document.getElementById("waste-batch-select");
if (wasteProductSelect && wasteBatchSelect) {
  wasteProductSelect.addEventListener("change", (e) => {
    triggerWasteBatchesPopulate(e.target.value);
  });
  
  wasteBatchSelect.addEventListener("change", (e) => {
    const prodId = wasteProductSelect.value;
    const batchId = e.target.value;
    const prod = inventory.find(p => p.id === prodId);
    if (prod && batchId) {
      const batch = prod.batches.find(b => b.id === batchId);
      if (batch) {
        document.getElementById("waste-qty").max = batch.qty;
        document.getElementById("waste-available-info").textContent = `Stock Limit: ${batch.qty} ${prod.unit} ($${batch.unitPrice.toFixed(2)}/unit)`;
      }
    } else {
      document.getElementById("waste-available-info").textContent = "Select batch to see stock limit";
    }
  });
}

function triggerWasteBatchesPopulate(productId) {
  if (!productId) {
    wasteBatchSelect.innerHTML = `<option value="">-- Choose Batch first --</option>`;
    wasteBatchSelect.disabled = true;
    document.getElementById("waste-available-info").textContent = "Select batch to see stock limit";
    return;
  }

  const product = inventory.find(p => p.id === productId);
  if (product) {
    wasteBatchSelect.innerHTML = `<option value="">-- Choose Batch --</option>` + 
      product.batches
        .filter(b => b.qty > 0)
        .map(b => `<option value="${b.id}">Batch #${b.batchId} (Qty: ${b.qty} | Exp: ${b.expiry})</option>`).join("");
    wasteBatchSelect.disabled = false;
  }
}

// View items in a specific zone modal
document.querySelectorAll(".btn-view-zone-items").forEach(btn => {
  btn.addEventListener("click", () => {
    const zoneName = btn.getAttribute("data-zone");
    document.getElementById("zone-items-title").textContent = `Medicines Stored in: ${zoneName}`;
    
    const tbody = document.getElementById("zone-items-tbody");
    
    // Find all products in zone
    const zoneProducts = [];
    inventory.forEach(p => {
      if (p.storageZone === zoneName) {
        p.batches.forEach(b => {
          if (b.qty > 0) {
            zoneProducts.push({
              name: p.name,
              batchId: b.batchId,
              qty: b.qty,
              unit: p.unit,
              expiry: b.expiry,
              daysLeft: getDaysDiff(b.expiry)
            });
          }
        });
      }
    });

    if (zoneProducts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No medicines stored in this zone.</td></tr>`;
    } else {
      tbody.innerHTML = zoneProducts.map(item => {
        let labelClass = "badge-success";
        let textStatus = "Safe";
        if (item.daysLeft <= 0) {
          labelClass = "badge-error";
          textStatus = "Expired";
        } else if (item.daysLeft <= 30) {
          labelClass = "badge-warning";
          textStatus = "Expiring Soon";
        }
        
        if (currentZoneBreaches[zoneName]) {
          labelClass = "badge-error";
          textStatus = "Compromised";
        }

        return `
          <tr>
            <td style="font-weight:600;">${item.name}</td>
            <td><code>#${item.batchId}</code></td>
            <td>${item.qty} ${item.unit}</td>
            <td>${item.expiry}</td>
            <td><span class="badge ${labelClass}">${textStatus}</span></td>
          </tr>
        `;
      }).join("");
    }

    openModal("zone-items-modal");
  });
});

// Add Stock Form Submit
document.getElementById("add-medicine-form").addEventListener("submit", (e) => {
  e.preventDefault();
  
  const name = document.getElementById("add-name").value.trim();
  const category = document.getElementById("add-category").value;
  const batchId = document.getElementById("add-batch").value.trim().toUpperCase();
  const qty = document.getElementById("add-qty").value;
  const unit = document.getElementById("add-unit").value.trim();
  const unitPrice = document.getElementById("add-unit-price").value;
  const reorder = document.getElementById("add-reorder").value;
  const expiry = document.getElementById("add-expiry").value;
  const storage = document.getElementById("add-storage").value;

  const result = addStockItem(name, category, batchId, qty, unit, unitPrice, expiry, storage, reorder);
  
  if (result.success) {
    showToast(result.message, "success");
    closeModal("add-medicine-modal");
    e.target.reset();
    updateUI();
  } else {
    showToast(result.message, "error");
  }
});

// Dispense Form Submit
document.getElementById("dispense-medicine-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const prodId = document.getElementById("dispense-product-select").value;
  const qty = parseInt(document.getElementById("dispense-qty").value);
  const operator = document.getElementById("dispense-by").value.trim();

  const result = dispenseProduct(prodId, qty, operator);

  if (result.success) {
    showToast(result.message, "success");
    closeModal("dispense-medicine-modal");
    e.target.reset();
    updateUI();
  } else {
    showToast(result.message, "error");
  }
});

// Waste Form Submit
document.getElementById("waste-medicine-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const prodId = document.getElementById("waste-product-select").value;
  const batchId = document.getElementById("waste-batch-select").value;
  const qty = parseInt(document.getElementById("waste-qty").value);
  const reason = document.getElementById("waste-reason").value;
  const action = document.getElementById("waste-action").value.trim();

  const result = logWastage(prodId, batchId, qty, reason, action);

  if (result.success) {
    showToast(result.message, "warning");
    closeModal("waste-medicine-modal");
    e.target.reset();
    document.getElementById("waste-batch-select").disabled = true;
    updateUI();
  } else {
    showToast(result.message, "error");
  }
});

// Manual Temperature Log Form Submit
document.getElementById("log-temp-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const zone = document.getElementById("log-temp-zone").value;
  const temp = parseFloat(document.getElementById("log-temp-val").value);
  const humidityVal = document.getElementById("log-humidity-val").value;
  const humidity = humidityVal ? parseInt(humidityVal) : null;
  const operator = document.getElementById("log-temp-operator").value.trim();

  const spec = STORAGE_ZONES[zone];
  const isHealthy = temp >= spec.tempMin && temp <= spec.tempMax;
  const status = isHealthy ? "Normal" : "Breach Alert";

  // Register in sensor logs
  const logEntry = {
    time: CURRENT_DATE.toISOString(),
    zone,
    temp,
    humidity,
    status,
    operator
  };

  sensorLogs.unshift(logEntry);

  if (isHealthy) {
    // If it was breached, clear breach
    if (currentZoneBreaches[zone]) {
      delete currentZoneBreaches[zone];
      showToast(`Temperature in zone [${zone}] is back to normal. Dispensation unfrozen.`, "success");
    } else {
      showToast(`Logged temperature for ${zone}: ${temp}°C (Target verified)`, "success");
    }
  } else {
    currentZoneBreaches[zone] = true;
    showToast(`CRITICAL BREACH: Zone [${zone}] recorded temperature excursion of ${temp}°C!`, "error");
  }

  saveState();
  closeModal("log-temp-modal");
  e.target.reset();
  updateUI();
});

// ==========================================
// ENVIRONMENT BREACH SIMULATOR
// ==========================================

function simulateTemperatureBreach() {
  // Pick a random storage zone
  const zones = Object.keys(STORAGE_ZONES);
  const randomZone = zones[Math.floor(Math.random() * zones.length)];
  
  let failingTemp = 0;
  if (randomZone === "Deep Freezer") failingTemp = 2.4; // Target: -25 to -10
  else if (randomZone === "Refrigerated coldroom") failingTemp = 14.5; // Target: 2 to 8
  else failingTemp = 32.1; // Target: 15 to 25

  currentZoneBreaches[randomZone] = true;

  // Add sensor log
  const logEntry = {
    time: CURRENT_DATE.toISOString(),
    zone: randomZone,
    temp: failingTemp,
    humidity: randomZone === "Ambient Cabinet" ? 78 : 65,
    status: "Breach Alert",
    operator: "Simulated Telemetry Node"
  };

  sensorLogs.unshift(logEntry);
  saveState();
  updateUI();

  showToast(`CRITICAL STORAGE BREAK: Sensor [${randomZone}] reports breach temperature of ${failingTemp.toFixed(1)}°C!`, "error");
  
  // Flash zone card
  const activeNav = document.querySelector('[data-tab="storage"]');
  if (activeNav) {
    activeNav.click(); // switch tab to show the failure
  }
}

// Bind trigger buttons
const triggerSimBtn = document.getElementById("trigger-sensor-sim");
if (triggerSimBtn) triggerSimBtn.addEventListener("click", simulateTemperatureBreach);

const triggerSimBtnDirect = document.getElementById("trigger-breach-direct");
if (triggerSimBtnDirect) triggerSimBtnDirect.addEventListener("click", simulateTemperatureBreach);

// Search Filters Listeners
document.getElementById("inv-search").addEventListener("input", renderInventoryTable);
document.getElementById("filter-category").addEventListener("change", renderInventoryTable);
document.getElementById("filter-status").addEventListener("change", renderInventoryTable);
document.getElementById("filter-storage").addEventListener("change", renderInventoryTable);

// Global Search bar at top
document.getElementById("global-search").addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  
  // Redirect to inventory tab
  const invTabBtn = document.querySelector('[data-tab="inventory"]');
  if (invTabBtn && !invTabBtn.classList.contains("active")) {
    invTabBtn.click();
  }
  
  const searchInput = document.getElementById("inv-search");
  if (searchInput) {
    searchInput.value = query;
    renderInventoryTable();
  }
});

// ==========================================
// STARTUP BOOTSTRAP
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  updateUI();
});
