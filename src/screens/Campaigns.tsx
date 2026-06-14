import { useEffect, useMemo, useState } from 'react'
import { Plus, Send, Play, Pause, ArrowLeft, Paperclip, X, Megaphone, RotateCcw, Download, Check, CheckCheck, Save, Clock, Workflow as WorkflowIcon, Trash2 } from 'lucide-react'
import type {
  Campaign,
  CampaignRecipient,
  ListDTO,
  MediaType,
  RecipientStatus,
  CampaignEstimate,
  CampaignContentType,
  Tag,
  Template,
  AudienceFilter,
  Sequence,
  SequenceStep,
  SequenceStepCondition
} from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { Card, SectionTitle, Button, Badge, EmptyState, TextInput, TextArea, Field, ProgressBar, Spinner } from '../components/ui'
import { pct, cn } from '../lib/format'
import { statusBadge } from './Dashboard'

type View = { t: 'list' } | { t: 'create' } | { t: 'detail'; id: number }

function mediaTypeOf(path: string): MediaType {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video'
  return 'document'
}

function previewRender(t: string): string {
  const withVars = t.replace(/\{(ad|name|isim)\}/gi, 'Ahmet')
  return withVars.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, inner: string) => inner.split('|')[0])
}

export function Campaigns() {
  const [view, setView] = useState<View>({ t: 'list' })
  const [camps, setCamps] = useState<Campaign[]>([])
  const [listTab, setListTab] = useState<'campaigns' | 'sequences'>('campaigns')

  const reload = () => octo.campaigns.all().then(setCamps)
  useEffect(() => {
    reload()
    return octo.campaigns.onProgress(() => reload())
  }, [])

  if (view.t === 'create') return <Composer onBack={() => setView({ t: 'list' })} onCreated={(id) => setView({ t: 'detail', id })} />
  if (view.t === 'detail') return <Detail id={view.id} onBack={() => { reload(); setView({ t: 'list' }) }} />

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle
        title={listTab === 'campaigns' ? 'Kampanyalar' : 'Diziler (drip)'}
        subtitle={listTab === 'campaigns' ? 'Toplu mesaj kampanyalarını oluştur ve yönet' : 'Çok adımlı otomatik takip dizileri'}
        action={
          listTab === 'campaigns' ? (
            <Button onClick={() => setView({ t: 'create' })}>
              <Plus size={16} /> Yeni kampanya
            </Button>
          ) : undefined
        }
      />

      <div className="flex w-fit gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-white/5">
        {(['campaigns', 'sequences'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setListTab(t)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition',
              listTab === t ? 'bg-white text-slate-800 shadow-sm dark:bg-[#111b21] dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            )}
          >
            {t === 'campaigns' ? 'Kampanyalar' : 'Diziler'}
          </button>
        ))}
      </div>

      {listTab === 'sequences' ? (
        <Sequences />
      ) : camps.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={28} />}
          title="Henüz kampanya yok"
          subtitle="Bir liste seç, mesajını yaz ve güvenli gönderime başla."
          action={<Button onClick={() => setView({ t: 'create' })}>Kampanya oluştur</Button>}
        />
      ) : (
        <div className="space-y-3">
          {camps.map((c) => {
            const done = c.stats.sent + c.stats.failed + c.stats.skipped + c.stats.optout
            return (
              <Card
                key={c.id}
                className="cursor-pointer p-5 transition hover:ring-1 hover:ring-brand-500/30"

              >
                <div onClick={() => setView({ t: 'detail', id: c.id })}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {statusBadge(c.status)}
                    </div>
                    <span className="text-sm tabular-nums text-slate-500">
                      {c.stats.sent}/{c.stats.total}
                    </span>
                  </div>
                  <ProgressBar value={pct(done, c.stats.total)} />
                </div>
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
  const [name, setName] = useState('')
  const [listId, setListId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [media, setMedia] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<CampaignEstimate | null>(null)
  const [busy, setBusy] = useState(false)
  const [contentType, setContentType] = useState<CampaignContentType>('message')
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollSelectable, setPollSelectable] = useState(1)
  const [vcardName, setVcardName] = useState('')
  const [vcardPhone, setVcardPhone] = useState('')
  const [audienceType, setAudienceType] = useState<'list' | 'tag'>('list')
  const [tagId, setTagId] = useState<number | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const toast = useToast()

  useEffect(() => {
    octo.lists.all().then((ls) => {
      setLists(ls)
      setListId((cur) => cur ?? ls[0]?.id ?? null)
    })
    octo.tags.list().then(setTags)
    octo.templates.list().then(setTemplates)
  }, [])
  useEffect(() => {
    if (audienceType === 'list' && listId) octo.campaigns.estimate(listId).then(setEstimate)
    else setEstimate(null)
  }, [listId, audienceType])

  const saveTemplate = async () => {
    if (!message.trim()) return
    const t = await octo.templates.save({ name: name.trim() || 'Şablon', body: message })
    setTemplates((ts) => [t, ...ts.filter((x) => x.id !== t.id)])
    toast('Şablon kaydedildi', 'success')
  }

  const attach = async () => {
    const f = await octo.dialog.openFile([
      { name: 'Medya', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'pdf', 'docx', 'xlsx'] }
    ])
    if (f) setMedia(f)
  }

  const insertVar = (token: string) => setMessage((m) => m + token)

  const cleanPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean)
  const pollValid = pollQuestion.trim().length > 0 && cleanPollOptions.length >= 2
  const vcardValid = vcardName.trim().length > 0 && vcardPhone.replace(/\D/g, '').length >= 8
  const contentValid =
    contentType === 'message' ? message.trim().length > 0 : contentType === 'poll' ? pollValid : vcardValid
  const audienceValid = audienceType === 'list' ? !!listId : !!tagId
  const canCreate = audienceValid && name.trim().length > 0 && contentValid

  const create = async () => {
    if (!canCreate) return
    setBusy(true)
    try {
      const camp = await octo.campaigns.create({
        name: name.trim(),
        messageTemplate: contentType === 'message' ? message : '',
        listId: audienceType === 'list' ? listId : null,
        tagId: audienceType === 'tag' ? tagId : null,
        audienceFilter,
        scheduledAt: scheduleEnabled && scheduleAt ? new Date(scheduleAt).getTime() : null,
        mediaPath: contentType === 'message' ? media : null,
        mediaType: contentType === 'message' && media ? mediaTypeOf(media) : null,
        contentType,
        poll:
          contentType === 'poll'
            ? { question: pollQuestion.trim(), options: cleanPollOptions, selectable: pollSelectable }
            : null,
        vcard:
          contentType === 'vcard'
            ? { name: vcardName.trim(), phone: vcardPhone.replace(/\D/g, '') }
            : null
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
      <SectionTitle title="Yeni kampanya" subtitle="Liste seç, mesajını yaz, önizle ve oluştur" />

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
            <select className="input-base" value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value as AudienceFilter)}>
              <option value="all">Tüm kişiler</option>
              <option value="not_replied">Sadece yanıt vermeyenler</option>
              <option value="replied">Sadece yanıt verenler</option>
            </select>
          </div>
        </Field>

        <Field label="İçerik tipi">
          <div className="flex gap-2">
            {([['message', 'Mesaj'], ['poll', 'Anket'], ['vcard', 'Kartvizit']] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setContentType(v)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm transition',
                  contentType === v
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'border-slate-300 text-slate-500 dark:border-white/10'
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>

        {contentType === 'message' && (
          <>
            {templates.length > 0 && (
              <Field label="Şablondan yükle">
                <select
                  className="input-base"
                  value=""
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === Number(e.target.value))
                    if (t) setMessage(t.body)
                  }}
                >
                  <option value="">— şablon seç —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label="Mesaj"
              hint="Değişken: {ad} · Spintax: {Merhaba|Selam} — her mesaj rastgele seçer"
            >
              <TextArea rows={5} placeholder="{Merhaba|Selam} {ad}, ..." value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Ekle:</span>
              {['{ad}', '{Merhaba|Selam}'].map((t) => (
                <button
                  key={t}
                  onClick={() => insertVar(t)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {t}
                </button>
              ))}
              <div className="flex-1" />
              {media ? (
                <span className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 text-xs dark:bg-white/5">
                  <Paperclip size={13} /> {media.split(/[\\/]/).pop()}
                  <button onClick={() => setMedia(null)} className="text-slate-400 hover:text-rose-500">
                    <X size={13} />
                  </button>
                </span>
              ) : (
                <Button variant="outline" onClick={attach}>
                  <Paperclip size={15} /> Medya ekle
                </Button>
              )}
              {message.trim() && (
                <Button variant="ghost" onClick={saveTemplate}>
                  <Save size={15} /> Şablon kaydet
                </Button>
              )}
            </div>

            {message.trim() && (
              <div className="rounded-xl bg-brand-50/60 p-4 text-sm dark:bg-brand-500/5">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-700/70 dark:text-brand-300/70">
                  Önizleme
                </div>
                <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{previewRender(message)}</div>
              </div>
            )}
          </>
        )}

        {contentType === 'poll' && (
          <div className="space-y-3">
            <Field label="Anket sorusu">
              <TextInput placeholder="Hangi ürünü tercih edersin?" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
            </Field>
            <Field label="Seçenekler (en az 2)">
              <div className="space-y-2">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <TextInput
                      placeholder={`Seçenek ${i + 1}`}
                      value={opt}
                      onChange={(e) => setPollOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions((o) => o.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 12 && (
                  <Button variant="ghost" onClick={() => setPollOptions((o) => [...o, ''])}>
                    <Plus size={15} /> Seçenek ekle
                  </Button>
                )}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={pollSelectable > 1}
                onChange={(e) => setPollSelectable(e.target.checked ? 12 : 1)}
              />
              Çoklu seçime izin ver
            </label>
          </div>
        )}

        {contentType === 'vcard' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kartvizit adı">
              <TextInput placeholder="Alsa Yazılım" value={vcardName} onChange={(e) => setVcardName(e.target.value)} />
            </Field>
            <Field label="Kartvizit numarası" hint="Ülke koduyla">
              <TextInput placeholder="905551234567" value={vcardPhone} onChange={(e) => setVcardPhone(e.target.value)} />
            </Field>
          </div>
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
              <span className="text-slate-400"> günde tamamlanır (günlük güvenli limitle)</span>
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

  if (!campaign) return <div className="p-6 text-slate-400">Yükleniyor…</div>
  const s = campaign.stats
  const done = s.sent + s.failed + s.skipped + s.optout
  const running = campaign.status === 'running'
  const replyRate = s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0
  const readRate = s.sent > 0 ? Math.round((s.read / s.sent) * 100) : 0

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
          </div>
        </div>

        <ProgressBar value={pct(done, s.total)} />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Counter label="Gönderildi" value={s.sent} tone="text-brand-600" />
          <Counter label="Bekleyen" value={s.pending} tone="text-slate-500" />
          <Counter label="Başarısız" value={s.failed} tone="text-rose-500" />
          <Counter label="Atlandı" value={s.skipped} tone="text-amber-500" />
          <Counter label="Engelli" value={s.optout} tone="text-slate-400" />
          <Counter label="Toplam" value={s.total} tone="text-slate-500" />
        </div>

        {/* delivery funnel + engagement KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FunnelStat label="İletildi" value={s.delivered} of={s.sent} tone="text-sky-600" />
          <FunnelStat label="Okundu" value={s.read} of={s.sent} tone="text-indigo-600" />
          <FunnelStat label="Yanıtladı" value={s.replied} of={s.sent} tone="text-brand-600" />
          <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
            <div className="text-xs text-slate-400">Yanıt oranı</div>
            <div className={cn('text-lg font-semibold tabular-nums', replyRate >= 30 ? 'text-brand-600' : replyRate > 0 ? 'text-amber-500' : 'text-slate-400')}>
              %{replyRate}
            </div>
            <div className="text-[11px] text-slate-400">okunma %{readRate}</div>
          </div>
        </div>

        {campaign.status === 'halted' && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            ⚠️ Kampanya durduruldu{note === 'banned' ? ' — olası ban sinyali algılandı' : ''}. Numaranı kontrol et,
            güvenliyse &quot;Devam et&quot;.
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
                  <td className="px-2 py-2.5"><DeliveryTicks r={r} /></td>
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

function FunnelStat({ label, value, of, tone }: { label: string; value: number; of: number; tone: string }) {
  const pctv = of > 0 ? Math.round((value / of) * 100) : 0
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={cn('text-lg font-semibold tabular-nums', tone)}>{value}</div>
      <div className="text-[11px] text-slate-400">%{pctv}</div>
    </div>
  )
}

function DeliveryTicks({ r }: { r: CampaignRecipient }) {
  if (r.repliedAt)
    return <span className="inline-flex items-center gap-1 text-xs text-brand-600" title="Yanıtladı">↩ yanıt</span>
  if (r.readAt) return <CheckCheck size={15} className="text-sky-500" />
  if (r.deliveredAt) return <CheckCheck size={15} className="text-slate-400" />
  if (r.status === 'sent') return <Check size={15} className="text-slate-400" />
  return null
}

// ---------- Sequences (drip) ----------

function Sequences() {
  const [seqs, setSeqs] = useState<Sequence[]>([])
  const [editing, setEditing] = useState<Sequence | 'new' | null>(null)
  const load = () => octo.sequences.list().then(setSeqs)
  useEffect(() => {
    load()
    return octo.sequences.onProgress(() => load())
  }, [])

  if (editing)
    return (
      <SequenceEditor
        seq={editing === 'new' ? null : editing}
        onClose={() => {
          setEditing(null)
          load()
        }}
      />
    )

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Yeni dizi
        </Button>
      </div>
      {seqs.length === 0 ? (
        <EmptyState
          icon={<WorkflowIcon size={28} />}
          title="Henüz dizi yok"
          subtitle="Çok adımlı otomatik takip: yanıt gelene kadar zamanlı mesajlar gönderir, yanıt gelince durur."
          action={<Button onClick={() => setEditing('new')}>Dizi oluştur</Button>}
        />
      ) : (
        seqs.map((s) => <SequenceCard key={s.id} seq={s} onEdit={() => setEditing(s)} onChanged={load} />)
      )}
    </div>
  )
}

function SequenceCard({ seq, onEdit, onChanged }: { seq: Sequence; onEdit: () => void; onChanged: () => void }) {
  const [lists, setLists] = useState<ListDTO[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [listSel, setListSel] = useState<number | null>(null)
  const [tagSel, setTagSel] = useState<number | null>(null)
  const toast = useToast()

  useEffect(() => {
    octo.lists.all().then((ls) => {
      setLists(ls)
      setListSel(ls[0]?.id ?? null)
    })
    octo.tags.list().then((ts) => {
      setTags(ts)
      setTagSel(ts[0]?.id ?? null)
    })
  }, [])

  const enroll = async (source: { listId?: number; tagId?: number }) => {
    const n = await octo.sequences.enroll(seq.id, source)
    toast(n > 0 ? `${n} kişi diziye eklendi` : 'Eklenecek yeni kişi yok', n > 0 ? 'success' : 'info')
    setEnrollOpen(false)
    onChanged()
  }
  const del = async () => {
    if (window.confirm('Dizi ve kayıtları silinsin mi?')) {
      await octo.sequences.delete(seq.id)
      onChanged()
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">{seq.name}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {seq.steps.length} adım · aktif {seq.stats.active} · bitti {seq.stats.done} · durdu{' '}
            {seq.stats.stopped}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEnrollOpen((o) => !o)}>
            <Plus size={15} /> Kişi ekle
          </Button>
          <Button variant="ghost" onClick={onEdit}>
            Düzenle
          </Button>
          <button onClick={del} className="text-slate-400 hover:text-rose-500">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {enrollOpen && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10 sm:grid-cols-2">
          <div className="flex gap-2">
            <select className="input-base" value={listSel ?? ''} onChange={(e) => setListSel(Number(e.target.value))}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.count})
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => listSel && enroll({ listId: listSel })} disabled={!listSel}>
              Listeden
            </Button>
          </div>
          <div className="flex gap-2">
            <select className="input-base" value={tagSel ?? ''} onChange={(e) => setTagSel(Number(e.target.value))}>
              {tags.length === 0 && <option value="">Etiket yok</option>}
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.count})
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => tagSel && enroll({ tagId: tagSel })} disabled={!tagSel}>
              Etiketten
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function SequenceEditor({ seq, onClose }: { seq: Sequence | null; onClose: () => void }) {
  const [name, setName] = useState(seq?.name ?? '')
  const [steps, setSteps] = useState<SequenceStep[]>(
    seq?.steps?.length ? seq.steps : [{ ord: 0, body: '', delayHours: 0, condition: 'always' }]
  )
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const setStep = (i: number, patch: Partial<SequenceStep>) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    const clean = steps.filter((s) => s.body.trim())
    if (!name.trim() || clean.length === 0) return
    setBusy(true)
    try {
      await octo.sequences.save({ id: seq?.id, name: name.trim(), steps: clean })
      toast('Dizi kaydedildi', 'success')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
        <ArrowLeft size={16} /> Diziler
      </button>
      <Card className="space-y-4 p-6">
        <Field label="Dizi adı">
          <TextInput placeholder="Lead takibi" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">{i + 1}. adım</span>
                {steps.length > 1 && (
                  <button onClick={() => setSteps((st) => st.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500">
                    <X size={15} />
                  </button>
                )}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Field label={i === 0 ? 'Gecikme (saat)' : 'Önceki adımdan sonra (saat)'}>
                  <TextInput
                    type="number"
                    value={s.delayHours}
                    onChange={(e) => setStep(i, { delayHours: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Koşul">
                  <select
                    className="input-base"
                    value={s.condition}
                    onChange={(e) => setStep(i, { condition: e.target.value as SequenceStepCondition })}
                  >
                    <option value="always">Her zaman gönder</option>
                    <option value="if_no_reply">Yanıt yoksa gönder</option>
                  </select>
                </Field>
              </div>
              <TextArea
                rows={2}
                placeholder="Mesaj ({ad} kullanılabilir)"
                value={s.body}
                onChange={(e) => setStep(i, { body: e.target.value })}
              />
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => setSteps((s) => [...s, { ord: s.length, body: '', delayHours: 48, condition: 'if_no_reply' }])}
          >
            <Plus size={15} /> Adım ekle
          </Button>
        </div>

        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          Dizi, kişi eklendikten sonra adımları sırayla gönderir. <b>"Yanıt yoksa gönder"</b> adımı,
          kişi o ana kadar yanıt verdiyse <b>atlanır ve dizi durur</b> (pause-on-reply). Engellenenlere
          gönderilmez.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy ? <Spinner /> : <Save size={16} />} Kaydet
          </Button>
        </div>
      </Card>
    </div>
  )
}
