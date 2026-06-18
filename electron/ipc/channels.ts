export const CH = {
  WA_STATUS_EVENT: 'wa:status',
  WA_GET_STATUS: 'wa:getStatus',

  CLOUD_VERIFY: 'cloud:verify',
  CLOUD_TEMPLATES: 'cloud:templates',

  CONTACTS_PREVIEW: 'contacts:previewColumns',
  CONTACTS_IMPORT: 'contacts:import',
  CONTACTS_DISTINCT: 'contacts:distinctValues',
  CONTACTS_IMPORT_REGION: 'contacts:importByRegion',
  CONTACTS_LIST: 'contacts:list',
  CONTACTS_COUNT: 'contacts:count',
  CONTACTS_ADD: 'contacts:add',
  CONTACTS_DELETE: 'contacts:delete',
  CONTACTS_TEMPLATE: 'contacts:template',

  LISTS_CREATE: 'lists:create',
  LISTS_ALL: 'lists:all',
  LISTS_DELETE: 'lists:delete',

  OPTOUT_LIST: 'optout:list',
  OPTOUT_ADD: 'optout:add',
  OPTOUT_REMOVE: 'optout:remove',

  CAMP_CREATE: 'campaigns:create',
  CAMP_ALL: 'campaigns:all',
  CAMP_GET: 'campaigns:get',
  CAMP_DELETE: 'campaigns:delete',
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

  TEMPLATES_LIST: 'templates:list',
  TEMPLATES_SAVE: 'templates:save',
  TEMPLATES_DELETE: 'templates:delete',

  TAGS_LIST: 'tags:list',
  TAGS_CREATE: 'tags:create',
  TAGS_DELETE: 'tags:delete',
  TAGS_ASSIGN: 'tags:assign',
  TAGS_UNASSIGN: 'tags:unassign',

  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',

  DIALOG_OPEN: 'dialog:openFile'
} as const
