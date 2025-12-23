// State
let pricesData = [];
let defaults = {};
let settings = {};

// DOM Elements
const elements = {
  currentPrice: document.getElementById('currentPrice'),
  currentPriceTotal: document.getElementById('currentPriceTotal'),
  avgPrice: document.getElementById('avgPrice'),
  minPrice: document.getElementById('minPrice'),
  maxPrice: document.getElementById('maxPrice'),
  priceChart: document.getElementById('priceChart'),
  durationSlider: document.getElementById('durationSlider'),
  durationValue: document.getElementById('durationValue'),
  bestWindowTime: document.getElementById('bestWindowTime'),
  bestWindowCountdown: document.getElementById('bestWindowCountdown'),
  bestWindowPrice: document.getElementById('bestWindowPrice'),
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

  // Event listeners
  elements.durationSlider.addEventListener('input', updateBestWindow);
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
    console.error('Failed to load defaults:', error);
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

  const feeKeys = ['transferDay', 'transferNight', 'renewableSurcharge', 'exciseTax', 'vatPercent'];

  feeKeys.forEach(key => {
    const item = document.createElement('div');
    item.className = 'setting-item';

    const label = document.createElement('label');
    label.textContent = defaults.labels[key] || key;
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
    unit.textContent = defaults.units[key] || '';

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
    elements.lastUpdated.textContent = new Date(data.updated).toLocaleString();

    updateAll();
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    elements.currentPrice.textContent = 'Error';
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
    elements.currentPriceTotal.textContent = `Total with fees: ${total.toFixed(2)} cents/kWh`;
  } else {
    elements.currentPrice.textContent = '--';
    elements.currentPriceTotal.textContent = 'Total with fees: -- cents/kWh';
  }
}

// Update statistics
function updateStats() {
  const today = new Date().toDateString();
  const todayPrices = pricesData.filter(p => new Date(p.timestamp).toDateString() === today);

  if (todayPrices.length > 0) {
    const prices = todayPrices.map(p => p.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    elements.avgPrice.textContent = avg.toFixed(2);
    elements.minPrice.textContent = min.toFixed(2);
    elements.maxPrice.textContent = max.toFixed(2);
  }
}

// Update chart
function updateChart() {
  const chart = elements.priceChart;
  chart.innerHTML = '';

  if (pricesData.length === 0) return;

  const now = new Date();
  const currentHour = now.getHours();
  const today = now.toDateString();

  // Find max price for scaling
  const allPrices = pricesData.map(p => p.price);
  const maxPrice = Math.max(...allPrices, 1);
  const minPrice = Math.min(...allPrices, 0);
  const range = maxPrice - Math.min(0, minPrice);

  pricesData.forEach((priceData, index) => {
    const priceDate = new Date(priceData.timestamp);
    const hour = priceDate.getHours();
    const isToday = priceDate.toDateString() === today;

    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.dataset.index = index;

    // Determine bar type
    if (isToday && hour === currentHour) {
      bar.classList.add('current');
    } else if (priceDate < now) {
      bar.classList.add('past');
    } else {
      bar.classList.add('future');
    }

    // Handle negative prices
    if (priceData.price < 0) {
      bar.classList.add('negative');
    }

    // Calculate height (minimum 4px for visibility)
    const height = Math.max(4, ((priceData.price - Math.min(0, minPrice)) / range) * 180);
    bar.style.height = `${height}px`;

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-bar-tooltip';
    const total = getTotalPrice(priceData.price, priceDate);
    tooltip.innerHTML = `${hour}:00<br>${priceData.price.toFixed(2)} c/kWh<br>Total: ${total.toFixed(2)}`;
    bar.appendChild(tooltip);

    chart.appendChild(bar);
  });
}

// Find best consecutive window
function findBestWindow(duration) {
  const now = new Date();

  // Filter to only future prices (including current hour)
  const futurePrices = pricesData.filter(p => new Date(p.timestamp) >= new Date(now.setMinutes(0, 0, 0)));

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
  const duration = parseInt(elements.durationSlider.value);
  elements.durationValue.textContent = `${duration} hour${duration > 1 ? 's' : ''}`;

  const best = findBestWindow(duration);

  // Update chart highlighting
  document.querySelectorAll('.chart-bar.best').forEach(bar => {
    bar.classList.remove('best');
  });

  if (best && best.prices.length > 0) {
    const startTime = new Date(best.prices[0].timestamp);
    const endTime = new Date(best.prices[best.prices.length - 1].timestamp);
    endTime.setHours(endTime.getHours() + 1);

    const startStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endStr = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = startTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

    elements.bestWindowTime.textContent = `${dateStr} ${startStr} - ${endStr}`;
    elements.bestWindowPrice.textContent = best.avgPrice.toFixed(2);

    // Highlight best bars on chart
    best.prices.forEach(p => {
      const index = pricesData.findIndex(pd => pd.timestamp === p.timestamp);
      const bar = document.querySelector(`.chart-bar[data-index="${index}"]`);
      if (bar) bar.classList.add('best');
    });

    updateCountdown();
  } else {
    elements.bestWindowTime.textContent = 'Not enough data';
    elements.bestWindowPrice.textContent = '--';
    elements.bestWindowCountdown.textContent = '';
  }
}

// Update countdown
function updateCountdown() {
  const duration = parseInt(elements.durationSlider.value);
  const best = findBestWindow(duration);

  if (best && best.prices.length > 0) {
    const startTime = new Date(best.prices[0].timestamp);
    const now = new Date();
    const diff = startTime - now;

    if (diff <= 0) {
      elements.bestWindowCountdown.textContent = 'Window is active now!';
    } else {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        elements.bestWindowCountdown.textContent = `Starts in ${hours}h ${minutes}min`;
      } else {
        elements.bestWindowCountdown.textContent = `Starts in ${minutes} minutes`;
      }
    }
  }
}

// Update cost calculator
function updateCostCalculator() {
  const kwh = parseFloat(elements.kwhInput.value) || 0;
  const duration = parseInt(elements.durationSlider.value);

  const current = getCurrentPriceData();
  const best = findBestWindow(duration);

  if (current) {
    const currentTotal = getTotalPrice(current.price, new Date(current.timestamp));
    const costNow = (currentTotal * kwh / 100).toFixed(2);
    elements.costNow.textContent = `€${costNow}`;
  } else {
    elements.costNow.textContent = '--';
  }

  if (best) {
    const costOptimal = (best.avgPrice * kwh / 100).toFixed(2);
    elements.costOptimal.textContent = `€${costOptimal}`;

    if (current) {
      const currentTotal = getTotalPrice(current.price, new Date(current.timestamp));
      const savingsAmount = ((currentTotal - best.avgPrice) * kwh / 100).toFixed(2);

      if (savingsAmount > 0) {
        elements.savings.textContent = `Save €${savingsAmount} by waiting`;
      } else if (savingsAmount < 0) {
        elements.savings.textContent = `Now is a good time! (€${Math.abs(savingsAmount)} cheaper)`;
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
