import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, Events, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActivityType, REST, Routes
} from 'discord.js';
import { createClient } from '@supabase/supabase-js';

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BOT_OWNER_ID,
  BOT_VERSION = '1.0.0'
} = process.env;

if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN fehlt.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

const clientId = DISCORD_CLIENT_ID
  || (() => {
    try {
      return Buffer.from(DISCORD_TOKEN.split('.')[0], 'base64').toString('utf8');
    } catch (error) {
      return null;
    }
  })();

const DURATIONS = {
  '60s': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000
};

const COLORS = {
  brand: 0xff6b10,
  success: 0x2ecc71,
  danger: 0xe74c3c,
  warning: 0xf1c40f,
  info: 0x3498db,
  muted: 0x95a5a6
};

const DEFAULT_SETTINGS = {
  guild_id: DISCORD_GUILD_ID || null,
  mod_log_channel_id: null,
  welcome_channel_id: null,
  mute_role_id: null,
  mod_role_ids: [],
  auto_role_ids: [],
  welcome_enabled: false,
  welcome_message: 'Willkommen {user} auf {server}!',
  automod_enabled: false,
  automod_invites: true,
  automod_links: false,
  automod_caps: true,
  automod_spam: true,
  automod_banned_words: [],
  automod_action: 'delete',
  log_messages: true,
  log_members: true,
  log_moderation: true,
  dm_on_action: true,
  warn_timeout_at: 3,
  warn_ban_at: 0,
  purchases_enabled: true,
  bot_activity: 'Ro-Tech Hub',
  disabled_commands: []
};

let settings = { ...DEFAULT_SETTINGS };
let settingsLoadedAt = 0;
const spamTracker = new Map();

function guildId() {
  return DISCORD_GUILD_ID || settings.guild_id || null;
}

function activeGuild() {
  const id = guildId();
  return id ? client.guilds.cache.get(id) : client.guilds.cache.first();
}

async function loadSettings(force = false) {
  if (!force && settingsLoadedAt && Date.now() - settingsLoadedAt < 30000) return settings;
  const { data, error } = await supabase.from('bot_settings').select('*').eq('id', 1).maybeSingle();
  if (error) {
    console.error('[settings]', error.message);
  } else if (data) {
    settings = { ...DEFAULT_SETTINGS, ...data };
  }
  settingsLoadedAt = Date.now();
  if (client.user) {
    client.user.setPresence({
      activities: [{ name: settings.bot_activity || 'Ro-Tech Hub', type: ActivityType.Watching }],
      status: 'online'
    });
  }
  return settings;
}

function isModerator(member) {
  if (!member) return false;
  if (BOT_OWNER_ID && member.id === BOT_OWNER_ID) return true;
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const allowed = settings.mod_role_ids || [];
  return member.roles.cache.some((role) => allowed.includes(role.id));
}

function formatDuration(value) {
  if (!value) return '—';
  return value
    .replace('60s', '60 Sekunden')
    .replace('5m', '5 Minuten')
    .replace('10m', '10 Minuten')
    .replace('30m', '30 Minuten')
    .replace('1h', '1 Stunde')
    .replace('6h', '6 Stunden')
    .replace('1d', '1 Tag')
    .replace('1w', '7 Tage');
}

function truncate(text, length = 1024) {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

async function sendLog(guild, embed) {
  if (!settings.log_moderation || !settings.mod_log_channel_id) return;
  try {
    const channel = await guild.channels.fetch(settings.mod_log_channel_id).catch(() => null);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[log]', error.message);
  }
}

async function persistAction({
  guild, action, targetId, targetName, moderatorId, moderatorName, reason, duration = null, metadata = null
}) {
  try {
    await supabase.from('moderation_actions').insert({
      guild_id: guild?.id || guildId(),
      action,
      target_id: targetId || null,
      target_name: targetName || null,
      moderator_id: moderatorId || null,
      moderator_name: moderatorName || null,
      reason: reason || null,
      duration_seconds: duration ? Math.round(duration / 1000) : null,
      metadata
    });
  } catch (error) {
    console.error('[action]', error.message);
  }
}

function actionEmbed({ action, target, moderator, reason, duration, extra }) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(action)
    .setTimestamp();
  if (target) embed.addFields({ name: 'Ziel', value: target, inline: true });
  if (moderator) embed.addFields({ name: 'Von', value: moderator, inline: true });
  if (reason) embed.addFields({ name: 'Grund', value: truncate(reason, 1000) });
  if (duration) embed.addFields({ name: 'Dauer', value: duration, inline: true });
  if (extra) embed.addFields({ name: 'Details', value: truncate(extra, 1000) });
  return embed;
}

async function logAction({ guild, action, target, moderator, reason, duration, color = COLORS.brand, extra }) {
  await sendLog(guild, actionEmbed({ action, target, moderator, reason, duration, extra }).setColor(color));
}

async function dmUser(user, content) {
  if (!settings.dm_on_action) return;
  try {
    await user.send(content);
  } catch (error) {
    /* DMs geschlossen. */
  }
}

async function reply(interaction, content) {
  const payload = typeof content === 'string' ? { content } : content;
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

function checkHierarchy(interaction, member, { requireMember = true } = {}) {
  if (!member) return requireMember ? 'Der Nutzer ist nicht auf diesem Server.' : null;
  const guild = interaction.guild;
  if (member.id === client.user.id) return 'Ich kann keine Aktionen gegen mich selbst ausführen.';
  if (member.id === guild.ownerId) return 'Der Serverinhaber ist geschützt.';
  if (member.id === interaction.user.id) return 'Du kannst diese Aktion nicht gegen dich selbst ausführen.';
  const botMember = guild.members.me;
  if (botMember.roles.highest.position <= member.roles.highest.position) {
    return 'Meine Bot-Rolle steht nicht hoch genug in der Rollenhierarchie.';
  }
  const isOwner = interaction.user.id === guild.ownerId;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isOwner && !isAdmin && interaction.member.roles.highest.position <= member.roles.highest.position) {
    return 'Deine Rolle steht nicht hoch genug, um diesen Nutzer zu moderieren.';
  }
  return null;
}

async function getTarget(interaction, { requireMember = false } = {}) {
  const user = interaction.options.getUser('user', true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (requireMember && !member) {
    await reply(interaction, 'Dieser Nutzer ist nicht auf dem Server.');
    return null;
  }
  const hierarchy = checkHierarchy(interaction, member, { requireMember });
  if (hierarchy) {
    await reply(interaction, hierarchy);
    return null;
  }
  return { user, member };
}

async function activeWarningCount(userId) {
  const { count } = await supabase
    .from('warnings')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId())
    .eq('user_id', userId)
    .eq('active', true);
  return count || 0;
}

async function maybeApplyWarnThresholds(interaction, user, member, warningCount) {
  const results = [];
  if (!member) return results;

  if (settings.warn_ban_at > 0 && warningCount >= settings.warn_ban_at) {
    const hierarchy = checkHierarchy(interaction, member, { requireMember: true });
    if (!hierarchy) {
      await dmUser(user, `Du wurdest von **${interaction.guild.name}** gebannt: Warnschwelle erreicht (${warningCount} Warnungen).`);
      await interaction.guild.members.ban(user.id, { reason: `Auto-Ban: ${warningCount} aktive Warnungen` }).catch(() => null);
      await persistAction({
        guild: interaction.guild,
        action: 'Auto-Ban (Warnschwelle)',
        targetId: user.id,
        targetName: user.tag,
        moderatorId: client.user.id,
        moderatorName: client.user.tag,
        reason: `${warningCount} aktive Warnungen`,
        metadata: { threshold: settings.warn_ban_at }
      });
      await logAction({
        guild: interaction.guild, action: 'Auto-Ban (Warnschwelle)', target: `${user.tag} (${user.id})`,
        moderator: client.user.tag, reason: `${warningCount} aktive Warnungen`, color: COLORS.danger
      });
      results.push(`Ban-Schwelle erreicht (${warningCount} Warnungen).`);
      return results;
    }
  }

  if (settings.warn_timeout_at > 0 && warningCount >= settings.warn_timeout_at) {
    const hierarchy = checkHierarchy(interaction, member, { requireMember: true });
    if (!hierarchy && member.moderatable) {
      await member.timeout(10 * 60 * 1000, `Auto-Timeout: ${warningCount} aktive Warnungen`).catch(() => null);
      await dmUser(user, `Du wurdest auf **${interaction.guild.name}** für 10 Minuten stummgeschaltet: Warnschwelle erreicht (${warningCount} Warnungen).`);
      await persistAction({
        guild: interaction.guild,
        action: 'Auto-Timeout (Warnschwelle)',
        targetId: user.id,
        targetName: user.tag,
        moderatorId: client.user.id,
        moderatorName: client.user.tag,
        reason: `${warningCount} aktive Warnungen`,
        duration: 10 * 60 * 1000,
        metadata: { threshold: settings.warn_timeout_at }
      });
      await logAction({
        guild: interaction.guild, action: 'Auto-Timeout (Warnschwelle)', target: `${user.tag} (${user.id})`,
        moderator: client.user.tag, reason: `${warningCount} aktive Warnungen`, duration: '10 Minuten', color: COLORS.warning
      });
      results.push(`Timeout-Schwelle erreicht (${warningCount} Warnungen, 10 Minuten).`);
    }
  }
  return results;
}

/* ------------------------------------------------------------
   Command definitions
   ------------------------------------------------------------ */

const commandDefinitions = [
  new SlashCommandBuilder().setName('warn').setDescription('Verwarnt ein Mitglied und speichert die Warnung.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund der Warnung').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder().setName('warnings').setDescription('Zeigt aktive Warnungen eines Mitglieds.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('Entfernt Warnungen eines Mitglieds.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
    .addStringOption((o) => o.setName('id').setDescription('Optional: ID einer einzelnen Warnung').setRequired(false)),
  new SlashCommandBuilder().setName('kick').setDescription('Kickt ein Mitglied mit Grund.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder().setName('ban').setDescription('Bannt einen Nutzer mit Grund.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Nutzer').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(1000))
    .addIntegerOption((o) => o.setName('nachrichten_tage').setDescription('Nachrichten der letzten Tage löschen').addChoices(
      { name: '0 Tage', value: 0 }, { name: '1 Tag', value: 1 }, { name: '3 Tage', value: 3 }, { name: '7 Tage', value: 7 }
    )),
  new SlashCommandBuilder().setName('unban').setDescription('Hebt einen Ban auf.')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('user_id').setDescription('Discord-ID des Nutzers').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder().setName('timeout').setDescription('Schaltet ein Mitglied stumm.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
    .addStringOption((o) => o.setName('dauer').setDescription('Dauer').setRequired(true).addChoices(
      { name: '60 Sekunden', value: '60s' }, { name: '5 Minuten', value: '5m' }, { name: '10 Minuten', value: '10m' },
      { name: '30 Minuten', value: '30m' }, { name: '1 Stunde', value: '1h' }, { name: '6 Stunden', value: '6h' },
      { name: '1 Tag', value: '1d' }, { name: '7 Tage', value: '1w' }
    ))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder().setName('untimeout').setDescription('Hebt den Timeout eines Mitglieds auf.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder().setName('purge').setDescription('Löscht Nachrichten im Kanal.')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('anzahl').setDescription('Anzahl (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Nur Nachrichten dieses Nutzers').setRequired(false))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(false).setMaxLength(500)),
  new SlashCommandBuilder().setName('slowmode').setDescription('Setzt den Slowmode eines Kanals.')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('sekunden').setDescription('0–21600 Sekunden').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: aktueller)').setRequired(false))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(false).setMaxLength(500)),
  new SlashCommandBuilder().setName('lock').setDescription('Sperrt einen Kanal für @everyone.')
    .setDMPermission(false)
    .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: aktueller)').setRequired(false))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder().setName('unlock').setDescription('Entsperrt einen Kanal.')
    .setDMPermission(false)
    .addChannelOption((o) => o.setName('kanal').setDescription('Kanal (Standard: aktueller)').setRequired(false))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder().setName('nickname').setDescription('Ändert den Nickname eines Mitglieds.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
    .addStringOption((o) => o.setName('name').setDescription('Neuer Nickname (leer = zurücksetzen)').setRequired(false).setMaxLength(32))
    .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(false).setMaxLength(500)),
  new SlashCommandBuilder().setName('role').setDescription('Vergibt oder entfernt eine Rolle.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('add').setDescription('Rolle vergeben')
      .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
      .addRoleOption((o) => o.setName('rolle').setDescription('Rolle').setRequired(true))
      .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(false).setMaxLength(500)))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Rolle entfernen')
      .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
      .addRoleOption((o) => o.setName('rolle').setDescription('Rolle').setRequired(true))
      .addStringOption((o) => o.setName('grund').setDescription('Grund').setRequired(false).setMaxLength(500))),
  new SlashCommandBuilder().setName('userinfo').setDescription('Zeigt Informationen zu einem Mitglied.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Zeigt Serverinformationen.')
    .setDMPermission(false),
  new SlashCommandBuilder().setName('say').setDescription('Sendet eine Nachricht im Namen des Bots.')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('nachricht').setDescription('Nachricht').setRequired(true).setMaxLength(2000))
    .addChannelOption((o) => o.setName('kanal').setDescription('Zielkanal (Standard: aktueller)').setRequired(false)),
  new SlashCommandBuilder().setName('help').setDescription('Zeigt alle Bot-Befehle.')
    .setDMPermission(false),
  new SlashCommandBuilder().setName('botinfo').setDescription('Zeigt Status und Konfiguration des Bots.')
    .setDMPermission(false),
  new SlashCommandBuilder().setName('ping').setDescription('Zeigt die Latenz des Bots.')
    .setDMPermission(false)
];

const commandExecutors = {
  async warn(interaction) {
    const target = await getTarget(interaction, { requireMember: true });
    if (!target) return;
    const reason = interaction.options.getString('grund', true);
    const { user, member } = target;

    const { error } = await supabase.from('warnings').insert({
      guild_id: interaction.guild.id,
      user_id: user.id,
      username: user.tag,
      moderator_id: interaction.user.id,
      moderator_name: interaction.user.tag,
      reason
    });
    if (error) {
      await reply(interaction, `Warnung konnte nicht gespeichert werden: ${error.message}`);
      return;
    }

    const count = await activeWarningCount(user.id);
    await dmUser(user, `Du hast auf **${interaction.guild.name}** eine Verwarnung erhalten.\n**Grund:** ${reason}\n**Aktive Warnungen:** ${count}`);
    await persistAction({
      guild: interaction.guild,
      action: 'Warnung',
      targetId: user.id,
      targetName: user.tag,
      moderatorId: interaction.user.id,
      moderatorName: interaction.user.tag,
      reason,
      metadata: { warning_count: count }
    });
    await logAction({
      guild: interaction.guild, action: 'Warnung', target: `${user.tag} (${user.id})`,
      moderator: interaction.user.tag, reason, extra: `${count} aktive Warnung(en)`, color: COLORS.warning
    });

    const extra = await maybeApplyWarnThresholds(interaction, user, member, count);
    await reply(interaction, `**${user.tag}** wurde verwarnt. Aktive Warnungen: **${count}**.${extra.length ? `\n${extra.join('\n')}` : ''}`);
  },

  async warnings(interaction) {
    const user = interaction.options.getUser('user', true);
    const { data, error } = await supabase.from('warnings')
      .select('*')
      .eq('guild_id', interaction.guild.id)
      .eq('user_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(15);
    if (error) {
      await reply(interaction, `Warnungen konnten nicht geladen werden: ${error.message}`);
      return;
    }
    if (!data?.length) {
      await reply(interaction, `**${user.tag}** hat keine aktiven Warnungen.`);
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(`Warnungen von ${user.tag}`)
      .setDescription(data.map((warning, index) => (
        `**${index + 1}.** ${truncate(warning.reason, 250)}\n` +
        `-# ${new Date(warning.created_at).toLocaleString('de-DE')} · von ${warning.moderator_name || warning.moderator_id || 'Unbekannt'} · \`${warning.id}\``
      )).join('\n\n'))
      .setFooter({ text: `${data.length} aktive Warnung(en)` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async clearwarnings(interaction) {
    const user = interaction.options.getUser('user', true);
    const warningId = interaction.options.getString('id');
    let query = supabase.from('warnings').update({
      active: false,
      removed_at: new Date().toISOString(),
      removed_by: interaction.user.tag
    }).eq('guild_id', interaction.guild.id).eq('user_id', user.id);
    if (warningId) query = query.eq('id', warningId);
    const { error } = await query;
    if (error) {
      await reply(interaction, `Warnungen konnten nicht entfernt werden: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild,
      action: warningId ? 'Warnung entfernt' : 'Alle Warnungen entfernt',
      targetId: user.id,
      targetName: user.tag,
      moderatorId: interaction.user.id,
      moderatorName: interaction.user.tag,
      reason: warningId ? `Warnungs-ID: ${warningId}` : 'Alle aktiven Warnungen'
    });
    await logAction({
      guild: interaction.guild, action: warningId ? 'Warnung entfernt' : 'Alle Warnungen entfernt',
      target: `${user.tag} (${user.id})`, moderator: interaction.user.tag, color: COLORS.success
    });
    await reply(interaction, `Warnungen von **${user.tag}** wurden entfernt.`);
  },

  async kick(interaction) {
    const target = await getTarget(interaction, { requireMember: true });
    if (!target) return;
    const reason = interaction.options.getString('grund', true);
    const { user, member } = target;
    await dmUser(user, `Du wurdest von **${interaction.guild.name}** gekickt.\n**Grund:** ${reason}`);
    try {
      await member.kick(reason);
    } catch (error) {
      await reply(interaction, `Kick fehlgeschlagen: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Kick', targetId: user.id, targetName: user.tag,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason
    });
    await logAction({
      guild: interaction.guild, action: 'Kick', target: `${user.tag} (${user.id})`,
      moderator: interaction.user.tag, reason, color: COLORS.danger
    });
    await reply(interaction, `**${user.tag}** wurde gekickt.`);
  },

  async ban(interaction) {
    const target = await getTarget(interaction, { requireMember: false });
    if (!target) return;
    const reason = interaction.options.getString('grund', true);
    const days = interaction.options.getInteger('nachrichten_tage') || 0;
    const { user, member } = target;
    if (member) {
      const hierarchy = checkHierarchy(interaction, member, { requireMember: false });
      if (hierarchy) {
        await reply(interaction, hierarchy);
        return;
      }
    }
    await dmUser(user, `Du wurdest von **${interaction.guild.name}** gebannt.\n**Grund:** ${reason}`);
    try {
      await interaction.guild.members.ban(user.id, {
        reason,
        deleteMessageSeconds: Math.min(7, days) * 86400
      });
    } catch (error) {
      await reply(interaction, `Ban fehlgeschlagen: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Ban', targetId: user.id, targetName: user.tag,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason,
      metadata: { delete_message_days: days }
    });
    await logAction({
      guild: interaction.guild, action: 'Ban', target: `${user.tag} (${user.id})`,
      moderator: interaction.user.tag, reason, extra: `${days} Tag(e) Nachrichten gelöscht`, color: COLORS.danger
    });
    await reply(interaction, `**${user.tag}** wurde gebannt.`);
  },

  async unban(interaction) {
    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('grund', true);
    if (!/^\d{17,20}$/.test(userId)) {
      await reply(interaction, 'Bitte eine gültige Discord-Nutzer-ID angeben.');
      return;
    }
    try {
      await interaction.guild.members.unban(userId, reason);
    } catch (error) {
      await reply(interaction, `Unban fehlgeschlagen: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Unban', targetId: userId, targetName: userId,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason
    });
    await logAction({
      guild: interaction.guild, action: 'Unban', target: userId,
      moderator: interaction.user.tag, reason, color: COLORS.success
    });
    await reply(interaction, `Der Ban für \`${userId}\` wurde aufgehoben.`);
  },

  async timeout(interaction) {
    const target = await getTarget(interaction, { requireMember: true });
    if (!target) return;
    const reason = interaction.options.getString('grund', true);
    const durationKey = interaction.options.getString('dauer', true);
    const duration = DURATIONS[durationKey];
    const { user, member } = target;
    if (!member.moderatable) {
      await reply(interaction, 'Dieses Mitglied kann nicht stummgeschaltet werden (Rollenposition).');
      return;
    }
    try {
      await member.timeout(duration, reason);
    } catch (error) {
      await reply(interaction, `Timeout fehlgeschlagen: ${error.message}`);
      return;
    }
    await dmUser(user, `Du wurdest auf **${interaction.guild.name}** für ${formatDuration(durationKey)} stummgeschaltet.\n**Grund:** ${reason}`);
    await persistAction({
      guild: interaction.guild, action: 'Timeout', targetId: user.id, targetName: user.tag,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason, duration
    });
    await logAction({
      guild: interaction.guild, action: 'Timeout', target: `${user.tag} (${user.id})`,
      moderator: interaction.user.tag, reason, duration: formatDuration(durationKey), color: COLORS.warning
    });
    await reply(interaction, `**${user.tag}** wurde für **${formatDuration(durationKey)}** stummgeschaltet.`);
  },

  async untimeout(interaction) {
    const target = await getTarget(interaction, { requireMember: true });
    if (!target) return;
    const reason = interaction.options.getString('grund', true);
    const { user, member } = target;
    try {
      await member.timeout(null, reason);
    } catch (error) {
      await reply(interaction, `Timeout konnte nicht aufgehoben werden: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Timeout aufgehoben', targetId: user.id, targetName: user.tag,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason
    });
    await logAction({
      guild: interaction.guild, action: 'Timeout aufgehoben', target: `${user.tag} (${user.id})`,
      moderator: interaction.user.tag, reason, color: COLORS.success
    });
    await reply(interaction, `Der Timeout von **${user.tag}** wurde aufgehoben.`);
  },

  async purge(interaction) {
    const amount = interaction.options.getInteger('anzahl', true);
    const filterUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    const channel = interaction.channel;
    if (!channel?.isTextBased() || !('bulkDelete' in channel)) {
      await reply(interaction, 'In diesem Kanal können keine Nachrichten gelöscht werden.');
      return;
    }
    if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
      await reply(interaction, 'Mir fehlt die Berechtigung „Nachrichten verwalten“.');
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const filtered = filterUser ? messages.filter((message) => message.author.id === filterUser.id) : messages;
      const targetMessages = [...filtered.values()].slice(0, amount);
      const deleted = await channel.bulkDelete(targetMessages, true);
      await persistAction({
        guild: interaction.guild, action: 'Nachrichten gelöscht', targetId: filterUser?.id || channel.id,
        targetName: filterUser?.tag || `#${channel.name}`, moderatorId: interaction.user.id,
        moderatorName: interaction.user.tag, reason, metadata: { count: deleted.size, channel_id: channel.id }
      });
      await logAction({
        guild: interaction.guild, action: 'Nachrichten gelöscht', target: filterUser ? filterUser.tag : `#${channel.name}`,
        moderator: interaction.user.tag, reason, extra: `${deleted.size} Nachricht(en)`, color: COLORS.info
      });
      await interaction.editReply(`**${deleted.size}** Nachricht(en) gelöscht.`);
    } catch (error) {
      await interaction.editReply(`Löschen fehlgeschlagen: ${error.message}`);
    }
  },

  async slowmode(interaction) {
    const seconds = interaction.options.getInteger('sekunden', true);
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    if (!channel?.isTextBased() || !('setRateLimitPerUser' in channel)) {
      await reply(interaction, 'Slowmode ist für diesen Kanal nicht verfügbar.');
      return;
    }
    try {
      await channel.setRateLimitPerUser(seconds, reason);
    } catch (error) {
      await reply(interaction, `Slowmode fehlgeschlagen: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Slowmode', targetId: channel.id, targetName: `#${channel.name}`,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason,
      metadata: { seconds }
    });
    await logAction({
      guild: interaction.guild, action: 'Slowmode', target: `#${channel.name}`,
      moderator: interaction.user.tag, reason, extra: `${seconds} Sekunden`, color: COLORS.info
    });
    await reply(interaction, `Slowmode in <#${channel.id}> auf **${seconds} Sekunden** gesetzt.`);
  },

  async lock(interaction) {
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const reason = interaction.options.getString('grund', true);
    if (!channel?.permissionOverwrites) {
      await reply(interaction, 'Dieser Kanal kann nicht gesperrt werden.');
      return;
    }
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason });
    } catch (error) {
      await reply(interaction, `Sperren fehlgeschlagen: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Kanal gesperrt', targetId: channel.id, targetName: `#${channel.name}`,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason
    });
    await logAction({
      guild: interaction.guild, action: 'Kanal gesperrt', target: `#${channel.name}`,
      moderator: interaction.user.tag, reason, color: COLORS.warning
    });
    await reply(interaction, `<#${channel.id}> wurde gesperrt.`);
  },

  async unlock(interaction) {
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const reason = interaction.options.getString('grund', true);
    if (!channel?.permissionOverwrites) {
      await reply(interaction, 'Dieser Kanal kann nicht entsperrt werden.');
      return;
    }
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }, { reason });
    } catch (error) {
      await reply(interaction, `Entsperren fehlgeschlagen: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Kanal entsperrt', targetId: channel.id, targetName: `#${channel.name}`,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason
    });
    await logAction({
      guild: interaction.guild, action: 'Kanal entsperrt', target: `#${channel.name}`,
      moderator: interaction.user.tag, reason, color: COLORS.success
    });
    await reply(interaction, `<#${channel.id}> wurde entsperrt.`);
  },

  async nickname(interaction) {
    const target = await getTarget(interaction, { requireMember: true });
    if (!target) return;
    const nickname = interaction.options.getString('name');
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    try {
      await target.member.setNickname(nickname || null, reason);
    } catch (error) {
      await reply(interaction, `Nickname konnte nicht geändert werden: ${error.message}`);
      return;
    }
    await persistAction({
      guild: interaction.guild, action: 'Nickname geändert', targetId: target.user.id, targetName: target.user.tag,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason,
      metadata: { nickname: nickname || null }
    });
    await reply(interaction, nickname
      ? `Nickname von **${target.user.tag}** wurde auf **${nickname}** gesetzt.`
      : `Nickname von **${target.user.tag}** wurde zurückgesetzt.`);
  },

  async role(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = await getTarget(interaction, { requireMember: true });
    if (!target) return;
    const role = interaction.options.getRole('rolle', true);
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    const guild = interaction.guild;
    if (role.managed) {
      await reply(interaction, 'Diese Rolle wird von einer Integration verwaltet und kann nicht geändert werden.');
      return;
    }
    if (role.position >= guild.members.me.roles.highest.position) {
      await reply(interaction, 'Meine Bot-Rolle steht nicht hoch genug für diese Rolle.');
      return;
    }
    if (interaction.user.id !== guild.ownerId
        && interaction.member.roles.highest.position <= role.position
        && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await reply(interaction, 'Deine Rolle steht nicht hoch genug für diese Rolle.');
      return;
    }
    try {
      if (sub === 'add') await target.member.roles.add(role, reason);
      else await target.member.roles.remove(role, reason);
    } catch (error) {
      await reply(interaction, `Rolle konnte nicht geändert werden: ${error.message}`);
      return;
    }
    await persistAction({
      guild, action: sub === 'add' ? 'Rolle vergeben' : 'Rolle entfernt',
      targetId: target.user.id, targetName: target.user.tag,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason,
      metadata: { role_id: role.id, role_name: role.name }
    });
    await logAction({
      guild, action: sub === 'add' ? 'Rolle vergeben' : 'Rolle entfernt',
      target: `${target.user.tag} (${target.user.id})`, moderator: interaction.user.tag,
      reason, extra: role.name, color: COLORS.info
    });
    await reply(interaction, `Rolle **${role.name}** wurde ${sub === 'add' ? 'vergeben' : 'entfernt'}.`);
  },

  async userinfo(interaction) {
    const target = await getTarget(interaction, { requireMember: false });
    if (!target) return;
    const { user, member } = target;
    const warnings = await activeWarningCount(user.id);
    const embed = new EmbedBuilder()
      .setColor(COLORS.brand)
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'Ja' : 'Nein', inline: true },
        { name: 'Erstellt', value: user.createdAt.toLocaleString('de-DE'), inline: true },
        { name: 'Beigetreten', value: member?.joinedAt ? member.joinedAt.toLocaleString('de-DE') : 'Nicht auf dem Server', inline: true },
        { name: 'Aktive Warnungen', value: String(warnings), inline: true },
        { name: 'Nickname', value: member?.nickname || '—', inline: true }
      );
    if (member) embed.addFields({ name: `Rollen (${member.roles.cache.size - 1})`, value: member.roles.cache.filter((role) => role.id !== interaction.guild.id).map((role) => `<@&${role.id}>`).slice(0, 25).join(' ') || '—' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async serverinfo(interaction) {
    const guild = interaction.guild;
    const embed = new EmbedBuilder()
      .setColor(COLORS.brand)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'Server-ID', value: guild.id, inline: true },
        { name: 'Inhaber', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Erstellt', value: guild.createdAt.toLocaleString('de-DE'), inline: true },
        { name: 'Mitglieder', value: String(guild.memberCount), inline: true },
        { name: 'Kanäle', value: String(guild.channels.cache.size), inline: true },
        { name: 'Rollen', value: String(guild.roles.cache.size), inline: true },
        { name: 'Boosts', value: String(guild.premiumSubscriptionCount || 0), inline: true }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async say(interaction) {
    const message = interaction.options.getString('nachricht', true);
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    if (!channel?.isTextBased()) {
      await reply(interaction, 'In diesem Kanal kann keine Nachricht gesendet werden.');
      return;
    }
    await channel.send({ content: message, allowedMentions: { parse: [] } });
    await persistAction({
      guild: interaction.guild, action: 'Nachricht gesendet', targetId: channel.id, targetName: `#${channel.name}`,
      moderatorId: interaction.user.id, moderatorName: interaction.user.tag, reason: truncate(message, 300)
    });
    await reply(interaction, `Nachricht in <#${channel.id}> gesendet.`);
  },

  async help(interaction) {
    const disabled = new Set(settings.disabled_commands || []);
    const lines = commandDefinitions
      .filter((command) => command.name !== 'help')
      .map((command) => `${disabled.has(command.name) ? '~~' : ''}\`/${command.name}\`${disabled.has(command.name) ? ' (deaktiviert)~~' : ''} — ${command.description}`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.brand)
      .setTitle('Ro-Tech Hub · Bot-Befehle')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Moderationsbefehle benötigen eine konfigurierte Moderator-Rolle oder Discord-Rechte.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async botinfo(interaction) {
    await loadSettings(true);
    const embed = new EmbedBuilder()
      .setColor(COLORS.brand)
      .setTitle('Ro-Tech Hub Bot')
      .addFields(
        { name: 'Status', value: client.isReady() ? 'Online' : 'Offline', inline: true },
        { name: 'Ping', value: `${client.ws.ping} ms`, inline: true },
        { name: 'Version', value: BOT_VERSION, inline: true },
        { name: 'Server', value: activeGuild()?.name || 'Nicht verbunden', inline: true },
        { name: 'Mod-Rollen', value: String((settings.mod_role_ids || []).length), inline: true },
        { name: 'AutoMod', value: settings.automod_enabled ? 'Aktiv' : 'Inaktiv', inline: true }
      )
      .setFooter({ text: `Uptime: ${Math.floor(client.uptime / 60000)} Minuten` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async ping(interaction) {
    const sent = Date.now();
    await interaction.reply({ content: 'Pong …', ephemeral: true });
    const latency = Date.now() - sent;
    await interaction.editReply({ content: `Pong! WebSocket: **${client.ws.ping} ms** · Antwort: **${latency} ms**` });
  }
};

const commandList = commandDefinitions.map((data) => ({
  data,
  execute: commandExecutors[data.name]
})).filter((command) => typeof command.execute === 'function');

/* ------------------------------------------------------------
   Discord events
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   Produktrollen (automatisch anlegen / aufräumen)
   ------------------------------------------------------------ */

let roleJobsRunning = false;

async function finishRoleJob(job, status, error = null) {
  await supabase.from('discord_role_jobs').update({
    status,
    error,
    processed_at: new Date().toISOString()
  }).eq('id', job.id);
}

async function processRoleJobs() {
  if (roleJobsRunning) return;
  const guild = activeGuild();
  if (!guild) return;

  roleJobsRunning = true;
  try {
    const { data: jobs, error } = await supabase
      .from('discord_role_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('[roles]', error.message);
      return;
    }

    for (const job of jobs || []) {
      if (job.action === 'create') {
        const { data: product } = await supabase
          .from('products')
          .select('id, name, discord_role_id')
          .eq('id', job.product_id)
          .maybeSingle();

        if (!product || product.discord_role_id) {
          await finishRoleJob(job, 'cancelled', 'Produkt existiert nicht mehr oder hat bereits eine Rolle.');
          continue;
        }

        try {
          const role = await guild.roles.create({
            name: truncate(product.name || job.role_name || 'Produkt', 100),
            colors: { primaryColor: 0xff6b10 },
            hoist: false,
            mentionable: false,
            reason: `Ro-Tech Hub: Produktrolle für "${product.name}"`
          });

          const { data: linkedProduct, error: linkError } = await supabase.from('products')
            .update({ discord_role_id: role.id })
            .eq('id', product.id)
            .select('id')
            .maybeSingle();
          if (linkError || !linkedProduct) {
            await role.delete('Ro-Tech Hub: Rollen-ID konnte nicht am Produkt gespeichert werden').catch(() => {});
            await finishRoleJob(job, 'failed', linkError?.message || 'Produkt wurde zwischenzeitlich gelöscht.');
            await logAction({
              guild,
              action: 'Produktrolle konnte nicht gespeichert werden',
              target: product.name,
              moderator: client.user.tag,
              reason: linkError?.message || 'Produkt wurde zwischenzeitlich gelöscht.',
              color: COLORS.danger
            });
            continue;
          }

          await finishRoleJob(job, 'done');
          await logAction({
            guild,
            action: 'Produktrolle erstellt',
            target: role.name,
            moderator: client.user.tag,
            reason: 'Automatisch bei Produkterstellung',
            extra: `Rollen-ID: ${role.id}`,
            color: COLORS.success
          });
        } catch (createError) {
          console.error('[roles:create]', createError.message);
          await finishRoleJob(job, 'failed', createError.message);
          await logAction({
            guild,
            action: 'Produktrolle konnte nicht erstellt werden',
            target: product.name,
            moderator: client.user.tag,
            reason: createError.message,
            color: COLORS.danger
          });
        }
        continue;
      }

      if (job.action === 'delete') {
        if (!job.role_id) {
          await finishRoleJob(job, 'done');
          continue;
        }

        const role = guild.roles.cache.get(job.role_id)
          || await guild.roles.fetch(job.role_id).catch(() => null);
        if (!role) {
          await finishRoleJob(job, 'done');
          continue;
        }

        if (guild.members.cache.size < guild.memberCount) {
          try {
            await guild.members.fetch();
          } catch (memberError) {
            await finishRoleJob(job, 'failed', `Mitglieder konnten nicht geladen werden: ${memberError.message}`);
            await logAction({
              guild,
              action: 'Produktrolle nicht gelöscht',
              target: role.name,
              moderator: client.user.tag,
              reason: 'Mitgliederliste konnte nicht vollständig geladen werden. Sicherheitshalber nicht gelöscht.',
              color: COLORS.danger
            });
            continue;
          }
        }

        if (!BOT_OWNER_ID) {
          await finishRoleJob(job, 'failed', 'BOT_OWNER_ID fehlt; Produktrolle wird aus Sicherheitsgründen nicht gelöscht.');
          await logAction({
            guild,
            action: 'Produktrolle nicht gelöscht',
            target: role.name,
            moderator: client.user.tag,
            reason: 'BOT_OWNER_ID fehlt. Der Bot benötigt die Discord-ID des Master Admins.',
            color: COLORS.danger
          });
          continue;
        }

        const ownerId = BOT_OWNER_ID;
        const otherMembers = role.members.filter((member) => member.id !== ownerId);
        if (otherMembers.size > 0) {
          await finishRoleJob(job, 'skipped', `Rolle ist noch ${otherMembers.size} Mitglied(ern) zugewiesen.`);
          await logAction({
            guild,
            action: 'Produktrolle nicht gelöscht',
            target: role.name,
            moderator: client.user.tag,
            reason: `Noch ${otherMembers.size} Mitglied(er) außer dem Master zugewiesen.`,
            color: COLORS.warning
          });
          continue;
        }

        try {
          await role.delete(`Ro-Tech Hub: Produkt "${job.role_name || role.name}" gelöscht`);
          await finishRoleJob(job, 'done');
          await logAction({
            guild,
            action: 'Produktrolle gelöscht',
            target: role.name,
            moderator: client.user.tag,
            reason: 'Automatisch bei Produktlöschung',
            extra: `Rollen-ID: ${role.id}`,
            color: COLORS.success
          });
        } catch (deleteError) {
          console.error('[roles:delete]', deleteError.message);
          await finishRoleJob(job, 'failed', deleteError.message);
          await logAction({
            guild,
            action: 'Produktrolle konnte nicht gelöscht werden',
            target: role.name,
            moderator: client.user.tag,
            reason: deleteError.message,
            color: COLORS.danger
          });
        }
      }
    }
  } finally {
    roleJobsRunning = false;
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`[bot] Eingeloggt als ${client.user.tag}`);
  await loadSettings(true);
  const presence = activeGuild();
  if (presence) console.log(`[bot] Aktiver Server: ${presence.name} (${presence.id})`);

  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const body = commandList.map((command) => command.data.toJSON());
    if (guildId()) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId()), { body });
      console.log(`[bot] ${body.length} Befehle für Guild ${guildId()} registriert.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
      console.log(`[bot] ${body.length} globale Befehle registriert (kann bis zu 1 Stunde dauern).`);
    }
  } catch (error) {
    console.error('[commands]', error.message);
  }

  await heartbeat();
  setInterval(() => { loadSettings(true).catch(console.error); }, 30000);
  setInterval(() => { heartbeat().catch(console.error); }, 60000);
  setInterval(() => { syncPurchaseRoles().catch(console.error); }, 60000);
  setInterval(() => { processRoleJobs().catch(console.error); }, 15000);
  syncPurchaseRoles().catch(console.error);
  processRoleJobs().catch(console.error);
});

async function heartbeat() {
  const guild = activeGuild();
  await supabase.from('bot_heartbeat').upsert({
    id: 1,
    last_seen: new Date().toISOString(),
    guild_name: guild?.name || null,
    latency_ms: client.ws.ping,
    version: BOT_VERSION,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Dieser Bot funktioniert nur auf einem Server.', ephemeral: true });
    return;
  }

  const command = commandList.find((entry) => entry.data.name === interaction.commandName);
  if (!command) return;

  if ((settings.disabled_commands || []).includes(command.data.name)) {
    await interaction.reply({ content: 'Dieser Befehl wurde vom Master Admin deaktiviert.', ephemeral: true });
    return;
  }

  const publicCommands = new Set(['help', 'ping', 'botinfo']);
  if (!publicCommands.has(command.data.name) && !isModerator(interaction.member)) {
    await interaction.reply({ content: 'Du hast keine Berechtigung für diesen Befehl.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[command:${command.data.name}]`, error);
    const content = `Fehler beim Ausführen: ${truncate(error.message, 400)}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {});
    } else {
      await interaction.reply({ content, ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.inGuild() || message.author.bot || message.system) return;
  if (!settings.automod_enabled) return;
  const member = message.member;
  if (!member || isModerator(member)) return;

  const content = message.content || '';
  const lower = content.toLowerCase();
  const reasons = [];

  if (settings.automod_invites && /(discord\.gg|discord(?:app)?\.com\/invite)\//i.test(content)) {
    reasons.push('Invite-Link');
  }
  if (settings.automod_links && /https?:\/\//i.test(content)) {
    reasons.push('Externer Link');
  }
  const bannedWords = (settings.automod_banned_words || []).filter(Boolean);
  if (bannedWords.some((word) => lower.includes(String(word).toLowerCase()))) {
    reasons.push('Verbotenes Wort');
  }
  if (settings.automod_caps) {
    const letters = content.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
    const uppercase = content.replace(/[^A-ZÄÖÜ]/g, '');
    if (letters.length >= 15 && uppercase.length / letters.length > 0.72) {
      reasons.push('Zu viele Großbuchstaben');
    }
  }
  if (settings.automod_spam) {
    const now = Date.now();
    const key = `${message.guild.id}:${message.author.id}`;
    const times = (spamTracker.get(key) || []).filter((timestamp) => now - timestamp < 6000);
    times.push(now);
    spamTracker.set(key, times);
    if (times.length >= 6) {
      reasons.push('Spam');
      spamTracker.delete(key);
    }
  }

  if (!reasons.length) return;

  const reason = reasons.join(', ');
  if (message.deletable) await message.delete().catch(() => {});
  if (settings.automod_action === 'timeout' && member.moderatable) {
    await member.timeout(10 * 60 * 1000, `AutoMod: ${reason}`).catch(() => {});
  }

  await persistAction({
    guild: message.guild,
    action: 'AutoMod',
    targetId: message.author.id,
    targetName: message.author.tag,
    moderatorId: client.user.id,
    moderatorName: client.user.tag,
    reason: `${reason}: ${truncate(content, 300)}`,
    metadata: { channel_id: message.channelId, message_id: message.id }
  });
  await logAction({
    guild: message.guild,
    action: 'AutoMod',
    target: `${message.author.tag} (${message.author.id})`,
    moderator: client.user.tag,
    reason,
    extra: `Kanal: <#${message.channelId}>${settings.automod_action === 'timeout' ? ' · 10 Min Timeout' : ''}`,
    color: COLORS.warning
  });
});

client.on(Events.MessageDelete, async (message) => {
  if (!settings.log_messages || !message.inGuild() || message.author?.bot) return;
  await logAction({
    guild: message.guild,
    action: 'Nachricht gelöscht',
    target: message.author ? `${message.author.tag} (${message.author.id})` : 'Unbekannt',
    moderator: 'System',
    reason: message.content ? truncate(message.content, 800) : 'Kein Textinhalt',
    extra: `Kanal: <#${message.channelId}>`,
    color: COLORS.muted
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!settings.log_messages || !newMessage.inGuild() || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await logAction({
    guild: newMessage.guild,
    action: 'Nachricht bearbeitet',
    target: newMessage.author ? `${newMessage.author.tag} (${newMessage.author.id})` : 'Unbekannt',
    moderator: 'System',
    reason: `Vorher: ${truncate(oldMessage.content || '—', 400)}\nNachher: ${truncate(newMessage.content || '—', 400)}`,
    extra: `Kanal: <#${newMessage.channelId}>`,
    color: COLORS.info
  });
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (settings.log_members) {
    await logAction({
      guild: member.guild,
      action: 'Mitglied beigetreten',
      target: `${member.user.tag} (${member.id})`,
      moderator: 'System',
      reason: `Account erstellt: ${member.user.createdAt.toLocaleString('de-DE')}`,
      color: COLORS.success
    });
  }

  for (const roleId of settings.auto_role_ids || []) {
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.add(role, 'Auto-Rolle').catch(() => {});
  }

  if (!settings.welcome_enabled || !settings.welcome_channel_id) return;
  const channel = await member.guild.channels.fetch(settings.welcome_channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const text = (settings.welcome_message || 'Willkommen {user}!')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
  await channel.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (!settings.log_members) return;
  await logAction({
    guild: member.guild,
    action: 'Mitglied verlassen',
    target: `${member.user.tag} (${member.id})`,
    moderator: 'System',
    reason: `Beigetreten: ${member.joinedAt ? member.joinedAt.toLocaleString('de-DE') : 'Unbekannt'}`,
    color: COLORS.muted
  });
});

async function syncPurchaseRoles() {
  if (!settings.purchases_enabled) return;
  const guild = activeGuild();
  if (!guild) return;

  const { data, error } = await supabase.from('purchases')
    .select('id, user_id, product_name, products(name, discord_role_id), profiles!purchases_user_id_fkey(discord_id, blocked, username)')
    .eq('status', 'confirmed')
    .is('role_granted_at', null)
    .limit(10);

  if (error) {
    console.error('[purchases]', error.message);
    return;
  }

  for (const purchase of data || []) {
    const buyer = purchase.profiles;
    const product = purchase.products;
    const roleId = product?.discord_role_id;
    const discordId = buyer?.discord_id;
    if (!discordId || buyer?.blocked || !roleId) continue;

    const member = await guild.members.fetch(discordId).catch(() => null);
    const role = guild.roles.cache.get(roleId);
    if (!member || !role) {
      console.warn(`[purchases] Rolle ${roleId} oder Mitglied ${discordId} nicht gefunden.`);
      continue;
    }
    if (role.position >= guild.members.me.roles.highest.position) {
      console.warn(`[purchases] Bot-Rolle zu niedrig für ${role.name}.`);
      continue;
    }

    try {
      await member.roles.add(role, `Kauf bestätigt: ${purchase.product_name}`);
      await supabase.from('purchases').update({ role_granted_at: new Date().toISOString() }).eq('id', purchase.id);
      await member.send(`Dein Kauf von **${purchase.product_name}** wurde bestätigt. Die Rolle **${role.name}** wurde dir vergeben.`).catch(() => {});
      await logAction({
        guild,
        action: 'Kauf-Rolle vergeben',
        target: `${member.user.tag} (${member.id})`,
        moderator: client.user.tag,
        reason: purchase.product_name,
        extra: role.name,
        color: COLORS.success
      });
    } catch (roleError) {
      console.error('[purchases]', roleError.message);
    }
  }
}

client.on(Events.Error, (error) => console.error('[discord]', error));
client.on(Events.Warn, (warning) => console.warn('[discord:warn]', warning));

process.on('SIGINT', async () => {
  console.log('[bot] Beende …');
  await client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('[unhandledRejection]', error);
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('[login]', error.message);
  process.exit(1);
});
