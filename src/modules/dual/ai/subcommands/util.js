/** Text of the message the user replied to (prefix commands only). */
async function repliedMessage(ctx) {
    if (!ctx.reference?.messageId) return null;
    return ctx.channel.messages.fetch(ctx.reference.messageId).catch(() => null);
}
async function repliedText(ctx) {
    const m = await repliedMessage(ctx);
    return (m?.content || m?.embeds?.[0]?.description || '').trim();
}
module.exports = { repliedMessage, repliedText };
