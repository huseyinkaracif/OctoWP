import { useEffect, useState } from 'react'
import type { WAStatus } from '@shared/types'
import { octo } from './lib/ipc'
import { Sidebar, type NavKey } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Dashboard } from './screens/Dashboard'
import { Account } from './screens/Account'
import { Contacts } from './screens/Contacts'
import { Campaigns } from './screens/Campaigns'
import { Settings } from './screens/Settings'
import { Logs } from './screens/Logs'

export default function App() {
  const [route, setRoute] = useState<NavKey>('dashboard')
  const [wa, setWa] = useState<WAStatus>({ state: 'disconnected', phone: null, name: null, qr: null, error: null })

  useEffect(() => {
    octo.wa.getStatus().then(setWa)
    return octo.wa.onStatus(setWa)
  }, [])

  return (
    <div className="flex h-full bg-slate-100 dark:bg-[#0b141a]">
      <Sidebar route={route} setRoute={setRoute} wa={wa} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar wa={wa} />
        <main className="flex-1 overflow-y-auto p-6">
          {route === 'dashboard' && <Dashboard wa={wa} go={setRoute} />}
          {route === 'account' && <Account wa={wa} />}
          {route === 'contacts' && <Contacts />}
          {route === 'campaigns' && <Campaigns />}
          {route === 'settings' && <Settings />}
          {route === 'logs' && <Logs />}
        </main>
      </div>
    </div>
  )
}
