require('dotenv').config();

module.exports = {
  bookingPort: process.env.BOOKING_PORT || 3000,
  scheduleServiceUrl: process.env.SCHEDULE_SERVICE_URL || 'http://localhost:3001',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002'
};
