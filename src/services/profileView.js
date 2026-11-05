// grace · builds a member's profile: the card image and the small container around it.

const { AttachmentBuilder, MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const ui = require('./ui');
const cards = require('../database/profileCards');
const { Profile } = require('../database/schemas');
const { renderProfile, THEMES } = require('./profileCard2');

const validUrl = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

/** Saved choices on top of the older `profile description` value. */
const compose = (saved, fb) => ({ ...saved, bio: saved.bio ?? fb.bio ?? '' });

/** Everything the renderer needs for one member. */
async function gather(client, guild, user, status = 'offline') {
    const [card, banner, socials, description, oldBg] = await Promise.all([
        cards.get(user.id).catch(() => ({})),
        cards.getBanner(user.id).catch(() => null),
        Profile.getSocials(user.id).catch(() => []),
        Profile.getDescription(user.id).catch(() => null),
        Profile.getBackground(user.id).catch(() => null),
    ]);

    let badges = [], clan = null;
    try {
        const { getBadges } = require('./profileCard');
        const res = await getBadges(user, { botToken: client?.token });
        badges = (res.badges ?? []).map((b) => b.canvas).filter(Boolean);
        clan = res.clanData?.tag ?? null;
    } catch { /* badges are optional */ }

    const fallback = { bio: description ?? '' };
    return {
        user: {
            name: user.globalName || user.displayName || user.username, handle: user.username, bot: !!user.bot,
            avatar: user.displayAvatarURL({ extension: 'png', size: 512 }),
        },
        status, socials, badges, clan,
        saved: card, fallback,
        banner: banner ?? oldBg ?? null,
        card: compose(card, fallback),
    };
}

/** The card, then link buttons for the socials. */
function container(data, imageName) {
    const c = ui.box('base').addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${imageName}`)),
    );
    const links = data.socials.filter((s) => validUrl(s.link)).slice(0, 3).map((s) => ui.link(s.platform, s.link));
    if (links.length) c.addActionRowComponents(ui.row(links));
    return c;
}

/** The reply for `profile` / `profile view`: just the card picture (plus link buttons if they added socials). No container. */
async function view(client, guild, user, status) {
    const data = await gather(client, guild, user, status);
    const name = `profile-${user.id}.png`;
    const buf = await renderProfile(data);
    const links = data.socials.filter((s) => validUrl(s.link)).slice(0, 3).map((s) => ui.link(s.platform, s.link));
    return { files: [new AttachmentBuilder(buf, { name })], ...(links.length ? { components: [ui.row(links)] } : {}) };
}

/** Just the image (for `profile card`). */
async function image(client, guild, user, status) {
    const buf = await renderProfile(await gather(client, guild, user, status));
    return { files: [new AttachmentBuilder(buf, { name: `profile-${user.id}.png` })] };
}

module.exports = { compose, gather, container, view, image, THEMES };
