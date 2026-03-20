const express = require('express');

const app = express();
const PORT = process.env.SCHEDULE_PORT || 3001;

// --- Hardcoded timetable data ---

const timetable = [
  {
    trainId: 'T100',
    operator: 'Northern Rail',
    from: 'London Euston',
    to: 'Manchester Piccadilly',
    date: '2026-04-01',
    departure: '08:15',
    arrival: '10:25',
    duration: '2h 10m',
    price: 45.00,
    seatsAvailable: 142
  },
  {
    trainId: 'T101',
    operator: 'Northern Rail',
    from: 'London Euston',
    to: 'Manchester Piccadilly',
    date: '2026-04-01',
    departure: '10:30',
    arrival: '12:45',
    duration: '2h 15m',
    price: 38.50,
    seatsAvailable: 89
  },
  {
    trainId: 'T102',
    operator: 'Avanti West Coast',
    from: 'London Euston',
    to: 'Manchester Piccadilly',
    date: '2026-04-01',
    departure: '14:00',
    arrival: '16:05',
    duration: '2h 05m',
    price: 62.00,
    seatsAvailable: 210
  },
  {
    trainId: 'T200',
    operator: 'LNER',
    from: 'London Kings Cross',
    to: 'Edinburgh Waverley',
    date: '2026-04-01',
    departure: '09:00',
    arrival: '13:30',
    duration: '4h 30m',
    price: 88.00,
    seatsAvailable: 55
  },
  {
    trainId: 'T201',
    operator: 'LNER',
    from: 'London Kings Cross',
    to: 'Edinburgh Waverley',
    date: '2026-04-02',
    departure: '09:00',
    arrival: '13:30',
    duration: '4h 30m',
    price: 78.00,
    seatsAvailable: 102
  },
  {
    trainId: 'T300',
    operator: 'GWR',
    from: 'London Paddington',
    to: 'Bristol Temple Meads',
    date: '2026-04-01',
    departure: '11:00',
    arrival: '12:45',
    duration: '1h 45m',
    price: 32.00,
    seatsAvailable: 175
  }
];

// --- Routes ---

// Search schedules by origin, destination, and optional date
app.get('/schedules', (req, res) => {
  const { from, to, date } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Both "from" and "to" query parameters are required' });
  }

  const fromNorm = from.toLowerCase();
  const toNorm = to.toLowerCase();

  const results = timetable.filter((train) => {
    const matchFrom = train.from.toLowerCase().includes(fromNorm);
    const matchTo = train.to.toLowerCase().includes(toNorm);
    const matchDate = date ? train.date === date : true;
    return matchFrom && matchTo && matchDate;
  });

  res.json({ count: results.length, results });
});

// Get a single train by ID
app.get('/schedules/:trainId', (req, res) => {
  const train = timetable.find((t) => t.trainId === req.params.trainId);

  if (!train) {
    return res.status(404).json({ error: `Train "${req.params.trainId}" not found` });
  }

  res.json(train);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'schedule' });
});

app.listen(PORT, () => {
  console.log(`[Schedule Service] running on http://localhost:${PORT}`);
});
