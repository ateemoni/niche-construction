'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

const VAT_RATE = 16
const catLabels: any = {
  labor: 'Type of labor',
  materials: 'Material name',
  tools: 'Tool name',
  transport: 'Route / purpose',
  permits: 'Permit type'
}
const catColors: any = {
  labor: 'bg-amber-100 text-amber-800',
  materials: 'bg-green-100 text-green-800',
  tools: 'bg-blue-100 text-blue-800',
  transport: 'bg-gray-100 text-gray-600',
  permits: 'bg-gray-100 text-gray-600'
}

function fmt(n: number) {
  return 'KSh ' + Math.round(n).toLocaleString()
}

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<any>({
    name: '', budget: '', client: '', location: '', contractor: '', start_date: '', end_date: ''
  })
  const [expForm, setExpForm] = useState<any>({ cat: 'labor', item: '', vendor: '', amount: '' })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/auth')
      else { setUser(data.user); loadProject(data.user.id) }
    })
  }, [])

  async function loadProject(userId: string) {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      setProject(data)
      setForm({
        name: data.name || '',
        budget: data.budget || '',
        client: data.client || '',
        location: data.location || '',
        contractor: data.contractor || '',
        start_date: data.start_date || '',
        end_date: data.end_date || ''
      })
      loadExpenses(data.id)
    }
  }

  async function loadExpenses(projectId: string) {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (data) setExpenses(data)
  }

  async function saveProject() {
    setSaving(true)
    if (project) {
      await supabase.from('projects').update({
        name: form.name,
        budget: parseFloat(form.budget) || 0,
        client: form.client,
        location: form.location,
        contractor: form.contractor,
        start_date: form.start_date || null,
        end_date: form.end_date || null
      }).eq('id', project.id)
    } else {
      const { data } = await supabase.from('projects').insert({
        user_id: user.id,
        name: form.name,
        budget: parseFloat(form.budget) || 0,
        client: form.client,
        location: form.location,
        contractor: form.contractor,
        start_date: form.start_date || null,
        end_date: form.end_date || null
      }).select().single()
      if (data) { setProject(data); loadExpenses(data.id) }
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function addExpense() {
    if (!project) return alert('Save your project first.')
    if (!expForm.item || !expForm.amount) return
    const { data } = await supabase.from('expenses').insert({
      project_id: project.id,
      user_id: user.id,
      category: expForm.cat,
      item: expForm.item,
      vendor: expForm.vendor || null,
      amount: parseFloat(expForm.amount)
    }).select().single()
    if (data) setExpenses([...expenses, data])
    setExpForm({ cat: expForm.cat, item: '', vendor: '', amount: '' })
  }

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(expenses.filter((e: any) => e.id !== id))
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const budget = parseFloat(form.budget) || 0
  const baseSpent = expenses.reduce((s: number, e: any) => s + parseFloat(e.amount), 0)
  const taxAmt = baseSpent * VAT_RATE / 100
  const totalSpent = baseSpent + taxAmt
  const remaining = budget - totalSpent
  const spentPct = budget > 0 ? Math.min(100, Math.round(totalSpent / budget * 100)) : 0
  const completion = Math.min(100, Math.round(spentPct * 0.9))

  const taxByCategory = expenses.reduce((acc: any, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 font-bold text-lg">N</div>
          <div className="flex-1">
            <h1 className="text-lg font-medium text-gray-900">Niche Construction</h1>
            <p className="text-sm text-gray-500">Project Manager</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full border ${spentPct > 90 ? 'bg-red-50 text-red-600 border-red-200' : spentPct > 70 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
            {spentPct > 90 ? 'Over budget risk' : spentPct > 70 ? 'Watch spend' : 'On budget'}
          </span>
          <button onClick={signOut} className="text-sm text-gray-400 hover:text-gray-600">Sign out</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total budget', value: fmt(budget), color: 'text-green-600' },
            { label: 'Spent', value: fmt(totalSpent), color: 'text-amber-600' },
            { label: 'Remaining', value: fmt(remaining), color: remaining < 0 ? 'text-red-600' : remaining < budget * 0.1 ? 'text-amber-600' : 'text-green-600' },
            { label: 'Tax deducted', value: fmt(taxAmt), color: 'text-gray-700' }
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className={`text-lg font-medium ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Spend vs completion</span>
            <span>{spentPct}% spent · {completion}% done</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2 mb-1 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${spentPct > 90 ? 'bg-red-400' : spentPct > 70 ? 'bg-amber-400' : 'bg-amber-300'}`} style={{ width: spentPct + '%' }} />
          </div>
          <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: completion + '%' }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 mb-4">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <span className="text-sm font-medium flex-1">Project setup</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${saved ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{saved ? 'Saved' : project ? 'Up to date' : 'Unsaved'}</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: 'Project name', key: 'name', type: 'text', placeholder: 'e.g. Westlands Office' },
                { label: 'Total budget (KSh)', key: 'budget', type: 'number', placeholder: 'e.g. 5000000' },
                { label: 'Client / owner', key: 'client', type: 'text', placeholder: 'Client name' },
                { label: 'Location', key: 'location', type: 'text', placeholder: 'Site address' },
                { label: 'Contractor', key: 'contractor', type: 'text', placeholder: 'Contractor name' },
                { label: 'Start date', key: 'start_date', type: 'date', placeholder: '' },
                { label: 'Expected end date', key: 'end_date', type: 'date', placeholder: '' }
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block">{f.label}</label>
                  <input
                    type={f.type}
                    value={form[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 bg-gray-50"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <button
                onClick={saveProject}
                disabled={saving}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${saved ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-900 text-white hover:bg-gray-700'}`}
              >
                {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save project'}
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                Completion auto-updates from spend — {completion}%
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 mb-4">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <span className="text-sm font-medium flex-1">Expenditures</span>
            <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">{expenses.length} item{expenses.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-5">
            {expenses.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No expenses yet. Add one below.</p>
            ) : (
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left pb-2 font-normal">Category</th>
                    <th className="text-left pb-2 font-normal">Item</th>
                    <th className="text-left pb-2 font-normal">Vendor</th>
                    <th className="text-right pb-2 font-normal">Amount</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e: any) => (
                    <tr key={e.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${catColors[e.category]}`}>{e.category}</span></td>
                      <td className="py-2 text-gray-700">{e.item}</td>
                      <td className="py-2 text-gray-400">{e.vendor || '—'}</td>
                      <td className="py-2 text-right font-medium">{fmt(parseFloat(e.amount))}</td>
                      <td className="py-2 text-right"><button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-100">
              <select
                value={expForm.cat}
                onChange={(e: any) => setExpForm({ ...expForm, cat: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none bg-gray-50"
              >
                {Object.keys(catLabels).map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                value={expForm.item}
                onChange={(e: any) => setExpForm({ ...expForm, item: e.target.value })}
                placeholder={catLabels[expForm.cat]}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50"
              />
              <input
                type="text"
                value={expForm.vendor}
                onChange={(e: any) => setExpForm({ ...expForm, vendor: e.target.value })}
                placeholder="Vendor"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={expForm.amount}
                  onChange={(e: any) => setExpForm({ ...expForm, amount: e.target.value })}
                  placeholder="Amount"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50 min-w-0"
                  onKeyDown={(e: any) => e.key === 'Enter' && addExpense()}
                />
                <button onClick={addExpense} className="bg-gray-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-gray-700">+</button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 mb-4">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <span className="text-sm font-medium flex-1">Tax summary</span>
            <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Auto-calculated</span>
          </div>
          <div className="p-5">
            {baseSpent === 0 ? (
              <p className="text-sm text-gray-400">Add expenses above — taxes appear here automatically.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(taxByCategory).map(([cat, base]: [string, any]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${catColors[cat]}`}>{cat}</span>
                      <span className="text-gray-400">{fmt(base)} base</span>
                    </div>
                    <span className="text-amber-600 font-medium">+{fmt(base * VAT_RATE / 100)} VAT</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-medium pt-2 border-t border-gray-100">
                  <span>Total tax (16% VAT)</span>
                  <span className="text-amber-600">{fmt(taxAmt)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}