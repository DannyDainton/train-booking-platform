# Train Booking Platform

A small Node.js microservices project for a train booking system. Four Express services work together — a main **Booking Service** that orchestrates three dependent services: **Schedule Service**, **Payment Service**, and **Notification Service**.

## Architecture

```
┌──────────────────────┐
│   Booking Service    │  :3000  (main API)
│                      │
│  GET  /search        │──────▶  Schedule Service  :3001
│  POST /bookings      │──────▶  Schedule + Payment + Notification
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

### Swapping to a mock server

To point the Booking Service at a local mock server instead of the real dependent services, just change the URLs in `.env`:

```env
SCHEDULE_SERVICE_URL=http://localhost:9000
PAYMENT_SERVICE_URL=http://localhost:9001
NOTIFICATION_SERVICE_URL=http://localhost:9002
```

Then restart the Booking Service. It will call your mock server on those URLs instead.

## API Examples

### Search for trains

```bash
curl "http://localhost:3000/search?from=London&to=Manchester&date=2026-04-01"
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
