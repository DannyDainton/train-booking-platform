const http = require("http");

// --- Hardcoded timetable data ---
// NOTE: Must stay in sync with services/schedule/index.js
const timetable = [
  { trainId: "T100", operator: "Northern Rail", from: "London Euston", to: "Manchester Piccadilly", date: "2026-04-01", departure: "08:15", arrival: "10:25", duration: "2h 10m", price: 45.00, seatsAvailable: 142, seats: { standard: { available: 100, price: 45.00 }, firstClass: { available: 42, price: 54.00 } } },
  { trainId: "T101", operator: "Northern Rail", from: "London Euston", to: "Manchester Piccadilly", date: "2026-04-01", departure: "10:30", arrival: "12:45", duration: "2h 15m", price: 38.50, seatsAvailable: 89, seats: { standard: { available: 60, price: 38.50 }, firstClass: { available: 29, price: 46.20 } } },
  { trainId: "T102", operator: "Avanti West Coast", from: "London Euston", to: "Manchester Piccadilly", date: "2026-04-01", departure: "14:00", arrival: "16:05", duration: "2h 05m", price: 62.00, seatsAvailable: 210, seats: { standard: { available: 150, price: 62.00 }, firstClass: { available: 60, price: 74.40 } } },
  { trainId: "T200", operator: "LNER", from: "London Kings Cross", to: "Edinburgh Waverley", date: "2026-04-01", departure: "09:00", arrival: "13:30", duration: "4h 30m", price: 88.00, seatsAvailable: 55, seats: { standard: { available: 35, price: 88.00 }, firstClass: { available: 20, price: 105.60 } } },
  { trainId: "T201", operator: "LNER", from: "London Kings Cross", to: "Edinburgh Waverley", date: "2026-04-02", departure: "09:00", arrival: "13:30", duration: "4h 30m", price: 78.00, seatsAvailable: 102, seats: { standard: { available: 72, price: 78.00 }, firstClass: { available: 30, price: 93.60 } } },
  { trainId: "T250", operator: "LNER", from: "Edinburgh Waverley", to: "London Kings Cross", date: "2026-04-01", departure: "07:30", arrival: "12:00", duration: "4h 30m", price: 92.00, seatsAvailable: 64, seats: { standard: { available: 40, price: 92.00 }, firstClass: { available: 24, price: 110.40 } } },
  { trainId: "T251", operator: "LNER", from: "Edinburgh Waverley", to: "London Kings Cross", date: "2026-04-02", departure: "08:00", arrival: "12:30", duration: "4h 30m", price: 82.00, seatsAvailable: 118, seats: { standard: { available: 80, price: 82.00 }, firstClass: { available: 38, price: 98.40 } } },
  { trainId: "T300", operator: "GWR", from: "London Paddington", to: "Bristol Temple Meads", date: "2026-04-01", departure: "11:00", arrival: "12:45", duration: "1h 45m", price: 32.00, seatsAvailable: 175, seats: { standard: { available: 130, price: 32.00 }, firstClass: { available: 45, price: 38.40 } } }
];

// --- Helper: assign a random seat ---
function assignSeat(seatClass) {
  if (seatClass === "first") {
    const coach = ["E", "F"][Math.floor(Math.random() * 2)];
    const seat = Math.floor(Math.random() * 30) + 1;
    return `${coach}-${seat}`;
  }
  const coach = ["A", "B", "C", "D"][Math.floor(Math.random() * 4)];
  const seat = Math.floor(Math.random() * 60) + 1;
  return `${coach}-${seat}`;
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // @endpoint GET /ping
  if (method === "GET" && pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "schedule-mock" }));
    return;
  }

  // @endpoint GET /schedules
  if (method === "GET" && pathname === "/schedules") {
    const from = parsedUrl.searchParams.get("from");
    const to = parsedUrl.searchParams.get("to");
    const date = parsedUrl.searchParams.get("date");
    const seatClass = parsedUrl.searchParams.get("seatClass");

    if (!from || !to) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required query parameters: from, to" }));
      return;
    }

    if (seatClass && seatClass !== "standard" && seatClass !== "first") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: '"seatClass" must be "standard" or "first"' }));
      return;
    }

    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    let results = timetable.filter((train) => {
      const matchFrom = train.from.toLowerCase().includes(fromLower);
      const matchTo = train.to.toLowerCase().includes(toLower);
      const matchDate = date ? train.date === date : true;
      return matchFrom && matchTo && matchDate;
    });

    if (seatClass === "first") {
      results = results.filter((train) => train.seats.firstClass.available > 0);
    } else if (seatClass === "standard") {
      results = results.filter((train) => train.seats.standard.available > 0);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count: results.length, results }));
    return;
  }

  // @endpoint POST /schedules/:trainId/assign-seat
  const assignSeatMatch = pathname.match(/^\/schedules\/([^/]+)\/assign-seat$/);
  if (method === "POST" && assignSeatMatch) {
    const trainId = decodeURIComponent(assignSeatMatch[1]);
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }

      const train = timetable.find((t) => t.trainId === trainId);
      if (!train) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Train "${trainId}" not found` }));
        return;
      }

      const seatClass = parsed.seatClass;
      if (!seatClass || (seatClass !== "standard" && seatClass !== "first")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: '"seatClass" must be "standard" or "first"' }));
        return;
      }

      const seatInfo = seatClass === "first" ? train.seats.firstClass : train.seats.standard;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ trainId, seatClass, seat: assignSeat(seatClass), price: seatInfo.price }));
    });
    return;
  }

  // @endpoint GET /schedules/:trainId
  const schedulesMatch = pathname.match(/^\/schedules\/([^/]+)$/);
  if (method === "GET" && schedulesMatch) {
    const trainId = decodeURIComponent(schedulesMatch[1]);
    const train = timetable.find((t) => t.trainId === trainId);

    if (!train) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Train "${trainId}" not found` }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(train));
    return;
  }

  // --- Fallback 404 ---
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Mock route not defined", method, url: req.url }));
});

const PORT = process.env.PORT || 4501;
server.listen(PORT);