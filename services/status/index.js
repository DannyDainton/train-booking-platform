const express = require('express');
const {
  bookingPort,
  bookingServiceUrl,
  schedulePort,
  scheduleServiceUrl,
  paymentPort,
  paymentServiceUrl,
  notificationPort,
  notificationServiceUrl,
  weatherPort,
  weatherServiceUrl,
  openWeatherApiUrl,
} = require('../../config/endpoints');

const app = express();

const statusPort = Number(process.env.STATUS_PORT) || 3005;
const OPENWEATHER_API_KEY =
  process.env.OPENWEATHER_API_KEY || 'dev-placeholder-key';

// Postman mock server ports (see package.json "mocks:*" scripts).
const MOCK = {
  schedule: 'http://localhost:4501',
  payment: 'http://localhost:4502',
  notification: 'http://localhost:4503',
  openweather: 'http://localhost:4504',
};

/**
 * Topology of everything the platform depends on. Each group has a fixed
 * "real" target, an optional Postman "mock" target, and the currently wired
 * "active" URL (resolved by config/endpoints.js — the same logic the services
 * themselves use), so we can show which one traffic actually flows to.
 */
const groups = [
  {
    key: 'booking',
    label: 'Booking',
    role: 'Gateway / public API',
    real: `http://localhost:${bookingPort}`,
    active: bookingServiceUrl,
  },
  {
    key: 'schedule',
    label: 'Schedule',
    role: 'Train schedules & seat assignment',
    real: `http://localhost:${schedulePort}`,
    mock: MOCK.schedule,
    active: scheduleServiceUrl,
    consumedVia: 'SCHEDULE_SERVICE_URL',
  },
  {
    key: 'payment',
    label: 'Payment',
    role: 'Payments & refunds',
    real: `http://localhost:${paymentPort}`,
    mock: MOCK.payment,
    active: paymentServiceUrl,
    consumedVia: 'PAYMENT_SERVICE_URL',
  },
  {
    key: 'notification',
    label: 'Notification',
    role: 'Booking & weather alerts',
    real: `http://localhost:${notificationPort}`,
    mock: MOCK.notification,
    active: notificationServiceUrl,
    consumedVia: 'NOTIFICATION_SERVICE_URL',
  },
  {
    key: 'weather',
    label: 'Weather',
    role: 'Travel weather (wraps OpenWeather)',
    real: `http://localhost:${weatherPort}`,
    active: weatherServiceUrl,
  },
  {
    key: 'openweather',
    label: 'OpenWeather (upstream)',
    role: 'Weather data source for the Weather service',
    real: 'https://api.openweathermap.org',
    mock: MOCK.openweather,
    active: openWeatherApiUrl,
    consumedVia: 'OPENWEATHER_API_URL',
    // The real OpenWeather API has no /ping — probe a real endpoint instead
    // and treat any non-5xx reply (200 ok, 401 bad key, etc.) as "reachable".
    probes: {
      real: {
        path: `/data/2.5/weather?q=London&appid=${OPENWEATHER_API_KEY}`,
        accept: (status) => status > 0 && status < 500,
      },
      mock: { path: '/ping', accept: (status) => status === 200 },
    },
  },
];

function trimTrailingSlash(url) {
  return (url || '').replace(/\/$/, '');
}

/**
 * Decide whether traffic is currently routed to the mock, the real service,
 * or some other custom URL, by comparing the active URL to the known targets.
 */
function activeTargetOf(group) {
  const active = trimTrailingSlash(group.active);
  if (group.mock && trimTrailingSlash(group.mock) === active) {
    return 'mock';
  }
  if (trimTrailingSlash(group.real) === active) {
    return 'real';
  }
  return 'custom';
}

/**
 * Probe a single target URL and report reachability, HTTP status and latency.
 */
async function probe(url, options = {}) {
  const { path = '/ping', accept = (status) => status === 200, timeoutMs = 2000 } =
    options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const target = `${trimTrailingSlash(url)}${path}`;
  const startedAt = Date.now();

  try {
    const res = await fetch(target, { signal: controller.signal });
    const ms = Date.now() - startedAt;
    let service = null;
    try {
      const body = await res.json();
      service = body && body.service ? body.service : null;
    } catch (err) {
      // Non-JSON or empty body is fine — reachability is what matters here.
    }
    return { url, up: accept(res.status), status: res.status, ms, service };
  } catch (err) {
    return {
      url,
      up: false,
      status: null,
      ms: Date.now() - startedAt,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function buildStatus() {
  const results = await Promise.all(
    groups.map(async (group) => {
      const probes = group.probes || {};
      const [real, mock] = await Promise.all([
        probe(group.real, probes.real),
        group.mock ? probe(group.mock, probes.mock) : Promise.resolve(null),
      ]);

      return {
        key: group.key,
        label: group.label,
        role: group.role,
        consumedVia: group.consumedVia || null,
        activeUrl: trimTrailingSlash(group.active),
        activeTarget: activeTargetOf(group),
        targets: {
          real: { ...real, kind: 'real' },
          mock: group.mock ? { ...mock, kind: 'mock' } : null,
        },
      };
    })
  );

  return { generatedAt: new Date().toISOString(), services: results };
}

app.get('/api/status', async (_req, res) => {
  try {
    res.json(await buildStatus());
  } catch (err) {
    res.status(500).json({ error: 'Failed to build status', message: err.message });
  }
});

app.get('/ping', (_req, res) => {
  res.json({ status: 'ok', service: 'status' });
});

app.get('/', (_req, res) => {
  res.type('html').send(PAGE_HTML);
});

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Platform Status</title>
	<style>
		:root {
			--bg: #0f1220;
			--panel: #191d31;
			--panel-2: #212639;
			--border: #2c3350;
			--text: #e7eaf3;
			--muted: #9aa3bd;
			--up: #34d399;
			--down: #f87171;
			--idle: #6b7280;
			--mock: #f59e0b;
			--real: #38bdf8;
			--radius: 12px;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
				Helvetica, Arial, sans-serif;
			background: var(--bg);
			color: var(--text);
			line-height: 1.5;
		}
		header {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			flex-wrap: wrap;
			gap: 0.5rem 1rem;
			padding: 1.5rem clamp(1rem, 4vw, 2.5rem) 0.5rem;
		}
		h1 { font-size: 1.4rem; margin: 0; }
		.meta { color: var(--muted); font-size: 0.85rem; }
		main {
			padding: 1rem clamp(1rem, 4vw, 2.5rem) 2.5rem;
			display: grid;
			gap: 1rem;
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		}
		.card {
			background: var(--panel);
			border: 1px solid var(--border);
			border-radius: var(--radius);
			padding: 1rem 1.1rem 1.1rem;
		}
		.card__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
		}
		.card__title { font-size: 1.05rem; font-weight: 600; }
		.card__role { color: var(--muted); font-size: 0.8rem; margin: 0.15rem 0 0.9rem; }
		.badge {
			font-size: 0.68rem;
			font-weight: 700;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			padding: 0.2rem 0.5rem;
			border-radius: 999px;
			border: 1px solid transparent;
			white-space: nowrap;
		}
		.badge--mock { color: var(--mock); border-color: var(--mock); background: rgba(245,158,11,0.12); }
		.badge--real { color: var(--real); border-color: var(--real); background: rgba(56,189,248,0.12); }
		.badge--custom { color: var(--muted); border-color: var(--muted); background: rgba(154,163,189,0.12); }
		.target {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			padding: 0.55rem 0.65rem;
			border: 1px solid var(--border);
			border-radius: 10px;
			background: var(--panel-2);
			margin-top: 0.5rem;
		}
		.target--active { border-color: var(--real); box-shadow: 0 0 0 1px var(--real) inset; }
		.dot {
			width: 10px; height: 10px; border-radius: 50%;
			background: var(--idle); flex: none;
		}
		.dot--up { background: var(--up); box-shadow: 0 0 8px var(--up); }
		.dot--down { background: var(--down); box-shadow: 0 0 8px var(--down); }
		.target__body { min-width: 0; flex: 1; }
		.target__label {
			display: flex; align-items: center; gap: 0.4rem;
			font-size: 0.78rem; font-weight: 600; text-transform: uppercase;
			letter-spacing: 0.03em; color: var(--muted);
		}
		.tag-active {
			font-size: 0.6rem; color: var(--real); border: 1px solid var(--real);
			padding: 0.05rem 0.35rem; border-radius: 999px; letter-spacing: 0.03em;
		}
		.target__url {
			font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
			font-size: 0.78rem; color: var(--text);
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		}
		.target__detail { font-size: 0.72rem; color: var(--muted); }
		footer {
			padding: 0 clamp(1rem, 4vw, 2.5rem) 2rem;
			color: var(--muted); font-size: 0.8rem;
		}
		.legend { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
		.legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
		button {
			font: inherit; color: var(--text); background: var(--panel-2);
			border: 1px solid var(--border); border-radius: 8px;
			padding: 0.35rem 0.7rem; cursor: pointer;
		}
		button:hover { border-color: var(--real); }
	</style>
</head>
<body>
	<header>
		<div>
			<h1>Train Booking Platform &mdash; Status</h1>
			<p class="meta" id="meta" aria-live="polite">Loading&hellip;</p>
		</div>
		<button id="refresh" type="button">Refresh now</button>
	</header>
	<main id="grid" aria-live="polite"></main>
	<footer>
		<div class="legend">
			<span><span class="dot dot--up"></span> Reachable</span>
			<span><span class="dot dot--down"></span> Down</span>
			<span><span class="badge badge--real">Real</span> Live service in use</span>
			<span><span class="badge badge--mock">Mock</span> Postman mock in use</span>
		</div>
	</footer>
	<script>
		const grid = document.getElementById('grid')
		const meta = document.getElementById('meta')

		function targetRow (target, isActive) {
			if (!target) return ''
			const dotClass = target.up ? 'dot--up' : 'dot--down'
			const detail = target.up
				? (target.status ? 'HTTP ' + target.status : 'ok') +
					(typeof target.ms === 'number' ? ' &middot; ' + target.ms + 'ms' : '')
				: (target.error || 'unreachable')
			const activeTag = isActive
				? '<span class="tag-active">in use</span>'
				: ''
			return (
				'<div class="target ' + (isActive ? 'target--active' : '') + '">' +
					'<span class="dot ' + dotClass + '"></span>' +
					'<div class="target__body">' +
						'<div class="target__label">' + target.kind + activeTag + '</div>' +
						'<div class="target__url" title="' + target.url + '">' + target.url + '</div>' +
						'<div class="target__detail">' + detail + '</div>' +
					'</div>' +
				'</div>'
			)
		}

		function card (svc) {
			const badgeClass = svc.activeTarget === 'mock' ? 'badge--mock'
				: svc.activeTarget === 'real' ? 'badge--real' : 'badge--custom'
			const badgeText = svc.activeTarget
			const via = svc.consumedVia
				? '<div class="target__detail" style="margin-top:0.6rem">wired via <code>' +
					svc.consumedVia + '</code></div>'
				: ''
			return (
				'<article class="card">' +
					'<div class="card__head">' +
						'<span class="card__title">' + svc.label + '</span>' +
						'<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
					'</div>' +
					'<p class="card__role">' + svc.role + '</p>' +
					targetRow(svc.targets.real, svc.activeTarget === 'real') +
					targetRow(svc.targets.mock, svc.activeTarget === 'mock') +
					via +
				'</article>'
			)
		}

		async function load () {
			try {
				const res = await fetch('/api/status', { cache: 'no-store' })
				const data = await res.json()
				grid.innerHTML = data.services.map(card).join('')
				const when = new Date(data.generatedAt).toLocaleTimeString()
				meta.innerHTML = 'Last checked ' + when + ' &middot; auto-refresh every 30s'
			} catch (err) {
				meta.textContent = 'Failed to load status: ' + err.message
			}
		}

		document.getElementById('refresh').addEventListener('click', load)
		load()
		setInterval(load, 30000)
	</script>
</body>
</html>`;

app.listen(statusPort, () => {
  console.log(`[Status Dashboard] http://localhost:${statusPort}`);
});
