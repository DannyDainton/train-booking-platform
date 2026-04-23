const { weatherPort, weatherServiceUrl, openWeatherApiUrl } = require('../../config/endpoints');
const express = require('express');

const app = express();
app.use(express.json());

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'dev-placeholder-key';

// Naive in-memory cache — keyed by "city|date"
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(city, date) {
  return `${city.toLowerCase()}|${date || 'current'}`;
}

function getCached(city, date) {
  const entry = cache.get(cacheKey(city, date));
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    cache.delete(cacheKey(city, date));
    return null;
  }
  return entry.data;
}

function putCached(city, date, data) {
  cache.set(cacheKey(city, date), { data, storedAt: Date.now() });
}

/**
 * Map an OpenWeather `weather[0].main` value to a simple travel-friendly category.
 */
function toTravelCategory(main) {
  const m = (main || '').toLowerCase();
  if (['thunderstorm', 'tornado', 'squall'].includes(m)) return 'severe';
  if (['snow', 'rain', 'drizzle'].includes(m)) return 'wet';
  if (['mist', 'fog', 'haze', 'smoke', 'dust', 'sand', 'ash'].includes(m)) return 'reduced_visibility';
  if (m === 'clouds') return 'cloudy';
  if (m === 'clear') return 'clear';
  return 'unknown';
}

function normaliseOpenWeatherResponse(owResponse, city) {
  const weather = owResponse.weather && owResponse.weather[0];
  const main = owResponse.main || {};

  return {
    city: owResponse.name || city,
    country: (owResponse.sys && owResponse.sys.country) || null,
    observedAt: owResponse.dt ? new Date(owResponse.dt * 1000).toISOString() : new Date().toISOString(),
    conditions: {
      summary: weather ? weather.main : 'Unknown',
      description: weather ? weather.description : null,
      category: toTravelCategory(weather && weather.main),
    },
    temperature: {
      current: main.temp ?? null,
      feelsLike: main.feels_like ?? null,
      min: main.temp_min ?? null,
      max: main.temp_max ?? null,
      unit: 'C',
    },
    wind: {
      speed: owResponse.wind ? owResponse.wind.speed : null,
      unit: 'm/s',
    },
    humidity: main.humidity ?? null,
    travelAdvisory: buildTravelAdvisory(weather && weather.main, owResponse.wind && owResponse.wind.speed),
  };
}

function buildTravelAdvisory(main, windSpeed) {
  const category = toTravelCategory(main);
  if (category === 'severe') {
    return { level: 'warning', message: 'Severe weather — check for service disruption before travelling.' };
  }
  if (windSpeed && windSpeed > 15) {
    return { level: 'warning', message: 'High winds may affect services.' };
  }
  if (category === 'wet') {
    return { level: 'advice', message: 'Wet weather expected — allow extra time at stations.' };
  }
  if (category === 'reduced_visibility') {
    return { level: 'advice', message: 'Reduced visibility — expect possible delays.' };
  }
  return { level: 'ok', message: 'No weather disruption expected.' };
}

// --- Routes ---

// GET /weather?city=London[&date=2026-04-25]
app.get('/weather', async (req, res) => {
  const { city, date } = req.query;

  if (!city) {
    return res.status(400).json({ error: '"city" query parameter is required' });
  }

  const cached = getCached(city, date);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const params = new URLSearchParams({
      q: city,
      appid: OPENWEATHER_API_KEY,
      units: 'metric',
    });

    const upstreamUrl = `${openWeatherApiUrl}/data/2.5/weather?${params}`;
    const upstream = await fetch(upstreamUrl);

    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({
        error: 'OpenWeather upstream returned an error',
        upstreamStatus: upstream.status,
        details: body,
      });
    }

    const raw = await upstream.json();
    const normalised = normaliseOpenWeatherResponse(raw, city);

    putCached(city, date, normalised);

    res.json({ ...normalised, cached: false });
  } catch (err) {
    res.status(502).json({
      error: 'OpenWeather API is unreachable',
      service: 'openweather',
      message: err.message,
    });
  }
});

// Health check
app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', service: 'weather' });
});

app.listen(weatherPort, () => {
  console.log(`[Weather Service] ${weatherServiceUrl} (upstream: ${openWeatherApiUrl})`);
});
