// State
let pricesData = [];
let defaults = {};
let settings = {};
let selectedDuration = 1;

// DOM Elements
const elements = {
  currentPrice: document.getElementById('currentPrice'),
  currentPriceTotal: document.getElementById('currentPriceTotal'),
  avgPrice: document.getElementById('avgPrice'),
  maxPrice: document.getElementById('maxPrice'),
  chartDate: document.getElementById('chartDate'),
  chartYAxis: document.getElementById('chartYAxis'),
  priceChart: document.getElementById('priceChart'),
  chartXAxis: document.getElementById('chartXAxis'),
  durationButtons: document.getElementById('durationButtons'),
  bestWindowTime: document.getElementById('bestWindowTime'),
  bestWindowPrice: document.getElementById('bestWindowPrice'),
  countdownBox: document.getElementById('countdownBox'),
  countdownText: document.getElementById('countdownText'),
  kwhInput: document.getElementById('kwhInput'),
  costNow: document.getElementById('costNow'),
  costOptimal: document.getElementById('costOptimal'),
  savings: document.getElementById('savings'),
  settingsGrid: document.getElementById('settingsGrid'),
  resetSettings: document.getElementById('resetSettings'),
  lastUpdated: document.getElementById('lastUpdated')
};

// Initialize
async function init() {
  await loadDefaults();
  loadSettings();
  renderSettings();
  await fetchPrices();

  // Duration button listeners
  elements.durationButtons.addEventListener('click', (e) => {
    if (e.target.classList.contains('duration-btn')) {
      document.querySelectorAll('.duration-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      selectedDuration = parseInt(e.target.dataset.hours);
      updateBestWindow();
      updateCostCalculator();
    }
  });

  elements.kwhInput.addEventListener('input', updateCostCalculator);
  elements.resetSettings.addEventListener('click', resetSettings);

  // Update countdown every minute
  setInterval(updateCountdown, 60000);

  // Refresh prices every 5 minutes
  setInterval(fetchPrices, 5 * 60 * 1000);
}

// Load default values
async function loadDefaults() {
  try {
    const response = await fetch('/defaults.json');
    defaults = await response.json();
  } catch (error) {
    console.error('Vaikeväärtuste laadimine ebaõnnestus:', error);
    defaults = {
      fees: {
        transferDay: 3.95,
        transferNight: 2.30,
        renewableSurcharge: 0.84,
        exciseTax: 0.21,
        vatPercent: 24
      },
      dayHours: { start: 7, end: 23 },
      labels: {},
      units: {}
    };
  }
}

// Load settings from localStorage
function loadSettings() {
  const saved = localStorage.getItem('electricitySettings');
  if (saved) {
    settings = JSON.parse(saved);
  } else {
    settings = { ...defaults.fees };
  }
}

// Save settings to localStorage
function saveSettings() {
  localStorage.setItem('electricitySettings', JSON.stringify(settings));
}

// Reset settings to defaults
function resetSettings() {
  settings = { ...defaults.fees };
  saveSettings();
  renderSettings();
  updateAll();
}

// Render settings form
function renderSettings() {
  const grid = elements.settingsGrid;
  grid.innerHTML = '';

  const labels = {
    transferDay: 'Päevane võrgutasu (07-23)',
    transferNight: 'Öine võrgutasu (23-07)',
    renewableSurcharge: 'Taastuvenergia tasu',
    exciseTax: 'Elektriaktsiis',
    vatPercent: 'Käibemaks'
  };

  const units = {
    transferDay: 's/kWh',
    transferNight: 's/kWh',
    renewableSurcharge: 's/kWh',
    exciseTax: 's/kWh',
    vatPercent: '%'
  };

  const feeKeys = ['transferDay', 'transferNight', 'renewableSurcharge', 'exciseTax', 'vatPercent'];

  feeKeys.forEach(key => {
    const item = document.createElement('div');
    item.className = 'setting-item';

    const label = document.createElement('label');
    label.textContent = labels[key];
    label.htmlFor = `setting-${key}`;

    const inputGroup = document.createElement('div');
    inputGroup.className = 'setting-input-group';

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `setting-${key}`;
    input.step = '0.01';
    input.value = settings[key];
    input.addEventListener('change', (e) => {
      settings[key] = parseFloat(e.target.value) || 0;
      saveSettings();
      updateAll();
    });

    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = units[key];

    inputGroup.appendChild(input);
    inputGroup.appendChild(unit);
    item.appendChild(label);
    item.appendChild(inputGroup);
    grid.appendChild(item);
  });
}

// Fetch prices from API
async function fetchPrices() {
  try {
    const response = await fetch('/api/prices');
    const data = await response.json();

    if (data.error) {
      throw new Error(data.message);
    }

    pricesData = data.prices;
    elements.lastUpdated.textContent = new Date(data.updated).toLocaleString('et-EE');

    updateAll();
  } catch (error) {
    console.error('Hindade laadimine ebaõnnestus:', error);
    elements.currentPrice.textContent = 'Viga';
  }
}

// Update all displays
function updateAll() {
  updateCurrentPrice();
  updateStats();
  updateChart();
  updateBestWindow();
  updateCostCalculator();
}

// Check if hour is day tariff
function isDayHour(date) {
  const hour = date.getHours();
  return hour >= defaults.dayHours.start && hour < defaults.dayHours.end;
}

// Calculate total price with fees
function getTotalPrice(spotPrice, date) {
  const isDay = isDayHour(date);
  const transferFee = isDay ? settings.transferDay : settings.transferNight;
  const subtotal = spotPrice + transferFee + settings.renewableSurcharge + settings.exciseTax;
  const total = subtotal * (1 + settings.vatPercent / 100);
  return total;
}

// Get current hour's price data
function getCurrentPriceData() {
  const now = new Date();
  const currentHour = now.getHours();
  const today = now.toDateString();

  return pricesData.find(p => {
    const priceDate = new Date(p.timestamp);
    return priceDate.toDateString() === today && priceDate.getHours() === currentHour;
  });
}

// Update current price display
function updateCurrentPrice() {
  const current = getCurrentPriceData();

  if (current) {
    const spotPrice = current.price;
    const total = getTotalPrice(spotPrice, new Date(current.timestamp));

    elements.currentPrice.textContent = spotPrice.toFixed(2);
    elements.currentPriceTotal.textContent = `Koos tasudega: ${total.toFixed(2)} s/kWh`;
  } else {
    elements.currentPrice.textContent = '--';
    elements.currentPriceTotal.textContent = 'Koos tasudega: -- s/kWh';
  }
}

// Update statistics
function updateStats() {
  const now = new Date();
  const todayStr = now.toDateString();
  const todayPrices = pricesData.filter(p => new Date(p.timestamp).toDateString() === todayStr);

  if (todayPrices.length > 0) {
    const prices = todayPrices.map(p => p.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const max = Math.max(...prices);

    elements.avgPrice.textContent = `${avg.toFixed(2)} s/kWh`;
    elements.maxPrice.textContent = `${max.toFixed(2)} s/kWh`;
  }
}

// Update chart - line chart showing future prices
function updateChart() {
  const canvas = document.getElementById('chartCanvas');
  const xAxis = elements.chartXAxis;
  const yAxis = elements.chartYAxis;

  xAxis.innerHTML = '';
  yAxis.innerHTML = '';

  if (pricesData.length === 0) return;

  const now = new Date();
  now.setMinutes(0, 0, 0);

  // Filter to future prices only (from current hour onwards)
  const futurePrices = pricesData.filter(p => new Date(p.timestamp) >= now);

  if (futurePrices.length === 0) return;

  // Get price range for scaling
  const allPrices = futurePrices.map(p => p.price);
  const maxPrice = Math.max(...allPrices, 1);
  const minPrice = Math.min(...allPrices);
  const hasNegative = minPrice < 0;

  // Add padding to range
  const paddedMax = maxPrice + Math.abs(maxPrice) * 0.15;
  const paddedMin = hasNegative ? minPrice - Math.abs(minPrice) * 0.15 : Math.min(0, minPrice - 1);
  const priceRange = paddedMax - paddedMin;

  // Y-axis labels (5 labels)
  const ySteps = 5;
  for (let i = 0; i < ySteps; i++) {
    const value = paddedMax - (priceRange / (ySteps - 1)) * i;
    const span = document.createElement('span');
    span.textContent = value.toFixed(1);
    yAxis.appendChild(span);
  }

  // X-axis labels - every 2 hours
  const firstDate = new Date(futurePrices[0].timestamp);
  const lastDate = new Date(futurePrices[futurePrices.length - 1].timestamp);

  elements.chartDate.textContent = `${firstDate.toLocaleDateString('et-EE', { weekday: 'short', day: 'numeric', month: 'short' })} – ${lastDate.toLocaleDateString('et-EE', { weekday: 'short', day: 'numeric', month: 'short' })}`;

  // Create x-axis labels every 2 hours (only even hours)
  for (let i = 0; i < futurePrices.length; i++) {
    const priceDate = new Date(futurePrices[i].timestamp);
    const hour = priceDate.getHours();
    // Show label only for even hours
    if (hour % 2 === 0) {
      const span = document.createElement('span');
      span.className = 'chart-x-label';
      span.textContent = hour.toString().padStart(2, '0');
      xAxis.appendChild(span);
    }
  }

  // Setup canvas
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 10, right: 10, bottom: 10, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find best window
  const best = findBestWindow(selectedDuration);
  const bestIndices = new Set();
  if (best && best.prices.length > 0) {
    best.prices.forEach(p => {
      const idx = futurePrices.findIndex(fp => fp.timestamp === p.timestamp);
      if (idx >= 0) bestIndices.add(idx);
    });
  }

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw zero line if negative prices
  if (hasNegative) {
    const zeroY = padding.top + ((paddedMax - 0) / priceRange) * chartHeight;
    ctx.beginPath();
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw grid lines
  ctx.beginPath();
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i < ySteps; i++) {
    const y = padding.top + (i / (ySteps - 1)) * chartHeight;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
  }
  ctx.stroke();

  // Calculate points
  const points = futurePrices.map((p, i) => {
    const x = padding.left + (i / (futurePrices.length - 1)) * chartWidth;
    const y = padding.top + ((paddedMax - p.price) / priceRange) * chartHeight;
    return { x, y, price: p.price, timestamp: p.timestamp, isBest: bestIndices.has(i) };
  });

  // Draw best window area (green fill)
  if (bestIndices.size > 0) {
    const bestPoints = points.filter(p => p.isBest);
    if (bestPoints.length > 0) {
      const firstBestIdx = points.findIndex(p => p.isBest);
      const lastBestIdx = points.length - 1 - [...points].reverse().findIndex(p => p.isBest);

      ctx.beginPath();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.moveTo(points[firstBestIdx].x, height - padding.bottom);
      for (let i = firstBestIdx; i <= lastBestIdx; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(points[lastBestIdx].x, height - padding.bottom);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw main line
  ctx.beginPath();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  points.forEach((point, i) => {
    if (i === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  // Draw best window line segment (green)
  if (bestIndices.size > 0) {
    ctx.beginPath();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;

    let started = false;
    points.forEach((point, i) => {
      if (point.isBest) {
        if (!started) {
          ctx.moveTo(point.x, point.y);
          started = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
    });
    ctx.stroke();
  }

  // Draw current time line (red dotted)
  const currentX = padding.left;
  ctx.beginPath();
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.moveTo(currentX, padding.top);
  ctx.lineTo(currentX, height - padding.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw dots on line
  points.forEach((point, i) => {
    ctx.beginPath();
    ctx.fillStyle = point.isBest ? '#22c55e' : '#3b82f6';
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Store points for tooltip (optional future use)
  canvas.chartPoints = points;
  canvas.futurePrices = futurePrices;
}

// Find best consecutive window
function findBestWindow(duration) {
  const now = new Date();
  now.setMinutes(0, 0, 0);

  // Filter to only future prices
  const futurePrices = pricesData.filter(p => new Date(p.timestamp) >= now);

  if (futurePrices.length < duration) {
    return null;
  }

  let bestStart = 0;
  let bestAvg = Infinity;

  for (let i = 0; i <= futurePrices.length - duration; i++) {
    const window = futurePrices.slice(i, i + duration);
    const avg = window.reduce((sum, p) => {
      const total = getTotalPrice(p.price, new Date(p.timestamp));
      return sum + total;
    }, 0) / duration;

    if (avg < bestAvg) {
      bestAvg = avg;
      bestStart = i;
    }
  }

  return {
    startIndex: bestStart,
    prices: futurePrices.slice(bestStart, bestStart + duration),
    avgPrice: bestAvg
  };
}

// Update best window display
function updateBestWindow() {
  const best = findBestWindow(selectedDuration);

  if (best && best.prices.length > 0) {
    const startTime = new Date(best.prices[0].timestamp);
    const endTime = new Date(best.prices[best.prices.length - 1].timestamp);
    endTime.setHours(endTime.getHours() + 1);

    const timeStr = `${startTime.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })}`;

    elements.bestWindowTime.textContent = timeStr;
    elements.bestWindowPrice.textContent = `${best.avgPrice.toFixed(2)} s/kWh`;

    updateCountdown();
  } else {
    elements.bestWindowTime.textContent = 'Pole piisavalt andmeid';
    elements.bestWindowPrice.textContent = '-- s/kWh';
    elements.countdownText.textContent = '--';
  }
}

// Update countdown
function updateCountdown() {
  const best = findBestWindow(selectedDuration);

  if (best && best.prices.length > 0) {
    const startTime = new Date(best.prices[0].timestamp);
    const now = new Date();
    const diff = startTime - now;

    if (diff <= 0) {
      elements.countdownBox.classList.remove('waiting');
      elements.countdownText.textContent = 'Soodsaim aeg on praegu!';
    } else {
      elements.countdownBox.classList.add('waiting');
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        elements.countdownText.textContent = `Soodsaim aeg algab ${hours}h ${minutes}min pärast`;
      } else {
        elements.countdownText.textContent = `Soodsaim aeg algab ${minutes} minuti pärast`;
      }
    }
  }
}

// Update cost calculator
function updateCostCalculator() {
  const kwh = parseFloat(elements.kwhInput.value) || 0;

  const current = getCurrentPriceData();
  const best = findBestWindow(selectedDuration);

  if (current) {
    const currentTotal = getTotalPrice(current.price, new Date(current.timestamp));
    const costNow = (currentTotal * kwh / 100).toFixed(3);
    elements.costNow.textContent = `€${costNow}`;
  } else {
    elements.costNow.textContent = '--';
  }

  if (best) {
    const costOptimal = (best.avgPrice * kwh / 100).toFixed(3);
    elements.costOptimal.textContent = `€${costOptimal}`;

    if (current) {
      const currentTotal = getTotalPrice(current.price, new Date(current.timestamp));
      const savingsAmount = ((currentTotal - best.avgPrice) * kwh / 100).toFixed(3);

      if (parseFloat(savingsAmount) > 0.001) {
        elements.savings.textContent = `Säästad €${savingsAmount} oodates`;
      } else if (parseFloat(savingsAmount) < -0.001) {
        elements.savings.textContent = `Praegu on hea aeg! (€${Math.abs(savingsAmount)} odavam)`;
      } else {
        elements.savings.textContent = '';
      }
    }
  } else {
    elements.costOptimal.textContent = '--';
    elements.savings.textContent = '';
  }
}

// Start the app
init();
