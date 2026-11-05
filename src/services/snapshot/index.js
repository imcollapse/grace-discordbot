// Snapshot — storage, slots and who may use it.

const zlib = require('zlib');
const crypto = require('crypto');
const { PermissionFlagsBits } = require('discord.js');
const { Snapshot, SnapshotSettings } = require('../../database/schemas');
const { capture, countsOf } = require('./capture');

const LIMITS = { free: 2, premium: 5 };
const MAX_PACKED = 24 * 1024 * 1024;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const pack = (data) => zlib.gzipSync(Buffer.from(JSON.stringify(data))).toString('base64');
const unpack = (text) => JSON.parse(zlib.gunzipSync(Buffer.from(text, 'base64')).toString());

const limitFor = async (userId) => ((await require('../premium').isUserPremium(userId)) ? LIMITS.premium : LIMITS.free);
const normalizeId = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function newId() {
    for (;;) {
        const id = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
        if (!(await Snapshot.findByPk(id))) return id;
    }
}

/** @returns { ok, snap?, reason?, used?, limit? }  reason: full | too_big */
async function create(guild, user, name) {
    const [used, limit] = await Promise.all([Snapshot.count({ where: { ownerId: user.id } }), limitFor(user.id)]);
    if (used >= limit) return { ok: false, reason: 'full', used, limit };

    const data = await capture(guild);
    let packed = pack(data);
    if (packed.length > MAX_PACKED) { data.emojis = []; packed = pack(data); }
    if (packed.length > MAX_PACKED) return { ok: false, reason: 'too_big' };

    const snap = await Snapshot.create({
        id: await newId(), ownerId: user.id, sourceGuildId: guild.id, sourceName: guild.name,
        name: (name || guild.name).slice(0, 60), counts: countsOf(data), data: packed,
    });
    return { ok: true, snap, used: used + 1, limit };
}

const listFor = (userId) => Snapshot.findAll({ where: { ownerId: userId }, order: [['createdAt', 'DESC']], attributes: { exclude: ['data'] } });
const get = (id) => Snapshot.findByPk(normalizeId(id));
const remove = (userId, id) => Snapshot.destroy({ where: { id: normalizeId(id), ownerId: userId } });

/* ── who may use it ────────────────────────────────────────────────── */

async function adminsAllowed(guildId) {
    const row = await SnapshotSettings.findByPk(guildId);
    return !!row?.allowAdmins;
}
const setAdminsAllowed = (guildId, value) => SnapshotSettings.upsert({ guildId, allowAdmins: !!value });

/** Owner always; admins only when the owner allowed it. */
async function mayUse(guild, member) {
    if (!member) return false;
    if (member.id === guild.ownerId) return true;
    return member.permissions.has(PermissionFlagsBits.Administrator) && (await adminsAllowed(guild.id));
}

module.exports = { LIMITS, limitFor, normalizeId, create, listFor, get, remove, unpack, adminsAllowed, setAdminsAllowed, mayUse };
