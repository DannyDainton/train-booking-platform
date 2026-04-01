const http = require("http");

const server = http.createServer((req, res) => {
  const method = req.method;
  const url = req.url.split("?")[0];

  res.setHeader("Content-Type", "application/json");

  // @endpoint GET /ping
  if (method === "GET" && url === "/ping") {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: "healthy",
      service: "notification-service",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // @endpoint GET /notifications/:notificationId
  if (method === "GET" && url.match(/^\/notifications\/[^/]+$/)) {
    const notificationId = url.split("/")[2];
    res.writeHead(200);
    res.end(JSON.stringify({
      id: notificationId,
      type: "booking_confirmation",
      recipient: "passenger@example.com",
      bookingRef: "BK-2025-00742",
      details: {
        subject: "Booking Confirmation - London to Edinburgh",
        message: "Your train booking BK-2025-00742 has been confirmed. Departure: 2025-08-15 at 09:30 from London King's Cross.",
        channel: "email"
      },
      status: "delivered",
      createdAt: "2025-07-15T10:30:00.000Z",
      deliveredAt: "2025-07-15T10:30:02.450Z"
    }));
    return;
  }

  // @endpoint POST /notifications
  if (method === "POST" && url === "/notifications") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        // use defaults if body is not valid JSON
      }

      res.writeHead(201);
      res.end(JSON.stringify({
        id: "ntf-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8),
        type: parsed.type || "booking_confirmation",
        recipient: parsed.recipient || "passenger@example.com",
        bookingRef: parsed.bookingRef || "BK-2025-00742",
        details: parsed.details || {
          subject: "Booking Confirmation",
          message: "Your train booking has been confirmed.",
          channel: "email"
        },
        status: "queued",
        createdAt: new Date().toISOString(),
        deliveredAt: null
      }));
    });
    return;
  }

  // 404 fallback
  res.writeHead(404);
  res.end(JSON.stringify({
    error: "Not Found",
    message: "The requested route " + method + " " + url + " is not mocked.",
    availableEndpoints: [
      "GET /ping",
      "GET /notifications/:notificationId",
      "POST /notifications"
    ]
  }));
});

server.listen(process.env.PORT || 4500);
