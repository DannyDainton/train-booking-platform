const express = require('express');
const crypto = require('crypto');
const config = require('./config');

const app = express();
app.use(express.json());

// In-memory bookings store
const bookings = new Map();

// --- Routes ---

// Search for trains (proxies to Schedule Service)
app.get('/search', async (req, res) => {
  const { from, to, date } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Both "from" and "to" query parameters are required' });
  }

  try {
    const params = new URLSearchParams({ from, to });
    if (date) params.set('date', date);

    const url = `${config.scheduleServiceUrl}/schedules?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: 'Failed to fetch schedules',
        details: body
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: 'Schedule Service is unavailable',
      message: err.message
    });
  }
});

// Create a booking
app.post('/bookings', async (req, res) => {
  const { trainId, passengers } = req.body;

  if (!trainId || !Array.isArray(passengers) || passengers.length === 0) {
    return res.status(400).json({
      error: '"trainId" and a non-empty "passengers" array are required'
    });
  }

  try {
    // 1. Validate the train exists via Schedule Service
    const trainRes = await fetch(`${config.scheduleServiceUrl}/schedules/${encodeURIComponent(trainId)}`);

    if (!trainRes.ok) {
      const body = await trainRes.json().catch(() => ({}));
      return res.status(trainRes.status).json({
        error: `Train "${trainId}" not found`,
        details: body
      });
    }

    const train = await trainRes.json();

    // 2. Process payment via Payment Service
    const bookingRef = `BR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const totalAmount = train.price * passengers.length;

    const paymentRes = await fetch(`${config.paymentServiceUrl}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totalAmount,
        currency: 'GBP',
        bookingRef
      })
    });

    if (!paymentRes.ok) {
      const body = await paymentRes.json().catch(() => ({}));
      return res.status(paymentRes.status).json({
        error: 'Payment failed',
        details: body
      });
    }

    const payment = await paymentRes.json();

    // 3. Store the booking
    const booking = {
      bookingRef,
      status: 'confirmed',
      train: {
        trainId: train.trainId,
        operator: train.operator,
        from: train.from,
        to: train.to,
        date: train.date,
        departure: train.departure,
        arrival: train.arrival
      },
      passengers,
      totalAmount,
      currency: 'GBP',
      payment: {
        transactionId: payment.transactionId,
        status: payment.status
      },
      createdAt: new Date().toISOString()
    };

    bookings.set(bookingRef, booking);

    res.status(201).json(booking);
  } catch (err) {
    res.status(502).json({
      error: 'A dependent service is unavailable',
      message: err.message
    });
  }
});

// Get a booking by reference
app.get('/bookings/:bookingRef', (req, res) => {
  const booking = bookings.get(req.params.bookingRef);

  if (!booking) {
    return res.status(404).json({ error: `Booking "${req.params.bookingRef}" not found` });
  }

  res.json(booking);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'booking' });
});

app.listen(config.bookingPort, () => {
  console.log(`[Booking Service] running on http://localhost:${config.bookingPort}`);
  console.log(`  -> Schedule Service: ${config.scheduleServiceUrl}`);
  console.log(`  -> Payment Service:  ${config.paymentServiceUrl}`);
});
