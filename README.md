# Train Booking Platform

A small Node.js microservices project for a train booking system. Five Express services work together — a main **Booking Service** that orchestrates four dependent services: **Schedule Service**, **Payment Service**, **Notification Service**, and **Weather Service** (which calls the OpenWeather 3rd‑party API).

## Architecture

```
┌──────────────────────┐
│   Booking Service    │  :3000  (main API)
│                      │
│  GET  /search        │──────▶  Schedule Service  :3001
│  POST /bookings      │──────▶  Schedule Service  :3001
│  POST /bookings/:ref/pay    ▶  Payment + Notification + Weather
│  POST /bookings/:ref/refund ▶  Payment Service  :3002
│  GET  /bookings/:ref │
└──────────────────────┘
                                  ┌─────────────────────┐
                                  │  Schedule Service    │  :3001
                                  │  GET /schedules      │
                                  │  GET /schedules/:id  │
                                  └─────────────────────┘

                                  ┌─────────────────────┐
                                  │  Payment Service     │  :3002
                                  │  POST /payments      │
                                  │  GET  /payments/:id  │
                                  └─────────────────────┘

                                  ┌─────────────────────────┐
                                  │  Notification Service    │  :3003
                                  │  POST /notifications     │
                                  │  GET  /notifications/:id │
                                  └─────────────────────────┘

                                  ┌─────────────────────────┐
                                  │  Weather Service         │  :3004
                                  │  GET /weather?city=...   │──▶  OpenWeather API (3rd party)
                                  │  GET /ping               │
                                  └─────────────────────────┘
```

## Getting Started

```bash
# Install dependencies
npm install

# Start all 4 services at once
npm run dev

# Or start them individually
npm run start:schedule
npm run start:payment
npm run start:notification
npm run start:booking
```

## Environment Config

Copy `.env.example` to `.env` (already done by default). The key variables are:

| Variable               | Default                  | Description                        |
|------------------------|--------------------------|------------------------------------|
| `BOOKING_PORT`         | `3000`                   | Port for the Booking Service       |
| `SCHEDULE_PORT`        | `3001`                   | Port for the Schedule Service      |
| `SCHEDULE_SERVICE_URL` | `http://localhost:3001`  | URL the Booking Service calls      |
| `PAYMENT_PORT`         | `3002`                   | Port for the Payment Service       |
| `PAYMENT_SERVICE_URL`  | `http://localhost:3002`  | URL the Booking Service calls      |
| `NOTIFICATION_PORT`    | `3003`                   | Port for the Notification Service  |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:3003` | URL the Booking Service calls    |
| `WEATHER_PORT`         | `3004`                   | Port for the Weather Service       |
| `WEATHER_SERVICE_URL`  | `http://localhost:3004`  | URL the Booking Service calls      |
| `OPENWEATHER_API_URL`  | `https://api.openweathermap.org` | Upstream OpenWeather base URL (point at local mock during dev) |
| `OPENWEATHER_API_KEY`  | `dev-placeholder-key`    | API key for the real OpenWeather API |

## Running with mocks

This repo ships with Postman local mocks for every dependency under `postman/mocks/`. You can run the real services against any combination of mocks **without editing `.env`** — the `dev:mock:*` scripts simply override the relevant `*_SERVICE_URL` inline.

### Mock ports

| Dependency                | Mock port |
|---------------------------|-----------|
| Schedule Service          | `4501`    |
| Payment Service           | `4502`    |
| Notification Service      | `4503`    |
| OpenWeather (3rd-party)   | `4504`    |

### 1. Start the mocks you need

In one terminal, start all four Postman local mocks at once:

```bash
npm run mocks:start
```

Or start them individually:

```bash
npm run mocks:schedule
npm run mocks:payment
npm run mocks:notification
npm run mocks:openweather
```

### 2. Start the services pointed at those mocks

In a second terminal, pick the script that matches what you mocked:

```bash
npm run dev                    # all real services (default)
npm run dev:mock:schedule      # only Schedule mocked
npm run dev:mock:payment       # only Payment mocked
npm run dev:mock:notification  # only Notification mocked
npm run dev:mock:openweather   # only OpenWeather mocked
npm run dev:mock:all           # all dependencies mocked
```

Need an ad-hoc combination? Just prefix `npm run dev` with the URLs you want to override:

```bash
SCHEDULE_SERVICE_URL=http://localhost:4501 \
PAYMENT_SERVICE_URL=http://localhost:4502 \
npm run dev
```

Your `.env` stays untouched — stop the script and you're back to the real dependencies on the next `npm run dev`.

## API Examples

### Search for trains

```bash
curl "http://localhost:3000/search?from=London&to=Manchester&date=2026-07-08"
```

### Create a booking

```bash
curl -X POST http://localhost:3000/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "trainId": "T100",
    "passengers": [
      { "name": "Alice Smith" },
      { "name": "Bob Jones" }
    ]
  }'
```

### Pay for a booking

```bash
curl -X POST http://localhost:3000/bookings/BR-XXXXXXXX/pay \
  -H "Content-Type: application/json" \
  -d '{ "cardNumber": "4242424242424242", "cardHolder": "Alice Smith", "expiryDate": "12/28", "cvv": "123" }'
```

### Refund a booking

```bash
curl -X POST http://localhost:3000/bookings/BR-XXXXXXXX/refund \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Customer requested refund" }'
```

### Get a booking

```bash
curl http://localhost:3000/bookings/BR-XXXXXXXX
```

### Send a notification

```bash
curl -X POST http://localhost:3003/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "type": "booking_confirmation",
    "recipient": "Alice Smith",
    "bookingRef": "BR-TEST0001",
    "details": {
      "train": {
        "trainId": "T100",
        "from": "London Euston",
        "to": "Manchester Piccadilly"
      }
    }
  }'
```

### Get a notification

```bash
curl http://localhost:3003/notifications/NTF-XXXXXXXX
```

### Call dependent services directly

```bash
# Schedules
curl "http://localhost:3001/schedules?from=London&to=Edinburgh"
curl http://localhost:3001/schedules/T200

# Payments
curl -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{ "amount": 45, "currency": "GBP", "bookingRef": "BR-TEST0001" }'
curl -X POST http://localhost:3002/payments/TXN-XXXXXXXX/refund \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Customer requested refund" }'

# Notifications
curl -X POST http://localhost:3003/notifications \
  -H "Content-Type: application/json" \
  -d '{ "type": "booking_confirmation", "recipient": "Alice Smith", "bookingRef": "BR-TEST0001" }'
```

### Health checks

```bash
curl http://localhost:3000/ping
curl http://localhost:3001/ping
curl http://localhost:3002/ping
curl http://localhost:3003/ping
```
