const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const { log } = require('./logger');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  if (req.path === '/ping') {
    return next();
  }
  const started = Date.now();
  res.on('finish', () => {
    log('info', 'request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
});

// In-memory bookings store
const bookings = new Map();

// --- Routes ---

// Search for trains (proxies to Schedule Service)
app.get('/search', async (req, res) => {
  const { from, to, date } = req.query;

  if (!from || !to) {
    log('warn', 'search rejected: missing from or to');
    return res.status(400).json({ error: 'Both "from" and "to" query parameters are required' });
  }

  try {
    const params = new URLSearchParams({ from, to });
    if (date) params.set('date', date);

    const url = `${config.scheduleServiceUrl}/schedules?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      log('warn', 'schedule service returned error', {
        status: response.status,
        from,
        to,
      });
      return res.status(response.status).json({
        error: 'Failed to fetch schedules',
        details: body
      });
    }

    const data = await response.json();
    let resultCount = null;
    if (Array.isArray(data)) {
      resultCount = data.length;
    } else if (data && typeof data.count === 'number') {
      resultCount = data.count;
    }
    log('info', 'search ok', { from, to, resultCount });
    res.json(data);
  } catch (err) {
    log('error', 'schedule service unreachable', { message: err.message, from, to });
    res.status(502).json({
      error: 'Schedule Service is unavailable',
      message: err.message
    });
  }
});

// Create a booking
app.post('/bookings', async (req, res) => {
  const { trainId, passengers, seatClass = 'standard' } = req.body;

  if (!trainId || !Array.isArray(passengers) || passengers.length === 0) {
    log('warn', 'create booking rejected: invalid body');
    return res.status(400).json({
      error: '"trainId" and a non-empty "passengers" array are required'
    });
  }

  if (seatClass !== 'standard' && seatClass !== 'first') {
    log('warn', 'create booking rejected: invalid seatClass', { seatClass });
    return res.status(400).json({
      error: '"seatClass" must be "standard" or "first"'
    });
  }

  let failedDependency = 'schedule';
  try {
    // 1. Validate the train exists via Schedule Service
    const scheduleTrainUrl = `${config.scheduleServiceUrl}/schedules/${encodeURIComponent(trainId)}`;
    log('info', 'calling schedule service', {
      reason: 'validate train for booking',
      method: 'GET',
      url: scheduleTrainUrl,
      trainId,
    });
    const trainRes = await fetch(scheduleTrainUrl);

    if (!trainRes.ok) {
      const body = await trainRes.json().catch(() => ({}));
      log('warn', 'train lookup failed', { trainId, status: trainRes.status });
      return res.status(trainRes.status).json({
        error: `Train "${trainId}" not found`,
        details: body
      });
    }

    const train = await trainRes.json();
    log('info', 'schedule service responded', {
      trainId,
      httpStatus: trainRes.status,
    });

    // 1b. Assign seats for each passenger
    const seatAssignments = [];
    for (const passenger of passengers) {
      const assignUrl = `${config.scheduleServiceUrl}/schedules/${encodeURIComponent(trainId)}/assign-seat`;
      const seatRes = await fetch(assignUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatClass })
      });
      if (!seatRes.ok) {
        const body = await seatRes.json().catch(() => ({}));
        log('warn', 'seat assignment failed', { trainId, passenger: passenger.name });
        return res.status(seatRes.status).json({
          error: 'Seat assignment failed',
          details: body
        });
      }
      const seatData = await seatRes.json();
      seatAssignments.push({
        passenger: passenger.name,
        seatClass: seatData.seatClass,
        seat: seatData.seat,
        price: seatData.price
      });
    }

    failedDependency = 'payment';

    // 2. Process payment via Payment Service
    const bookingRef = `BR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const totalAmount = seatAssignments.reduce((sum, s) => sum + s.price, 0);

    const paymentUrl = `${config.paymentServiceUrl}/payments`;
    log('info', 'calling payment service', {
      reason: 'process payment for booking',
      method: 'POST',
      url: paymentUrl,
      bookingRef,
      amount: totalAmount,
      currency: 'GBP',
    });
    const paymentRes = await fetch(paymentUrl, {
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
      log('warn', 'payment failed', {
        bookingRef,
        status: paymentRes.status,
      });
      return res.status(paymentRes.status).json({
        error: 'Payment failed',
        details: body
      });
    }

    const payment = await paymentRes.json();
    log('info', 'payment service responded', {
      bookingRef,
      httpStatus: paymentRes.status,
      transactionId: payment.transactionId,
    });

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
      seatClass,
      passengers: seatAssignments,
      totalAmount,
      currency: 'GBP',
      payment: {
        transactionId: payment.transactionId,
        status: payment.status
      },
      createdAt: new Date().toISOString()
    };

    bookings.set(bookingRef, booking);

    log('info', 'booking created', {
      bookingRef,
      trainId,
      seatClass,
      passengerCount: passengers.length,
      totalAmount,
    });

    // 4. Send booking confirmation notification (fire-and-forget)
    sendNotification(booking).catch((err) => {
      log('warn', 'notification failed (non-blocking)', {
        bookingRef,
        message: err.message,
      });
    });

    res.status(201).json(booking);
  } catch (err) {
    const service =
      failedDependency === 'schedule' ? 'Schedule' : 'Payment';
    log('error', 'create booking failed', {
      message: err.message,
      trainId,
      unavailableService: failedDependency,
    });
    res.status(502).json({
      error: `${service} service is unavailable`,
      service: failedDependency,
      message: err.message,
    });
  }
});

// Get a booking by reference
app.get('/bookings/:bookingRef', (req, res) => {
  const booking = bookings.get(req.params.bookingRef);

  if (!booking) {
    log('warn', 'booking not found', { bookingRef: req.params.bookingRef });
    return res.status(404).json({ error: `Booking "${req.params.bookingRef}" not found` });
  }

  res.json(booking);
});

// Health check
app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', service: 'booking' });
});

/**
 * Fire-and-forget helper — sends a booking confirmation to the Notification Service.
 * Failures are logged but never block the booking response.
 */
async function sendNotification(booking) {
  const notificationUrl = `${config.notificationServiceUrl}/notifications`;
  const payload = {
    type: 'booking_confirmation',
    recipient: booking.passengers[0].passenger,
    bookingRef: booking.bookingRef,
    details: {
      train: booking.train,
      passengers: booking.passengers,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      paymentTransactionId: booking.payment.transactionId,
    },
  };

  log('info', 'calling notification service', {
    reason: 'send booking confirmation',
    method: 'POST',
    url: notificationUrl,
    bookingRef: booking.bookingRef,
  });

  const notifRes = await fetch(notificationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!notifRes.ok) {
    const body = await notifRes.json().catch(() => ({}));
    log('warn', 'notification service returned error', {
      bookingRef: booking.bookingRef,
      status: notifRes.status,
      details: body,
    });
    return;
  }

  const notif = await notifRes.json();
  log('info', 'notification service responded', {
    bookingRef: booking.bookingRef,
    notificationId: notif.notificationId,
    httpStatus: notifRes.status,
  });
}

app.listen(config.bookingPort, () => {
  log('info', 'listening', { url: config.bookingServiceUrl });
});