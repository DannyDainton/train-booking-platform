const http = require("http");

// --- Hardcoded weather responses, keyed by lowercased city name ---
// Shape matches OpenWeather's GET /data/2.5/weather response.
const cityWeather = {
  london: {
    coord: { lon: -0.1257, lat: 51.5085 },
    weather: [{ id: 211, main: "Thunderstorm", description: "thunderstorm with heavy rain", icon: "11d" }],
    base: "stations",
    main: { temp: 8.2, feels_like: 5.1, temp_min: 7.0, temp_max: 10.0, pressure: 998, humidity: 88 },
    visibility: 4000,
    wind: { speed: 17.5, deg: 240 },
    clouds: { all: 100 },
    dt: Math.floor(Date.now() / 1000),
    sys: { type: 2, id: 2075535, country: "GB", sunrise: 1712894400, sunset: 1712943600 },
    timezone: 3600,
    id: 2643743,
    name: "London",
    cod: 200,
  },
  manchester: {
    coord: { lon: -2.2374, lat: 53.4809 },
    weather: [{ id: 500, main: "Rain", description: "light rain", icon: "10d" }],
    base: "stations",
    main: { temp: 9.4, feels_like: 7.2, temp_min: 8.3, temp_max: 10.8, pressure: 1008, humidity: 85 },
    visibility: 8000,
    wind: { speed: 6.8, deg: 250 },
    clouds: { all: 95 },
    dt: Math.floor(Date.now() / 1000),
    sys: { type: 2, id: 2011204, country: "GB", sunrise: 1712894700, sunset: 1712943900 },
    timezone: 3600,
    id: 2643123,
    name: "Manchester",
    cod: 200,
  },
  edinburgh: {
    coord: { lon: -3.1883, lat: 55.9533 },
    weather: [{ id: 600, main: "Snow", description: "light snow", icon: "13d" }],
    base: "stations",
    main: { temp: 1.5, feels_like: -2.1, temp_min: 0.8, temp_max: 2.4, pressure: 1005, humidity: 92 },
    visibility: 5000,
    wind: { speed: 8.2, deg: 280 },
    clouds: { all: 100 },
    dt: Math.floor(Date.now() / 1000),
    sys: { type: 2, id: 2038884, country: "GB", sunrise: 1712893200, sunset: 1712944800 },
    timezone: 3600,
    id: 2650225,
    name: "Edinburgh",
    cod: 200,
  },
  bristol: {
    coord: { lon: -2.5879, lat: 51.4545 },
    weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
    base: "stations",
    main: { temp: 14.8, feels_like: 14.1, temp_min: 13.5, temp_max: 16.0, pressure: 1018, humidity: 58 },
    visibility: 10000,
    wind: { speed: 3.2, deg: 180 },
    clouds: { all: 5 },
    dt: Math.floor(Date.now() / 1000),
    sys: { type: 2, id: 2019646, country: "GB", sunrise: 1712894900, sunset: 1712943200 },
    timezone: 3600,
    id: 2654675,
    name: "Bristol",
    cod: 200,
  },
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // @endpoint GET /ping
  if (method === "GET" && pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "openweather-mock" }));
    return;
  }

  // @endpoint GET /data/2.5/weather
  if (method === "GET" && pathname === "/data/2.5/weather") {
    const q = parsedUrl.searchParams.get("q");
    const appid = parsedUrl.searchParams.get("appid");

    if (!appid) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        cod: 401,
        message: "Invalid API key. Please see https://openweathermap.org/faq#error401 for more info."
      }));
      return;
    }

    if (!q) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cod: "400", message: "Nothing to geocode" }));
      return;
    }

    // Handle "City,CountryCode" form by taking the first segment
    const cityKey = q.split(",")[0].trim().toLowerCase();
    const match = cityWeather[cityKey];

    if (!match) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cod: "404", message: "city not found" }));
      return;
    }

    // Refresh `dt` so the normalised observedAt stays current
    const response = { ...match, dt: Math.floor(Date.now() / 1000) };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
    return;
  }

  // --- Fallback 404 ---
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Mock route not defined", method, url: req.url }));
});

const PORT = process.env.PORT || 4504;
server.listen(PORT);
