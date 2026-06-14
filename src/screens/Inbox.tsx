import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Send, MessageSquare, Bot, Plus, Trash2, X } from 'lucide-react'
import type {
  ConversationSummary,
  ConversationMessage,
  AutoReplyRule,
  MatchType
} from '@shared/types'
import { octo } from '../lib/ipc'
import { useToast } from '../lib/toast'
import { Card, SectionTitle, Button, Badge, EmptyState, TextInput, TextArea, Field, Spinner } from '../components/ui'
import { displayPhone, cn } from '../lib/format'

type Tab = 'chats' | 'autoreply'

export function Inbox() {
  const [tab, setTab] = useState<Tab>('chats')
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionTitle title="Gelen Kutusu" subtitle="Gelen yanıtlar ve otomatik cevaplar" />
      <div className="flex w-fit gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-white/5">
        <TabBtn active={tab === 'chats'} onClick={() => setTab('chats')}>
          <MessageSquare size={15} /> Sohbetler
        </TabBtn>
        <TabBtn active={tab === 'autoreply'} onClick={() => setTab('autoreply')}>
          <Bot size={15} /> Oto-yanıt
        </TabBtn>
      </div>
      {tab === 'chats' ? <Chats /> : <AutoReply />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition',
        active ? 'bg-white text-slate-800 shadow-sm dark:bg-[#111b21] dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
      )}
    >
      {children}
    </button>
  )
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

function Chats() {
  const [convos, setConvos] = useState<ConversationSummary[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [thread, setThread] = useState<ConversationMessage[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const toast = useToast()
  const endRef = useRef<HTMLDivElement>(null)

  const loadConvos = () => octo.inbox.conversations().then(setConvos)
  const loadThread = (phone: string) => octo.inbox.conversation(phone).then(setThread)

  useEffect(() => {
    loadConvos()
    return octo.inbox.onMessage(() => {
      loadConvos()
      setActive((cur) => {
        if (cur) loadThread(cur)
        return cur
      })
    })
  }, [])
  useEffect(() => {
    if (active) loadThread(active)
    else setThread([])
  }, [active])
  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [thread])

  const send = async () => {
    if (!active || !reply.trim()) return
    setSending(true)
    try {
      const res = await octo.inbox.reply(active, reply.trim())
      if (res.ok) {
        setReply('')
        loadThread(active)
      } else toast('Gönderilemedi (bağlı mısın?)', 'error')
    } finally {
      setSending(false)
    }
  }

  if (convos.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare size={28} />}
        title="Henüz gelen mesaj yok"
        subtitle="Birisi yanıt verdiğinde burada görünür. Yanıtlar kampanya analitiğine de işlenir."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      <Card className="max-h-[64vh] overflow-y-auto p-1.5">
        {convos.map((c) => (
          <button
            key={c.phone}
            onClick={() => setActive(c.phone)}
            className={cn(
              'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition',
              active === c.phone ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-slate-100 dark:hover:bg-white/5'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="truncate font-medium">{c.name || displayPhone(c.phone)}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{fmtTime(c.lastTs)}</span>
            </div>
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">{c.lastText}</span>
          </button>
        ))}
      </Card>

      <Card className="flex max-h-[64vh] flex-col">
        {active ? (
          <>
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-medium dark:border-white/5">
              {convos.find((c) => c.phone === active)?.name || displayPhone(active)}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {thread.map((m, i) => (
                <div key={i} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                      m.direction === 'out'
                        ? 'bg-brand-500 text-white'
                        : 'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-100'
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className={cn('mt-0.5 text-[10px]', m.direction === 'out' ? 'text-white/70' : 'text-slate-400')}>
                      {fmtTime(m.ts)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-3 dark:border-white/5">
              <TextInput
                placeholder="Yanıt yaz…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <Button onClick={send} disabled={sending || !reply.trim()}>
                {sending ? <Spinner /> : <Send size={16} />}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Soldan bir sohbet seç
          </div>
        )}
      </Card>
    </div>
  )
}

function AutoReply() {
  const [rules, setRules] = useState<AutoReplyRule[]>([])
  const toast = useToast()
  const load = () => octo.autoreply.listRules().then(setRules)
  useEffect(() => {
    load()
  }, [])

  const greeting = rules.find((r) => r.kind === 'greeting')
  const away = rules.find((r) => r.kind === 'away')
  const keywords = rules.filter((r) => r.kind === 'keyword')

  const saveSpecial = async (kind: 'greeting' | 'away', existing: AutoReplyRule | undefined, reply: string, enabled: boolean) => {
    await octo.autoreply.saveRule({ id: existing?.id, kind, reply: reply || ' ', enabled })
    toast('Kaydedildi', 'success')
    load()
  }
  const del = async (id: number) => {
    await octo.autoreply.deleteRule(id)
    load()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Gelen mesajlara otomatik yanıt. Öncelik: anahtar kelime → karşılama (ilk mesaj) → müsait değil
        (yedek). Kişi başına 5 dk soğuma (döngü önleme); engellenenlere asla yanıt verilmez.
      </p>

      <SpecialRule
        title="Karşılama (greeting)"
        hint="Bir kişiden gelen İLK mesajda gönderilir"
        rule={greeting}
        onSave={(reply, enabled) => saveSpecial('greeting', greeting, reply, enabled)}
      />
      <SpecialRule
        title="Müsait değil (away)"
        hint="Hiçbir kurala uymayan mesajlara yedek yanıt"
        rule={away}
        onSave={(reply, enabled) => saveSpecial('away', away, reply, enabled)}
      />

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">Anahtar kelime kuralları</span>
        </div>
        {keywords.length === 0 && <p className="mb-3 text-sm text-slate-400">Henüz kural yok</p>}
        <div className="space-y-2">
          {keywords.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="blue">{r.matchType}</Badge>
                  {r.keywords.map((k) => (
                    <Badge key={k}>{k}</Badge>
                  ))}
                  {!r.enabled && <Badge tone="amber">kapalı</Badge>}
                </div>
                <div className="mt-1 truncate text-sm text-slate-500">→ {r.reply}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={r.enabled}
                    onChange={(e) => octo.autoreply.saveRule({ ...r, enabled: e.target.checked }).then(load)}
                  />
                </label>
                <button onClick={() => del(r.id)} className="text-slate-400 hover:text-rose-500">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <KeywordForm onAdd={load} />
      </Card>
    </div>
  )
}

function SpecialRule({
  title,
  hint,
  rule,
  onSave
}: {
  title: string
  hint: string
  rule: AutoReplyRule | undefined
  onSave: (reply: string, enabled: boolean) => void
}) {
  const [reply, setReply] = useState('')
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    setReply(rule?.reply?.trim() ?? '')
    setEnabled(rule?.enabled ?? false)
  }, [rule])
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-slate-400">{hint}</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Aktif
        </label>
      </div>
      <TextArea rows={2} placeholder="Otomatik yanıt metni ({ad} kullanılabilir)" value={reply} onChange={(e) => setReply(e.target.value)} />
      <div className="mt-2 flex justify-end">
        <Button onClick={() => onSave(reply, enabled)}>Kaydet</Button>
      </div>
    </Card>
  )
}

function KeywordForm({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const [matchType, setMatchType] = useState<MatchType>('contains')
  const [reply, setReply] = useState('')
  const toast = useToast()

  const add = async () => {
    const keywords = kw.split(',').map((x) => x.trim()).filter(Boolean)
    if (keywords.length === 0 || !reply.trim()) return
    await octo.autoreply.saveRule({ kind: 'keyword', keywords, matchType, reply: reply.trim(), enabled: true })
    toast('Kural eklendi', 'success')
    setKw('')
    setReply('')
    setOpen(false)
    onAdd()
  }

  if (!open)
    return (
      <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>
        <Plus size={16} /> Kural ekle
      </Button>
    )

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Yeni anahtar kelime kuralı</span>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Anahtar kelimeler (virgülle)">
          <TextInput placeholder="fiyat, ücret, kaç para" value={kw} onChange={(e) => setKw(e.target.value)} />
        </Field>
        <Field label="Eşleşme">
          <select className="input-base" value={matchType} onChange={(e) => setMatchType(e.target.value as MatchType)}>
            <option value="contains">İçerir</option>
            <option value="exact">Eşittir</option>
            <option value="starts">İle başlar</option>
          </select>
        </Field>
      </div>
      <Field label="Yanıt">
        <TextArea rows={2} placeholder="Fiyat listemiz: ..." value={reply} onChange={(e) => setReply(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button onClick={add}>Ekle</Button>
      </div>
    </div>
  )
}
