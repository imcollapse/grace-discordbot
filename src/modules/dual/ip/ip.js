// grace · ,ip  ·  /ip
//   lookup <ip|host>   location, network and timezone      whois <ip>   registry record (RDAP)
//   abuse <ip>         abuse contact and reports            asn <ip|AS123>   network owner
//   ptr <ip>           reverse DNS                          ports <ip|host>  common open ports
//   subnet <cidr>      subnet maths                         ping <ip|host>   TCP latency

const nt = require('../../../services/netTools');
const K = require('../../../services/lookupKit');
const { makeCommand, need } = require('../../../services/socialKit');

const { kv, group, code, when, num, card, note, send, clip } = K;
const tx = (ctx, a) => a;

/** An address for what the person typed: an IP, or the first public address of a host. */
async function target(input) {
  const s = nt.cleanHost(input);
  if (nt.isIp(s)) { if (nt.isPrivate(s)) throw new nt.LookupError('That is a private or reserved address, so there is nothing public to look up.'); return { ip: s, host: null }; }
  const host = nt.cleanDomain(s);
  return { ip: await nt.publicAddress(host), host };
}
const about = (t) => `Results for ${code(t.host ? `${t.host} → ${t.ip}` : t.ip)}`;

async function lookup(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which IP address', 'ip lookup <ip>');
  const t = await target(arg);
  const d = await nt.ipInfo(t.ip);
  const c = d.connection ?? {};
  return send(ctx, card({
    title: 'IP Lookup', iconKey: 'lookup_ip', about: about(t),
    groups: [
      group('Location', [kv('Country', [d.country, d.country_code && `(${d.country_code})`].filter(Boolean).join(' ')), kv('Region', d.region), kv('City', d.city), kv('Postal', d.postal), kv('Continent', d.continent),
        d.latitude !== undefined ? kv('Coordinates', `${d.latitude}, ${d.longitude}`) : null]),
      group('Network', [kv('Type', d.type), kv('ISP', c.isp), kv('Organisation', c.org), kv('ASN', c.asn ? `AS${c.asn}` : null), kv('Domain', c.domain)]),
      group('Timezone', [kv('Zone', d.timezone?.id), kv('UTC offset', d.timezone?.utc), kv('Local time', d.timezone?.current_time ? d.timezone.current_time.replace('T', ' ').slice(0, 16) : null)]),
    ],
    footer: 'ipwho.is',
  }));
}

async function whois(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which IP address', 'ip whois <ip>');
  const t = await target(arg);
  const r = await nt.rdapIp(t.ip);
  return send(ctx, card({
    title: 'IP WHOIS', iconKey: 'lookup_ip', about: about(t),
    groups: [
      group('Allocation', [kv('Name', r.name), kv('Handle', r.handle), kv('Type', r.type), kv('Country', r.country), kv('Owner', r.owner),
        r.cidr.length ? kv('Range', r.cidr.slice(0, 4).join(', ')) : kv('Range', r.start && `${r.start} – ${r.end}`), kv('Parent', r.parent)]),
      group('Dates', [kv('Registered', r.created && when(r.created), { plain: true }), kv('Updated', r.updated && when(r.updated), { plain: true })]),
      group('Contact', [kv('Abuse email', r.abuseEmail), kv('Phone', r.abusePhone)]),
      r.remarks.length ? group('Remarks', r.remarks.map(x => clip(x.replace(/\s+/g, ' '), 160))) : null,
    ],
    footer: 'RDAP registry data',
  }));
}

async function abuse(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which IP address', 'ip abuse <ip>');
  const t = await target(arg);
  const [score, r] = await Promise.all([nt.abuseScore(t.ip), nt.rdapIp(t.ip).catch(() => null)]);
  const groups = [];
  if (score) {
    groups.push(group('Reports (last 90 days)', [kv('Abuse confidence', `${score.abuseConfidenceScore}%`), kv('Reports', num(score.totalReports)), kv('Distinct reporters', num(score.numDistinctUsers)),
      kv('Last reported', score.lastReportedAt && when(score.lastReportedAt), { plain: true }), kv('Whitelisted', score.isWhitelisted ? 'yes' : null), kv('Usage', score.usageType), kv('ISP', score.isp)]));
  }
  groups.push(group('Abuse contact', [kv('Email', r?.abuseEmail), kv('Phone', r?.abusePhone), kv('Network', r?.name), kv('Owner', r?.owner)]));
  if (!score) groups.push(ui_sub('Report scores need an AbuseIPDB key. The owner can add `ABUSEIPDB_KEY`.'));
  return send(ctx, card({ title: 'IP Abuse', iconKey: 'lookup_ip', about: about(t), groups, footer: score ? 'AbuseIPDB · RDAP' : 'RDAP registry data' }));
}
const ui_sub = (t) => K.ui.sub(t);

async function asn(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which IP address or AS number', 'ip asn <ip|AS15169>');
  let number = arg.trim();
  let t = null;
  if (!/^(as)?\d{1,10}$/i.test(number)) {
    t = await target(number);
    const d = await nt.ipInfo(t.ip);
    if (!d.connection?.asn) throw new nt.LookupError('No ASN is announced for that address.');
    number = String(d.connection.asn);
  }
  const a = await nt.asnInfo(number);
  return send(ctx, card({
    title: 'ASN Lookup', iconKey: 'lookup_ip', about: `Results for ${code(`AS${a.asn}`)}${t ? ` (${t.host || t.ip})` : ''}`,
    groups: [
      group('Network', [kv('Name', a.name), kv('Description', a.description && clip(a.description, 120)), kv('Owner', a.owner), kv('Country', a.country), kv('Website', a.website)]),
      group('Registry', [kv('RIR', a.rir), kv('Allocated', a.allocated && when(a.allocated), { plain: true }), kv('Abuse email', a.abuse)]),
    ],
    footer: 'RDAP · BGPView',
  }));
}

async function ptr(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which IP address', 'ip ptr <ip>');
  const t = await target(arg);
  let names = [];
  try { names = await nt.dns.reverse(t.ip); } catch { /* none */ }
  return send(ctx, card({
    title: 'Reverse DNS', iconKey: 'lookup_dns', about: about(t),
    groups: [names.length ? group('PTR records', names.slice(0, 10).map(n => code(n))) : K.ui.sub('This address has no reverse DNS record.')],
    footer: 'System resolver',
  }));
}

async function ports(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which IP address', 'ip ports <ip>');
  const left = K.cooldown('ports', K.userOf(ctx).id, 60);
  if (left) return send(ctx, note('warning', `Wait ${left}s before scanning again.`));
  const t = await target(arg);
  const res = await nt.scanPorts(t.ip);
  const open = res.filter(r => r.ms !== null);
  const closed = res.filter(r => r.ms === null);
  return send(ctx, card({
    title: 'Port Scan', iconKey: 'lookup_ip', about: about(t),
    groups: [
      group(`Open (${open.length})`, open.length ? open.map(r => `${code(r.port)} ${r.service}  ·  ${Math.round(r.ms)} ms`) : ['No common ports answered.']),
      group(`Closed or filtered (${closed.length})`, [closed.map(r => r.port).join(', ') || 'none']),
    ],
    footer: `${res.length} common ports checked`,
  }));
}

async function subnet(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which network', 'ip subnet 192.168.1.0/24');
  const s = nt.subnet(arg);
  return send(ctx, card({
    title: 'Subnet', iconKey: 'lookup_ip', about: `Results for ${code(`${s.input}/${s.bits}`)}`,
    groups: [
      group('Range', [kv('Network', s.network), kv('Broadcast', s.broadcast), kv('First host', s.first), kv('Last host', s.last)]),
      group('Mask', [kv('Netmask', s.mask), kv('Wildcard', s.wildcard), kv('Prefix', `/${s.bits}`)]),
      group('Size', [kv('Total addresses', num(s.total)), kv('Usable hosts', num(s.usable)), kv('Scope', s.private ? 'private' : 'public')]),
    ],
    footer: 'IPv4 only',
  }));
}

async function ping(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which IP address', 'ip ping <ip>');
  const left = K.cooldown('ping', K.userOf(ctx).id, 20);
  if (left) return send(ctx, note('warning', `Wait ${left}s before pinging again.`));
  const t = await target(arg);
  const r = await nt.tcpPing(t.ip);
  const ms = (v) => (v === null ? 'n/a' : `${v.toFixed(1)} ms`);
  return send(ctx, card({
    title: 'Ping', iconKey: 'lookup_ip', about: about(t),
    groups: [group(`TCP port ${r.port}`, r.got ? [kv('Replies', `${r.got}/${r.sent}`), kv('Fastest', ms(r.min)), kv('Average', ms(r.avg)), kv('Slowest', ms(r.max))] : ['No answer. The host may be offline or filtering connections.'])],
    footer: 'TCP connection time, not ICMP',
  }));
}

module.exports = makeCommand({
  name: 'ip',
  description: 'Look up IP addresses: location, WHOIS, abuse, ASN, ports and more',
  category: 'utility',
  fallback: 'lookup',
  help: 'ip',
  usage: 'ip <lookup|whois|abuse|asn|ptr|ports|subnet|ping> <ip>',
  subs: [
    { name: 'lookup', desc: 'Detailed information on an IP address', arg: 'ip', argDesc: 'IP address or hostname', run: lookup },
    { name: 'whois', desc: 'WHOIS record for an IP address', arg: 'ip', argDesc: 'IP address', run: whois },
    { name: 'abuse', desc: 'Abuse reports and contact for an IP address', arg: 'ip', argDesc: 'IP address', run: abuse },
    { name: 'asn', desc: 'ASN information for an IP address or AS number', arg: 'query', argDesc: 'IP address or AS number', run: asn },
    { name: 'ptr', desc: 'Reverse DNS lookup', arg: 'ip', argDesc: 'IP address', run: ptr },
    { name: 'ports', desc: 'Scan common ports on an IP address', arg: 'ip', argDesc: 'IP address or hostname', run: ports },
    { name: 'subnet', desc: 'Calculate subnet information', arg: 'network', argDesc: 'For example 192.168.1.0/24', run: subnet },
    { name: 'ping', desc: 'Ping an IP address (TCP)', arg: 'ip', argDesc: 'IP address or hostname', run: ping },
  ],
});
