const useColor =
  process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  process.env.FORCE_COLOR !== '0';

const c = useColor
  ? {
      reset: '\x1b[0m',
      dim: '\x1b[2m',
      bold: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
    }
  : {
      reset: '',
      dim: '',
      bold: '',
      red: '',
      green: '',
      yellow: '',
      cyan: '',
    };

function shortTime(d = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`;
}

function paintHttpStatus(code) {
  const s = String(code);
  if (!useColor) return s;
  if (code >= 500) return `${c.red}${s}${c.reset}`;
  if (code >= 400) return `${c.yellow}${s}${c.reset}`;
  return `${c.green}${s}${c.reset}`;
}

function levelBadge(level) {
  const label = level.toUpperCase();
  if (!useColor) return label;
  if (level === 'error') return `${c.bold}${c.red}${label}${c.reset}`;
  if (level === 'warn') return `${c.bold}${c.yellow}${label}${c.reset}`;
  return `${c.bold}${c.cyan}${label}${c.reset}`;
}

/**
 * Drop noisy fields and shorten URLs to pathname + query.
 */
function simplifyMeta(meta, message) {
  if (!meta || typeof meta !== 'object') return null;
  if (message === 'request') return null;

  const m = { ...meta };
  delete m.reason;

  if (typeof m.url === 'string') {
    try {
      const u = new URL(m.url);
      m.path = u.pathname + u.search;
      delete m.url;
    } catch {
      // keep url as-is
    }
  }

  const { method, path, ...rest } = m;
  const out = {};
  if (method !== undefined) out.method = method;
  if (path !== undefined) out.path = path;
  for (const k of Object.keys(rest).sort()) {
    if (rest[k] !== undefined) out[k] = rest[k];
  }
  return out;
}

function metaSuffix(meta, message) {
  const simple = simplifyMeta(meta, message);
  if (simple === null) return '';
  if (Object.keys(simple).length === 0) return '';
  return formatMetaSuffix(simple);
}

function formatMetaSuffix(metaObj) {
  const keys = Object.keys(metaObj);
  if (keys.length === 0) return '';

  const parts = keys.map((k) => {
    const v = metaObj[k];
    const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `${c.dim}${k}=${c.reset}${str}`;
  });
  return ` ${c.dim}·${c.reset} ${parts.join(` ${c.dim}·${c.reset} `)}`;
}

/**
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
function log(level, message, meta) {
  const time = `${c.dim}${shortTime()}${c.reset}`;
  const badge = levelBadge(level);

  if (message === 'request' && meta && meta.method && meta.path != null) {
    const { method, path, status, ms } = meta;
    const line = `${time} ${badge} ${c.bold}${method}${c.reset} ${path} ${paintHttpStatus(
      status,
    )} ${c.dim}${ms}ms${c.reset}`;
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
    return;
  }

  const suffix = metaSuffix(meta, message);
  const line = `${time} ${badge} ${message}${suffix}`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

module.exports = { log };
