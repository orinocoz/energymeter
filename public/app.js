// State
let pricesData = [];        // Raw 15-min data from API
let displayPrices = [];     // Prices aggregated to selected resolution
let defaults = {};
let settings = {};
let selectedDuration = 1;   // Hours
let selectedResolution = 15; // Minutes (60 = 1h, 15 = 15min)
let selectedMode = 'consecutive'; // 'consecutive' or 'cheapest'
let showDualLines = false;  // Show two price lines on chart

// Helper to get all network packages from both under-63A and over-63A categories
function getAllPackages() {
  const under63 = defaults.network_tariffs?.packages_low_voltage_upto_63A || {};
  const over63 = defaults.network_tariffs?.packages_low_voltage_over_63A || {};
  return { ...under63, ...over63 };
}

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
  durationSlider: document.getElementById('durationSlider'),
  durationValue: document.getElementById('durationValue'),
  durationModeButtons: document.getElementById('durationModeButtons'),
  bestWindowTime: document.getElementById('bestWindowTime'),
  bestWindowPrice: document.getElementById('bestWindowPrice'),
  countdownBox: document.getElementById('countdownBox'),
  countdownText: document.getElementById('countdownText'),
  kwhInput: document.getElementById('kwhInput'),
  costNow: document.getElementById('costNow'),
  costOptimal: document.getElementById('costOptimal'),
  savings: document.getElementById('savings'),
  settingsGrid: document.getElementById('settingsGrid'),
  networkPackage: document.getElementById('networkPackage'),
  packageInfo: document.getElementById('packageInfo'),
  resetSettings: document.getElementById('resetSettings'),
  lastUpdated: document.getElementById('lastUpdated'),
  resolutionButtons: document.getElementById('resolutionButtons'),
  chartToggleFull: document.getElementById('chartToggleFull'),
  showDualLines: document.getElementById('showDualLines'),
  chartLegend: document.getElementById('chartLegend')
};

// Parse duration input (accepts 'H:MM' or decimal like '1.5' or '1,5') and normalize to nearest 0.25 hours
function parseDurationInput(raw) {
  if (raw === '' || raw === null || typeof raw === 'undefined') return null;
  const s = String(raw).trim();
  // H:MM format
  if (s.includes(':')) {
    const [hStr, mStr] = s.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (isNaN(h) || isNaN(m)) return NaN;
    const total = h + (m / 60);
    return Math.round(total * 4) / 4;
  }
  // Decimal format (accept comma)
  const normalizedStr = s.replace(',', '.');
  const v = parseFloat(normalizedStr);
  if (isNaN(v)) return NaN;
  return Math.round(v * 4) / 4;
}

// Format decimal hours to H:MM string (minutes will be multiples of 15)
function formatHoursToInputString(hours) {
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
} 

// Initialize
async function init() {
  await loadDefaults();
  loadSettings();
  renderSettings();
  await fetchPrices();

  // Resolution button listeners
  elements.resolutionButtons.addEventListener('click', (e) => {
    if (e.target.classList.contains('toggle-btn') && e.target.dataset.resolution) {
      elements.resolutionButtons.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      selectedResolution = parseInt(e.target.dataset.resolution);

      // Update slider step and value based on resolution
      updateSliderStep();

      // Save and recalculate display prices and update everything
      saveSettings();
      calculateDisplayPrices();
      updateAll();
    }
  });

  // Duration slider listener
  if (elements.durationSlider) {
    elements.durationSlider.addEventListener('input', () => {
      selectedDuration = parseFloat(elements.durationSlider.value);
      updateDurationDisplay();
      saveSettings();
      updateChart();
      updateBestWindow();
      updateCostCalculator();
    });
  }

  // Helper to update slider step based on resolution
  function updateSliderStep() {
    if (!elements.durationSlider) return;
    const step = (selectedResolution === 15) ? 0.25 : 1;
    const min = (selectedResolution === 15) ? 0.25 : 1;
    elements.durationSlider.step = step;
    elements.durationSlider.min = min;

    // Round current value to new step
    let normalized = Math.round(selectedDuration / step) * step;
    if (normalized < min) normalized = min;
    selectedDuration = normalized;
    elements.durationSlider.value = normalized;
    updateDurationDisplay();
  }

  // Helper to update duration display text
  function updateDurationDisplay() {
    if (elements.durationValue) {
      elements.durationValue.textContent = formatHoursToInputString(selectedDuration);
    }
  }

  // Duration mode (consecutive vs cheapest) listeners
  if (elements.durationModeButtons) {
    elements.durationModeButtons.addEventListener('click', (e) => {
      if (e.target.classList.contains('toggle-btn') && e.target.dataset.mode) {
        elements.durationModeButtons.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        selectedMode = e.target.dataset.mode;
        // Save and update views
        saveSettings();
        updateChart();
        updateBestWindow();
        updateCostCalculator();
      }
    });
  }

  // Chart fullscreen / expand toggle (expands chart area to screen width)
  if (elements.chartToggleFull) {
    let chartExpanded = false;
    elements.chartToggleFull.addEventListener('click', () => {
      chartExpanded = !chartExpanded;
      document.body.classList.toggle('chart-expanded', chartExpanded);
      // Use icons: ⤢ expand, ⤡ collapse
      elements.chartToggleFull.innerHTML = chartExpanded ? '⤡' : '⤢';
      elements.chartToggleFull.setAttribute('title', chartExpanded ? 'Vähenda graafikut' : 'Suurenda graafikut');
      elements.chartToggleFull.setAttribute('aria-label', chartExpanded ? 'Vähenda graafikut' : 'Suurenda graafikut');
      // Force redraw to pick up new sizes
      updateChart();
    });
  }

  elements.kwhInput.addEventListener('input', updateCostCalculator);
  elements.resetSettings.addEventListener('click', resetSettings);

  // Dual lines toggle listener
  if (elements.showDualLines) {
    elements.showDualLines.checked = showDualLines;
    updateChartLegend(); // Set initial legend visibility
    elements.showDualLines.addEventListener('change', (e) => {
      showDualLines = e.target.checked;
      saveSettings();
      updateChartLegend();
      updateChart();
    });
  }

  // Restore UI state from saved settings
  // Resolution buttons
  elements.resolutionButtons.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.resolution) === selectedResolution);
  });
  // Duration slider
  if (elements.durationSlider) {
    updateSliderStep();
    elements.durationSlider.value = selectedDuration;
    updateDurationDisplay();
  }
  // Mode buttons
  elements.durationModeButtons.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
  });

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
    console.log('Defaults loaded:', !!defaults.network_tariffs);
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
    // Restore UI preferences from settings if present
    if (settings.selectedResolution !== undefined) {
      selectedResolution = settings.selectedResolution;
    }
    if (settings.selectedDuration !== undefined) {
      selectedDuration = settings.selectedDuration;
    }
    if (settings.selectedMode !== undefined) {
      selectedMode = settings.selectedMode;
    }
    if (settings.showDualLines !== undefined) {
      showDualLines = settings.showDualLines;
    }
  } else {
    settings = { ...defaults.fees };
    // default network package selection (prefer VML2, then VORK2 if available)
    const pkgs = Object.keys(getAllPackages());
    settings.networkPackage = pkgs.includes('VML2') ? 'VML2' : (pkgs.includes('VORK2') ? 'VORK2' : (pkgs[0] || null));
    // If defaults include a known security fee in network_tariffs, seed it so the UI shows it
    const national = defaults.network_tariffs?.national_fees_and_taxes_cents_per_kwh || {};
    settings.securityOfSupplyFee = national.security_of_supply_fee?.excl_vat ?? settings.securityOfSupplyFee ?? null;
  }
}

// Save settings to localStorage
function saveSettings() {
  // Include UI preferences in saved settings
  settings.selectedResolution = selectedResolution;
  settings.selectedDuration = selectedDuration;
  settings.selectedMode = selectedMode;
  settings.showDualLines = showDualLines;
  localStorage.setItem('electricitySettings', JSON.stringify(settings));
}

// Reset settings to defaults
function resetSettings() {
  settings = { ...defaults.fees };
  const pkgs = Object.keys(getAllPackages());
  settings.networkPackage = pkgs.includes('VML2') ? 'VML2' : (pkgs.includes('VORK2') ? 'VORK2' : (pkgs[0] || null));
  saveSettings();
  renderSettings();
  updateAll();
}

// Render settings form
function renderSettings() {
  const grid = elements.settingsGrid;
  grid.innerHTML = '';

  // If a network package is selected, apply its default fees to the settings so inputs show package values
  applyPackageToSettings(settings.networkPackage);

  const labels = {
    transferDay: 'Päevane võrgutasu (07-23)',
    transferNight: 'Öine võrgutasu (23-07)',
    renewableSurcharge: 'Taastuvenergia tasu',
    securityOfSupplyFee: 'Varustuskindluse tasu',
    exciseTax: 'Elektriaktsiis',
    balancingCapacityFee: 'Tasakaalustamise tasu',
    vatPercent: 'Käibemaks',
    purchaseMargin: 'Ostumarginaal',
    salesMargin: 'Müügimarginaal'
  };

  const units = {
    transferDay: 's/kWh',
    transferNight: 's/kWh',
    renewableSurcharge: 's/kWh',
    securityOfSupplyFee: 's/kWh',
    exciseTax: 's/kWh',
    balancingCapacityFee: 's/kWh',
    vatPercent: '%',
    purchaseMargin: 's/kWh',
    salesMargin: 's/kWh'
  };

  const feeKeys = ['transferDay', 'transferNight', 'renewableSurcharge', 'securityOfSupplyFee', 'exciseTax', 'balancingCapacityFee', 'vatPercent', 'purchaseMargin', 'salesMargin'];

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
    // If the setting is null/undefined, leave input blank
    input.value = (settings[key] === null || settings[key] === undefined) ? '' : settings[key];
    input.addEventListener('change', (e) => {
      // Empty input -> clear setting (do not interpret as zero)
      if (e.target.value === '' || e.target.value === null) {
        settings[key] = null;
      } else {
        settings[key] = parseFloat(e.target.value) || 0;
      }
      saveSettings();
      updateAll();
    });

    item.appendChild(label);
    inputGroup.appendChild(input);

    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = units[key];

    inputGroup.appendChild(unit);

    // No special note — security fee is treated like other fees and VAT will be applied
    item.appendChild(inputGroup);
    grid.appendChild(item);
  });

  // Populate network package selector
  const networkSelect = document.getElementById('networkPackage');
  const packageInfo = document.getElementById('packageInfo');
  if (networkSelect) {
    // Always include an explicit empty option (no package selected)
    networkSelect.innerHTML = '<option value="">Pole valitud</option>';

    const pkgs = getAllPackages();
    const pkgKeys = Object.keys(pkgs);
    console.log('renderSettings: network packages available?', pkgKeys.length > 0);
    if (pkgKeys.length > 0) {
      console.log('renderSettings: packages', pkgKeys);
      pkgKeys.forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${key} — ${pkgs[key].label}`;
        networkSelect.appendChild(opt);
      });

      // If a saved package is no longer present, clear it
      if (settings.networkPackage && !pkgs[settings.networkPackage]) {
        console.log('Saved networkPackage no longer present, clearing');
        settings.networkPackage = null;
        saveSettings();
      }
    }

    // Set current value (allow empty)
    networkSelect.value = (settings.networkPackage === undefined || settings.networkPackage === null) ? '' : settings.networkPackage;
    renderPackageInfo(networkSelect.value);

    networkSelect.addEventListener('change', (e) => {
      settings.networkPackage = e.target.value || null; // store null when unselected
      // Apply package to settings fields (transferDay/Night, national fees)
      applyPackageToSettings(settings.networkPackage);
      saveSettings();
      renderPackageInfo(settings.networkPackage);
      // Recalculate display prices (chart/stats depend on package) and update all
      calculateDisplayPrices();
      updateAll();
      // Update DOM input values to reflect applied package
      const feeKeys = ['transferDay', 'transferNight', 'renewableSurcharge', 'securityOfSupplyFee', 'exciseTax', 'balancingCapacityFee', 'vatPercent'];
      feeKeys.forEach(k => {
        const el = document.getElementById('setting-' + k);
        if (el) el.value = settings[k];
      });
    });
  }

  // Helper to show package info
  function renderPackageInfo(pkgId) {
    if (!packageInfo) return;
    const pkgs = getAllPackages();
    if (!pkgId || !pkgs[pkgId]) {
      packageInfo.textContent = 'Pole valitud — näidatakse ainult börsihinda';
      return;
    }
    const p = pkgs[pkgId];
    const periodLabels = {
      'DAY': 'Päev',
      'NIGHT': 'Öö',
      'DAY_PEAK': 'Päeva tipp',
      'REST_PEAK': 'Puhkepäeva tipp',
      'FLAT': 'Ühtne'
    };
    const periods = p.periods.map(period => periodLabels[period] || period).join(', ');
    const dayPrice = p.energy_cents_per_kwh.excl_vat.DAY !== undefined ? `${p.energy_cents_per_kwh.excl_vat.DAY} s/kWh (päev)` : '';
    const flat = p.energy_cents_per_kwh.excl_vat.FLAT !== undefined ? `${p.energy_cents_per_kwh.excl_vat.FLAT} s/kWh (ühtne)` : '';
    packageInfo.textContent = `${periods} ${dayPrice}${flat ? (dayPrice ? ' • ' : '') + flat : ''}`;
    // Note: chart and stats reflect total price (võrgutasu + riigitasud + KM) when a package is selected
    const note = document.createElement('div');
    note.className = 'package-note';
    note.textContent = 'Diagramm ja statistika näitavad nüüd kogu hinda koos võrgutasu ja maksudega.';
    // remove any old note
    const old = packageInfo.querySelector('.package-note');
    if (old) old.remove();
    packageInfo.appendChild(note);
  }

  // Apply package to settings values (update settings.* fields but do not persist automatically)
  function applyPackageToSettings(pkgId) {
    // If none selected, clear some settings so inputs show empty (fees are not applied until a package is chosen)
    // Note: keep securityOfSupplyFee seeded from national defaults so it remains visible in the UI
    if (!pkgId) {
      settings.transferDay = null;
      settings.transferNight = null;
      settings.renewableSurcharge = null;
      settings.exciseTax = null;
      settings.balancingCapacityFee = null;
      settings.vatPercent = null;
      settings.purchaseMargin = null;
      settings.salesMargin = null;
      return;
    }

    const pkgs = getAllPackages();
    const pkg = pkgs[pkgId];
    if (!pkg) return;

    // Energy rates in cents/kWh (excl VAT)
    const e = pkg.energy_cents_per_kwh?.excl_vat || {};
    // For day/night fields, prefer DAY/NIGHT, fallback to FLAT if present
    settings.transferDay = (e.DAY !== undefined) ? e.DAY : (e.FLAT !== undefined ? e.FLAT : settings.transferDay);
    settings.transferNight = (e.NIGHT !== undefined) ? e.NIGHT : (e.FLAT !== undefined ? e.FLAT : settings.transferNight);

    // National fees from network_tariffs section
    const national = defaults.network_tariffs?.national_fees_and_taxes_cents_per_kwh || {};
    settings.renewableSurcharge = national.renewable_energy_fee?.excl_vat ?? settings.renewableSurcharge;
    settings.exciseTax = national.electricity_excise?.excl_vat ?? settings.exciseTax;
    settings.securityOfSupplyFee = national.security_of_supply_fee?.excl_vat ?? settings.securityOfSupplyFee;
    settings.balancingCapacityFee = national.balancing_capacity_fee?.excl_vat ?? settings.balancingCapacityFee;

    // Keep VAT as configured in defaults.fees
    settings.vatPercent = defaults.fees?.vatPercent ?? settings.vatPercent;

    // Margins from defaults.fees
    settings.purchaseMargin = defaults.fees?.purchaseMargin ?? settings.purchaseMargin ?? 0;
    settings.salesMargin = defaults.fees?.salesMargin ?? settings.salesMargin ?? 1;
  }
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

    // Calculate display prices based on selected resolution
    calculateDisplayPrices();
    updateAll();

    console.log('Prices loaded', pricesData.length, 'slots');
  } catch (error) {
    console.error('Hindade laadimine ebaõnnestus:', error);
    elements.currentPrice.textContent = 'Viga';
  }
}

// Return the displayed price (cents/kWh) for a slot
// If a package is selected, return the total (incl. network fees, national fees and VAT).
// If no package is selected, return the raw spot price (no VAT, no extra fees) as requested.
function getDisplayedPriceForSlot(spotPrice, timestamp) {
  if (settings.networkPackage) {
    return getTotalPrice(spotPrice, new Date(timestamp));
  }
  return spotPrice;
}

// Calculate display prices based on resolution (aggregate 15-min to 1h if needed)
function calculateDisplayPrices() {
  if (selectedResolution === 15) {
    // Use raw 15-minute data, but attach a displayPrice field (spot or total depending on package)
    displayPrices = pricesData.map(p => ({
      timestamp: p.timestamp,
      price: p.price,
      displayPrice: getDisplayedPriceForSlot(p.price, p.timestamp)
    }));
  } else {
    // Aggregate to hourly: group by hour and average both spot and display prices
    const hourlyMap = new Map();

    pricesData.forEach(p => {
      const date = new Date(p.timestamp);
      // Round down to hour
      date.setMinutes(0, 0, 0);
      const hourKey = date.toISOString();

      if (!hourlyMap.has(hourKey)) {
        hourlyMap.set(hourKey, { spotPrices: [], displayPrices: [], timestamp: hourKey });
      }
      const bucket = hourlyMap.get(hourKey);
      bucket.spotPrices.push(p.price);
      bucket.displayPrices.push(getDisplayedPriceForSlot(p.price, p.timestamp));
    });

    // Calculate average for each hour
    displayPrices = Array.from(hourlyMap.values()).map(h => ({
      timestamp: h.timestamp,
      price: h.spotPrices.reduce((a, b) => a + b, 0) / h.spotPrices.length,
      displayPrice: h.displayPrices.reduce((a, b) => a + b, 0) / h.displayPrices.length
    }));

    // Sort by timestamp
    displayPrices.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
}

// Update chart legend visibility based on dual lines mode
function updateChartLegend() {
  if (!elements.chartLegend) return;
  const spotItems = elements.chartLegend.querySelectorAll('.legend-spot-only');
  const fullItems = elements.chartLegend.querySelectorAll('.legend-full-only');
  const mainItem = elements.chartLegend.querySelector('.legend-item:first-child'); // "Hind" item

  spotItems.forEach(item => item.style.display = showDualLines ? 'flex' : 'none');
  fullItems.forEach(item => item.style.display = showDualLines ? 'flex' : 'none');
  if (mainItem) mainItem.style.display = showDualLines ? 'none' : 'flex';
}

// Update all displays
function updateAll() {
  updateCurrentPrice();
  updateStats();
  updateChartLegend();
  updateChart();
  updateBestWindow();
  updateCostCalculator();
}

// --- Holiday & time rules helpers ---
function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function timeInRange(date, startHHMM, endHHMM) {
  const mins = date.getHours() * 60 + date.getMinutes();
  const start = parseTimeToMinutes(startHHMM);
  const end = parseTimeToMinutes(endHHMM);
  if (start <= end) {
    return mins >= start && mins < end;
  }
  // Overnight range (e.g., 22:00 - 07:00)
  return mins >= start || mins < end;
}

// Compute Easter Sunday (Gregorian algorithm)
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = {};
function getHolidaysForYear(year) {
  if (holidayCache[year]) return holidayCache[year];
  const holidays = new Set();
  const rules = defaults.network_tariffs?.estonia_public_holidays?.rules || [];
  rules.forEach(r => {
    if (r.type === 'fixed') {
      const d = new Date(year, r.month - 1, r.day);
      holidays.add(d.toDateString());
    } else if (r.type === 'easter_offset') {
      const easter = easterSunday(year);
      const d = new Date(easter);
      d.setDate(d.getDate() + (r.offset_days || 0));
      holidays.add(d.toDateString());
    }
  });
  holidayCache[year] = holidays;
  return holidays;
}

function isPublicHoliday(date) {
  const y = date.getFullYear();
  const set = getHolidaysForYear(y);
  return set.has(new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString());
}

function isWeekend(date) {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

function isRestDay(date) {
  return isWeekend(date) || isPublicHoliday(date);
}

// Determine the base DAY/NIGHT according to time_rules
function baseDayRuleMatches(date) {
  const dayRule = defaults.network_tariffs?.time_rules?.day;
  if (!dayRule) {
    // fallback to previous defaults
    return date.getHours() >= defaults.dayHours.start && date.getHours() < defaults.dayHours.end;
  }
  const dow = date.getDay(); // 0 Sun ... 6 Sat
  const isWeekday = dow >= 1 && dow <= 5;
  if (!isWeekday) return false;
  if (isPublicHoliday(date)) return false;
  return timeInRange(date, dayRule.start, dayRule.end);
}

// Determine package-specific period (DAY, NIGHT, DAY_PEAK, REST_PEAK, FLAT)
function getPackagePeriod(pkgId, date) {
  const pkgs = getAllPackages();
  const pkg = pkgs[pkgId];
  // fallback
  if (!pkg) {
    return baseDayRuleMatches(date) ? 'DAY' : 'NIGHT';
  }

  // If package has FLAT only
  if (pkg.periods && pkg.periods.includes('FLAT')) return 'FLAT';

  // Peaks logic
  const peaks = defaults.network_tariffs?.time_rules?.peaks;
  const month = date.getMonth() + 1; // 1-12
  const winterMonths = peaks?.season?.winter?.months || [11,12,1,2,3];
  const inWinter = winterMonths.includes(month);

  // REST_PEAK check: if rest day and window matches
  if (pkg.periods.includes('REST_PEAK') && inWinter && isRestDay(date)) {
    const windows = peaks?.rest_day_peak_windows_winter || [];
    for (const w of windows) {
      if (timeInRange(date, w.start, w.end)) return 'REST_PEAK';
    }
  }

  // DAY_PEAK check: if weekday and window matches
  if (pkg.periods.includes('DAY_PEAK') && inWinter && !isRestDay(date)) {
    const windows = peaks?.weekday_day_peak_windows_winter || [];
    for (const w of windows) {
      if (timeInRange(date, w.start, w.end)) return 'DAY_PEAK';
    }
  }

  // Day or night fallback
  return baseDayRuleMatches(date) ? 'DAY' : 'NIGHT';
}

function getNetworkEnergyPrice(pkgId, date) {
  // returns cents per kWh (excl VAT)
  const pkgs = getAllPackages();
  const pkg = pkgs[pkgId];
  if (pkg) {
    const period = getPackagePeriod(pkgId, date);
    const price = pkg.energy_cents_per_kwh?.excl_vat?.[period];
    if (price !== undefined) return price;
    // Try DAY/NIGHT fallback
    if (period !== 'FLAT') {
      const tryPeriod = period === 'DAY_PEAK' || period === 'REST_PEAK' ? 'DAY' : period;
      const fallback = pkg.energy_cents_per_kwh?.excl_vat?.[tryPeriod];
      if (fallback !== undefined) return fallback;
    }
  }
  // Fallback to old transferDay/transferNight settings
  return baseDayRuleMatches(date) ? settings.transferDay : settings.transferNight;
}

// Calculate total price with fees (spotPrice and network fees + national fees), VAT applied at the end
function getTotalPrice(spotPrice, date) {
  // If no package is selected, do not apply network or national fees or VAT — return raw spotPrice
  if (!settings.networkPackage) return spotPrice;

  const networkFee = getNetworkEnergyPrice(settings.networkPackage, date);
  const national = defaults.network_tariffs?.national_fees_and_taxes_cents_per_kwh || {};
  const renewable = national.renewable_energy_fee?.excl_vat ?? settings.renewableSurcharge ?? 0;

  // Excise tax with date-based changes support
  let excise = national.electricity_excise?.excl_vat ?? settings.exciseTax ?? 0;
  const exciseChanges = national.electricity_excise?.changes || [];
  for (const change of exciseChanges) {
    if (change.effective_from) {
      const eff = new Date(change.effective_from + 'T00:00:00Z');
      if (date >= eff) excise = change.excl_vat;
    }
  }

  // Security of supply fee with effective date
  let securityFee = 0;
  const sec = national.security_of_supply_fee;
  if (sec && sec.effective_from) {
    const eff = new Date(sec.effective_from + 'T00:00:00Z');
    if (date >= eff) securityFee = sec.excl_vat || 0;
  }
  // If national does not define a security fee for the date, fall back to user-configured / seeded value
  if (!securityFee) securityFee = settings.securityOfSupplyFee ?? 0;

  // Balancing capacity fee with effective date
  let balancingFee = 0;
  const bal = national.balancing_capacity_fee;
  if (bal && bal.effective_from) {
    const eff = new Date(bal.effective_from + 'T00:00:00Z');
    if (date >= eff) balancingFee = bal.excl_vat || 0;
  }
  // Fall back to user-configured / seeded value
  if (!balancingFee) balancingFee = settings.balancingCapacityFee ?? 0;

  const subtotal = spotPrice + networkFee + renewable + excise + securityFee + balancingFee;
  const total = subtotal * (1 + (settings.vatPercent || defaults.fees?.vatPercent || 0) / 100);
  return total;
}

// Get spot price without VAT (raw spot price only)
function getSpotPriceNoVat(spotPrice) {
  return spotPrice;
}

// Get full price with all fees + margins + VAT (for dual line chart)
function getFullPriceWithMargins(spotPrice, date) {
  // Start with the base total price
  const baseTotal = getTotalPrice(spotPrice, date);

  // If no package selected, just return spot price (no margins applied)
  if (!settings.networkPackage) return spotPrice;

  // Add margins (before VAT is applied, so we need to recalculate)
  const networkFee = getNetworkEnergyPrice(settings.networkPackage, date);
  const national = defaults.network_tariffs?.national_fees_and_taxes_cents_per_kwh || {};
  const renewable = national.renewable_energy_fee?.excl_vat ?? settings.renewableSurcharge ?? 0;

  let excise = national.electricity_excise?.excl_vat ?? settings.exciseTax ?? 0;
  const exciseChanges = national.electricity_excise?.changes || [];
  for (const change of exciseChanges) {
    if (change.effective_from) {
      const eff = new Date(change.effective_from + 'T00:00:00Z');
      if (date >= eff) excise = change.excl_vat;
    }
  }

  let securityFee = 0;
  const sec = national.security_of_supply_fee;
  if (sec && sec.effective_from) {
    const eff = new Date(sec.effective_from + 'T00:00:00Z');
    if (date >= eff) securityFee = sec.excl_vat || 0;
  }
  if (!securityFee) securityFee = settings.securityOfSupplyFee ?? 0;

  let balancingFee = 0;
  const bal = national.balancing_capacity_fee;
  if (bal && bal.effective_from) {
    const eff = new Date(bal.effective_from + 'T00:00:00Z');
    if (date >= eff) balancingFee = bal.excl_vat || 0;
  }
  if (!balancingFee) balancingFee = settings.balancingCapacityFee ?? 0;

  // Add margins
  const purchaseMargin = settings.purchaseMargin ?? defaults.fees?.purchaseMargin ?? 0;
  const salesMargin = settings.salesMargin ?? defaults.fees?.salesMargin ?? 0;

  const subtotal = spotPrice + networkFee + renewable + excise + securityFee + balancingFee + purchaseMargin + salesMargin;
  const total = subtotal * (1 + (settings.vatPercent || defaults.fees?.vatPercent || 0) / 100);
  return total;
}

// Get current price data (finds matching 15-min or hourly slot)
function getCurrentPriceData() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const today = now.toDateString();

  // For 15-min resolution, find the exact 15-min slot
  // For hourly, find matching hour
  return pricesData.find(p => {
    const priceDate = new Date(p.timestamp);
    if (priceDate.toDateString() !== today) return false;
    if (priceDate.getHours() !== currentHour) return false;

    // Check if this is the right 15-min slot
    const priceMinute = priceDate.getMinutes();
    const currentSlot = Math.floor(currentMinute / 15) * 15;
    return priceMinute === currentSlot;
  });
}

// Update current price display
function updateCurrentPrice() {
  const current = getCurrentPriceData();

  if (current) {
    const spotPrice = current.price;
    const vat = (settings.vatPercent !== undefined && settings.vatPercent !== null) ? settings.vatPercent : defaults.fees?.vatPercent || 0;
    const spotDisplay = !settings.networkPackage ? spotPrice : spotPrice * (1 + vat / 100);

    // If a network package is NOT selected, show only the market price (no combined total)
    if (!settings.networkPackage) {
      elements.currentPrice.textContent = spotDisplay.toFixed(2);
      elements.currentPriceTotal.textContent = '';
    } else {
      const total = getTotalPrice(spotPrice, new Date(current.timestamp));
      elements.currentPrice.textContent = spotDisplay.toFixed(2);
      const pkgId = settings.networkPackage;
      const pkgLabel = getAllPackages()[pkgId]?.label || '';
      elements.currentPriceTotal.innerHTML = `Koos tasudega: <strong>${total.toFixed(2)}</strong> s/kWh${pkgLabel ? ' · Elektripakett: ' + pkgLabel : ''}`;
    }
  } else {
    elements.currentPrice.textContent = '--';
    elements.currentPriceTotal.innerHTML = 'Koos tasudega: <strong>--</strong> s/kWh';
  }
}

// Update statistics
function updateStats() {
  const now = new Date();
  const todayStr = now.toDateString();
  const todayPrices = displayPrices.filter(p => new Date(p.timestamp).toDateString() === todayStr);

  if (todayPrices.length > 0) {
    // Use displayPrice (includes package & VAT if selected) for stats
    const dPrices = todayPrices.map(p => (p.displayPrice !== undefined ? p.displayPrice : getDisplayedPriceForSlot(p.price, p.timestamp)));
    const avg = dPrices.reduce((a, b) => a + b, 0) / dPrices.length;
    const max = Math.max(...dPrices);

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

  if (displayPrices.length === 0) return;

  const now = new Date();
  // Round down to current resolution slot
  if (selectedResolution === 15) {
    const currentSlot = Math.floor(now.getMinutes() / 15) * 15;
    now.setMinutes(currentSlot, 0, 0);
  } else {
    now.setMinutes(0, 0, 0);
  }

  // Filter to future prices only (from current slot onwards)
  const futurePrices = displayPrices.filter(p => new Date(p.timestamp) >= now);

  if (futurePrices.length === 0) return;

  // Get price range for scaling (use displayPrice so chart reflects package selection)
  // When dual lines are shown, include both spot (no VAT) and full (with margins + VAT) prices in range
  let allPrices;
  if (showDualLines && settings.networkPackage) {
    const spotPrices = futurePrices.map(p => p.price);
    const fullPrices = futurePrices.map(p => getFullPriceWithMargins(p.price, new Date(p.timestamp)));
    allPrices = [...spotPrices, ...fullPrices];
  } else {
    allPrices = futurePrices.map(p => (p.displayPrice !== undefined ? p.displayPrice : getDisplayedPriceForSlot(p.price, p.timestamp)));
  }
  const maxPrice = Math.max(...allPrices, 1);
  const minPrice = Math.min(...allPrices);
  const hasNegative = minPrice < 0;

  // Round to nice 2-step intervals
  const stepSize = 2;
  let roundedMin = Math.floor(minPrice / stepSize) * stepSize;
  let roundedMax = Math.ceil(maxPrice / stepSize) * stepSize;

  // Dual lines mode: always include zero on Y-axis
  if (showDualLines && settings.networkPackage) {
    if (roundedMin > 0) roundedMin = 0;
    if (roundedMax < 0) roundedMax = 0;
  }

  // Add padding - less for dual lines to maximize chart usage
  const padSteps = (showDualLines && settings.networkPackage) ? 0 : 1;
  const paddedMin = roundedMin - (stepSize * padSteps);
  const paddedMax = roundedMax + (stepSize * padSteps);
  const priceRange = paddedMax - paddedMin;

  // Y-axis labels (every 2 units)
  const yLabels = [];
  for (let v = paddedMax; v >= paddedMin; v -= stepSize) {
    yLabels.push(v);
  }

  yLabels.forEach(value => {
    const span = document.createElement('span');
    span.textContent = value;
    yAxis.appendChild(span);
  });

  // X-axis labels - every 2 hours
  const firstDate = new Date(futurePrices[0].timestamp);
  const lastDate = new Date(futurePrices[futurePrices.length - 1].timestamp);

  elements.chartDate.textContent = `${firstDate.toLocaleDateString('et-EE', { weekday: 'short', day: 'numeric', month: 'short' })} – ${lastDate.toLocaleDateString('et-EE', { weekday: 'short', day: 'numeric', month: 'short' })}`;

  // Create x-axis labels
  const shownLabels = new Set();
  const labelInterval = selectedResolution === 15 ? 4 : 2; // Every hour for 15min, every 2 hours for 1h

  for (let i = 0; i < futurePrices.length; i++) {
    const priceDate = new Date(futurePrices[i].timestamp);
    const hour = priceDate.getHours();
    const minute = priceDate.getMinutes();
    const day = priceDate.getDate();
    const key = `${day}-${hour}`;

    // For 15-min: show label every full hour (minute === 0)
    // For 1h: show label every 2 hours (even hours)
    const shouldShow = selectedResolution === 15
      ? (minute === 0 && !shownLabels.has(key))
      : (hour % 2 === 0 && !shownLabels.has(key));

    if (shouldShow) {
      shownLabels.add(key);
      const span = document.createElement('span');
      span.className = 'chart-x-label';
      span.textContent = hour;
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

  // Determine best selection (consecutive or cheapest non-consecutive)
  const best = getBestSelectionFromFuturePrices(futurePrices, selectedDuration);
  const bestIndices = new Set();
  if (best) {
    if (best.indices) {
      best.indices.forEach(i => bestIndices.add(i));
    } else if (best.startIndex !== undefined) {
      // Backwards compatible: fill range for consecutive result
      const slotsToFill = selectedResolution === 15 ? selectedDuration * 4 : selectedDuration;
      for (let i = best.startIndex; i < best.startIndex + slotsToFill && i < futurePrices.length; i++) {
        bestIndices.add(i);
      }
    }
  }

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw zero line if negative prices or dual lines mode (always show zero reference)
  const showZeroLine = hasNegative || (showDualLines && settings.networkPackage);
  if (showZeroLine && paddedMin <= 0 && paddedMax >= 0) {
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

  // Draw grid lines for each Y label
  ctx.beginPath();
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  yLabels.forEach((value, i) => {
    const y = padding.top + (i / (yLabels.length - 1)) * chartHeight;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
  });
  ctx.stroke();

  // Calculate points (use displayPrice for plotting so chart reflects package selection/VAT)
  // When dual lines mode is active, also calculate spotY and fullY
  const points = futurePrices.map((p, i) => {
    const x = padding.left + (i / (futurePrices.length - 1)) * chartWidth;
    const dp = (p.displayPrice !== undefined) ? p.displayPrice : getDisplayedPriceForSlot(p.price, p.timestamp);
    const y = padding.top + ((paddedMax - dp) / priceRange) * chartHeight;

    // Dual lines mode: spot price (no VAT) and full price (with margins + VAT)
    const spotPrice = p.price; // Raw spot price without VAT
    const fullPrice = settings.networkPackage ? getFullPriceWithMargins(p.price, new Date(p.timestamp)) : p.price;
    const spotY = padding.top + ((paddedMax - spotPrice) / priceRange) * chartHeight;
    const fullY = padding.top + ((paddedMax - fullPrice) / priceRange) * chartHeight;

    return {
      x, y, price: p.price, displayPrice: dp, timestamp: p.timestamp, isBest: bestIndices.has(i),
      spotPrice, fullPrice, spotY, fullY
    };
  });

  // Draw best selection as green vertical bars/columns spanning full height (supports multiple non-consecutive groups)
  if (bestIndices.size > 0) {
    // Build sorted list of indices
    const sortedBestIdx = Array.from(bestIndices).sort((a, b) => a - b);
    // Group contiguous ranges
    const groups = [];
    let groupStart = sortedBestIdx[0];
    let prev = sortedBestIdx[0];

    for (let i = 1; i < sortedBestIdx.length; i++) {
      const cur = sortedBestIdx[i];
      if (cur === prev + 1) {
        prev = cur;
      } else {
        groups.push([groupStart, prev]);
        groupStart = cur;
        prev = cur;
      }
    }
    groups.push([groupStart, prev]);

    groups.forEach(([startIdx, endIdx]) => {
      const firstBestIdx = startIdx;
      const lastBestIdx = endIdx;
      if (firstBestIdx >= 0 && lastBestIdx >= 0 && points[firstBestIdx] && points[lastBestIdx]) {
        const barX = points[firstBestIdx].x;
        const barWidth = points[lastBestIdx].x - points[firstBestIdx].x + (chartWidth / (futurePrices.length - 1));

        ctx.beginPath();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.fillRect(barX - 2, padding.top, barWidth, chartHeight);

        // Draw left and right borders of the green zone
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.moveTo(barX, padding.top);
        ctx.lineTo(barX, height - padding.bottom);
        ctx.moveTo(barX + barWidth - 4, padding.top);
        ctx.lineTo(barX + barWidth - 4, height - padding.bottom);
        ctx.stroke();
      }
    });
  }

  // Calculate step width for stepped line chart
  const stepWidth = points.length > 1 ? (points[1].x - points[0].x) : chartWidth;

  // Helper function to draw a stepped line
  function drawSteppedLine(pts, yGetter, color, lineWidth) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';

    pts.forEach((point, i) => {
      const y = yGetter(point);
      const prevY = i > 0 ? yGetter(pts[i - 1]) : y;
      if (i === 0) {
        ctx.moveTo(point.x, y);
      } else {
        ctx.lineTo(point.x, prevY);
        ctx.lineTo(point.x, y);
      }
      if (i === pts.length - 1) {
        ctx.lineTo(point.x + stepWidth, y);
      }
    });
    ctx.stroke();
  }

  // Draw lines based on mode
  if (showDualLines && settings.networkPackage) {
    // Dual lines mode: draw spot line (orange) and full line (purple)
    drawSteppedLine(points, p => p.spotY, '#f59e0b', 2);  // Orange - spot price (no VAT)
    drawSteppedLine(points, p => p.fullY, '#8b5cf6', 2);  // Purple - full price (with margins + VAT)
  } else {
    // Single line mode: draw main stepped line (blue)
    drawSteppedLine(points, p => p.y, '#1e40af', 2);
  }

  // Draw best window stepped line segment (green) on top
  if (bestIndices.size > 0) {
    ctx.beginPath();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;

    let started = false;
    let prevPoint = null;
    const yGetter = showDualLines && settings.networkPackage ? (p => p.fullY) : (p => p.y);

    points.forEach((point, i) => {
      if (point.isBest) {
        const y = yGetter(point);
        if (!started) {
          ctx.moveTo(point.x, y);
          started = true;
        } else {
          // Stepped line for green section
          ctx.lineTo(point.x, yGetter(prevPoint));
          ctx.lineTo(point.x, y);
        }
        prevPoint = point;
        // Extend last best point
        if (i === points.length - 1 || !points[i + 1]?.isBest) {
          ctx.lineTo(point.x + stepWidth, y);
        }
      } else if (started && prevPoint) {
        // End of best window - extend to this point's x
        ctx.lineTo(point.x, yGetter(prevPoint));
        started = false;
        prevPoint = null;
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

  // Store points for tooltip
  canvas.chartPoints = points;
  canvas.futurePrices = futurePrices;
  canvas.chartDimensions = { width, height, padding, dpr };

  // Add tooltip handlers (click/touch for mobile, mousemove/mouseleave for desktop hover)
  if (!canvas.hasTooltipHandler) {
    canvas.hasTooltipHandler = true;

    // Helper: find closest point to x,y (within threshold)
    function findClosestPoint(x, y, threshold = 30) {
      const pts = canvas.chartPoints || [];
      let closest = null;
      let closestDist = Infinity;
      pts.forEach((p, i) => {
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < closestDist && dist < threshold) {
          closestDist = dist;
          closest = { ...p, index: i };
        }
      });
      return closest;
    }

    // Create or update tooltip element
    function showOrUpdateTooltipAt(point, leftPos, topPos) {
      if (!point) return;
      const priceDate = new Date(point.timestamp);
      const hour = priceDate.getHours();
      const minutes = priceDate.getMinutes();
      const price = point.price;
      const spotDisplay = price * (1 + ((settings.vatPercent !== undefined) ? settings.vatPercent : (defaults.fees?.vatPercent || 0)) / 100);
      const total = (point.displayPrice !== undefined) ? point.displayPrice : getTotalPrice(price, priceDate);

      let tooltip = document.getElementById('chartTooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'chartTooltip';
        tooltip.className = 'chart-tooltip';
      }

      // Dual lines mode: show spot (no VAT), full (with margins + VAT), and difference
      if (showDualLines && settings.networkPackage) {
        const spotNoVat = point.spotPrice;
        const fullWithMargins = point.fullPrice;
        const diff = fullWithMargins - spotNoVat;
        tooltip.innerHTML = `
          <strong>${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}</strong><br>
          Börs (ilma km): ${spotNoVat.toFixed(2)} s/kWh<br>
          Kokku (+ marginaalid + km): ${fullWithMargins.toFixed(2)} s/kWh<br>
          <span style="color: #fbbf24;">Vahe: +${diff.toFixed(2)} s/kWh</span>
        `;
      } else {
        tooltip.innerHTML = `
          <strong>${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}</strong><br>
          Börs: ${spotDisplay.toFixed(2)} s/kWh<br>
          Kokku: ${total.toFixed(2)} s/kWh
        `;
      }

      // Positioning - use chart-section as container to avoid overflow:hidden clipping
      const chartSection = canvas.closest('.chart-section');
      const chartArea = canvas.closest('.chart-area');
      const chartAreaRect = chartArea.getBoundingClientRect();
      const sectionRect = chartSection.getBoundingClientRect();

      // Calculate position relative to chart-section
      const pointAbsX = chartAreaRect.left + leftPos - sectionRect.left;
      const pointAbsY = chartAreaRect.top + topPos - sectionRect.top;

      // Measure tooltip size (append temporarily if needed)
      if (!chartSection.contains(tooltip)) {
        tooltip.style.visibility = 'hidden';
        chartSection.appendChild(tooltip);
      }
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      tooltip.style.visibility = '';

      let left = pointAbsX;
      let top = pointAbsY - tooltipHeight - 10;

      // Horizontal bounds: keep tooltip fully visible within section
      const minLeft = tooltipWidth / 2 + 5;
      const maxLeft = sectionRect.width - tooltipWidth / 2 - 5;
      if (left < minLeft) left = minLeft;
      if (left > maxLeft) left = maxLeft;

      // Vertical bounds: if too close to top, show below the point
      if (top < 5) {
        top = pointAbsY + 20;
        tooltip.classList.add('tooltip-below');
      } else {
        tooltip.classList.remove('tooltip-below');
      }

      // If still overflows bottom, clamp it
      if (top + tooltipHeight > sectionRect.height - 5) {
        top = sectionRect.height - tooltipHeight - 5;
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    // Mousemove handler for hover
    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const closest = findClosestPoint(x, y);
      if (closest) {
        showOrUpdateTooltipAt(closest, closest.x, closest.y);
      } else {
        const t = document.getElementById('chartTooltip');
        if (t) t.remove();
      }
    };

    const onMouseLeave = () => {
      const t = document.getElementById('chartTooltip');
      if (t) t.remove();
    };

    // For accessibility / mobile: keep the existing click/touch behavior (brief tooltip)
    const showTooltipOnce = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
      const closest = findClosestPoint(x, y);
      if (!closest) return;
      showOrUpdateTooltipAt(closest, closest.x, closest.y);
      // Auto-hide after 3s
      setTimeout(() => {
        const t = document.getElementById('chartTooltip');
        if (t) t.remove();
      }, 3000);
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('mouseout', onMouseLeave);

    canvas.addEventListener('click', showTooltipOnce);
    canvas.addEventListener('touchstart', showTooltipOnce);
  }
}

// Find best consecutive window from given prices array
function findBestWindowFromPrices(prices, duration) {
  if (!prices || prices.length < duration || duration < 1) {
    return null;
  }

  let bestStart = 0;
  let bestAvg = Infinity;

  // Iterate through all possible starting positions for the window
  for (let i = 0; i <= prices.length - duration; i++) {
    // Calculate average price for this window (consecutive slots)
    let totalPrice = 0;
    for (let j = 0; j < duration; j++) {
      const p = prices[i + j];
      const total = getTotalPrice(p.price, new Date(p.timestamp));
      totalPrice += total;
    }
    const avg = totalPrice / duration;

    if (avg < bestAvg) {
      bestAvg = avg;
      bestStart = i;
    }
  }

  const windowPrices = prices.slice(bestStart, bestStart + duration);

  console.log(`Best window for ${duration} slots: starts at index ${bestStart}, avg price: ${bestAvg.toFixed(2)}`);
  console.log(`Window hours:`, windowPrices.map(p => new Date(p.timestamp).getHours() + ':00').join(', '));

  return {
    startIndex: bestStart,
    indices: new Set(Array.from({ length: Math.min(duration, prices.length - bestStart) }, (_, k) => bestStart + k)),
    prices: windowPrices,
    avgPrice: bestAvg
  };
}

// Find cheapest non-consecutive hours (returns indices set of slots and avg price)
function findCheapestNonConsecutiveFromPrices(prices, durationHours) {
  // Allow durations down to 0.25 h (15 min) when using 15-min resolution
  if (!prices || prices.length === 0 || durationHours < 0.25) return null;

  // If user views 15-min resolution, select individual 15-min slots (not hourly blocks)
  if (selectedResolution === 15) {
    const slotsNeeded = Math.round(durationHours * 4); // 4 slots per hour
    // Build list of slots with their total price
    const slotList = prices.map((p, i) => ({ index: i, total: getTotalPrice(p.price, new Date(p.timestamp)), ts: new Date(p.timestamp) }));

    if (slotList.length < slotsNeeded) return null;

    // Sort by total ascending and take cheapest slotsNeeded
    slotList.sort((a, b) => a.total - b.total);
    const chosen = slotList.slice(0, slotsNeeded);

    // Build set of indices and compute average
    const selectedIndices = new Set(chosen.map(c => c.index));
    const overallAvg = chosen.reduce((a, b) => a + b.total, 0) / chosen.length;

    // Sort chosen timestamps chronologically for display
    const chosenTimes = chosen.map(c => c.ts).sort((a, b) => a - b);

    return {
      indices: selectedIndices,
      hours: chosenTimes,
      avgPrice: overallAvg
    };
  }

  // Fallback: original hourly grouping behavior for 1h resolution
  const hoursNeeded = durationHours;

  // Build hour groups: key = ISO hour start, value = { indices: [], totalPrices: [], hourStart }
  const hourMap = new Map();

  prices.forEach((p, i) => {
    const d = new Date(p.timestamp);
    const hourStart = new Date(d);
    hourStart.setMinutes(0, 0, 0);
    const hourKey = hourStart.toISOString();

    if (!hourMap.has(hourKey)) {
      hourMap.set(hourKey, { indices: [], totalPrices: [], hourStart });
    }
    const g = hourMap.get(hourKey);
    g.indices.push(i);
    g.totalPrices.push(getTotalPrice(p.price, d));
  });

  // Compute average total price per hour
  const hoursArr = Array.from(hourMap.values()).map(h => ({
    hourStart: h.hourStart,
    indices: h.indices,
    avgTotal: h.totalPrices.reduce((a, b) => a + b, 0) / h.totalPrices.length
  }));

  // If there are fewer available hours than requested, return null
  if (hoursArr.length < hoursNeeded) return null;

  // Sort by avgTotal ascending and pick cheapest hoursNeeded
  hoursArr.sort((a, b) => a.avgTotal - b.avgTotal);
  const chosen = hoursArr.slice(0, hoursNeeded);

  // Build indices set and compute overall average
  const selectedIndices = new Set();
  let totalOfChosen = 0;
  chosen.forEach(c => {
    c.indices.forEach(idx => selectedIndices.add(idx));
    totalOfChosen += c.avgTotal;
  });

  const overallAvg = totalOfChosen / chosen.length;

  // Sort chosen hours by time for display
  chosen.sort((a, b) => a.hourStart - b.hourStart);

  return {
    indices: selectedIndices,
    hours: chosen.map(c => c.hourStart),
    avgPrice: overallAvg
  };
}

// General getter for best selection depending on mode
function getBestSelectionFromFuturePrices(futurePrices, durationHours) {
  if (!futurePrices || futurePrices.length === 0) return null;
  const slotsPerHour = selectedResolution === 15 ? 4 : 1;

  if (selectedMode === 'consecutive') {
    const durationSlots = durationHours * slotsPerHour;
    return findBestWindowFromPrices(futurePrices, durationSlots);
  } else {
    return findCheapestNonConsecutiveFromPrices(futurePrices, durationHours);
  }
}

// Find best consecutive window (uses displayPrices)
function findBestWindow(durationHours) {
  const now = new Date();
  // Round down to current resolution slot
  if (selectedResolution === 15) {
    const currentSlot = Math.floor(now.getMinutes() / 15) * 15;
    now.setMinutes(currentSlot, 0, 0);
  } else {
    now.setMinutes(0, 0, 0);
  }

  // Filter to only future prices
  const futurePrices = displayPrices.filter(p => new Date(p.timestamp) >= now);

  // Convert duration in hours to slots
  const slotsPerHour = selectedResolution === 15 ? 4 : 1;
  const durationSlots = durationHours * slotsPerHour;

  return findBestWindowFromPrices(futurePrices, durationSlots);
}

// Update best window display
function updateBestWindow() {
  // Recompute future prices and selection
  const now = new Date();
  if (selectedResolution === 15) {
    const currentSlot = Math.floor(now.getMinutes() / 15) * 15;
    now.setMinutes(currentSlot, 0, 0);
  } else {
    now.setMinutes(0, 0, 0);
  }
  const futurePrices = displayPrices.filter(p => new Date(p.timestamp) >= now);

  const best = getBestSelectionFromFuturePrices(futurePrices, selectedDuration);

  if (best) {
    // Consecutive mode: best.prices may contain the window prices
    if (selectedMode === 'consecutive' && best.prices && best.prices.length > 0) {
      const startTime = new Date(best.prices[0].timestamp);
      const endTime = new Date(best.prices[best.prices.length - 1].timestamp);
      if (selectedResolution === 15) {
        endTime.setMinutes(endTime.getMinutes() + 15);
      } else {
        endTime.setHours(endTime.getHours() + 1);
      }
      const timeStr = `${startTime.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })}`;
      elements.bestWindowTime.textContent = timeStr;
      elements.bestWindowPrice.textContent = `${best.avgPrice.toFixed(2)} s/kWh`;
    } else if (selectedMode === 'cheapest' && best.hours && best.hours.length > 0) {
      // Show list of cheapest hours
      const times = best.hours.map(h => new Date(h).toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' }));
      const timeStr = times.length <= 4 ? times.join(', ') : `${times.slice(0, 3).join(', ')} + ${times.length - 3} more`;
      elements.bestWindowTime.textContent = timeStr;
      elements.bestWindowPrice.textContent = `${best.avgPrice.toFixed(2)} s/kWh`;
    } else {
      elements.bestWindowTime.textContent = 'Pole piisavalt andmeid';
      elements.bestWindowPrice.textContent = '-- s/kWh';
    }

    updateCountdown();
  } else {
    elements.bestWindowTime.textContent = 'Pole piisavalt andmeid';
    elements.bestWindowPrice.textContent = '-- s/kWh';
    elements.countdownText.textContent = '--';
  }
}

// Update countdown
function updateCountdown() {
  // Recompute future prices and selection
  const now = new Date();
  if (selectedResolution === 15) {
    const currentSlot = Math.floor(now.getMinutes() / 15) * 15;
    now.setMinutes(currentSlot, 0, 0);
  } else {
    now.setMinutes(0, 0, 0);
  }
  const futurePrices = displayPrices.filter(p => new Date(p.timestamp) >= now);
  const best = getBestSelectionFromFuturePrices(futurePrices, selectedDuration);

  if (best) {
    // Determine next upcoming chosen time
    let nextStart = null;

    if (selectedMode === 'consecutive' && best.prices && best.prices.length > 0) {
      nextStart = new Date(best.prices[0].timestamp);
    } else if (selectedMode === 'cheapest' && best.hours && best.hours.length > 0) {
      // pick the earliest chosen hour that is >= now
      nextStart = best.hours.find(h => new Date(h) >= new Date());
      if (!nextStart) nextStart = best.hours[0];
    }

    if (!nextStart) {
      elements.countdownBox.classList.add('waiting');
      elements.countdownText.textContent = '--';
      return;
    }

    const diff = new Date(nextStart) - new Date();

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
  } else {
    elements.countdownBox.classList.add('waiting');
    elements.countdownText.textContent = '--';
  }
}

// Update cost calculator
function updateCostCalculator() {
  const kwh = parseFloat(elements.kwhInput.value) || 0;

  const current = getCurrentPriceData();
  const best = (function() {
    // compute best selection avgPrice similarly to other functions
    const now = new Date();
    if (selectedResolution === 15) {
      const currentSlot = Math.floor(now.getMinutes() / 15) * 15;
      now.setMinutes(currentSlot, 0, 0);
    } else {
      now.setMinutes(0, 0, 0);
    }
    const futurePrices = displayPrices.filter(p => new Date(p.timestamp) >= now);
    return getBestSelectionFromFuturePrices(futurePrices, selectedDuration);
  })();

  if (current) {
    const currentTotal = getTotalPrice(current.price, new Date(current.timestamp));
    const costNow = (currentTotal * kwh / 100).toFixed(3);
    elements.costNow.textContent = `€${costNow}`;
  } else {
    elements.costNow.textContent = '--';
  }

  if (best && best.avgPrice !== undefined) {
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
