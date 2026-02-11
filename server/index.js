const express = require('express');
const compression = require('compression');
const path = require('path');
const { fetchPrices } = require('./elering');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable gzip/brotli compression for all responses
app.use(compression());

// Serve static files from public directory with caching
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1h',
  etag: true
}));

// API endpoint for electricity prices
app.get('/api/prices', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
  try {
    const data = await fetchPrices();
    res.json(data);
  } catch (error) {
    console.error('Error fetching prices:', error);
    res.status(500).json({
      error: 'Failed to fetch electricity prices',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Electricity price calculator running on http://localhost:${PORT}`);
});
