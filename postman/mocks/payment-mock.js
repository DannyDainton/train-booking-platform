const http = require("http");

// --- In-memory payment store ---
const payments = new Map();
let paymentCounter = 1;

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // @endpoint GET /ping
  if (method === "GET" && pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "payment-mock" }));
    return;
  }

  // @endpoint POST /payments
  if (method === "POST" && pathname === "/payments") {
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

      const { amount, currency, bookingRef } = parsed;

      if (amount === undefined || !currency || !bookingRef) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required fields: amount, currency, bookingRef" }));
        return;
      }

      if (typeof amount !== "number" || amount <= 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "amount must be a positive number" }));
        return;
      }

      const transactionId = "TXN-MOCK" + String(paymentCounter).padStart(4, "0");
      paymentCounter++;

      const payment = {
        transactionId,
        bookingRef,
        amount,
        currency: currency.toUpperCase(),
        status: "confirmed",
        createdAt: new Date().toISOString()
      };

      payments.set(transactionId, payment);

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payment));
    });
    return;
  }

  // @endpoint GET /payments/:transactionId
  const paymentsMatch = pathname.match(/^\/payments\/([^/]+)$/);
  if (method === "GET" && paymentsMatch) {
    const transactionId = decodeURIComponent(paymentsMatch[1]);
    const payment = payments.get(transactionId);

    if (!payment) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Payment "${transactionId}" not found` }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payment));
    return;
  }

  // --- Fallback 404 ---
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Mock route not defined", method, url: req.url }));
});

const PORT = process.env.PORT || 4502;
server.listen(PORT);
