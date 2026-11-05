// grace · ,domain  ·  /domain
//   lookup <domain>        registration details (RDAP)       dns <domain> [type]   DNS records
//   ssl <domain>           certificate details               ip <domain>           addresses it points to
//   availability <domain>  is it free to register           sub <domain>          subdomains from certificate logs

const nt = require('../../../services/netTools');
const K = require('../../../services/lookupKit');
const { makeCommand, need } = require('../../../services/socialKit');
const { pager } = require('../../../services/pager');

const { kv, group, code, when, num, card, note, send, clip } = K;
const sub = (t) => K.ui.sub(t);

async function lookup(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which domain', 'domain lookup <domain>');
  const d = nt.cleanDomain(arg);
  const r = await nt.rdapDomain(d);
  if (!r) return send(ctx, card({ title: 'Domain Lookup', iconKey: 'lookup_domain', about: `Results for ${code(d)}`, groups: ['No registration was found. It may be available. Use `domain availability` to check.'], footer: 'RDAP registry data' }));
  const tld = d.split('.').pop();
  return send(ctx, card({
    title: 'Domain Lookup', iconKey: 'lookup_domain', about: `Results for ${code(r.name)}`,
    groups: [
      group('Registration', [kv('Registrar', r.registrar), kv('IANA ID', r.iana), kv('TLD', tld), kv('Created', r.created && when(r.created), { plain: true }),
        kv('Updated', r.updated && when(r.updated), { plain: true }), kv('Expires', r.expires && when(r.expires), { plain: true }), kv('DNSSEC', r.dnssec === null ? null : r.dnssec ? 'signed' : 'unsigned')]),
      r.nameservers.length ? group('Nameservers', r.nameservers.slice(0, 8).map(n => code(n))) : null,
      r.status.length ? group('Status', r.status.slice(0, 6).map(s => code(s))) : null,
    ],
    footer: 'RDAP registry data',
  }));
}

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];

async function dns(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which domain', 'domain dns <domain> [type]');
  const parts = arg.split(/\s+/);
  const asked = parts.length > 1 && TYPES.includes(parts[parts.length - 1].toUpperCase()) ? parts.pop().toUpperCase() : null;
  const d = nt.cleanDomain(parts.join(' '));
  const want = asked ? [asked] : TYPES;
  const results = await Promise.all(want.map(t => nt.dnsQuery(d, t).then(r => [t, r.answers.filter(a => a.type === t)]).catch(() => [t, []])));
  const groups = results.filter(([, a]) => a.length).map(([t, a]) => group(`${t} (${a.length})`, a.slice(0, 6).map(x => `${code(clip(x.data, 160))}  ·  TTL ${x.ttl}`)));
  return send(ctx, card({
    title: 'DNS Records', iconKey: 'lookup_dns', about: `Results for ${code(d)}${asked ? `  ·  ${asked}` : ''}`,
    groups: groups.length ? groups : ['No records found.'], footer: 'Cloudflare DNS',
  }));
}

const when2 = (s) => (s ? when(new Date(s)) : null);

async function ssl(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which domain', 'domain ssl <domain>');
  const left = K.cooldown('ssl', K.userOf(ctx).id, 10);
  if (left) return send(ctx, note('warning', `Wait ${left}s before checking again.`));
  const d = nt.cleanDomain(arg);
  await nt.publicAddress(d);
  const { cert, protocol, cipher, authorized, error } = await nt.certificate(d);
  if (!cert?.subject) throw new nt.LookupError('That server did not present a certificate.');
  const alts = String(cert.subjectaltname ?? '').split(', ').map(s => s.replace(/^DNS:/, '')).filter(Boolean);
  const exp = new Date(cert.valid_to), days = Math.floor((exp - Date.now()) / 864e5);
  return send(ctx, card({
    title: 'SSL Certificate', iconKey: 'lookup_ssl', about: `Results for ${code(d)}`,
    groups: [
      group('Certificate', [kv('Subject', cert.subject.CN || cert.subject.O), kv('Issuer', [cert.issuer?.O, cert.issuer?.CN].filter(Boolean).join(' · ')),
        kv('Valid from', when2(cert.valid_from), { plain: true }), kv('Valid until', when2(cert.valid_to), { plain: true }),
        kv('Days left', days >= 0 ? String(days) : `expired ${-days} days ago`), kv('Trusted', authorized ? 'yes' : `no${error ? ` (${error})` : ''}`)]),
      group('Connection', [kv('Protocol', protocol), kv('Cipher', cipher), kv('Key', cert.bits ? `${cert.asn1Curve || 'RSA'} ${cert.bits} bit` : null)]),
      group('Fingerprint', [kv('SHA-256', cert.fingerprint256 && clip(cert.fingerprint256, 95)), kv('Serial', cert.serialNumber && clip(cert.serialNumber, 60))]),
      alts.length ? group(`Names (${alts.length})`, [alts.slice(0, 8).map(a => code(a)).join('  ') + (alts.length > 8 ? `  +${alts.length - 8} more` : '')]) : null,
    ],
    footer: 'Live TLS handshake',
  }));
}

async function ip(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which domain', 'domain ip <domain>');
  const d = nt.cleanDomain(arg);
  const [a, aaaa] = await Promise.all([nt.dnsQuery(d, 'A'), nt.dnsQuery(d, 'AAAA')]);
  const addrs = [...a.answers.filter(x => x.type === 'A'), ...aaaa.answers.filter(x => x.type === 'AAAA')].map(x => x.data);
  if (!addrs.length) throw new nt.LookupError(`\`${d}\` does not point to any address.`);
  const info = await Promise.all(addrs.slice(0, 4).map(x => nt.ipInfo(x).catch(() => null)));
  const lines = addrs.slice(0, 8).map((x, i) => {
    const o = info[i];
    return `${code(x)}${o ? `  ·  ${[o.connection?.org || o.connection?.isp, o.country_code].filter(Boolean).join(' · ')}` : ''}`;
  });
  return send(ctx, card({
    title: 'Domain IP', iconKey: 'lookup_domain', about: `Results for ${code(d)}`,
    groups: [group(`Addresses (${addrs.length})`, lines)], footer: 'Cloudflare DNS · ipwho.is',
  }));
}

async function availability(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which domain', 'domain availability <domain>');
  const d = nt.cleanDomain(arg);
  const [r, ns] = await Promise.all([nt.rdapDomain(d).catch(() => undefined), nt.dnsQuery(d, 'NS').catch(() => ({ answers: [] }))]);
  const hasDns = ns.answers.some(x => x.type === 'NS');
  let verdict, detail;
  if (r) { verdict = 'Taken'; detail = [kv('Registrar', r.registrar), kv('Expires', r.expires && when(r.expires), { plain: true })]; }
  else if (hasDns) { verdict = 'Taken'; detail = ['It has nameservers, so it is registered even though the registry gave no record.']; }
  else if (r === null) { verdict = 'Probably available'; detail = ['No registration and no DNS records were found. Confirm with a registrar before buying.']; }
  else { verdict = 'Unknown'; detail = ['The registry for this extension did not answer.']; }
  return send(ctx, card({ title: 'Domain Availability', iconKey: 'lookup_domain', about: `Results for ${code(d)}`, groups: [group(verdict, detail)], footer: 'RDAP · Cloudflare DNS' }));
}

async function subdomains(ctx, arg) {
  if (!arg) return need(ctx, arg, 'Which domain', 'domain sub <domain>');
  const left = K.cooldown('sub', K.userOf(ctx).id, 15);
  if (left) return send(ctx, note('warning', `Wait ${left}s before searching again.`));
  const d = nt.cleanDomain(arg);
  const list = await nt.subdomains(d);
  if (!list.length) return send(ctx, card({ title: 'Subdomains', iconKey: 'lookup_domain', about: `Results for ${code(d)}`, groups: ['No subdomains were found in public certificate logs.'], footer: 'crt.sh' }));
  const PER = 15, pages = Math.ceil(list.length / PER);
  return pager(ctx, {
    total: pages, user: K.userOf(ctx), send: (c) => send(ctx, c),
    render: (at) => card({
      title: 'Subdomains', iconKey: 'lookup_domain', about: `Results for ${code(d)}  ·  ${num(list.length)} found`,
      groups: [list.slice(at * PER, at * PER + PER).map(s => code(s)).join('\n')], footer: `Page ${at + 1}/${pages}  ·  certificate logs (crt.sh)`,
    }),
  });
}

module.exports = makeCommand({
  name: 'domain',
  description: 'Look up domains: registration, DNS, SSL, addresses and subdomains',
  category: 'utility',
  fallback: 'lookup',
  help: 'domain',
  usage: 'domain <lookup|dns|ssl|ip|availability|sub> <domain>',
  subs: [
    { name: 'lookup', desc: 'Look up domain information', arg: 'domain', argDesc: 'The domain, e.g. example.com', run: lookup },
    { name: 'dns', desc: 'View DNS records for a domain', arg: 'domain', argDesc: 'Domain, optionally followed by a type like MX', run: dns },
    { name: 'ssl', desc: 'Check SSL certificate details', arg: 'domain', argDesc: 'The domain', run: ssl },
    { name: 'ip', desc: 'Resolve a domain to its IP address', arg: 'domain', argDesc: 'The domain', run: ip },
    { name: 'availability', aliases: ['avail', 'available'], desc: 'Check if a domain is available', arg: 'domain', argDesc: 'The domain', run: availability },
    { name: 'sub', aliases: ['subdomains'], desc: 'Enumerate subdomains', arg: 'domain', argDesc: 'The domain', run: subdomains },
  ],
});
