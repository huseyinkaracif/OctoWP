export const CH = {
  WA_STATUS_EVENT: 'wa:status',
  WA_GET_STATUS: 'wa:getStatus',
  WA_CONNECT: 'wa:connect',
  WA_DISCONNECT: 'wa:disconnect',

  CONTACTS_PREVIEW: 'contacts:previewColumns',
  CONTACTS_IMPORT: 'contacts:import',
  CONTACTS_DISTINCT: 'contacts:distinctValues',
  CONTACTS_IMPORT_REGION: 'contacts:importByRegion',
  CONTACTS_LIST: 'contacts:list',
  CONTACTS_COUNT: 'contacts:count',
  CONTACTS_ADD: 'contacts:add',
  CONTACTS_DELETE: 'contacts:delete',
  CONTACTS_SYNC_WA: 'contacts:syncWhatsapp',
  CONTACTS_TEMPLATE: 'contacts:template',
  CONTACTS_SYNCED_EVENT: 'contacts:synced',

  LISTS_CREATE: 'lists:create',
  LISTS_ALL: 'lists:all',
  LISTS_DELETE: 'lists:delete',

  OPTOUT_LIST: 'optout:list',
  OPTOUT_ADD: 'optout:add',
  OPTOUT_REMOVE: 'optout:remove',

  CAMP_CREATE: 'campaigns:create',
  CAMP_ALL: 'campaigns:all',
  CAMP_GET: 'campaigns:get',
  CAMP_START: 'campaigns:start',
  CAMP_PAUSE: 'campaigns:pause',
  CAMP_RESUME: 'campaigns:resume',
  CAMP_ESTIMATE: 'campaigns:estimate',
  CAMP_RETRY: 'campaigns:retryFailed',
  CAMP_EXPORT: 'campaigns:exportResults',
  CAMP_PROGRESS_EVENT: 'campaign:progress',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_PRESET: 'settings:applyPreset',

  STATS_DASHBOARD: 'stats:dashboard',

  LOGS_LIST: 'logs:list',
  LOGS_CLEAR: 'logs:clear',

  GROUPS_LIST: 'groups:list',
  GROUPS_COLLECT: 'groups:collect',

  INBOX_LIST: 'inbox:conversations',
  INBOX_CONVERSATION: 'inbox:conversation',
  INBOX_REPLY: 'inbox:reply',
  INBOX_MESSAGE_EVENT: 'inbox:message',

  AUTOREPLY_LIST: 'autoreply:list',
  AUTOREPLY_SAVE: 'autoreply:save',
  AUTOREPLY_DELETE: 'autoreply:delete',

  TEMPLATES_LIST: 'templates:list',
  TEMPLATES_SAVE: 'templates:save',
  TEMPLATES_DELETE: 'templates:delete',

  TAGS_LIST: 'tags:list',
  TAGS_CREATE: 'tags:create',
  TAGS_DELETE: 'tags:delete',
  TAGS_ASSIGN: 'tags:assign',
  TAGS_UNASSIGN: 'tags:unassign',

  SEQ_LIST: 'sequences:list',
  SEQ_GET: 'sequences:get',
  SEQ_SAVE: 'sequences:save',
  SEQ_DELETE: 'sequences:delete',
  SEQ_ENROLL: 'sequences:enroll',
  SEQ_PROGRESS_EVENT: 'sequences:progress',

  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',

  DIALOG_OPEN: 'dialog:openFile'
} as const
