require('./load-env');

function trimTrailingSlash(url) {
  return url.replace(/\/$/, '');
}

function port(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Use *_SERVICE_URL from .env when set; otherwise http://localhost:<PORT>.
 */
function serviceUrl(urlKey, portNum) {
  const explicit = process.env[urlKey];
  if (explicit) {
    return trimTrailingSlash(explicit);
  }
  return `http://localhost:${portNum}`;
}

const bookingPort = port('BOOKING_PORT', 3000);
const schedulePort = port('SCHEDULE_PORT', 3001);
const paymentPort = port('PAYMENT_PORT', 3002);
const notificationPort = port('NOTIFICATION_PORT', 3003);

module.exports = {
  bookingPort,
  bookingServiceUrl: serviceUrl('BOOKING_SERVICE_URL', bookingPort),
  schedulePort,
  scheduleServiceUrl: serviceUrl('SCHEDULE_SERVICE_URL', schedulePort),
  paymentPort,
  paymentServiceUrl: serviceUrl('PAYMENT_SERVICE_URL', paymentPort),
  notificationPort,
  notificationServiceUrl: serviceUrl('NOTIFICATION_SERVICE_URL', notificationPort),
};