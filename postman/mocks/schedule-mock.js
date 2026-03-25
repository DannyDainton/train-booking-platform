const http = require("http");

// --- Hardcoded timetable data ---
const timetable = [
  { trainId: "T100", operator: "Northern Rail", from: "London Euston", to: "Manchester Piccadilly", date: "2026-04-01", departure: "08:15", arrival: "10:25", duration: "2h 10m", price: 45.00, seatsAvailable: 142 },
  { trainId: "T101", operator: "Northern Rail", from: "London Euston", to: "Manchester Piccadilly", date: "2026-04-01", departure: "10:30", arrival: "12:45", duration: "2h 15m", price: 38.50, seatsAvailable: 89 },
  { trainId: "T102", operator: "Avanti West Coast", from: "London Euston", to: "Manchester Piccadilly", date: "2026-04-01", departure: "14:00", arrival: "16:05", duration: "2h 05m", price: 62.00, seatsAvailable: 210 },
  { trainId: "T200", operator: "LNER", from: "London Kings Cross", to: "Edinburgh Waverley", date: "2026-04-01", departure: "09:00", arrival: "13:30", duration: "4h 30m", price: 88.00, seatsAvailable: 55 },
  { trainId: "T201", operator: "LNER", from: "London Kings Cross", to: "Edinburgh Waverley", date: "2026-04-02", departure: "09:00", arrival: "13:30", duration: "4h 30m", price: 78.00, seatsAvailable: 102 },
  { trainId: "T300", operator: "GWR", from: "London Paddington", to: "Bristol Temple Meads", date: "2026-04-01", departure: "11:00", arrival: "12:45", duration: "1h 45m", price: 32.00, seatsAvailable: 175 }
];

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

    if (!from || !to) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required query parameters: from, to" }));
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

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ count: results.length, results }));
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
