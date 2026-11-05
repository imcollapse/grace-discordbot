// grace · platform commands, prefix only: minecraft, steam, kick, roblox, chess, lichess, bluesky, pokemon, anime, manga,
// npm, pypi, docker, epic, ghuser. Free public APIs, no keys. modules/text/platforms/<name>.js calls build('<name>').

const K = require('./kit');
const { get, card, list, note, rows, clip, num, int, when, strip, file, PlatformError } = K;

const enc = encodeURIComponent;
const title = (s) => String(s ?? '').replace(/(^|[\s_-])(\w)/g, (m, a, b) => `${a === '_' || a === '-' ? ' ' : a}${b.toUpperCase()}`);

/* ── minecraft ─────────────────────────────────────────────────────── */

const host = (s) => String(s).trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').slice(0, 120);

async function mcServer(address, bedrock) {
    const a = host(address);
    if (!/^[a-z0-9.\-:_]+$/i.test(a)) throw new PlatformError('That is not a valid server address.');
    const d = await get(`https://api.mcsrvstat.us/${bedrock ? 'bedrock/' : ''}3/${enc(a)}`, { notFound: 'I couldn\'t find that server.' });
    const motd = (d.motd?.clean || []).map((l) => l.trim()).filter(Boolean).join(' · ');
    const players = d.players ? `${int(d.players.online)} / ${int(d.players.max)}` : null;
    const names = (d.players?.list || []).map((p) => p.name).slice(0, 12).join(', ');
    let files;
    if (d.icon?.startsWith('data:image')) files = [file(Buffer.from(d.icon.split(',')[1], 'base64'), 'icon.png')];
    const c = card({
        title: `${bedrock ? 'Bedrock' : 'Java'} · ${d.hostname || a}`,
        thumb: files ? 'attachment://icon.png' : undefined,
        lines: [
            d.online ? '**online**' : '**offline**',
            ...(d.online ? [motd ? `> ${clip(motd, 160)}` : null, ...rows(['version', d.version], ['players', players], ['software', d.software], ['gamemode', d.gamemode], ['map', d.map])] : []),
            names ? `-# ${clip(names, 200)}${(d.players?.list?.length ?? 0) > 12 ? ', ...' : ''}` : null,
            ...(d.ip ? [`-# ${d.ip}${d.port ? `:${d.port}` : ''}`] : []),
        ],
        footer: 'mcsrvstat.us',
    });
    return files ? [c, files] : c;
}
async function mcPlayer(name) {
    const n = String(name).trim();
    if (!/^[A-Za-z0-9_]{2,16}$/.test(n) && !/^[0-9a-f-]{32,36}$/i.test(n)) throw new PlatformError('That is not a valid Minecraft name. Java names are 3 to 16 letters, numbers or underscores.');
    const d = await get(`https://playerdb.co/api/player/minecraft/${enc(n)}`, { notFound: 'I couldn\'t find that player.', missing: [400, 404, 500] });
    const p = d?.data?.player;
    if (!p) throw new PlatformError('I couldn\'t find that player.');
    return p;
}
const mcUser = async (_m, name) => {
    const p = await mcPlayer(name);
    return card({
        title: p.username, url: `https://namemc.com/profile/${p.username}`, thumb: `https://mc-heads.net/avatar/${p.raw_id}/128`,
        lines: rows(['uuid', p.id]),
        image: `https://mc-heads.net/body/${p.raw_id}/220`,
        links: [{ label: 'NameMC', url: `https://namemc.com/profile/${p.username}` }, { label: 'Download skin', url: `https://mc-heads.net/download/${p.raw_id}` }],
        footer: 'java edition · playerdb',
    });
};
const mcSkin = async (_m, name) => {
    const p = await mcPlayer(name);
    return card({
        title: `${p.username}'s skin`, image: `https://mc-heads.net/body/${p.raw_id}/320`,
        links: [{ label: 'Download', url: `https://mc-heads.net/download/${p.raw_id}` }, { label: 'NameMC', url: `https://namemc.com/profile/${p.username}` }],
        footer: 'mc-heads.net',
    });
};
const mcUuid = async (_m, name) => {
    const p = await mcPlayer(name);
    return list(p.username, [`> uuid · \`${p.id}\``, `> short · \`${p.raw_id}\``], 'java edition');
};

/* ── steam ─────────────────────────────────────────────────────────── */

const money = (cents, cur = 'USD') => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(cents / 100); } catch { return `${(cents / 100).toFixed(2)} ${cur}`; } };

async function steamFind(q) {
    if (/^\d{1,8}$/.test(q)) return Number(q);
    const r = await get(`https://store.steampowered.com/api/storesearch/?term=${enc(q)}&l=english&cc=us`);
    const hit = r.items?.[0];
    if (!hit) throw new PlatformError(`I couldn't find a game called **${clip(q, 60)}**.`);
    return hit.id;
}
const steamGame = async (_m, q) => {
    const id = await steamFind(q);
    const r = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=english`);
    const d = r?.[id]?.data;
    if (!d) throw new PlatformError('That game has no store page.');
    const price = d.is_free ? 'Free' : d.price_overview ? `${d.price_overview.final_formatted}${d.price_overview.discount_percent ? ` (-${d.price_overview.discount_percent}%)` : ''}` : d.release_date?.coming_soon ? 'Not out yet' : null;
    const plat = Object.entries(d.platforms || {}).filter(([, v]) => v).map(([k]) => title(k)).join(', ');
    return card({
        title: d.name, url: `https://store.steampowered.com/app/${id}`, image: d.header_image,
        lines: [`> ${clip(strip(d.short_description), 260)}`, ...rows(['price', price], ['released', d.release_date?.date], ['developer', (d.developers || []).slice(0, 2).join(', ')], ['genres', (d.genres || []).slice(0, 4).map((g) => g.description).join(', ')], ['metacritic', d.metacritic?.score], ['reviews', d.recommendations ? int(d.recommendations.total) : null], ['platforms', plat])],
        links: [{ label: 'Open in Steam', url: `https://store.steampowered.com/app/${id}` }, ...(d.website ? [{ label: 'Website', url: d.website }] : [])],
        footer: `app ${id}`,
    });
};
const steamPlayers = async (_m, q) => {
    const id = await steamFind(q);
    const [r, s] = await Promise.all([
        get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`),
        get(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`).catch(() => null),
    ]);
    if (r?.response?.result !== 1) throw new PlatformError('Steam has no player count for that game.');
    return list(s?.[id]?.data?.name || `App ${id}`, [`> playing now · **${int(r.response.player_count)}**`], 'steam');
};
const xmlTag = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)); return m ? m[1].trim() : null; };
const steamUser = async (_m, q) => {
    let input = q.trim().replace(/^https?:\/\/steamcommunity\.com\//i, '').replace(/^(id|profiles)\//, (m) => m).replace(/\/+$/, '');
    let path;
    if (/^\d{17}$/.test(input)) path = `profiles/${input}`;
    else if (/^profiles\/\d{17}$/.test(input) || /^id\/[\w-]{2,32}$/.test(input)) path = input;
    else if (/^[\w-]{2,32}$/.test(input)) path = `id/${input}`;
    else throw new PlatformError('Give me a Steam profile link, a custom URL name or a 17 digit Steam ID.');
    const xml = await get(`https://steamcommunity.com/${path}/?xml=1`, { json: false });
    if (!xml.includes('<steamID64>')) throw new PlatformError('I couldn\'t find that Steam profile.');
    const id64 = xmlTag(xml, 'steamID64');
    const priv = xmlTag(xml, 'privacyState');
    const state = xmlTag(xml, 'onlineState');
    const game = xml.match(/<mostPlayedGame>[\s\S]*?<gameName>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/gameName>[\s\S]*?<hoursPlayed>(.*?)<\/hoursPlayed>/);
    return card({
        title: xmlTag(xml, 'steamID') || id64, url: `https://steamcommunity.com/profiles/${id64}`, thumb: xmlTag(xml, 'avatarFull'),
        lines: [
            xmlTag(xml, 'stateMessage') ? `> ${clip(strip(xmlTag(xml, 'stateMessage')), 120)}` : null,
            ...rows(['status', state], ['real name', xmlTag(xml, 'realname')], ['location', xmlTag(xml, 'location')], ['member since', xmlTag(xml, 'memberSince')], ['profile', priv !== 'public' ? priv : null], ['last 2 weeks', xmlTag(xml, 'hoursPlayed2Wk') ? `${xmlTag(xml, 'hoursPlayed2Wk')} h` : null], ['most played', game ? `${game[1]} (${game[2]} h)` : null], ['vac ban', xmlTag(xml, 'vacBanned') === '1' ? 'yes' : null], ['limited account', xmlTag(xml, 'isLimitedAccount') === '1' ? 'yes' : null]),
            xmlTag(xml, 'summary') ? `-# ${clip(strip(xmlTag(xml, 'summary')), 200)}` : null,
        ],
        links: [{ label: 'Open profile', url: `https://steamcommunity.com/profiles/${id64}` }],
        footer: `steam id ${id64}`,
    });
};
const steamTop = async () => {
    const r = await get('https://steamspy.com/api.php?request=top100in2weeks', { timeout: 15000 });
    const top = Object.values(r || {}).sort((a, b) => (b.ccu || 0) - (a.ccu || 0)).slice(0, 10);
    if (!top.length) throw new PlatformError('I couldn\'t load the chart right now.');
    return list('Most played on Steam', top.map((g, i) => `> \`${String(i + 1).padStart(2)}\` **[${clip(g.name, 40)}](https://store.steampowered.com/app/${g.appid})** · ${num(g.ccu)} playing`), 'steamspy · peak concurrent players');
};
const steamSales = async () => {
    const r = await get('https://store.steampowered.com/api/featuredcategories?cc=us&l=english');
    const items = (r?.specials?.items || []).slice(0, 10);
    if (!items.length) throw new PlatformError('No sales listed right now.');
    return list('Steam specials', items.map((g) => `> **[${clip(g.name, 40)}](https://store.steampowered.com/app/${g.id})** · -${g.discount_percent}% · ${money(g.final_price, g.currency)}`), 'store.steampowered.com');
};

/* ── kick ──────────────────────────────────────────────────────────── */

async function kickChannel(q) {
    const slug = q.trim().replace(/^https?:\/\/(www\.)?kick\.com\//i, '').split(/[/?#]/)[0].toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/.test(slug)) throw new PlatformError('That is not a valid Kick channel name.');
    return get(`https://kick.com/api/v2/channels/${slug}`, { notFound: 'I couldn\'t find that Kick channel.', forbidden: 'Kick is blocking automated lookups right now. Try again later.' });
}
const kickUser = async (_m, q) => {
    const d = await kickChannel(q);
    const live = d.livestream;
    return card({
        title: d.user?.username || d.slug, url: `https://kick.com/${d.slug}`, thumb: d.user?.profile_pic || d.profile_pic,
        lines: [d.user?.bio ? `> ${clip(d.user.bio, 240)}` : null, live ? '**live now**' : null, ...rows(['followers', int(d.followers_count ?? d.followersCount)], ['verified', d.verified ? 'yes' : null], ['subscriptions', d.subscription_enabled ? 'enabled' : null], ['playing', live?.categories?.[0]?.name], ['viewers', live ? int(live.viewer_count) : null])],
        image: live ? (live.thumbnail?.url || (typeof live.thumbnail === 'string' ? live.thumbnail : undefined)) : d.banner_image?.url,
        links: [{ label: live ? 'Watch live' : 'Open channel', url: `https://kick.com/${d.slug}` }],
        footer: 'kick',
    });
};
const kickLive = async (_m, q) => {
    const d = await kickChannel(q);
    const live = d.livestream;
    if (!live) return list(d.user?.username || d.slug, ['> **offline** right now'], 'kick');
    return card({
        title: live.session_title || `${d.slug} is live`, url: `https://kick.com/${d.slug}`, thumb: d.user?.profile_pic,
        lines: [`> ${d.user?.username || d.slug}`, ...rows(['playing', live.categories?.[0]?.name], ['viewers', int(live.viewer_count)], ['started', when(live.created_at ?? live.start_time, 'R')])],
        image: live.thumbnail?.url || (typeof live.thumbnail === 'string' ? live.thumbnail : undefined),
        links: [{ label: 'Watch live', url: `https://kick.com/${d.slug}` }], footer: 'kick',
    });
};

/* ── roblox ────────────────────────────────────────────────────────── */

async function robloxFind(name) {
    const n = name.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(n)) throw new PlatformError('That is not a valid Roblox username.');
    const r = await get('https://users.roblox.com/v1/usernames/users', { method: 'POST', body: { usernames: [n], excludeBannedUsers: false } });
    const u = r?.data?.[0];
    if (!u) throw new PlatformError('I couldn\'t find that Roblox user.');
    return u;
}
const robloxUser = async (_m, name) => {
    const u = await robloxFind(name);
    const [p, fr, fo, fg, av] = await Promise.all([
        get(`https://users.roblox.com/v1/users/${u.id}`),
        get(`https://friends.roblox.com/v1/users/${u.id}/friends/count`).catch(() => null),
        get(`https://friends.roblox.com/v1/users/${u.id}/followers/count`).catch(() => null),
        get(`https://friends.roblox.com/v1/users/${u.id}/followings/count`).catch(() => null),
        get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${u.id}&size=150x150&format=Png`).catch(() => null),
    ]);
    return card({
        title: `${p.displayName}${p.displayName !== p.name ? ` (@${p.name})` : ''}`, url: `https://www.roblox.com/users/${u.id}/profile`, thumb: av?.data?.[0]?.imageUrl,
        lines: [p.description ? `> ${clip(p.description, 240)}` : null, ...rows(['user id', u.id], ['created', when(p.created)], ['friends', fr ? int(fr.count) : null], ['followers', fo ? int(fo.count) : null], ['following', fg ? int(fg.count) : null], ['banned', p.isBanned ? 'yes' : null], ['verified', p.hasVerifiedBadge ? 'yes' : null])],
        links: [{ label: 'Open profile', url: `https://www.roblox.com/users/${u.id}/profile` }], footer: 'roblox',
    });
};
const robloxAvatar = async (_m, name) => {
    const u = await robloxFind(name);
    const av = await get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${u.id}&size=420x420&format=Png`);
    const img = av?.data?.[0]?.imageUrl;
    if (!img) throw new PlatformError('I couldn\'t load that avatar.');
    return card({ title: `${u.displayName}'s avatar`, url: `https://www.roblox.com/users/${u.id}/profile`, image: img, footer: 'roblox' });
};

/* ── chess.com and lichess ─────────────────────────────────────────── */

const chessPlayer = async (_m, name) => {
    const u = name.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,25}$/.test(u)) throw new PlatformError('That is not a valid chess.com username.');
    const [p, s] = await Promise.all([
        get(`https://api.chess.com/pub/player/${u}`, { notFound: 'I couldn\'t find that chess.com player.' }),
        get(`https://api.chess.com/pub/player/${u}/stats`).catch(() => ({})),
    ]);
    const mode = (k, label) => { const x = s?.[k]; return x?.last ? `${label} **${x.last.rating}**${x.best ? ` (best ${x.best.rating})` : ''}` : null; };
    const rec = (k) => s?.[k]?.record ? `${s[k].record.win}W ${s[k].record.loss}L ${s[k].record.draw}D` : null;
    return card({
        title: `${p.title ? `${p.title} ` : ''}${p.username}`, url: p.url, thumb: p.avatar,
        lines: [
            p.name ? `> ${p.name}` : null,
            ...rows(['followers', int(p.followers)], ['country', p.country ? p.country.split('/').pop() : null], ['joined', when(p.joined * 1000)], ['last online', when(p.last_online * 1000, 'R')], ['status', p.status !== 'basic' ? p.status : null]),
            [mode('chess_rapid', 'rapid'), mode('chess_blitz', 'blitz'), mode('chess_bullet', 'bullet'), mode('chess_daily', 'daily')].filter(Boolean).join(' · '),
            s?.tactics?.highest ? `-# puzzles best ${s.tactics.highest.rating}${s.puzzle_rush?.best ? ` · rush ${s.puzzle_rush.best.score}` : ''}${rec('chess_rapid') ? ` · rapid ${rec('chess_rapid')}` : ''}` : null,
        ],
        links: [{ label: 'Open profile', url: p.url }], footer: 'chess.com',
    });
};
const chessPuzzle = async () => {
    const p = await get('https://api.chess.com/pub/puzzle');
    return card({ title: p.title, url: p.url, lines: [`> daily puzzle · ${when(p.publish_time * 1000)}`], image: p.image, links: [{ label: 'Solve it', url: p.url }], footer: 'chess.com' });
};
const lichessUser = async (_m, name) => {
    const u = name.trim();
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(u)) throw new PlatformError('That is not a valid Lichess username.');
    const d = await get(`https://lichess.org/api/user/${enc(u)}`, { notFound: 'I couldn\'t find that Lichess user.' });
    const perf = (k) => (d.perfs?.[k]?.games ? `${k} **${d.perfs[k].rating}**` : null);
    return card({
        title: `${d.title ? `${d.title} ` : ''}${d.username}`, url: d.url || `https://lichess.org/@/${d.username}`,
        lines: [
            d.profile?.bio ? `> ${clip(d.profile.bio, 200)}` : null, d.disabled || d.tosViolation ? '**account closed**' : null,
            ...rows(['games', d.count ? int(d.count.all) : null], ['record', d.count ? `${d.count.win}W ${d.count.loss}L ${d.count.draw}D` : null], ['joined', when(d.createdAt)], ['last seen', d.seenAt ? when(d.seenAt, 'R') : null], ['time played', d.playTime ? `${Math.round(d.playTime.total / 3600)} h` : null], ['online', d.online ? 'yes' : null], ['patron', d.patron ? 'yes' : null]),
            ['bullet', 'blitz', 'rapid', 'classical', 'puzzle'].map(perf).filter(Boolean).join(' · '),
        ],
        links: [{ label: 'Open profile', url: d.url || `https://lichess.org/@/${d.username}` }], footer: 'lichess',
    });
};

/* ── bluesky ───────────────────────────────────────────────────────── */

const bskyHandle = (q) => { let h = q.trim().replace(/^@/, '').replace(/^https?:\/\/bsky\.app\/profile\//i, '').split(/[/?#]/)[0].toLowerCase(); if (!h.includes('.') && !h.startsWith('did:')) h += '.bsky.social'; return h; };
const bskyUser = async (_m, q) => {
    const d = await get(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${enc(bskyHandle(q))}`, { notFound: 'I couldn\'t find that Bluesky account.', missing: [400, 404] });
    return card({
        title: d.displayName || d.handle, url: `https://bsky.app/profile/${d.handle}`, thumb: d.avatar,
        lines: [`@${d.handle}`, d.description ? `> ${clip(d.description, 280)}` : null, ...rows(['followers', int(d.followersCount)], ['following', int(d.followsCount)], ['posts', int(d.postsCount)], ['joined', d.createdAt ? when(d.createdAt) : null])],
        image: d.banner, links: [{ label: 'Open profile', url: `https://bsky.app/profile/${d.handle}` }], footer: 'bluesky',
    });
};
const bskyPosts = async (_m, q) => {
    const h = bskyHandle(q);
    const r = await get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${enc(h)}&limit=6&filter=posts_no_replies`, { notFound: 'I couldn\'t find that Bluesky account.', missing: [400, 404] });
    const items = (r.feed || []).filter((f) => f.post?.record?.text).slice(0, 5);
    if (!items.length) throw new PlatformError('No recent posts.');
    return list(`@${h}`, items.map((f) => `> ${clip(f.post.record.text, 180)}\n> -# ${int(f.post.likeCount)} likes · ${int(f.post.repostCount)} reposts · ${when(f.post.record.createdAt, 'R')}`), 'bluesky');
};

/* ── pokemon, anime, manga ─────────────────────────────────────────── */

const pokemon = async (_m, q) => {
    const n = q.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9.\-']{1,40}$/.test(n)) throw new PlatformError('That is not a Pokémon name or number.');
    const p = await get(`https://pokeapi.co/api/v2/pokemon/${enc(n)}`, { notFound: 'I couldn\'t find that Pokémon.' });
    const sp = await get(p.species.url).catch(() => null);
    const flavor = sp?.flavor_text_entries?.find((f) => f.language.name === 'en')?.flavor_text?.replace(/[\n\f]/g, ' ');
    const genus = sp?.genera?.find((g) => g.language.name === 'en')?.genus;
    const stat = (k) => p.stats.find((s) => s.stat.name === k)?.base_stat;
    return card({
        title: `${title(p.name)} #${p.id}`, thumb: p.sprites?.front_default, image: p.sprites?.other?.['official-artwork']?.front_default,
        lines: [flavor ? `> ${clip(flavor, 240)}` : null, genus ? `-# ${genus}` : null, ...rows(['type', p.types.map((t) => title(t.type.name)).join(', ')], ['abilities', p.abilities.map((a) => title(a.ability.name)).join(', ')], ['height', `${p.height / 10} m`], ['weight', `${p.weight / 10} kg`]),
            `> hp **${stat('hp')}** · attack **${stat('attack')}** · defense **${stat('defense')}**\n> sp. atk **${stat('special-attack')}** · sp. def **${stat('special-defense')}** · speed **${stat('speed')}**`],
        links: [{ label: 'Bulbapedia', url: `https://bulbapedia.bulbagarden.net/wiki/${enc(title(p.name))}_(Pokémon)` }], footer: 'pokeapi',
    });
};

function malCard(d, kind) {
    const nums = kind === 'anime'
        ? rows(['type', d.type], ['episodes', d.episodes], ['status', d.status], ['aired', d.aired?.string], ['studio', (d.studios || []).map((s) => s.name).slice(0, 2).join(', ')], ['rating', d.rating])
        : rows(['type', d.type], ['chapters', d.chapters], ['volumes', d.volumes], ['status', d.status], ['published', d.published?.string], ['author', (d.authors || []).map((a) => a.name).slice(0, 2).join(', ')]);
    return card({
        title: d.title_english && d.title_english !== d.title ? `${d.title} · ${d.title_english}` : d.title, url: d.url, thumb: d.images?.jpg?.large_image_url,
        lines: [d.synopsis ? `> ${clip(d.synopsis.replace(/\[Written by MAL Rewrite\]/i, ''), 360)}` : null,
            ...rows(['score', d.score ? `${d.score} (${num(d.scored_by)} votes)` : null], ['rank', d.rank ? `#${int(d.rank)}` : null], ['popularity', d.popularity ? `#${int(d.popularity)}` : null]),
            ...nums, (d.genres || []).length ? `-# ${(d.genres || []).map((g) => g.name).join(' · ')}` : null],
        links: [{ label: 'MyAnimeList', url: d.url }], footer: 'myanimelist via jikan',
    });
}
const malSearch = (kind) => async (_m, q) => {
    const r = await get(`https://api.jikan.moe/v4/${kind}?q=${enc(q)}&limit=1&sfw=true`);
    if (!r?.data?.[0]) throw new PlatformError(`I couldn't find that ${kind}.`);
    return malCard(r.data[0], kind);
};
const malTop = (kind) => async () => {
    const r = await get(`https://api.jikan.moe/v4/top/${kind}?limit=10&sfw=true`);
    return list(`Top ${kind} on MyAnimeList`, (r.data || []).map((d, i) => `> \`${String(i + 1).padStart(2)}\` **[${clip(d.title, 44)}](${d.url})** · ${d.score ?? '-'}`), 'myanimelist via jikan');
};
const malRandom = (kind) => async () => malCard((await get(`https://api.jikan.moe/v4/random/${kind}?sfw=true`)).data, kind);

/* ── developer platforms ───────────────────────────────────────────── */

const npm = async (_m, q) => {
    const n = q.trim();
    if (!/^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i.test(n)) throw new PlatformError('That is not a valid package name.');
    const [d, dl] = await Promise.all([
        get(`https://registry.npmjs.org/${enc(n).replace('%40', '@')}/latest`, { notFound: 'I couldn\'t find that package.' }),
        get(`https://api.npmjs.org/downloads/point/last-week/${enc(n).replace('%40', '@')}`).catch(() => null),
    ]);
    const repo = (d.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://');
    return card({
        title: d.name, url: `https://www.npmjs.com/package/${d.name}`,
        lines: [d.description ? `> ${clip(d.description, 240)}` : null, ...rows(['version', d.version], ['weekly downloads', dl ? int(dl.downloads) : null], ['license', typeof d.license === 'string' ? d.license : d.license?.type], ['dependencies', Object.keys(d.dependencies || {}).length], ['author', d.author?.name]), (d.keywords || []).length ? `-# ${d.keywords.slice(0, 8).join(' · ')}` : null],
        links: [{ label: 'npm', url: `https://www.npmjs.com/package/${d.name}` }, ...(repo.startsWith('http') ? [{ label: 'Repository', url: repo }] : []), ...(d.homepage?.startsWith('http') ? [{ label: 'Homepage', url: d.homepage }] : [])],
        footer: 'npm',
    });
};
const pypi = async (_m, q) => {
    const n = q.trim();
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(n)) throw new PlatformError('That is not a valid package name.');
    const d = (await get(`https://pypi.org/pypi/${enc(n)}/json`, { notFound: 'I couldn\'t find that package.' })).info;
    return card({
        title: d.name, url: d.package_url,
        lines: [d.summary ? `> ${clip(d.summary, 240)}` : null, ...rows(['version', d.version], ['python', d.requires_python], ['license', clip(d.license || '', 40) || null], ['author', d.author || d.author_email])],
        links: [{ label: 'PyPI', url: d.package_url }, ...(d.home_page?.startsWith('http') ? [{ label: 'Homepage', url: d.home_page }] : [])], footer: 'pypi',
    });
};
const docker = async (_m, q) => {
    const n = q.trim().toLowerCase();
    if (!/^[a-z0-9._/-]{1,100}$/.test(n)) throw new PlatformError('That is not a valid image name.');
    const path = n.includes('/') ? n : `library/${n}`;
    const d = await get(`https://hub.docker.com/v2/repositories/${path}`, { notFound: 'I couldn\'t find that image.' });
    const url = `https://hub.docker.com/${path.startsWith('library/') ? '_/' + path.slice(8) : 'r/' + path}`;
    return card({
        title: `${d.namespace}/${d.name}`, url,
        lines: [d.description ? `> ${clip(d.description, 240)}` : null, ...rows(['pulls', num(d.pull_count)], ['stars', int(d.star_count)], ['updated', when(d.last_updated, 'R')])],
        links: [{ label: 'Docker Hub', url }], footer: `docker pull ${n}`,
    });
};
const ghuser = async (_m, q) => {
    const n = q.trim().replace(/^https?:\/\/github\.com\//i, '').split(/[/?#]/)[0];
    if (!/^[A-Za-z0-9-]{1,39}$/.test(n)) throw new PlatformError('That is not a valid GitHub username.');
    const [u, repos] = await Promise.all([
        get(`https://api.github.com/users/${n}`, { notFound: 'I couldn\'t find that GitHub user.' }),
        get(`https://api.github.com/users/${n}/repos?sort=pushed&per_page=5`).catch(() => []),
    ]);
    return card({
        title: u.name ? `${u.name} (${u.login})` : u.login, url: u.html_url, thumb: u.avatar_url,
        lines: [u.bio ? `> ${clip(u.bio, 220)}` : null, ...rows(['repos', int(u.public_repos)], ['followers', int(u.followers)], ['following', int(u.following)], ['company', u.company], ['location', u.location], ['joined', when(u.created_at)]),
            (repos || []).length ? `-# ${repos.map((r) => `[${r.name}](${r.html_url})`).join(' · ')}` : null],
        links: [{ label: 'Open profile', url: u.html_url }, ...(u.blog ? [{ label: 'Website', url: /^https?:/.test(u.blog) ? u.blog : `https://${u.blog}` }] : [])], footer: 'github',
    });
};

/* ── epic games ────────────────────────────────────────────────────── */

const epicFree = async () => {
    const r = await get('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US');
    const els = r?.data?.Catalog?.searchStore?.elements || [];
    const slug = (e) => e.productSlug?.replace(/\/home$/, '') || e.offerMappings?.[0]?.pageSlug || e.catalogNs?.mappings?.[0]?.pageSlug || e.urlSlug;
    const line = (e, o) => `> **[${clip(e.title, 50)}](https://store.epicgames.com/en-US/p/${slug(e)})**${o ? ` · until ${when(o.endDate)}` : ''}`;
    const now = [], next = [];
    for (const e of els) {
        const cur = e.promotions?.promotionalOffers?.[0]?.promotionalOffers?.find((o) => o.discountSetting?.discountPercentage === 0);
        const up = e.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.find((o) => o.discountSetting?.discountPercentage === 0);
        if (cur) now.push([e, cur]); else if (up) next.push([e, up]);
    }
    if (!now.length && !next.length) throw new PlatformError('No free games listed right now.');
    const art = now[0]?.[0]?.keyImages?.find((i) => i.type === 'OfferImageWide' || i.type === 'Thumbnail')?.url;
    const c = card({
        title: 'Free on Epic Games',
        lines: [now.length ? '**free now**' : null, ...now.map(([e, o]) => line(e, o)), next.length ? '\n**coming next**' : null, ...next.map(([e, o]) => `> **${clip(e.title, 50)}** · from ${when(o.startDate)}`)],
        image: art, footer: 'store.epicgames.com',
    });
    return c;
};

/* ── commands ──────────────────────────────────────────────────────── */

const DEFS = {
    minecraft: { aliases: ['minecraftmc'], description: 'Minecraft servers, players and skins', fallback: 'server', subs: [
        { name: 'server', aliases: ['status', 'java'], desc: 'Status, players and version of a Java server', arg: 'address', example: 'hypixel.net', run: (m, a) => mcServer(a, false) },
        { name: 'bedrock', desc: 'Status of a Bedrock server', arg: 'address', example: 'play.example.net', run: (m, a) => mcServer(a, true) },
        { name: 'user', aliases: ['player', 'profile'], desc: 'A Java player: uuid, skin and NameMC', arg: 'name', example: 'Notch', run: mcUser },
        { name: 'skin', desc: 'Full body skin with a download link', arg: 'name', example: 'Notch', run: mcSkin },
        { name: 'uuid', desc: 'The uuid of a Java player', arg: 'name', example: 'Notch', run: mcUuid },
    ] },
    steam: { aliases: [], description: 'Steam games, players and profiles', fallback: 'game', subs: [
        { name: 'game', aliases: ['app', 'info'], desc: 'Store page of a game: price, reviews, genres', arg: 'game', example: 'portal 2', run: steamGame },
        { name: 'user', aliases: ['profile'], desc: 'A public Steam profile', arg: 'profile', example: 'gabelogannewell', run: steamUser },
        { name: 'players', aliases: ['online'], desc: 'How many are playing a game right now', arg: 'game', example: 'counter-strike 2', run: steamPlayers },
        { name: 'top', desc: 'The most played games right now', run: steamTop },
        { name: 'sales', aliases: ['deals'], desc: 'Current store specials', run: steamSales },
    ] },
    kicktv: { aliases: ['kickstream', 'kicklive'], description: 'Kick channels and live status', fallback: 'user', subs: [
        { name: 'user', aliases: ['channel', 'profile'], desc: 'A Kick channel: followers, bio, live state', arg: 'channel', example: 'xqc', run: kickUser },
        { name: 'live', desc: 'Is the channel live? Title, viewers, category', arg: 'channel', example: 'xqc', run: kickLive },
    ] },
    roblox: { aliases: ['rbx'], description: 'Roblox profiles and avatars', fallback: 'user', subs: [
        { name: 'user', aliases: ['profile'], desc: 'A Roblox profile: friends, followers, join date', arg: 'username', example: 'Roblox', run: robloxUser },
        { name: 'avatar', desc: 'The full avatar of a Roblox user', arg: 'username', example: 'Roblox', run: robloxAvatar },
    ] },
    chess: { aliases: ['chesscom'], description: 'chess.com players and the daily puzzle', fallback: 'player', subs: [
        { name: 'player', aliases: ['user', 'profile', 'stats'], desc: 'Ratings, record and profile', arg: 'username', example: 'hikaru', run: chessPlayer },
        { name: 'puzzle', aliases: ['daily'], desc: 'Today\'s daily puzzle', run: chessPuzzle },
    ] },
    lichess: { aliases: ['lichessuser'], description: 'Lichess player profiles', fallback: 'user', subs: [
        { name: 'user', aliases: ['player', 'profile'], desc: 'Ratings, games and profile', arg: 'username', example: 'DrNykterstein', run: lichessUser },
    ] },
    bluesky: { aliases: ['bsky'], description: 'Bluesky profiles and recent posts', fallback: 'user', subs: [
        { name: 'user', aliases: ['profile'], desc: 'A Bluesky profile', arg: 'handle', example: 'bsky.app', run: bskyUser },
        { name: 'posts', aliases: ['feed'], desc: 'Their latest posts', arg: 'handle', example: 'bsky.app', run: bskyPosts },
    ] },
    pokemon: { aliases: ['pokedex', 'dex'], description: 'Pokédex entry: types, stats and artwork', fallback: 'info', subs: [
        { name: 'info', aliases: ['dex'], desc: 'Look up a Pokémon by name or number', arg: 'pokemon', example: 'pikachu', run: pokemon },
    ] },
    anime: { aliases: [], description: 'Search anime on MyAnimeList', fallback: 'search', subs: [
        { name: 'search', aliases: ['info'], desc: 'Look up an anime', arg: 'title', example: 'frieren', run: malSearch('anime') },
        { name: 'top', desc: 'Top ranked anime', run: malTop('anime') },
        { name: 'random', desc: 'A random anime', run: malRandom('anime') },
    ] },
    manga: { aliases: [], description: 'Search manga on MyAnimeList', fallback: 'search', subs: [
        { name: 'search', aliases: ['info'], desc: 'Look up a manga', arg: 'title', example: 'berserk', run: malSearch('manga') },
        { name: 'top', desc: 'Top ranked manga', run: malTop('manga') },
        { name: 'random', desc: 'A random manga', run: malRandom('manga') },
    ] },
    npm: { aliases: [], description: 'Look up an npm package', fallback: 'package', subs: [
        { name: 'package', aliases: ['info'], desc: 'Version, downloads, license and links', arg: 'package', example: 'discord.js', run: npm },
    ] },
    pypi: { aliases: ['pip'], description: 'Look up a Python package', fallback: 'package', subs: [
        { name: 'package', aliases: ['info'], desc: 'Version, python needs, license and links', arg: 'package', example: 'requests', run: pypi },
    ] },
    docker: { aliases: ['dockerhub'], description: 'Look up a Docker Hub image', fallback: 'image', subs: [
        { name: 'image', aliases: ['info'], desc: 'Pulls, stars and last update', arg: 'image', example: 'nginx', run: docker },
    ] },
    ghuser: { aliases: ['githubuser'], description: 'GitHub profile with recent repos', fallback: 'user', subs: [
        { name: 'user', aliases: ['profile'], desc: 'Repos, followers and latest pushes', arg: 'username', example: 'torvalds', run: ghuser },
    ] },
    epic: { aliases: ['epicgames'], description: 'Free games on the Epic Games Store', fallback: 'free', subs: [
        { name: 'free', aliases: ['games', 'freegames'], desc: 'Free now and coming next', run: epicFree },
    ] },
};

const build = (name) => K.makePlatform({ name, ...DEFS[name] });
module.exports = { build, DEFS };
