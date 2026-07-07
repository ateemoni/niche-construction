'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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

const emptyForm = { name: '', budget: '', client: '', location: '', contractor: '', start_date: '', end_date: '', contingency: '' }

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [project, setProject] = useState<any>(null)
  const [expenses, setExpenses] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [form, setForm] = useState<any>(emptyForm)
  const [expForm, setExpForm] = useState<any>({ cat: 'labor', item: '', vendor: '', amount: '', milestone_id: '' })
  const [milestones, setMilestones] = useState<any[]>([])
  const [msForm, setMsForm] = useState<any>({ name: '', budget: '' })
  const [members, setMembers] = useState<any[]>([])
  const [inviteForm, setInviteForm] = useState<any>({ email: '', role: 'viewer' })
  const [inviting, setInviting] = useState(false)
  const [isOwner, setIsOwner] = useState(true)
  const [notes, setNotes] = useState<any[]>([])
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/auth')
      else {
        setUser(data.user)
        loadProjects(data.user.id, data.user)
      }
    })
  }, [])

  async function loadProjects(userId: string, currentUser?: any) {
    const { data: owned } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const { data: memberRows } = await supabase
      .from('project_members')
      .select('project_id, role')
      .eq('user_id', userId)

    let shared: any[] = []
    if (memberRows && memberRows.length > 0) {
      const ids = memberRows.map((m: any) => m.project_id)
      const { data: sharedProjects } = await supabase
        .from('projects')
        .select('*')
        .in('id', ids)
      if (sharedProjects) shared = sharedProjects.map((p: any) => ({ ...p, _shared: true }))
    }

    const all = [...(owned || []), ...shared]
    if (all.length > 0) {
      setProjects(all)
      selectProject(all[0], currentUser)
    } else {
      setProjects([])
      setProject(null)
      setForm(emptyForm)
      setExpenses([])
    }
  }

  function selectProject(p: any, currentUser?: any) {
    setProject(p)
    setForm({
      name: p.name || '',
      budget: p.budget || '',
      client: p.client || '',
      location: p.location || '',
      contractor: p.contractor || '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      contingency: p.contingency || ''
    })
    loadExpenses(p.id)
    loadMilestones(p.id)
    loadMembers(p.id)
    loadNotes(p.id)
    const resolvedUser = currentUser || user
    setIsOwner(p.user_id === resolvedUser?.id)
    setSidebarOpen(false)
    setSaved(false)
  }

  async function loadMembers(projectId: string) {
    const { data } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (data) setMembers(data)
  }

  async function inviteMember() {
    if (!project || !inviteForm.email) return
    setInviting(true)
    const email = inviteForm.email.trim().toLowerCase()
    const { data, error } = await supabase.from('project_members').insert({
      project_id: project.id,
      email,
      role: inviteForm.role,
      invited_by: user.id
    }).select().single()
    if (data) {
      setMembers([...members, data])
      try {
        await fetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, projectName: form.name, inviterEmail: user.email })
        })
      } catch (e) {
        console.error('Invite email failed to send', e)
      }
    }
    if (error) alert(error.message)
    setInviteForm({ email: '', role: 'viewer' })
    setInviting(false)
  }

  async function removeMember(id: string) {
    await supabase.from('project_members').delete().eq('id', id)
    setMembers(members.filter((m: any) => m.id !== id))
  }

  function newProject() {
    setProject(null)
    setForm(emptyForm)
    setExpenses([])
    setMilestones([])
    setNotes([])
    setSidebarOpen(false)
    setSaved(false)
  }

  async function loadMilestones(projectId: string) {
    const { data } = await supabase
      .from('milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })
    if (data) setMilestones(data)
  }

  async function addMilestone() {
    if (!project) return alert('Save your project first.')
    if (!msForm.name) return
    const { data } = await supabase.from('milestones').insert({
      project_id: project.id,
      user_id: user.id,
      name: msForm.name,
      budget: parseFloat(msForm.budget) || 0,
      order_index: milestones.length
    }).select().single()
    if (data) setMilestones([...milestones, data])
    setMsForm({ name: '', budget: '' })
  }

  async function updateMilestoneStatus(id: string, status: string) {
    await supabase.from('milestones').update({ status }).eq('id', id)
    setMilestones(milestones.map(m => m.id === id ? { ...m, status } : m))
  }

  async function deleteMilestone(id: string) {
    await supabase.from('milestones').delete().eq('id', id)
    setMilestones(milestones.filter(m => m.id !== id))
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
        end_date: form.end_date || null,
        contingency: parseFloat(form.contingency) || 0
      }).eq('id', project.id)
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, name: form.name, budget: parseFloat(form.budget) || 0 } : p))
    } else {
      const { data } = await supabase.from('projects').insert({
        user_id: user.id,
        name: form.name,
        budget: parseFloat(form.budget) || 0,
        client: form.client,
        location: form.location,
        contractor: form.contractor,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        contingency: parseFloat(form.contingency) || 0
      }).select().single()
      if (data) {
        setProject(data)
        setProjects(prev => [data, ...prev])
        loadExpenses(data.id)
      }
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function deleteProject() {
    if (!project) return
    if (!confirm('Delete "' + project.name + '"? This will also delete all its expenses.')) return
    setDeleting(true)
    await supabase.from('expenses').delete().eq('project_id', project.id)
    await supabase.from('projects').delete().eq('id', project.id)
    const remaining = projects.filter(p => p.id !== project.id)
    setProjects(remaining)
    if (remaining.length > 0) selectProject(remaining[0])
    else { setProject(null); setForm(emptyForm); setExpenses([]) }
    setDeleting(false)
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
      amount: parseFloat(expForm.amount),
      milestone_id: expForm.milestone_id || null
    }).select().single()
    if (data) setExpenses([...expenses, data])
    setExpForm({ cat: expForm.cat, item: '', vendor: '', amount: '', milestone_id: expForm.milestone_id })
  }

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(expenses.filter((e: any) => e.id !== id))
  }

  async function loadNotes(projectId: string) {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (data) setNotes(data)
  }

  async function addNote() {
    if (!project || !noteText.trim()) return
    setAddingNote(true)
    const { data } = await supabase.from('notes').insert({
      project_id: project.id,
      user_id: user.id,
      content: noteText.trim()
    }).select().single()
    if (data) setNotes([...notes, { ...data, auth_user: { email: user.email } }])
    setNoteText('')
    setAddingNote(false)
  }

  async function deleteNote(id: string) {
    await supabase.from('notes').delete().eq('id', id)
    setNotes(notes.filter((n: any) => n.id !== id))
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const budget = parseFloat(form.budget) || 0
  const baseSpent = expenses.reduce((s: number, e: any) => s + parseFloat(e.amount), 0)
  const taxableBase = expenses.reduce((s: number, e: any) => !['labor', 'transport'].includes(e.category) ? s + parseFloat(e.amount) : s, 0)
  const taxAmt = taxableBase * VAT_RATE / 100
  const totalSpent = baseSpent + taxAmt
  const NON_TAXABLE = ['labor', 'transport']

  const taxByCategory = expenses.reduce((acc: any, e: any) => {
    if (!NON_TAXABLE.includes(e.category)) {
      acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount)
    }
    return acc
  }, {})

  const spendByMilestone = expenses.reduce((acc: any, e: any) => {
    if (e.milestone_id) acc[e.milestone_id] = (acc[e.milestone_id] || 0) + parseFloat(e.amount)
    return acc
  }, {})

  const statusColors: any = {
    pending: 'bg-gray-100 text-gray-500',
    in_progress: 'bg-amber-100 text-amber-700',
    complete: 'bg-green-100 text-green-700'
  }
  const statusLabels: any = { pending: 'Pending', in_progress: 'In progress', complete: 'Complete' }

  const contingency = parseFloat(form.contingency) || 0
  const workingBudget = budget - contingency
  const remaining = workingBudget - totalSpent
  const spentPct = workingBudget > 0 ? Math.min(100, Math.round(totalSpent / workingBudget * 100)) : 0
  const completion = Math.min(100, Math.round(spentPct * 0.9))

  const budgetStatus = spentPct > 90 ? 'Over budget risk' : spentPct > 70 ? 'Watch spend' : 'On budget'
  const budgetColor = spentPct > 90 ? 'bg-red-50 text-red-600 border-red-200' : spentPct > 70 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-green-50 text-green-600 border-green-200'

  function exportPDF() {
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()

    doc.setFillColor(26, 26, 26)
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Nichii Investment Ltd', 14, 12)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Project Report', 14, 20)
    doc.text(new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }), pageW - 14, 20, { align: 'right' })

    doc.setTextColor(30, 30, 30)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(form.name || 'Untitled Project', 14, 42)

    const info = [
      ['Client', form.client || '-', 'Location', form.location || '-'],
      ['Contractor', form.contractor || '-', 'Start date', form.start_date || '-'],
      ['End date', form.end_date || '-', 'Status', budgetStatus],
    ]
    let y = 50
    info.forEach(row => {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
      doc.text(row[0] + ':', 14, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
      doc.text(row[1], 45, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
      doc.text(row[2] + ':', 110, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
      doc.text(row[3], 140, y)
      y += 7
    })

    y += 4
    const boxes = [
      { label: 'Total Budget', value: fmt(budget) },
      { label: 'Total Spent', value: fmt(totalSpent) },
      { label: 'Remaining', value: fmt(remaining) },
      { label: 'Tax (16% VAT)', value: fmt(taxAmt) },
    ]
    const boxW = (pageW - 28) / 4
    boxes.forEach((b, i) => {
      const x = 14 + i * boxW
      doc.setFillColor(248, 248, 248)
      doc.roundedRect(x, y, boxW - 3, 20, 2, 2, 'F')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      doc.text(b.label.toUpperCase(), x + 4, y + 7)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(b.value, x + 4, y + 15)
    })

    y += 28
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text('Budget used: ' + spentPct + '%', 14, y)
    doc.text('Completion: ' + completion + '%', pageW - 14, y, { align: 'right' })
    y += 4
    doc.setFillColor(230, 230, 230)
    doc.roundedRect(14, y, pageW - 28, 4, 2, 2, 'F')
    const barColor = spentPct > 90 ? [220, 50, 50] : spentPct > 70 ? [245, 158, 20] : [34, 197, 94]
    doc.setFillColor(barColor[0], barColor[1], barColor[2])
    doc.roundedRect(14, y, (pageW - 28) * spentPct / 100, 4, 2, 2, 'F')

    y += 14
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text('Expenditures', 14, y)

    autoTable(doc, {
      startY: y + 4,
      head: [['Category', 'Item', 'Vendor', 'Amount (KSh)']],
      body: expenses.map(e => [e.category, e.item, e.vendor || '-', fmt(parseFloat(e.amount))]),
      foot: [['', '', 'Total', fmt(baseSpent)]],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' } },
      alternateRowStyles: { fillColor: [252, 252, 252] },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text('Tax Summary (16% VAT)', 14, finalY)

    autoTable(doc, {
      startY: finalY + 4,
      head: [['Category', 'Base Amount', 'VAT (16%)']],
      body: Object.entries(taxByCategory).map(([cat, base]: [string, any]) => [cat, fmt(base), fmt(base * VAT_RATE / 100)]),
      foot: [['Total', fmt(baseSpent), fmt(taxAmt)]],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 252, 252] },
    })

    doc.save((form.name || 'project').replace(/\s+/g, '-').toLowerCase() + '-report.pdf')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 flex">
      <div className={"fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-100 transform transition-transform duration-200 flex flex-col " + (sidebarOpen ? "translate-x-0" : "-translate-x-full") + " lg:translate-x-0 lg:static lg:flex"}>
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-sm">N</div>
          <span className="text-sm font-medium text-gray-900 flex-1">Nichii Investment Ltd</span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600 text-lg leading-none">x</button>
        </div>
        <div className="p-3 border-b border-gray-100">
          <button onClick={newProject} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors">
            <span className="text-base leading-none">+</span> New project
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {projects.length === 0 && <p className="text-xs text-gray-400 px-2 py-3">No projects yet. Create one!</p>}
          {projects.map(p => {
            const isActive = project?.id === p.id
            return (
              <button key={p.id} onClick={() => selectProject(p)} className={"w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors " + (isActive ? "bg-gray-100" : "hover:bg-gray-50")}>
                <div className={"text-sm font-medium truncate flex items-center gap-1.5 " + (isActive ? "text-gray-900" : "text-gray-600")}>
                  {p.name || "Untitled project"}
                  {p._shared && <span className="text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full shrink-0">Shared</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{fmt(parseFloat(p.budget) || 0)}</div>
              </button>
            )
          })}
        </div>
        <div className="p-3 border-t border-gray-100">
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 w-full text-left px-2 py-1">Sign out</button>
        </div>
      </div>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 min-w-0">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-5 sm:mb-8">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">☰</button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-medium text-gray-900 truncate">{form.name || "New project"}</h1>
              <p className="text-sm text-gray-500">Project Manager</p>
            </div>
            <span className={"text-xs px-3 py-1 rounded-full border " + budgetColor}>{budgetStatus}</span>
            <button onClick={exportPDF} className="text-xs px-3 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">Export PDF</button>
            {project && isOwner && <button onClick={deleteProject} disabled={deleting} className="text-xs text-red-400 hover:text-red-600 hidden sm:block">{deleting ? "Deleting..." : "Delete"}</button>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
            {[
              { label: "Total budget", value: fmt(budget), color: "text-green-600" },
              { label: "Contingency", value: fmt(contingency), color: "text-purple-600" },
              { label: "Working budget", value: fmt(workingBudget), color: "text-blue-600" },
              { label: "Spent", value: fmt(totalSpent), color: "text-amber-600" },
              { label: "Remaining", value: fmt(remaining), color: remaining < 0 ? "text-red-600" : remaining < workingBudget * 0.1 ? "text-amber-600" : "text-green-600" },
              { label: "Tax deducted", value: fmt(taxAmt), color: "text-gray-700" }
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
    {m.label}
  </div>
  <div className={"text-lg font-medium " + m.color}>
    {m.value}
  </div>
</div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-900">Spend vs completion</span>
              <span className="text-xs text-gray-400">{spentPct}% spent · {completion}% done</span>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                  <span className={"w-2 h-2 rounded-full " + (spentPct > 90 ? "bg-red-400" : spentPct > 70 ? "bg-amber-400" : "bg-amber-400")} />
                  Budget spent
                </span>
                <span className="text-xs font-semibold text-gray-700">{spentPct}%</span>
              </div>
              <div className="bg-gray-100 rounded-full h-3 overflow-hidden relative">
                <div className={"h-full rounded-full transition-all duration-500 " + (spentPct > 90 ? "bg-red-400" : spentPct > 70 ? "bg-amber-400" : "bg-amber-300")} style={{ width: spentPct + "%" }} />
                <div className="absolute inset-0 flex items-center" style={{ left: "70%" }}>
                  <div className="w-px h-3 bg-gray-300" />
                </div>
                <div className="absolute inset-0 flex items-center" style={{ left: "90%" }}>
                  <div className="w-px h-3 bg-gray-300" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Project completion
                </span>
                <span className="text-xs font-semibold text-gray-700">{completion}%</span>
              </div>
              <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="h-full rounded-full bg-green-400 transition-all duration-500" style={{ width: completion + "%" }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 mb-4">
            <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
              <span className="text-sm font-medium flex-1">Project setup</span>
              <span className={"text-xs px-2 py-0.5 rounded-full " + (saved ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400")}>{saved ? "Saved" : project ? "Up to date" : "Unsaved"}</span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {[
                  { label: "Project name", key: "name", type: "text", placeholder: "e.g. Westlands Office" },
                  { label: "Total budget (KSh)", key: "budget", type: "number", placeholder: "e.g. 5000000" },
                  { label: "Client / owner", key: "client", type: "text", placeholder: "Client name" },
                  { label: "Location", key: "location", type: "text", placeholder: "Site address" },
                  { label: "Contractor", key: "contractor", type: "text", placeholder: "Contractor name" },
                  { label: "Start date", key: "start_date", type: "date", placeholder: "" },
                  { label: "Expected end date", key: "end_date", type: "date", placeholder: "" },
                  { label: "Contingency reserve (KSh)", key: "contingency", type: "number", placeholder: "e.g. 50000" },
                  { label: "Contingency reserve (KSh)", key: "contingency", type: "number", placeholder: "e.g. 50000" }
                ].map(f => (
                  <div key={f.key}>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
  {f.label}
</label>
                    <input type={f.type} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100" />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <button onClick={saveProject} disabled={saving} className={"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (saved ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-900 text-white hover:bg-gray-700")}>
                  {saving ? "Saving..." : saved ? "Saved!" : "Save project"}
                </button>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  Completion auto-updates from spend — {completion}%
                </div>
              </div>
            </div>
          </div>

          {isOwner && project && (
            <div className="bg-white rounded-2xl border border-gray-100 mb-4">
              <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
                <span className="text-sm font-medium flex-1">Team</span>
                <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">{members.length} member{members.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="p-4 sm:p-5">
                {members.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-4">No team members yet. Invite a foreman, surveyor, or client to view this project.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {members.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm text-gray-700 truncate">{m.email}</div>
                          <div className="text-xs text-gray-400">{m.user_id ? "Active" : "Pending invite"}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={"text-xs px-2 py-0.5 rounded-full " + (m.role === "editor" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500")}>{m.role}</span>
                          <button onClick={() => removeMember(m.id)} className="text-gray-300 hover:text-red-400 text-xs">x</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e: any) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="Email address"
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50"
                    onKeyDown={(e: any) => e.key === "Enter" && inviteMember()}
                  />
                  <div className="flex gap-2">
                    <select
                      value={inviteForm.role}
                      onChange={(e: any) => setInviteForm({ ...inviteForm, role: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none bg-gray-50"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button onClick={inviteMember} disabled={inviting} className="bg-gray-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-gray-700">+</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 mb-4">
            <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
              <span className="text-sm font-medium flex-1">Milestones / Phases</span>
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">{milestones.length} phase{milestones.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="p-4 sm:p-5">
              {milestones.length === 0 ? (
                <p className="text-sm text-gray-400 mb-4">No phases yet. Break your project into stages below (e.g. Foundation, Roofing, Finishing).</p>
              ) : (
                <div className="space-y-3 mb-4">
                  {milestones.map((m: any) => {
                    const spent = spendByMilestone[m.id] || 0
                    const msBudget = parseFloat(m.budget) || 0
                    const pct = msBudget > 0 ? Math.min(100, Math.round(spent / msBudget * 100)) : 0
                    return (
                      <div key={m.id} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                            <select
                              value={m.status}
                              onChange={(e: any) => updateMilestoneStatus(m.id, e.target.value)}
                              className={"text-xs px-2 py-0.5 rounded-full border-0 outline-none " + statusColors[m.status]}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In progress</option>
                              <option value="complete">Complete</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-gray-400">{fmt(spent)} / {fmt(msBudget)}</span>
                            <button onClick={() => deleteMilestone(m.id)} className="text-gray-300 hover:text-red-400 text-xs">x</button>
                          </div>
                        </div>
                        <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className={"h-full rounded-full transition-all " + (pct > 90 ? "bg-red-400" : pct > 70 ? "bg-amber-400" : "bg-blue-400")} style={{ width: pct + "%" }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  value={msForm.name}
                  onChange={(e: any) => setMsForm({ ...msForm, name: e.target.value })}
                  placeholder="Phase name e.g. Foundation"
                  className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50"
                  onKeyDown={(e: any) => e.key === "Enter" && addMilestone()}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={msForm.budget}
                    onChange={(e: any) => setMsForm({ ...msForm, budget: e.target.value })}
                    placeholder="Budget"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50"
                    onKeyDown={(e: any) => e.key === "Enter" && addMilestone()}
                  />
                  <button onClick={addMilestone} className="bg-gray-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-gray-700">+</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 mb-4">
            <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
              <span className="text-sm font-medium flex-1">Expenditures</span>
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">{expenses.length} item{expenses.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="p-4 sm:p-5">
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-400 mb-4">No expenses yet. Add one below.</p>
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-sm mb-4">
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
                        <td className="py-2"><span className={"text-xs px-2 py-0.5 rounded-full " + catColors[e.category]}>{e.category}</span></td>
                        <td className="py-2 text-gray-700">{e.item}</td>
                        <td className="py-2 text-gray-400">{e.vendor || "-"}</td>
                        <td className="py-2 text-right font-medium">{fmt(parseFloat(e.amount))}</td>
                        <td className="py-2 text-right"><button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-400 text-xs">x</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
              {milestones.length > 0 && (
                <div className="mb-2">
                  <select value={expForm.milestone_id} onChange={(e: any) => setExpForm({ ...expForm, milestone_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50">
                    <option value="">No phase</option>
                    {milestones.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-gray-100">
                <select value={expForm.cat} onChange={(e: any) => setExpForm({ ...expForm, cat: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none bg-gray-50">
                  {Object.keys(catLabels).map((c: string) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="text" value={expForm.item} onChange={(e: any) => setExpForm({ ...expForm, item: e.target.value })} placeholder={catLabels[expForm.cat]} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50" />
                <input type="text" value={expForm.vendor} onChange={(e: any) => setExpForm({ ...expForm, vendor: e.target.value })} placeholder="Vendor" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50" />
                <div className="flex gap-2">
                  <input type="number" value={expForm.amount} onChange={(e: any) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="Amount" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-gray-50" onKeyDown={(e: any) => e.key === "Enter" && addExpense()} />
                  <button onClick={addExpense} className="bg-gray-900 text-white rounded-lg px-3 py-2 text-sm hover:bg-gray-700">+</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 mb-4">
            <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
              <span className="text-sm font-medium flex-1">Tax summary</span>
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Auto-calculated</span>
            </div>
            <div className="p-4 sm:p-5">
              {baseSpent === 0 ? (
                <p className="text-sm text-gray-400">Add expenses above — taxes appear here automatically.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(taxByCategory).map(([cat, base]: [string, any]) => (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={"text-xs px-2 py-0.5 rounded-full " + catColors[cat]}>{cat}</span>
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

          <div className="bg-white rounded-2xl border border-gray-100 mb-4">
            <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
              <span className="text-sm font-medium flex-1">Activity log</span>
              <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="p-4 sm:p-5">
              {notes.length === 0 ? (
                <p className="text-sm text-gray-400 mb-4">No notes yet. Add a comment or update below.</p>
              ) : (
                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                  {notes.map((n: any) => (
                    <div key={n.id} className="flex gap-3 group">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 mt-0.5">
                        {(user?.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-gray-700">{user?.email}</span>
                          <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{n.content}</p>
                      </div>
                      <button onClick={() => deleteNote(n.id)} className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 shrink-0">x</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  value={noteText}
                  onChange={(e: any) => setNoteText(e.target.value)}
                  onKeyDown={(e: any) => e.key === 'Enter' && addNote()}
                  placeholder="Add a note or update..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 bg-gray-50"
                />
                <button
                  onClick={addNote}
                  disabled={addingNote || !noteText.trim()}
                  className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm hover:bg-gray-700 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
