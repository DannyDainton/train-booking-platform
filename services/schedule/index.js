const { schedulePort, scheduleServiceUrl } = require('../../config/endpoints');
const express = require('express');

const app = express();
app.use(express.json());

// --- Hardcoded timetable data ---

const timetable = [
  {
    trainId: 'T100',
    operator: 'Northern Rail',
    from: 'London Euston',
    to: 'Manchester Piccadilly',
    date: '2026-11-12',
    departure: '08:15',
    arrival: '10:25',
    duration: '2h 10m',
    price: 45.00,
    seatsAvailable: 142,
    seats: {
      standard: { available: 100, price: 45.00 },
      firstClass: { available: 42, price: 54.00 }
    }
  },
  {
    trainId: 'T101',
    operator: 'Northern Rail',
    from: 'London Euston',
    to: 'Manchester Piccadilly',
    date: '2026-11-12',
    departure: '10:30',
    arrival: '12:45',
    duration: '2h 15m',
    price: 38.50,
    seatsAvailable: 89,
    seats: {
      standard: { available: 60, price: 38.50 },
      firstClass: { available: 29, price: 46.20 }
    }
  },
  {
    trainId: 'T102',
    operator: 'Avanti West Coast',
    from: 'London Euston',
    to: 'Manchester Piccadilly',
    date: '2026-11-12',
    departure: '14:00',
    arrival: '16:05',
    duration: '2h 05m',
    price: 62.00,
    seatsAvailable: 210,
    seats: {
      standard: { available: 150, price: 62.00 },
      firstClass: { available: 60, price: 74.40 }
    }
  },
  {
    trainId: 'T200',
    operator: 'LNER',
    from: 'London Kings Cross',
    to: 'Edinburgh Waverley',
    date: '2026-11-12',
    departure: '09:00',
    arrival: '13:30',
    duration: '4h 30m',
    price: 88.00,
    seatsAvailable: 55,
    seats: {
      standard: { available: 35, price: 88.00 },
      firstClass: { available: 20, price: 105.60 }
    }
  },
  {
    trainId: 'T201',
    operator: 'LNER',
    from: 'London Kings Cross',
    to: 'Edinburgh Waverley',
    date: '2026-11-13',
    departure: '09:00',
    arrival: '13:30',
    duration: '4h 30m',
    price: 78.00,
    seatsAvailable: 102,
    seats: {
      standard: { available: 72, price: 78.00 },
      firstClass: { available: 30, price: 93.60 }
    }
  },
  {
    trainId: 'T250',
    operator: 'LNER',
    from: 'Edinburgh Waverley',
    to: 'London Kings Cross',
    date: '2026-11-12',
    departure: '07:30',
    arrival: '12:00',
    duration: '4h 30m',
    price: 92.00,
    seatsAvailable: 64,
    seats: {
      standard: { available: 40, price: 92.00 },
      firstClass: { available: 24, price: 110.40 }
    }
  },
  {
    trainId: 'T251',
    operator: 'LNER',
    from: 'Edinburgh Waverley',
    to: 'London Kings Cross',
    date: '2026-11-13',
    departure: '08:00',
    arrival: '12:30',
    duration: '4h 30m',
    price: 82.00,
    seatsAvailable: 118,
    seats: {
      standard: { available: 80, price: 82.00 },
      firstClass: { available: 38, price: 98.40 }
    }
  },
  {
    trainId: 'T300',
    operator: 'GWR',
    from: 'London Paddington',
    to: 'Bristol Temple Meads',
    date: '2026-11-12',
    departure: '11:00',
    arrival: '12:45',
    duration: '1h 45m',
    price: 32.00,
    seatsAvailable: 175,
    seats: {
      standard: { available: 130, price: 32.00 },
      firstClass: { available: 45, price: 38.40 }
    }
  }
];

// --- Helper: assign a seat ---

function assignSeat(seatClass) {
  if (seatClass === 'first') {
    const coach = ['E', 'F'][Math.floor(Math.random() * 2)];
    const seat = Math.floor(Math.random() * 30) + 1;
    return `${coach}-${seat}`;
  }
  const coach = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
  const seat = Math.floor(Math.random() * 60) + 1;
  return `${coach}-${seat}`;
}

// --- Routes ---

// Search schedules by origin, destination, and optional date
app.get('/schedules', (req, res) => {
  const { from, to, date, seatClass } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Both "from" and "to" query parameters are required' });
  }

  if (seatClass && seatClass !== 'standard' && seatClass !== 'first') {
    return res.status(400).json({ error: '"seatClass" must be "standard" or "first"' });
  }

  const fromNorm = from.toLowerCase();
  const toNorm = to.toLowerCase();

  const results = timetable.filter((train) => {
    const matchFrom = train.from.toLowerCase().includes(fromNorm);
    const matchTo = train.to.toLowerCase().includes(toNorm);
    const matchDate = date ? train.date === date : true;
    const matchSeatClass = seatClass
      ? seatClass === 'first'
        ? train.seats.firstClass.available > 0
        : train.seats.standard.available > 0
      : true;
    return matchFrom && matchTo && matchDate && matchSeatClass;
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

// Assign a seat on a train
app.post('/schedules/:trainId/assign-seat', (req, res) => {
  const train = timetable.find((t) => t.trainId === req.params.trainId);

  if (!train) {
    return res.status(404).json({ error: `Train "${req.params.trainId}" not found` });
  }

  const { seatClass } = req.body;

  if (!seatClass || (seatClass !== 'standard' && seatClass !== 'first')) {
    return res.status(400).json({ error: '"seatClass" must be "standard" or "first"' });
  }

  const seatInfo = seatClass === 'first' ? train.seats.firstClass : train.seats.standard;
  const seat = assignSeat(seatClass);

  res.json({
    trainId: train.trainId,
    seatClass,
    seat,
    price: seatInfo.price
  });
});

// Health check
app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', service: 'schedule' });
});

app.listen(schedulePort, () => {
  console.log(`[Schedule Service] ${scheduleServiceUrl}`);
});
