// grace · clean containers. Components V2 containers never get an accent stripe:
// no base, success, warning or error colour, anywhere in the bot. Embeds are not touched.
// Loaded first thing in bootstrap.js, so every `container.setAccentColor(...)` (including
// ones written in the future) becomes a harmless no-op.

const { ContainerBuilder } = require('discord.js');

ContainerBuilder.prototype.setAccentColor = function setAccentColor() {
  if (this.data) delete this.data.accent_color;
  return this;
};

module.exports = {};
