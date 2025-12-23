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

// Update chart
function updateChart() {
  const chart = elements.priceChart;
  const xAxis = elements.chartXAxis;
  const yAxis = elements.chartYAxis;
  chart.innerHTML = '';
  xAxis.innerHTML = '';
  yAxis.innerHTML = '';

  if (pricesData.length === 0) return;

  const now = new Date();
  const currentHour = now.getHours();
  const today = now.toDateString();

  // Get price range for scaling
  const allPrices = pricesData.map(p => p.price);
  const maxPrice = Math.max(...allPrices, 1);
  const minPrice = Math.min(...allPrices, 0);
  const priceRange = maxPrice - Math.min(0, minPrice);

  // Y-axis labels
  const yLabels = [maxPrice.toFixed(0), ((maxPrice + minPrice) / 2).toFixed(0), Math.min(0, minPrice).toFixed(0)];
  yLabels.forEach(label => {
    const span = document.createElement('span');
    span.textContent = label;
    yAxis.appendChild(span);
  });

  // Chart date header
  const firstDate = new Date(pricesData[0].timestamp);
  const lastDate = new Date(pricesData[pricesData.length - 1].timestamp);
  elements.chartDate.textContent = `${firstDate.toLocaleDateString('et-EE', { day: 'numeric', month: 'short' })} - ${lastDate.toLocaleDateString('et-EE', { day: 'numeric', month: 'short' })}`;

  // Track current bar position for red line
  let currentBarIndex = -1;

  pricesData.forEach((priceData, index) => {
    const priceDate = new Date(priceData.timestamp);
    const hour = priceDate.getHours();
    const isToday = priceDate.toDateString() === today;
    const isPast = priceDate < now;
    const isCurrent = isToday && hour === currentHour;

    if (isCurrent) {
      currentBarIndex = index;
    }

    // Create bar
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.dataset.index = index;

    if (isPast && !isCurrent) {
      bar.classList.add('past');
    } else {
      bar.classList.add('future');
    }

    if (priceData.price < 0) {
      bar.classList.add('negative');
    }

    // Calculate height
    const height = Math.max(4, ((priceData.price - Math.min(0, minPrice)) / priceRange) * 190);
    bar.style.height = `${height}px`;

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-bar-tooltip';
    const total = getTotalPrice(priceData.price, priceDate);
    tooltip.innerHTML = `${hour}:00<br>${priceData.price.toFixed(2)} s/kWh<br>Kokku: ${total.toFixed(2)} s/kWh`;
    bar.appendChild(tooltip);

    chart.appendChild(bar);

    // X-axis label (show every 3 hours)
    const xLabel = document.createElement('span');
    xLabel.className = 'chart-x-label';
    if (hour % 3 === 0) {
      xLabel.textContent = hour;
    }
    xAxis.appendChild(xLabel);
  });

  // Add red line for current time
  if (currentBarIndex >= 0) {
    const currentLine = document.createElement('div');
    currentLine.className = 'chart-current-line';
    // Position it after the current bar
    const barWidth = chart.children[0]?.offsetWidth || 14;
    const gap = 2;
    const position = (currentBarIndex + 1) * (barWidth + gap) - gap / 2;
    currentLine.style.left = `${position}px`;
    chart.appendChild(currentLine);
  }

  // Highlight best window
  updateBestWindow();
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

  // Clear previous highlighting
  document.querySelectorAll('.chart-bar.best').forEach(bar => {
    bar.classList.remove('best');
  });

  if (best && best.prices.length > 0) {
    const startTime = new Date(best.prices[0].timestamp);
    const endTime = new Date(best.prices[best.prices.length - 1].timestamp);
    endTime.setHours(endTime.getHours() + 1);

    const timeStr = `${startTime.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })}`;

    elements.bestWindowTime.textContent = timeStr;
    elements.bestWindowPrice.textContent = `${best.avgPrice.toFixed(2)} s/kWh`;

    // Highlight best bars
    best.prices.forEach(p => {
      const index = pricesData.findIndex(pd => pd.timestamp === p.timestamp);
      const bar = document.querySelector(`.chart-bar[data-index="${index}"]`);
      if (bar) bar.classList.add('best');
    });

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
