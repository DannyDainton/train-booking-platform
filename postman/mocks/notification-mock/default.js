const http = require("http");

// --- In-memory notification store ---
const notifications = new Map();
let notificationCounter = 1;

const validTypes = ["booking_confirmation", "payment_receipt", "cancellation", "schedule_change"];

function generateDefaultMessage(type, bookingRef) {
  switch (type) {
    case "booking_confirmation":
      return `Your booking ${bookingRef} has been confirmed. Have a great journey!`;
    case "payment_receipt":
      return `Payment received for booking ${bookingRef}. Thank you!`;
    case "cancellation":
      return `Your booking ${bookingRef} has been cancelled.`;
    case "schedule_change":
      return `There has been a schedule change affecting your booking ${bookingRef}.`;
    default:
      return `Notification for booking ${bookingRef}.`;
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // @endpoint GET /ping
  if (method === "GET" && pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "notification-mock" }));
    return;
  }

  // @endpoint POST /notifications
  if (method === "POST" && pathname === "/notifications") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }

      const { type, recipient, bookingRef, message, details } = parsed;

      if (!type || !recipient || !bookingRef) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required fields: type, recipient, bookingRef" }));
        return;
      }

      if (!validTypes.includes(type)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `"type" must be one of: ${validTypes.join(", ")}` }));
        return;
      }

      const notificationId = "NTF-MOCK" + String(notificationCounter).padStart(4, "0");
      notificationCounter++;

      const notification = {
        notificationId,
        type,
        recipient,
        bookingRef,
        message: message || generateDefaultMessage(type, bookingRef),
        details: details || {},
        status: "sent",
        createdAt: new Date().toISOString()
      };

      notifications.set(notificationId, notification);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(notification));
    });
    return;
  }

  // @endpoint GET /notifications/:notificationId
  const notificationsMatch = pathname.match(/^\/notifications\/([^/]+)$/);
  if (method === "GET" && notificationsMatch) {
    const notificationId = decodeURIComponent(notificationsMatch[1]);
    const notification = notifications.get(notificationId);

    if (!notification) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Notification "${notificationId}" not found` }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(notification));
    return;
  }

  // --- Fallback 404 ---
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Mock route not defined", method, url: req.url }));
});

const PORT = process.env.PORT || 4503;
server.listen(PORT);
