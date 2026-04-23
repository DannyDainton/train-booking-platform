const { notificationPort, notificationServiceUrl } = require('../../config/endpoints');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// In-memory notification store
const notifications = new Map();

// Send a notification
app.post('/notifications', (req, res) => {
  const { type, recipient, bookingRef, message, details } = req.body;

  if (!type || !recipient || !bookingRef) {
    return res.status(400).json({
      error: '"type", "recipient", and "bookingRef" are all required'
    });
  }

  const validTypes = ['booking_confirmation', 'payment_receipt', 'cancellation', 'schedule_change', 'weather_alert'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      error: `"type" must be one of: ${validTypes.join(', ')}`
    });
  }

  const notificationId = `NTF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const notification = {
    notificationId,
    type,
    recipient,
    bookingRef,
    message: message || generateDefaultMessage(type, bookingRef),
    details: details || {},
    status: 'sent',
    createdAt: new Date().toISOString()
  };

  notifications.set(notificationId, notification);

  res.status(201).json(notification);
});

// List notifications, optionally filtered by bookingRef and/or type
app.get('/notifications', (req, res) => {
  const { bookingRef, type } = req.query;

  let results = Array.from(notifications.values());

  if (bookingRef) {
    results = results.filter((n) => n.bookingRef === bookingRef);
  }

  if (type) {
    results = results.filter((n) => n.type === type);
  }

  // Most recent first
  results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  res.json({ count: results.length, results });
});

// Get a notification by ID
app.get('/notifications/:notificationId', (req, res) => {
  const notification = notifications.get(req.params.notificationId);

  if (!notification) {
    return res.status(404).json({ error: `Notification "${req.params.notificationId}" not found` });
  }

  res.json(notification);
});

// Health check
app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', service: 'notification' });
});

function generateDefaultMessage(type, bookingRef) {
  switch (type) {
    case 'booking_confirmation':
      return `Your booking ${bookingRef} has been confirmed. Have a great journey!`;
    case 'payment_receipt':
      return `Payment received for booking ${bookingRef}. Thank you!`;
    case 'cancellation':
      return `Your booking ${bookingRef} has been cancelled.`;
    case 'schedule_change':
      return `There has been a schedule change affecting your booking ${bookingRef}.`;
    case 'weather_alert':
      return `Weather alert for your upcoming journey (booking ${bookingRef}). Check for possible disruption before travelling.`;
    default:
      return `Notification for booking ${bookingRef}.`;
  }
}

app.listen(notificationPort, () => {
  console.log(`[Notification Service] ${notificationServiceUrl}`);
});
