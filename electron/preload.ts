import { contextBridge, ipcRenderer } from 'electron'
import { CH } from './ipc/channels'
import type { OctoApi } from '../shared/types'

function sub(channel: string, cb: (payload: any) => void): () => void {
  const listener = (_e: unknown, payload: any) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OctoApi = {
  wa: {
    getStatus: () => ipcRenderer.invoke(CH.WA_GET_STATUS),
    connect: () => ipcRenderer.invoke(CH.WA_CONNECT),
    disconnect: () => ipcRenderer.invoke(CH.WA_DISCONNECT),
    onStatus: (cb) => sub(CH.WA_STATUS_EVENT, cb)
  },
  contacts: {
    previewColumns: (filePath) => ipcRenderer.invoke(CH.CONTACTS_PREVIEW, filePath),
    import: (filePath, mapping, listId) =>
      ipcRenderer.invoke(CH.CONTACTS_IMPORT, filePath, mapping, listId),
    list: (listId) => ipcRenderer.invoke(CH.CONTACTS_LIST, listId),
    count: () => ipcRenderer.invoke(CH.CONTACTS_COUNT),
    add: (listId, phone, name) => ipcRenderer.invoke(CH.CONTACTS_ADD, listId, phone, name),
    delete: (id) => ipcRenderer.invoke(CH.CONTACTS_DELETE, id),
    syncWhatsapp: () => ipcRenderer.invoke(CH.CONTACTS_SYNC_WA),
    downloadTemplate: () => ipcRenderer.invoke(CH.CONTACTS_TEMPLATE),
    onSynced: (cb) => sub(CH.CONTACTS_SYNCED_EVENT, cb)
  },
  lists: {
    create: (name) => ipcRenderer.invoke(CH.LISTS_CREATE, name),
    all: () => ipcRenderer.invoke(CH.LISTS_ALL),
    delete: (id) => ipcRenderer.invoke(CH.LISTS_DELETE, id)
  },
  optout: {
    list: () => ipcRenderer.invoke(CH.OPTOUT_LIST),
    add: (phone) => ipcRenderer.invoke(CH.OPTOUT_ADD, phone),
    remove: (phone) => ipcRenderer.invoke(CH.OPTOUT_REMOVE, phone)
  },
  campaigns: {
    create: (input) => ipcRenderer.invoke(CH.CAMP_CREATE, input),
    all: () => ipcRenderer.invoke(CH.CAMP_ALL),
    get: (id) => ipcRenderer.invoke(CH.CAMP_GET, id),
    start: (id) => ipcRenderer.invoke(CH.CAMP_START, id),
    pause: (id) => ipcRenderer.invoke(CH.CAMP_PAUSE, id),
    resume: (id) => ipcRenderer.invoke(CH.CAMP_RESUME, id),
    estimate: (listId) => ipcRenderer.invoke(CH.CAMP_ESTIMATE, listId),
    retryFailed: (id) => ipcRenderer.invoke(CH.CAMP_RETRY, id),
    exportResults: (id) => ipcRenderer.invoke(CH.CAMP_EXPORT, id),
    onProgress: (cb) => sub(CH.CAMP_PROGRESS_EVENT, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.SETTINGS_GET),
    set: (patch) => ipcRenderer.invoke(CH.SETTINGS_SET, patch),
    applyPreset: (name) => ipcRenderer.invoke(CH.SETTINGS_PRESET, name)
  },
  stats: {
    dashboard: () => ipcRenderer.invoke(CH.STATS_DASHBOARD)
  },
  logs: {
    list: (search) => ipcRenderer.invoke(CH.LOGS_LIST, search),
    clear: () => ipcRenderer.invoke(CH.LOGS_CLEAR)
  },
  inbox: {
    conversations: () => ipcRenderer.invoke(CH.INBOX_LIST),
    conversation: (phone) => ipcRenderer.invoke(CH.INBOX_CONVERSATION, phone),
    reply: (phone, text) => ipcRenderer.invoke(CH.INBOX_REPLY, phone, text),
    onMessage: (cb) => sub(CH.INBOX_MESSAGE_EVENT, cb)
  },
  autoreply: {
    listRules: () => ipcRenderer.invoke(CH.AUTOREPLY_LIST),
    saveRule: (rule) => ipcRenderer.invoke(CH.AUTOREPLY_SAVE, rule),
    deleteRule: (id) => ipcRenderer.invoke(CH.AUTOREPLY_DELETE, id)
  },
  templates: {
    list: () => ipcRenderer.invoke(CH.TEMPLATES_LIST),
    save: (t) => ipcRenderer.invoke(CH.TEMPLATES_SAVE, t),
    delete: (id) => ipcRenderer.invoke(CH.TEMPLATES_DELETE, id)
  },
  tags: {
    list: () => ipcRenderer.invoke(CH.TAGS_LIST),
    create: (name, color) => ipcRenderer.invoke(CH.TAGS_CREATE, name, color),
    delete: (id) => ipcRenderer.invoke(CH.TAGS_DELETE, id),
    assign: (contactId, tagId) => ipcRenderer.invoke(CH.TAGS_ASSIGN, contactId, tagId),
    unassign: (contactId, tagId) => ipcRenderer.invoke(CH.TAGS_UNASSIGN, contactId, tagId)
  },
  sequences: {
    list: () => ipcRenderer.invoke(CH.SEQ_LIST),
    get: (id) => ipcRenderer.invoke(CH.SEQ_GET, id),
    save: (seq) => ipcRenderer.invoke(CH.SEQ_SAVE, seq),
    delete: (id) => ipcRenderer.invoke(CH.SEQ_DELETE, id),
    enroll: (id, source) => ipcRenderer.invoke(CH.SEQ_ENROLL, id, source),
    onProgress: (cb) => sub(CH.SEQ_PROGRESS_EVENT, cb)
  },
  groups: {
    list: () => ipcRenderer.invoke(CH.GROUPS_LIST),
    collect: (groupIds, listName) => ipcRenderer.invoke(CH.GROUPS_COLLECT, groupIds, listName)
  },
  backup: {
    export: (password) => ipcRenderer.invoke(CH.BACKUP_EXPORT, password),
    import: (filePath, password) => ipcRenderer.invoke(CH.BACKUP_IMPORT, filePath, password)
  },
  dialog: {
    openFile: (filters) => ipcRenderer.invoke(CH.DIALOG_OPEN, filters)
  }
}

contextBridge.exposeInMainWorld('octo', api)
