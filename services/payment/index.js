const { paymentPort, paymentServiceUrl } = require('../../config/endpoints');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// In-memory payment records
const payments = new Map();

// Process a payment
app.post('/payments', (req, res) => {
  const { amount, currency, bookingRef } = req.body;

  if (!amount || !currency || !bookingRef) {
    return res.status(400).json({
      error: '"amount", "currency", and "bookingRef" are all required'
    });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: '"amount" must be a positive number' });
  }

  const transactionId = `TXN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const payment = {
    transactionId,
    bookingRef,
    amount,
    currency: currency.toUpperCase(),
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };

  payments.set(transactionId, payment);

  res.status(201).json(payment);
});

// Look up a payment by transaction ID
app.get('/payments/:transactionId', (req, res) => {
  const payment = payments.get(req.params.transactionId);

  if (!payment) {
    return res.status(404).json({ error: `Payment "${req.params.transactionId}" not found` });
  }

  res.json(payment);
});

// Health check
app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', service: 'payment' });
});

app.listen(paymentPort, () => {
  console.log(`[Payment Service] ${paymentServiceUrl}`);
});
