// grace · network lookups for the `ip` and `domain` commands.
// Free public sources only: RDAP (registries), Cloudflare DNS-over-HTTPS, ipwho.is, crt.sh, BGPView.
// Optional: ABUSEIPDB_KEY for real abuse scores.

const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
const { domainToASCII } = require('url');

class LookupError extends Error { constructor(m) { super(m); this.userFacing = true; } }

async function get(url, { timeout = 9000, headers = {}, json = true, okStatus = [] } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'grace-bot/1.0', accept: 'application/json', ...headers }, redirect: 'follow' });
    if (!res.ok && !okStatus.includes(res.status)) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: json ? await res.json() : await res.text() };
  } catch (e) {
    if (e.name === 'AbortError') { const err = new Error('timeout'); err.timeout = true; throw err; }
    throw e;
  } finally { clearTimeout(t); }
}

/* ── input ─────────────────────────────────────────────────────────── */

const isIp = (s) => net.isIP(s) > 0;

function cleanHost(input) {
  let s = String(input ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#]/)[0].replace(/^.*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return s;
}
function cleanDomain(input) {
  const s = domainToASCII(cleanHost(input));
  if (!s || s.length > 253 || !/^(?=.{1,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z]{2,63}$/.test(s)) throw new LookupError('That is not a valid domain. Try something like `example.com`.');
  return s;
}
function cleanIp(input) {
  const s = String(input ?? '').trim().replace(/^\[|\]$/g, '');
  if (!isIp(s)) throw new LookupError('That is not a valid IP address.');
  return s;
}

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('::ffff:');
}

/** A public address for a host or IP; refuses private ranges so the bot cannot be pointed at internal services. */
async function publicAddress(target) {
  let ip = target;
  if (!isIp(target)) {
    const host = cleanDomain(target);
    try { ip = (await dns.lookup(host, { all: true })).map(r => r.address).find(a => !isPrivate(a)) ?? null; }
    catch { throw new LookupError(`Could not resolve \`${host}\`.`); }
    if (!ip) throw new LookupError('That host only resolves to private addresses.');
  } else if (isPrivate(ip)) throw new LookupError('That is a private or reserved address.');
  return ip;
}

/* ── RDAP ──────────────────────────────────────────────────────────── */

const vcard = (ent, field) => (ent?.vcardArray?.[1] ?? []).find(v => v[0] === field)?.[3] ?? null;
const evt = (data, action) => (data?.events ?? []).find(e => e.eventAction === action)?.eventDate ?? null;
const flat = (ents = []) => ents.flatMap(e => [e, ...flat(e.entities ?? [])]);

async function rdapDomain(domain) {
  const { status, data } = await get(`https://rdap.org/domain/${domain}`, { okStatus: [404] }).catch(e => { if (e.status === 400 || e.status === 429 || e.status >= 500 || e.timeout) throw new LookupError('The registry did not answer. Try again in a moment.'); throw e; });
  if (status === 404) return null;
  const ents = flat(data.entities ?? []);
  const registrar = ents.find(e => (e.roles ?? []).includes('registrar'));
  return {
    name: (data.ldhName || domain).toLowerCase(),
    registrar: vcard(registrar, 'fn'),
    iana: registrar?.publicIds?.find(p => p.type === 'IANA Registrar ID')?.identifier ?? null,
    created: evt(data, 'registration'), updated: evt(data, 'last changed'), expires: evt(data, 'expiration'),
    nameservers: (data.nameservers ?? []).map(n => (n.ldhName || '').toLowerCase()).filter(Boolean),
    status: data.status ?? [],
    dnssec: data.secureDNS?.delegationSigned ?? null,
    abuse: vcard(ents.find(e => (e.roles ?? []).includes('abuse')), 'email'),
    raw: data,
  };
}

async function rdapIp(ip) {
  const { data } = await get(`https://rdap.org/ip/${ip}`).catch(e => { throw new LookupError(e.status === 404 ? 'No registry record for that address.' : 'The registry did not answer. Try again in a moment.'); });
  const ents = flat(data.entities ?? []);
  const abuseEnt = ents.find(e => (e.roles ?? []).includes('abuse'));
  const owner = ents.find(e => (e.roles ?? []).some(r => ['registrant', 'administrative', 'technical'].includes(r)));
  const cidr = (data['cidr0_cidrs'] ?? []).map(c => `${c.v4prefix || c.v6prefix}/${c.length}`);
  return {
    handle: data.handle, name: data.name, type: data.type, country: data.country,
    start: data.startAddress, end: data.endAddress, cidr, parent: data.parentHandle,
    owner: vcard(owner, 'fn'), abuseEmail: vcard(abuseEnt, 'email'), abusePhone: vcard(abuseEnt, 'tel'),
    created: evt(data, 'registration'), updated: evt(data, 'last changed'),
    remarks: (data.remarks ?? []).flatMap(r => r.description ?? []).slice(0, 3),
    status: data.status ?? [],
  };
}

/* ── DNS ───────────────────────────────────────────────────────────── */

const DNS_TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, CAA: 257 };
const TYPE_NAME = Object.fromEntries(Object.entries(DNS_TYPES).map(([k, v]) => [v, k]));

async function dnsQuery(name, type = 'A') {
  const { data } = await get(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, timeout: 6000 })
    .catch(() => { throw new LookupError('The DNS resolver did not answer. Try again in a moment.'); });
  return { status: data.Status, answers: (data.Answer ?? []).map(a => ({ type: TYPE_NAME[a.type] ?? String(a.type), ttl: a.TTL, data: String(a.data).replace(/^"|"$/g, '') })) };
}

/* ── IP intelligence ───────────────────────────────────────────────── */

async function ipInfo(ip) {
  const { data } = await get(`https://ipwho.is/${ip}`).catch(() => { throw new LookupError('The IP lookup service did not answer. Try again in a moment.'); });
  if (!data?.success) throw new LookupError(data?.message || 'No information for that address.');
  return data;
}

async function asnInfo(input) {
  const n = String(input).replace(/^as/i, '');
  if (!/^\d{1,10}$/.test(n)) throw new LookupError('Give an AS number like `AS15169`, or an IP address.');
  const [rd, bgp] = await Promise.all([
    get(`https://rdap.org/autnum/${n}`, { okStatus: [404] }).catch(() => null),
    get(`https://api.bgpview.io/asn/${n}`, { timeout: 7000 }).catch(() => null),
  ]);
  if (!rd?.data && !bgp?.data?.data) throw new LookupError(`No record for AS${n}.`);
  const r = rd?.data, b = bgp?.data?.data;
  const ents = flat(r?.entities ?? []);
  return {
    asn: Number(n), name: b?.name || r?.name, description: b?.description_full?.[0] || b?.description_short || null,
    country: b?.rir_allocation?.country_code || r?.country || null, rir: b?.rir_allocation?.rir_name ?? null,
    allocated: b?.rir_allocation?.date_allocated ?? evt(r, 'registration'),
    website: b?.website ?? null, abuse: vcard(ents.find(e => (e.roles ?? []).includes('abuse')), 'email') || (b?.email_contacts ?? [])[0] || null,
    owner: vcard(ents.find(e => (e.roles ?? []).includes('registrant')), 'fn'),
  };
}

async function abuseScore(ip) {
  const key = process.env.ABUSEIPDB_KEY;
  if (!key) return null;
  const { data } = await get(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, { headers: { Key: key } }).catch(() => ({ data: null }));
  return data?.data ?? null;
}

/* ── live checks ───────────────────────────────────────────────────── */

function connectOnce(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok ? Number(process.hrtime.bigint() - t0) / 1e6 : null); };
    s.setTimeout(timeout, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

const PORTS = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 465: 'SMTPS', 587: 'Submission', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 8080: 'HTTP alt', 8443: 'HTTPS alt' };

async function scanPorts(ip) {
  const list = Object.keys(PORTS).map(Number);
  const res = await Promise.all(list.map(async p => ({ port: p, service: PORTS[p], ms: await connectOnce(ip, p, 1800) })));
  return res;
}

async function tcpPing(ip, port = 443, count = 4) {
  const times = [];
  for (let i = 0; i < count; i++) times.push(await connectOnce(ip, port, 2500));
  let ok = times.filter(t => t !== null);
  let usedPort = port;
  if (!ok.length && port === 443) { usedPort = 80; for (let i = 0; i < count; i++) times[i] = await connectOnce(ip, 80, 2500); ok = times.filter(t => t !== null); }
  return { port: usedPort, sent: count, got: ok.length, min: ok.length ? Math.min(...ok) : null, avg: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null, max: ok.length ? Math.max(...ok) : null };
}

function certificate(host, port = 443) {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 6000 }, () => {
      const c = s.getPeerCertificate(true);
      const info = { cert: c, protocol: s.getProtocol(), cipher: s.getCipher()?.name, authorized: s.authorized, error: s.authorizationError ? String(s.authorizationError) : null };
      s.end(); resolve(info);
    });
    s.on('timeout', () => { s.destroy(); reject(new LookupError('The connection timed out.')); });
    s.on('error', () => reject(new LookupError(`Could not open a secure connection to \`${host}\`.`)));
  });
}

async function subdomains(domain) {
  const { data } = await get(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { timeout: 20000 })
    .catch(() => { throw new LookupError('The certificate log search is busy or timed out. Try again in a moment.'); });
  const set = new Set();
  for (const row of data ?? []) for (const n of String(row.name_value).split('\n')) {
    const h = n.trim().toLowerCase().replace(/^\*\./, '');
    if (h && (h === domain || h.endsWith(`.${domain}`))) set.add(h);
  }
  set.delete(domain);
  return [...set].sort();
}

/* ── subnet maths (IPv4) ───────────────────────────────────────────── */

const toInt = (ip) => ip.split('.').reduce((a, o) => (a * 256) + Number(o), 0);
const fromInt = (n) => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');

function subnet(input) {
  const m = String(input).trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2})|\s+(\d{1,3}(?:\.\d{1,3}){3}))?$/);
  if (!m || !net.isIPv4(m[1])) throw new LookupError('Give an IPv4 network like `192.168.1.0/24` or `10.0.0.5 255.255.255.0`.');
  let bits = 24;
  if (m[2] !== undefined) bits = Number(m[2]);
  else if (m[3]) { const mask = toInt(m[3]); const b = mask.toString(2); if (!/^1*0*$/.test(b.padStart(32, '0'))) throw new LookupError('That subnet mask is not valid.'); bits = b.replace(/0/g, '').length; }
  if (bits > 32) throw new LookupError('The prefix must be between 0 and 32.');
  const size = 2 ** (32 - bits), ip = toInt(m[1]);
  const network = Math.floor(ip / size) * size, broadcast = network + size - 1;
  const maskInt = bits === 0 ? 0 : (2 ** 32 - size);
  const usable = bits >= 31 ? size : size - 2;
  return {
    input: m[1], bits, network: fromInt(network), broadcast: fromInt(broadcast), mask: fromInt(maskInt), wildcard: fromInt(2 ** 32 - 1 - maskInt),
    first: bits >= 31 ? fromInt(network) : fromInt(network + 1), last: bits >= 31 ? fromInt(broadcast) : fromInt(broadcast - 1),
    total: size, usable, private: isPrivate(fromInt(network)),
  };
}

module.exports = {
  LookupError, get, isIp, isPrivate, cleanDomain, cleanIp, cleanHost, publicAddress,
  rdapDomain, rdapIp, dnsQuery, DNS_TYPES, ipInfo, asnInfo, abuseScore,
  scanPorts, tcpPing, certificate, subdomains, subnet, dns,
};
