import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'Nichii Investment Ltd',
  description: 'Project Manager',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
