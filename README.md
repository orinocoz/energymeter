# Electricity Price Calculator

Estonian Nord Pool spot price calculator with network packages, cost estimation and fee management.

## Features

- Real-time electricity spot prices from Elering (Nord Pool Estonia)
- 15-minute and hourly price resolution
- Hourly price chart with today and tomorrow's prices
- **Quick network package selector** in chart header for fast switching
- **Dual price line chart**: "Lisatasud" button toggles between single line or two lines showing spot price (no VAT) vs full price (with margins + VAT)
- Find cheapest hours: consecutive window or cheapest individual hours
- **Price calculator** (Hinnakalkulaator) with kWh input and savings display
- Elektrilevi network packages (Võrk 1, 2, 4, 5 and Amper VML2)
- Day/night/peak pricing with Estonian public holiday support
- National fees with date-based effective dates (2026 taxes included)
- **Purchase/sales margin settings** for electricity resellers
- Settings saved in browser localStorage

## Quick Start with Docker

```bash
docker compose up -d
```

Open http://localhost:8080 in your browser.

## Development

### Prerequisites

- Node.js 20+

### Run locally

```bash
npm install
npm start
```

Open http://localhost:3000 in your browser.

### Development with auto-reload

```bash
npm run dev
```

## Configuration

Default fees are set in `public/defaults.json`. Users can customize fees in the browser "Paketitasud" panel - changes are saved to localStorage.

### Network Packages

| Package | Day | Night | Type |
|---------|-----|-------|------|
| Võrk 1 | 7.72 s/kWh | (flat) | ≤63A |
| Võrk 2 | 6.07 s/kWh | 3.51 s/kWh | ≤63A |
| Võrk 4 | 3.69 s/kWh | 2.10 s/kWh | ≤63A |
| Võrk 5 | 5.29 s/kWh | 3.03 s/kWh | ≤63A, peaks |
| Amper VML2 | 3.95 s/kWh | 2.30 s/kWh | >63A |

Day hours: Mon-Fri 07:00-22:00 (excl. public holidays)

### National Fees (2025-2026)

| Fee | Value | Effective |
|-----|-------|-----------|
| Renewable energy fee | 0.84 s/kWh | Current |
| Electricity excise | 0.21 s/kWh | Until Apr 2026 |
| Electricity excise | 0.307 s/kWh | From May 2026 |
| Security of supply fee | 0.758 s/kWh | From Jan 2026 |
| Balancing capacity fee | 0.373 s/kWh | From Jan 2026 |
| VAT | 24% | Current |

### Margin Settings

For electricity resellers, you can configure purchase and sales margins:

| Setting | Default | Description |
|---------|---------|-------------|
| Purchase margin | 0 s/kWh | Margin added to purchase price |
| Sales margin | 1 s/kWh | Margin added to sales price |

### Dual Price Lines

Click the "Lisatasud" button on the chart to visualize two price lines:
- **Orange line**: Spot price without VAT
- **Purple line**: Full price including network fees, taxes, margins and VAT

Hover over the chart to see the price difference between the two lines.

### Duration Selection

Select the cheapest time period duration using:
- Quick buttons: 1h, 2h, 3h, 4h, 5h, 6h, 7h, 8h (all selected hours shown in green)
- Custom input with +/- buttons for values up to 24h

Choose between:
- **Järjest** (Consecutive): Find the best consecutive time window
- **Odavaimad** (Cheapest): Find the cheapest individual hours (not necessarily consecutive)

## Data Source

Prices are fetched from [Elering Dashboard API](https://dashboard.elering.ee) which provides Nord Pool spot prices for Estonia. Tomorrow's prices are typically available after 13:00 CET.

## License

MIT
