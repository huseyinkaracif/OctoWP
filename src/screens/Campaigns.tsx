import { useEffect, useMemo, useState } from 'react'
import { Plus, Send, Play, Pause, ArrowLeft, Image as ImageIcon, X, Megaphone, RotateCcw, Download, Clock, RefreshCcw, Trash2 } from 'lucide-react'
import type {
  Campaign,
  CampaignRecipient,
  ListDTO,
  MediaType,
  RecipientStatus,
  CampaignEstimate,
  Tag,
  WaTemplate,
  CampaignVarSource
} from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { Card, SectionTitle, Button, Badge, EmptyState, TextInput, Field, ProgressBar, Spinner } from '../components/ui'
import { pct, cn } from '../lib/format'
import { statusBadge } from './Dashboard'

type View = { t: 'list' } | { t: 'create' } | { t: 'detail'; id: number }

function mediaTypeOf(path: string): MediaType {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  return 'document'
}

/** Render a template body with the mapped variables for preview. */
function previewTemplate(body: string, vars: CampaignVarSource[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => {
    const v = vars[Number(n) - 1]
    if (!v) return `{{${n}}}`
    if (v.kind === 'static') return v.value || `{{${n}}}`
    return v.value ? `[${v.value}]` : `{{${n}}}`
  })
}

export function Campaigns() {
  const [view, setView] = useState<View>({ t: 'list' })
  const [camps, setCamps] = useState<Campaign[]>([])

  const reload = () => octo.campaigns.all().then(setCamps)
  useEffect(() => {
    reload()
    return octo.campaigns.onProgress(() => reload())
  }, [])

  const del = async (c: Campaign) => {
    if (!window.confirm(`"${c.name}" kampanyası ve tüm alıcı kayıtları silinsin mi?`)) return
    await octo.campaigns.delete(c.id)
    reload()
  }

  if (view.t === 'create') return <Composer onBack={() => setView({ t: 'list' })} onCreated={(id) => setView({ t: 'detail', id })} />
  if (view.t === 'detail') return <Detail id={view.id} onBack={() => { reload(); setView({ t: 'list' }) }} />

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle
        title="Kampanyalar"
        subtitle="Onaylı şablonla toplu mesaj kampanyalarını oluştur ve yönet"
        action={
          <Button onClick={() => setView({ t: 'create' })}>
            <Plus size={16} /> Yeni kampanya
          </Button>
        }
      />

      {camps.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={28} />}
          title="Henüz kampanya yok"
          subtitle="Bir liste ve onaylı şablon seç, değişkenleri eşle ve gönderime başla."
          action={<Button onClick={() => setView({ t: 'create' })}>Kampanya oluştur</Button>}
        />
      ) : (
        <div className="space-y-3">
          {camps.map((c) => {
            const done = c.stats.sent + c.stats.failed + c.stats.skipped + c.stats.optout
            return (
              <Card key={c.id} className="group p-5 transition hover:ring-1 hover:ring-brand-500/30">
                <div className="mb-3 flex items-center justify-between">
                  <button onClick={() => setView({ t: 'detail', id: c.id })} className="flex min-w-0 items-center gap-2 text-left">
                    <span className="truncate font-medium">{c.name}</span>
                    {statusBadge(c.status)}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-slate-500">
                      {c.stats.sent}/{c.stats.total}
                    </span>
                    <button
                      onClick={() => del(c)}
                      title="Kampanyayı sil"
                      className="text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <button onClick={() => setView({ t: 'detail', id: c.id })} className="block w-full">
                  <ProgressBar value={pct(done, c.stats.total)} />
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Composer({ onBack, onCreated }: { onBack: () => void; onCreated: (id: number) => void }) {
  const [lists, setLists] = useState<ListDTO[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [name, setName] = useState('')
  const [audienceType, setAudienceType] = useState<'list' | 'tag'>('list')
  const [listId, setListId] = useState<number | null>(null)
  const [tagId, setTagId] = useState<number | null>(null)
  const [estimate, setEstimate] = useState<CampaignEstimate | null>(null)
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [tplError, setTplError] = useState<string | null>(null)
  const [loadingTpl, setLoadingTpl] = useState(false)
  const [tplName, setTplName] = useState('')
  const [vars, setVars] = useState<CampaignVarSource[]>([])
  const [media, setMedia] = useState<string | null>(null)
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const template = useMemo(() => templates.find((t) => t.name === tplName) ?? null, [templates, tplName])

  const loadTemplates = () => {
    setLoadingTpl(true)
    setTplError(null)
    octo.cloud
      .templates()
      .then((ts) => setTemplates(ts))
      .catch((e) => setTplError(String(e?.message ?? e)))
      .finally(() => setLoadingTpl(false))
  }

  useEffect(() => {
    octo.lists.all().then((ls) => {
      setLists(ls)
      setListId((cur) => cur ?? ls[0]?.id ?? null)
    })
    octo.tags.list().then(setTags)
    loadTemplates()
  }, [])

  useEffect(() => {
    if (audienceType === 'list' && listId) octo.campaigns.estimate(listId).then(setEstimate)
    else setEstimate(null)
  }, [listId, audienceType])

  // reset variable mapping when the template changes
  useEffect(() => {
    if (!template) {
      setVars([])
      return
    }
    setVars(Array.from({ length: template.bodyVarCount }, () => ({ kind: 'column', value: '' })))
    if (template.headerFormat !== 'IMAGE') setMedia(null)
  }, [tplName]) // eslint-disable-line react-hooks/exhaustive-deps

  const setVar = (i: number, patch: Partial<CampaignVarSource>) =>
    setVars((vs) => vs.map((v, j) => (j === i ? ({ ...v, ...patch } as CampaignVarSource) : v)))

  const attach = async () => {
    const f = await octo.dialog.openFile([{ name: 'Görsel', extensions: ['png', 'jpg', 'jpeg', 'webp'] }])
    if (f) setMedia(f)
  }

  const needsImage = template?.headerFormat === 'IMAGE'
  const audienceValid = audienceType === 'list' ? !!listId : !!tagId
  const varsValid = vars.every((v) => v.value.trim().length > 0)
  const canCreate =
    name.trim().length > 0 && audienceValid && !!template && varsValid && (!needsImage || !!media)

  const create = async () => {
    if (!canCreate || !template) return
    setBusy(true)
    try {
      const camp = await octo.campaigns.create({
        name: name.trim(),
        listId: audienceType === 'list' ? listId : null,
        tagId: audienceType === 'tag' ? tagId : null,
        templateName: template.name,
        templateLang: template.language,
        variableMapping: vars,
        mediaPath: needsImage ? media : null,
        mediaType: needsImage && media ? mediaTypeOf(media) : null,
        scheduledAt: scheduleEnabled && scheduleAt ? new Date(scheduleAt).getTime() : null
      })
      onCreated(camp.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
        <ArrowLeft size={16} /> Geri
      </button>
      <SectionTitle title="Yeni kampanya" subtitle="Liste ve onaylı şablon seç, değişkenleri eşle" />

      <Card className="space-y-5 p-6">
        <Field label="Kampanya adı">
          <TextInput placeholder="Mayıs Promosyonu" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Hedef kitle">
          <div className="space-y-2">
            <div className="flex gap-2">
              {(['list', 'tag'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAudienceType(t)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm transition',
                    audienceType === t
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'border-slate-300 text-slate-500 dark:border-white/10'
                  )}
                >
                  {t === 'list' ? 'Liste' : 'Etiket'}
                </button>
              ))}
            </div>
            {audienceType === 'list' ? (
              <select className="input-base" value={listId ?? ''} onChange={(e) => setListId(Number(e.target.value))}>
                {lists.length === 0 && <option value="">Liste yok — önce Rehber&apos;den içe aktar</option>}
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.count} kişi)
                  </option>
                ))}
              </select>
            ) : (
              <select className="input-base" value={tagId ?? ''} onChange={(e) => setTagId(Number(e.target.value))}>
                {tags.length === 0 && <option value="">Etiket yok — önce Rehber&apos;den oluştur</option>}
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.count} kişi)
                  </option>
                ))}
              </select>
            )}
          </div>
        </Field>

        <Field
          label="Şablon (Meta onaylı)"
          hint="Şablonlar Meta WhatsApp Manager'da oluşturulur ve onaylanır"
        >
          {loadingTpl ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
              <Spinner /> Şablonlar yükleniyor…
            </div>
          ) : tplError ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                Şablonlar alınamadı: {tplError}
              </div>
              <Button variant="outline" onClick={loadTemplates}>
                <RefreshCcw size={15} /> Tekrar dene
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select className="input-base" value={tplName} onChange={(e) => setTplName(e.target.value)}>
                <option value="">— şablon seç —</option>
                {templates.map((t) => (
                  <option key={`${t.name}/${t.language}`} value={t.name}>
                    {t.name} · {t.language} · {t.category}
                  </option>
                ))}
              </select>
              <Button variant="ghost" onClick={loadTemplates} title="Yenile">
                <RefreshCcw size={15} />
              </Button>
            </div>
          )}
        </Field>

        {template && (
          <>
            {template.headerFormat === 'IMAGE' && (
              <Field label="Şablon görseli (header)">
                {media ? (
                  <span className="flex w-fit items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs dark:bg-white/5">
                    <ImageIcon size={13} /> {media.split(/[\\/]/).pop()}
                    <button onClick={() => setMedia(null)} className="text-slate-400 hover:text-rose-500">
                      <X size={13} />
                    </button>
                  </span>
                ) : (
                  <Button variant="outline" onClick={attach}>
                    <ImageIcon size={15} /> Görsel seç
                  </Button>
                )}
              </Field>
            )}

            {vars.length > 0 && (
              <Field label="Değişken eşleme" hint="Her {{n}} için liste sütunu (ör. ad) ya da sabit metin">
                <div className="space-y-2">
                  {vars.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-sm tabular-nums text-slate-400">{`{{${i + 1}}}`}</span>
                      <select
                        className="input-base w-28 shrink-0"
                        value={v.kind}
                        onChange={(e) => setVar(i, { kind: e.target.value as CampaignVarSource['kind'] })}
                      >
                        <option value="column">Sütun</option>
                        <option value="static">Sabit</option>
                      </select>
                      <TextInput
                        placeholder={v.kind === 'column' ? 'ör. ad' : 'sabit metin'}
                        value={v.value}
                        onChange={(e) => setVar(i, { value: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </Field>
            )}

            <div className="rounded-xl bg-brand-50/60 p-4 text-sm dark:bg-brand-500/5">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-700/70 dark:text-brand-300/70">
                Önizleme
              </div>
              <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                {previewTemplate(template.bodyText, vars)}
              </div>
            </div>
          </>
        )}

        {estimate && (
          <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 text-sm dark:border-white/10">
            <div>
              <span className="font-semibold tabular-nums">{estimate.recipients}</span>
              <span className="text-slate-400"> alıcı</span>
            </div>
            <div className="text-slate-300">·</div>
            <div>
              ~<span className="font-semibold tabular-nums">{estimate.days}</span>
              <span className="text-slate-400"> günde tamamlanır (günlük limitle)</span>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
            />
            <Clock size={15} /> İleri tarihe zamanla
          </label>
          {scheduleEnabled && (
            <input
              type="datetime-local"
              className="input-base mt-3"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onBack}>
            Vazgeç
          </Button>
          <Button onClick={create} disabled={!canCreate || busy || (scheduleEnabled && !scheduleAt)}>
            {busy ? <Spinner /> : scheduleEnabled ? <Clock size={16} /> : <Send size={16} />}{' '}
            {scheduleEnabled ? 'Zamanla' : 'Oluştur'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

const recipientTone: Record<RecipientStatus, Parameters<typeof Badge>[0]['tone']> = {
  pending: 'slate',
  sent: 'green',
  failed: 'red',
  skipped: 'amber',
  optout: 'slate'
}
const recipientLabel: Record<RecipientStatus, string> = {
  pending: 'Bekliyor',
  sent: 'Gönderildi',
  failed: 'Başarısız',
  skipped: 'Atlandı',
  optout: 'Engelli'
}

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([])
  const [note, setNote] = useState<string | null>(null)

  const load = () =>
    octo.campaigns.get(id).then((d) => {
      setCampaign(d.campaign)
      setRecipients(d.recipients)
    })
  useEffect(() => {
    load()
    return octo.campaigns.onProgress((p) => {
      if (p.campaignId === id) {
        if (p.note) setNote(p.note)
        load()
      }
    })
  }, [id])

  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const retry = async () => {
    setBusy(true)
    try {
      const n = await octo.campaigns.retryFailed(id)
      toast(n > 0 ? `${n} başarısız tekrar kuyruğa alındı` : 'Tekrar denenecek mesaj yok', n > 0 ? 'success' : 'info')
      load()
    } finally {
      setBusy(false)
    }
  }
  const exportResults = async () => {
    const path = await octo.campaigns.exportResults(id)
    if (path) toast('Sonuçlar dışa aktarıldı', 'success')
  }
  const del = async () => {
    if (!campaign) return
    if (!window.confirm(`"${campaign.name}" kampanyası ve tüm alıcı kayıtları silinsin mi?`)) return
    await octo.campaigns.delete(id)
    toast('Kampanya silindi', 'success')
    onBack()
  }

  if (!campaign) return <div className="p-6 text-slate-400">Yükleniyor…</div>
  const s = campaign.stats
  const done = s.sent + s.failed + s.skipped + s.optout
  const running = campaign.status === 'running'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
        <ArrowLeft size={16} /> Kampanyalar
      </button>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{campaign.name}</h1>
            {statusBadge(campaign.status)}
          </div>
          <div className="flex gap-2">
            {running ? (
              <Button variant="outline" onClick={() => octo.campaigns.pause(id)}>
                <Pause size={16} /> Duraklat
              </Button>
            ) : campaign.status === 'paused' || campaign.status === 'halted' ? (
              <Button onClick={() => octo.campaigns.resume(id)}>
                <Play size={16} /> Devam et
              </Button>
            ) : campaign.status === 'draft' ? (
              <Button onClick={() => octo.campaigns.start(id)}>
                <Play size={16} /> Başlat
              </Button>
            ) : null}
            {s.failed > 0 && (
              <Button variant="outline" onClick={retry} disabled={busy}>
                {busy ? <Spinner /> : <RotateCcw size={16} />} Başarısızları dene
              </Button>
            )}
            <Button variant="ghost" onClick={exportResults}>
              <Download size={16} /> Dışa aktar
            </Button>
            <Button variant="ghost" onClick={del}>
              <Trash2 size={16} /> Sil
            </Button>
          </div>
        </div>

        <ProgressBar value={pct(done, s.total)} />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Counter label="Gönderildi" value={s.sent} tone="text-brand-600" />
          <Counter label="Bekleyen" value={s.pending} tone="text-slate-500" />
          <Counter label="Başarısız" value={s.failed} tone="text-rose-500" />
          <Counter label="Engelli" value={s.optout} tone="text-slate-400" />
          <Counter label="Toplam" value={s.total} tone="text-slate-500" />
        </div>

        {campaign.status === 'halted' && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            ⚠️ Kampanya durduruldu
            {note === 'banned'
              ? ' — Meta hesap kısıtlaması/geçersiz token. Hesap ayarlarını kontrol et.'
              : note === 'media_error'
                ? ' — şablon görseli yüklenemedi.'
                : note === 'no_template'
                  ? ' — şablon seçilmemiş.'
                  : ''}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-500 dark:border-white/5">
          Alıcılar
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {recipients.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium">{r.name || '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-500">{r.phone}</td>
                  <td className="px-4 py-2.5 text-slate-400">{r.error || ''}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Badge tone={recipientTone[r.status]}>{recipientLabel[r.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`text-base font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </span>
  )
}
