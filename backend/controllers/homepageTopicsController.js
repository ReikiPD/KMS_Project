const pool = require('../config/db');
const { recordAudit } = require('../services/auditService');
const { validateTopicIds, readHomepageTopics, saveHomepageTopics } = require('../services/homepageTopicsService');

const getRecommendedTopics = async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const settings = await readHomepageTopics(pool);
    return res.json({ data: settings.topics });
  } catch (error) {
    console.error('Error reading recommended topics:', error.message);
    return res.status(500).json({ error: 'Rekomendasi topik belum dapat dimuat.' });
  }
};

const getTopicSettings = async (_req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try { return res.json(await readHomepageTopics(pool)); }
  catch (error) {
    console.error('Error reading topic settings:', error.message);
    return res.status(500).json({ error: 'Pengaturan topik belum dapat dimuat.' });
  }
};

const updateTopicSettings = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  let client;
  try {
    const ids = validateTopicIds(req.body?.categoryIds);
    client = await pool.connect();
    await client.query('BEGIN');
    const settings = await saveHomepageTopics(client, ids);
    await client.query('COMMIT');
    await recordAudit({
      actorId: req.user.id || null,
      actorLabel: req.user.role === 'admin' ? req.user.full_name : null,
      actorRole: req.user.role,
      action: 'homepage.topic_settings_updated',
      targetType: 'homepage_settings',
      targetId: 1,
      metadata: { categoryIds: ids },
    });
    return res.json(settings);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    if ([400, 409].includes(error.status)) return res.status(error.status).json({ error: error.message });
    console.error('Error updating topic settings:', error.message);
    return res.status(500).json({ error: 'Pengaturan topik belum berhasil disimpan.' });
  } finally { client?.release(); }
};

module.exports = { getRecommendedTopics, getTopicSettings, updateTopicSettings };
