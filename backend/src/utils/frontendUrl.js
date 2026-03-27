const { db } = require('../database/db');

/**
 * Get the frontend base URL, checking env var first, then falling back to
 * the `general_site_url` setting stored in the database.
 */
const getFrontendBaseUrl = async () => {
  let base = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (base) return base;

  try {
    const setting = await db('app_settings')
      .where('setting_key', 'general_site_url')
      .select('setting_value')
      .first();

    if (setting && setting.setting_value) {
      let val = setting.setting_value;
      // setting_value may be JSON-encoded string
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (_) {}
      }
      if (typeof val === 'string' && val.trim()) {
        base = val.trim().replace(/\/$/, '');
      }
    }
  } catch (_) {
    // Silently fall back — URL will just be a relative path
  }

  return base;
};

module.exports = { getFrontendBaseUrl };
