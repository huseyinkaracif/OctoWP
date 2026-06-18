import type Database from 'better-sqlite3'

function addColumn(db: Database.Database, table: string, col: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
  }
}

export function migrate(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      phone      TEXT NOT NULL UNIQUE,
      name       TEXT,
      vars       TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS list_members (
      list_id    INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      PRIMARY KEY (list_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      message_template TEXT NOT NULL,
      media_path       TEXT,
      media_type       TEXT,
      settings_snapshot TEXT NOT NULL DEFAULT '{}',
      status           TEXT NOT NULL DEFAULT 'draft',
      created_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      contact_id  INTEGER NOT NULL,
      phone       TEXT NOT NULL,
      name        TEXT,
      vars        TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'pending',
      error       TEXT,
      sent_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_recipients_campaign
      ON campaign_recipients(campaign_id, status);

    CREATE TABLE IF NOT EXISTS opt_outs (
      phone      TEXT PRIMARY KEY,
      reason     TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS send_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      phone       TEXT NOT NULL,
      status      TEXT NOT NULL,
      ts          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sendlog_ts ON send_log(ts);

    CREATE TABLE IF NOT EXISTS logs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      level   TEXT NOT NULL,
      scope   TEXT NOT NULL,
      message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);

    CREATE TABLE IF NOT EXISTS inbound_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      phone      TEXT NOT NULL,
      text       TEXT NOT NULL,
      ts         INTEGER NOT NULL,
      contact_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_inbound_phone ON inbound_messages(phone, ts);

    CREATE TABLE IF NOT EXISTS autoreply_rules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kind       TEXT NOT NULL DEFAULT 'keyword',
      name       TEXT NOT NULL DEFAULT '',
      keywords   TEXT NOT NULL DEFAULT '[]',
      match_type TEXT NOT NULL DEFAULT 'contains',
      reply      TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS autoreply_state (
      phone         TEXT PRIMARY KEY,
      last_reply_ts INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      body       TEXT NOT NULL,
      media_path TEXT,
      media_type TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT 'slate',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      PRIMARY KEY (tag_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS sequences (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sequence_steps (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      ord         INTEGER NOT NULL,
      body        TEXT NOT NULL,
      delay_hours REAL NOT NULL DEFAULT 0,
      condition   TEXT NOT NULL DEFAULT 'always'
    );

    CREATE TABLE IF NOT EXISTS sequence_enrollments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      contact_id  INTEGER,
      phone       TEXT NOT NULL,
      name        TEXT,
      vars        TEXT NOT NULL DEFAULT '{}',
      cur_step    INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'active',
      next_run_at INTEGER NOT NULL,
      last_sent_at INTEGER,
      enrolled_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_enroll_due ON sequence_enrollments(status, next_run_at);
  `)

  // ---- v2 additive columns (migrations) ----
  addColumn(db, 'campaign_recipients', 'wa_msg_id', 'TEXT')
  addColumn(db, 'campaign_recipients', 'delivered_at', 'TEXT')
  addColumn(db, 'campaign_recipients', 'read_at', 'TEXT')
  addColumn(db, 'campaign_recipients', 'replied_at', 'TEXT')
  addColumn(db, 'contacts', 'replied_at', 'TEXT')
  addColumn(db, 'contacts', 'last_contacted_at', 'TEXT')
  db.exec('CREATE INDEX IF NOT EXISTS idx_recipients_msgid ON campaign_recipients(wa_msg_id)')

  // ---- v2 phase 2 ----
  addColumn(db, 'inbound_messages', 'direction', "TEXT NOT NULL DEFAULT 'in'")
  addColumn(db, 'campaigns', 'content_type', "TEXT NOT NULL DEFAULT 'message'")
  addColumn(db, 'campaigns', 'poll_question', 'TEXT')
  addColumn(db, 'campaigns', 'poll_options', 'TEXT')
  addColumn(db, 'campaigns', 'poll_selectable', 'INTEGER')
  addColumn(db, 'campaigns', 'vcard_name', 'TEXT')
  addColumn(db, 'campaigns', 'vcard_phone', 'TEXT')

  // ---- v2 phase 3 ----
  addColumn(db, 'campaigns', 'scheduled_at', 'INTEGER')

  // ---- v3 Cloud API template fields ----
  addColumn(db, 'campaigns', 'template_name', 'TEXT')
  addColumn(db, 'campaigns', 'template_lang', 'TEXT')
  addColumn(db, 'campaigns', 'variable_mapping', 'TEXT')
}
