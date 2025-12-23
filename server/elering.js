const ELERING_API = 'https://dashboard.elering.ee/api/nps/price';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

let cache = {
  data: null,
  timestamp: 0
};

/**
 * Fetch electricity prices from Elering API
 * Returns prices in cents/kWh for Estonia
 */
async function fetchPrices() {
  const now = Date.now();

  // Return cached data if still valid
  if (cache.data && (now - cache.timestamp) < CACHE_DURATION_MS) {
    return cache.data;
  }

  // Calculate date range: today and tomorrow
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  const startDate = today.toISOString();
  const endDate = dayAfterTomorrow.toISOString();

  const url = `${ELERING_API}?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Elering API error: ${response.status}`);
    }

    const data = await response.json();

    // Elering returns prices in €/MWh, convert to cents/kWh (divide by 10)
    const prices = (data.data?.ee || []).map(item => ({
      timestamp: new Date(item.timestamp * 1000).toISOString(),
      price: parseFloat((item.price / 10).toFixed(4)) // cents/kWh
    }));

    // Sort by timestamp
    prices.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const result = {
      prices,
      updated: new Date().toISOString()
    };

    // Update cache
    cache = {
      data: result,
      timestamp: now
    };

    return result;
  } catch (error) {
    console.error('Failed to fetch prices from Elering:', error.message);

    // Return stale cache if available
    if (cache.data) {
      console.log('Returning stale cached data');
      return cache.data;
    }

    throw error;
  }
}

module.exports = { fetchPrices };
