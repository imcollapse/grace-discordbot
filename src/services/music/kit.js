/*
 * grace · music · command kit
 *
 * One definition per command drives BOTH the slash command and the prefix command
 * (grace's "dual" modules), plus the shared checks every music command repeats:
 * in a voice channel, player exists, same channel as the bot, control permission.
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('./ui');
const { hasControlPermission } = require('./helpers');

const MSG = {
    guildOnly: 'music commands only work in servers',
    notConfigured: 'music is not set up on this bot yet (no lavalink node configured)',
    needVoice: 'you need to be in a voice channel',
    noPlayer: 'no music is currently playing',
    sameChannel: 'you must be in the same voice channel as the bot',
    noControl: 'only the requester, admins, or server managers can control the music',
};

class Ctx {
    constructor(src, args = []) {
        this.src = src;
        this.args = args;
        this.isSlash = !!src.isChatInputCommand?.();
        this.client = src.client;
        this.guild = src.guild;
        this.member = src.member;
        this.user = src.user || src.author;
        this.channel = src.channel;
        this._msg = null;
        this._loading = false;
    }

    get poru() { return this.client.poru || null; }
    get player() { return this.guild ? this.poru?.players?.get(this.guild.id) || null : null; }
    get prefix() { return this.src.usedPrefix || ','; }

    /** Show a "working…" state: slash defers, prefix posts a status line that is edited later. */
    async loading(label) {
        if (this.isSlash) {
            if (!this.src.deferred && !this.src.replied) await this.src.deferReply();
        } else {
            this._msg = await this.src.reply(ui.statusPayload(label));
            this._loading = true;
        }
    }

    /** Send (or, after loading(), replace) the response. Returns the Message. */
    async respond(payload, { ephemeral = false } = {}) {
        const s = this.src;
        if (this.isSlash) {
            if (s.deferred && !s.replied) {
                this._msg = await s.editReply(payload);
            } else if (s.replied) {
                this._msg = await s.followUp({ ...payload, flags: (payload.flags || 0) | (ephemeral ? MessageFlags.Ephemeral : 0) });
            } else {
                const res = await s.reply({
                    ...payload,
                    flags: (payload.flags || 0) | (ephemeral ? MessageFlags.Ephemeral : 0),
                    withResponse: true,
                });
                this._msg = res?.resource?.message ?? await s.fetchReply();
            }
        } else if (this._loading && this._msg) {
            this._loading = false;
            this._msg = await this._msg.edit(payload);
        } else {
            this._msg = await s.reply(payload);
        }
        return this._msg;
    }

    ok(t) { return this.respond(ui.ok(t)); }
    fail(t) { return this.respond(ui.fail(t), { ephemeral: true }); }
    status(t, opts) { return this.respond(ui.statusPayload(t), opts); }
}

/** Runs the shared checks. Returns the player (or true when none is required) or null after replying. */
async function guard(ctx, g = {}) {
    if (!ctx.guild || !ctx.member) { await ctx.fail(MSG.guildOnly); return null; }
    if (!ctx.poru) { await ctx.fail(MSG.notConfigured); return null; }

    const vc = ctx.member.voice?.channel;
    if (g.voice !== false && !vc) { await ctx.fail(MSG.needVoice); return null; }

    if (!g.player) return true;

    const player = ctx.player;
    if (!player) { await ctx.fail(MSG.noPlayer); return null; }
    if (g.same !== false && vc && vc.id !== player.voiceChannel) { await ctx.fail(MSG.sameChannel); return null; }
    if (g.control && !hasControlPermission(ctx.src, player)) { await ctx.fail(MSG.noControl); return null; }
    return player;
}

function addOption(builder, o) {
    const common = (opt) => {
        opt.setName(o.name).setDescription(o.description).setRequired(!!o.required);
        return opt;
    };
    if (o.type === 'integer') {
        builder.addIntegerOption((opt) => {
            common(opt);
            if (o.min !== undefined) opt.setMinValue(o.min);
            if (o.max !== undefined) opt.setMaxValue(o.max);
            return opt;
        });
    } else {
        builder.addStringOption((opt) => {
            common(opt);
            if (o.autocomplete) opt.setAutocomplete(true);
            if (o.choices) opt.addChoices(...o.choices);
            return opt;
        });
    }
}

function parseArgs(spec, ctx) {
    const out = {};
    const opts = spec.options || [];
    if (ctx.isSlash) {
        for (const o of opts) {
            out[o.name] = o.type === 'integer' ? ctx.src.options.getInteger(o.name) : ctx.src.options.getString(o.name);
        }
        return { params: out };
    }
    let rest = [...ctx.args];
    for (let i = 0; i < opts.length; i++) {
        const o = opts[i];
        if (o.type === 'integer') {
            const n = parseInt(rest.shift(), 10);
            out[o.name] = Number.isNaN(n) ? null : n;
        } else if (i === opts.length - 1) {
            out[o.name] = rest.join(' ').trim() || null;
            rest = [];
        } else {
            out[o.name] = rest.shift() ?? null;
        }
        if (o.choices && out[o.name]) {
            const hit = o.choices.find((c) => c.value === String(out[o.name]).toLowerCase() || c.name.toLowerCase() === String(out[o.name]).toLowerCase());
            out[o.name] = hit ? hit.value : null;
        }
        if (out[o.name] === null && o.required) {
            const usage = opts.map((x) => (x.required ? `<${x.name}>` : `[${x.name}]`)).join(' ');
            return { error: `usage: \`${ctx.prefix}${spec.name} ${usage}\`` };
        }
        if (o.type === 'integer' && out[o.name] !== null) {
            if ((o.min !== undefined && out[o.name] < o.min) || (o.max !== undefined && out[o.name] > o.max)) {
                return { error: `\`${o.name}\` must be between ${o.min ?? '-∞'} and ${o.max ?? '∞'}` };
            }
        }
    }
    return { params: out };
}

/**
 * spec: {
 *   name, aliases, description, options: [{ name, type: 'string'|'integer', description, required, min, max, choices, autocomplete }],
 *   guard: { voice, player, same, control },
 *   autocomplete(interaction),
 *   run(ctx, params, player)
 * }
 */
function command(spec) {
    const data = new SlashCommandBuilder().setName(spec.slashName || spec.name).setDescription(spec.description);
    // required options must come before optional ones
    for (const o of [...(spec.options || [])].sort((a, b) => Number(!!b.required) - Number(!!a.required))) addOption(data, o);

    const mod = {
        ...(spec.slash === false ? {} : { data }),
        name: spec.name,
        aliases: spec.aliases || [],
        description: spec.description,
        category: 'music',

        async execute(src, args = []) {
            const ctx = new Ctx(src, args);
            const player = await guard(ctx, spec.guard || {});
            if (!player) return;
            const { params, error } = parseArgs(spec, ctx);
            if (error) return ctx.fail(error);
            return spec.run(ctx, params, player === true ? null : player);
        },
    };
    if (spec.autocomplete) mod.autocomplete = spec.autocomplete;
    return mod;
}

module.exports = { Ctx, guard, command, MSG };
