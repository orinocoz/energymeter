# Electricity Price Calculator

Estonian Nord Pool spot price calculator with cost estimation and fee management.

## Features

- Real-time electricity spot prices from Elering (Nord Pool Estonia)
- Hourly price chart with today and tomorrow's prices
- Find cheapest consecutive hours window (1-8 hours)
- Cost calculator with kWh input
- Customizable Estonian grid fees (day/night transfer, renewable surcharge, excise tax, VAT)
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

Default fees are set in `public/defaults.json`. Users can customize fees in the browser settings panel - changes are saved to localStorage.

### Default Estonian fees (2024)

| Fee | Day | Night |
|-----|-----|-------|
| Transfer fee | 3.95 c/kWh | 2.30 c/kWh |
| Renewable surcharge | 0.84 c/kWh | |
| Excise tax | 0.21 c/kWh | |
| VAT | 24% | |

Day hours: 07:00 - 23:00

## Data Source

Prices are fetched from [Elering Dashboard API](https://dashboard.elering.ee) which provides Nord Pool spot prices for Estonia. Tomorrow's prices are typically available after 13:00 CET.

## License

MIT
