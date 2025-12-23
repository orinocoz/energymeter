const express = require('express');
const path = require('path');
const { fetchPrices } = require('./elering');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// API endpoint for electricity prices
app.get('/api/prices', async (req, res) => {
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
