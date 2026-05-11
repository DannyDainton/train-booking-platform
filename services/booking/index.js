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

// Create a booking (pending payment)
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

    // 2. Store the booking as pending payment (no payment processing yet)
    const bookingRef = `BR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const totalAmount = seatAssignments.reduce((sum, s) => sum + s.price, 0);

    const booking = {
      bookingRef,
      status: 'pending_payment',
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
      createdAt: new Date().toISOString()
    };

    bookings.set(bookingRef, booking);

    log('info', 'booking created (pending payment)', {
      bookingRef,
      trainId,
      seatClass,
      passengerCount: passengers.length,
      totalAmount,
    });

    res.status(201).json(booking);
  } catch (err) {
    log('error', 'create booking failed', {
      message: err.message,
      trainId,
      unavailableService: 'schedule',
    });
    res.status(502).json({
      error: 'Schedule service is unavailable',
      service: 'schedule',
      message: err.message,
    });
  }
});

// Pay for a booking
app.post('/bookings/:bookingRef/pay', async (req, res) => {
  const { bookingRef } = req.params;
  const { cardNumber, cardHolder, expiryDate, cvv } = req.body;
  const booking = bookings.get(bookingRef);

  if (!booking) {
    log('warn', 'pay booking not found', { bookingRef });
    return res.status(404).json({ error: `Booking "${bookingRef}" not found` });
  }

  if (!cardNumber || !cardHolder || !expiryDate || !cvv) {
    log('warn', 'pay booking rejected: missing card details', { bookingRef });
    return res.status(400).json({ error: 'cardNumber, cardHolder, expiryDate, and cvv are required' });
  }

  if (booking.status === 'confirmed') {
    log('warn', 'pay booking already paid', { bookingRef });
    return res.status(409).json({ error: 'Booking has already been paid for' });
  }

  if (booking.status !== 'pending_payment') {
    log('warn', 'pay booking invalid state', { bookingRef, status: booking.status });
    return res.status(400).json({ error: 'Booking is not in a payable state' });
  }

  try {
    const paymentUrl = `${config.paymentServiceUrl}/payments`;
    log('info', 'calling payment service', {
      reason: 'process payment for booking',
      method: 'POST',
      url: paymentUrl,
      bookingRef,
      amount: booking.totalAmount,
      currency: booking.currency,
    });

    const paymentRes = await fetch(paymentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: booking.totalAmount,
        currency: booking.currency,
        bookingRef,
        cardNumber,
        cardHolder,
        expiryDate,
        cvv
      })
    });

    if (!paymentRes.ok) {
      const body = await paymentRes.json().catch(() => ({}));
      log('warn', 'payment failed', { bookingRef, status: paymentRes.status });
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

    // Update booking to confirmed
    booking.status = 'confirmed';
    booking.payment = {
      transactionId: payment.transactionId,
      status: payment.status,
      cardLast4: cardNumber.slice(-4),
      cardHolder: cardHolder
    };

    log('info', 'booking confirmed', {
      bookingRef,
      transactionId: payment.transactionId,
    });

    // Send booking confirmation notification (fire-and-forget)
    sendNotification(booking).catch((err) => {
      log('warn', 'notification failed (non-blocking)', {
        bookingRef,
        message: err.message,
      });
    });

    // Check destination weather and send an alert if disruption is likely (fire-and-forget)
    maybeSendWeatherAlert(booking).catch((err) => {
      log('warn', 'weather alert failed (non-blocking)', {
        bookingRef,
        message: err.message,
      });
    });

    res.json(booking);
  } catch (err) {
    log('error', 'payment service unreachable', {
      bookingRef,
      message: err.message,
    });
    res.status(502).json({
      error: 'Payment service is unavailable',
      service: 'payment',
      message: err.message,
    });
  }
});

// Refund a booking
app.post('/bookings/:bookingRef/refund', async (req, res) => {
  const { bookingRef } = req.params;
  const { reason = 'Customer requested refund' } = req.body || {};
  const booking = bookings.get(bookingRef);

  if (!booking) {
    log('warn', 'refund booking not found', { bookingRef });
    return res.status(404).json({ error: `Booking "${bookingRef}" not found` });
  }

  if (booking.status === 'refunded') {
    log('warn', 'refund booking already refunded', { bookingRef });
    return res.status(409).json({ error: 'Booking has already been refunded' });
  }

  if (booking.status !== 'confirmed') {
    log('warn', 'refund booking invalid state', { bookingRef, status: booking.status });
    return res.status(400).json({ error: 'Booking is not in a refundable state' });
  }

  if (!booking.payment || !booking.payment.transactionId) {
    log('warn', 'refund booking rejected: missing payment transaction', { bookingRef });
    return res.status(400).json({ error: 'Booking does not have a payment transaction to refund' });
  }

  try {
    const transactionId = booking.payment.transactionId;
    const refundUrl = `${config.paymentServiceUrl}/payments/${encodeURIComponent(transactionId)}/refund`;
    log('info', 'calling payment service', {
      reason: 'refund payment for booking',
      method: 'POST',
      url: refundUrl,
      bookingRef,
      transactionId,
    });

    const refundRes = await fetch(refundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });

    if (!refundRes.ok) {
      const body = await refundRes.json().catch(() => ({}));
      log('warn', 'payment refund failed', { bookingRef, transactionId, status: refundRes.status });
      return res.status(refundRes.status).json({
        error: 'Payment refund failed',
        details: body
      });
    }

    const payment = await refundRes.json();
    log('info', 'payment refund responded', {
      bookingRef,
      httpStatus: refundRes.status,
      transactionId: payment.transactionId,
    });

    booking.status = 'refunded';
    booking.payment = {
      ...booking.payment,
      status: payment.status,
      refundReason: payment.refundReason,
      refundedAt: payment.refundedAt
    };
    booking.refundedAt = payment.refundedAt;

    log('info', 'booking refunded', {
      bookingRef,
      transactionId: payment.transactionId,
    });

    res.json(booking);
  } catch (err) {
    log('error', 'payment service unreachable during refund', {
      bookingRef,
      message: err.message,
    });
    res.status(502).json({
      error: 'Payment service is unavailable',
      service: 'payment',
      message: err.message,
    });
  }
});

// Get a booking by reference (optionally enriched with destination weather)
app.get('/bookings/:bookingRef', async (req, res) => {
  const booking = bookings.get(req.params.bookingRef);

  if (!booking) {
    log('warn', 'booking not found', { bookingRef: req.params.bookingRef });
    return res.status(404).json({ error: `Booking "${req.params.bookingRef}" not found` });
  }

  // Enrich with destination weather (non-blocking — failures don't affect the booking response)
  const includeWeather = req.query.weather !== 'false';
  if (includeWeather && booking.train && booking.train.to) {
    const destination = booking.train.to.split(' ')[0]; // e.g. "Manchester" from "Manchester Piccadilly"
    try {
      const weatherUrl = `${config.weatherServiceUrl}/weather?city=${encodeURIComponent(destination)}`;
      log('info', 'calling weather service', {
        reason: 'enrich booking with destination weather',
        method: 'GET',
        url: weatherUrl,
        bookingRef: booking.bookingRef,
      });
      const weatherRes = await fetch(weatherUrl);
      if (weatherRes.ok) {
        const weather = await weatherRes.json();
        log('info', 'weather service responded', {
          bookingRef: booking.bookingRef,
          httpStatus: weatherRes.status,
          summary: weather.conditions && weather.conditions.summary,
        });
        return res.json({ ...booking, destinationWeather: weather });
      }
      log('warn', 'weather service returned error', {
        bookingRef: booking.bookingRef,
        status: weatherRes.status,
      });
    } catch (err) {
      log('warn', 'weather service unreachable (non-blocking)', {
        bookingRef: booking.bookingRef,
        message: err.message,
      });
    }
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

/**
 * Fire-and-forget helper — checks destination weather for a confirmed booking and
 * sends a `weather_alert` notification if the travelAdvisory indicates disruption.
 * Failures are logged but never block the booking response.
 */
async function maybeSendWeatherAlert(booking) {
  if (!booking.train || !booking.train.to) return;

  const destination = booking.train.to.split(' ')[0];
  const weatherUrl = `${config.weatherServiceUrl}/weather?city=${encodeURIComponent(destination)}`;

  log('info', 'calling weather service', {
    reason: 'evaluate destination weather for alert',
    method: 'GET',
    url: weatherUrl,
    bookingRef: booking.bookingRef,
  });

  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) {
    log('warn', 'weather service returned error (no alert sent)', {
      bookingRef: booking.bookingRef,
      status: weatherRes.status,
    });
    return;
  }

  const weather = await weatherRes.json();
  const level = weather.travelAdvisory && weather.travelAdvisory.level;

  // Only alert on warnings — 'advice' and 'ok' are not alert-worthy
  if (level !== 'warning') {
    log('info', 'no weather alert needed', {
      bookingRef: booking.bookingRef,
      level: level || 'unknown',
      summary: weather.conditions && weather.conditions.summary,
    });
    return;
  }

  const notificationUrl = `${config.notificationServiceUrl}/notifications`;
  const payload = {
    type: 'weather_alert',
    recipient: booking.passengers[0].passenger,
    bookingRef: booking.bookingRef,
    message: `Weather alert for ${weather.city} on your travel day: ${weather.travelAdvisory.message}`,
    details: {
      destination: weather.city,
      conditions: weather.conditions,
      temperature: weather.temperature,
      wind: weather.wind,
      travelAdvisory: weather.travelAdvisory,
      train: booking.train,
    },
  };

  log('info', 'calling notification service', {
    reason: 'send weather alert',
    method: 'POST',
    url: notificationUrl,
    bookingRef: booking.bookingRef,
    advisoryLevel: level,
  });

  const notifRes = await fetch(notificationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!notifRes.ok) {
    const body = await notifRes.json().catch(() => ({}));
    log('warn', 'weather alert notification returned error', {
      bookingRef: booking.bookingRef,
      status: notifRes.status,
      details: body,
    });
    return;
  }

  const notif = await notifRes.json();
  log('info', 'weather alert sent', {
    bookingRef: booking.bookingRef,
    notificationId: notif.notificationId,
    httpStatus: notifRes.status,
  });
}

app.listen(config.bookingPort, () => {
  log('info', 'listening', { url: config.bookingServiceUrl });
});