import { useEffect, useState } from 'react'

interface Preset {
  name: string
  swatch: string
  shades: Record<'50' | '100' | '300' | '400' | '500' | '600' | '700' | '900', string>
}

const PRESETS: Preset[] = [
  {
    name: 'Cyan',
    swatch: '#06b6d4',
    shades: { '50': '#ecfeff', '100': '#cffafe', '300': '#67e8f9', '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490', '900': '#164e63' }
  },
  {
    name: 'Violet',
    swatch: '#7c3aed',
    shades: { '50': '#f5f3ff', '100': '#ede9fe', '300': '#c4b5fd', '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9', '900': '#4c1d95' }
  },
  {
    name: 'Emerald',
    swatch: '#059669',
    shades: { '50': '#ecfdf5', '100': '#d1fae5', '300': '#6ee7b7', '400': '#34d399', '500': '#10b981', '600': '#059669', '700': '#047857', '900': '#064e3b' }
  },
  {
    name: 'Rose',
    swatch: '#e11d48',
    shades: { '50': '#fff1f2', '100': '#ffe4e6', '300': '#fda4af', '400': '#fb7185', '500': '#f43f5e', '600': '#e11d48', '700': '#be123c', '900': '#881337' }
  },
  {
    name: 'Amber',
    swatch: '#d97706',
    shades: { '50': '#fffbeb', '100': '#fef3c7', '300': '#fcd34d', '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309', '900': '#78350f' }
  },
  {
    name: 'Blue',
    swatch: '#2563eb',
    shades: { '50': '#eff6ff', '100': '#dbeafe', '300': '#93c5fd', '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '900': '#1e3a8a' }
  }
]

const ACCENT_KEY = 'kll-accent'

function applyPreset(preset: Preset): void {
  const root = document.documentElement
  for (const [shade, value] of Object.entries(preset.shades)) {
    root.style.setProperty(`--accent-${shade}`, value)
  }
}

export function applyStoredAccent(): void {
  try {
    const name = localStorage.getItem(ACCENT_KEY)
    const preset = PRESETS.find((p) => p.name === name)
    if (preset) applyPreset(preset)
  } catch {
    // default palette from index.css stays in effect
  }
}

export default function ColorPicker(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string>(() => {
    try {
      return localStorage.getItem(ACCENT_KEY) ?? 'Cyan'
    } catch {
      return 'Cyan'
    }
  })

  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('[data-color-picker]')) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const choose = (preset: Preset): void => {
    applyPreset(preset)
    setSelected(preset.name)
    setOpen(false)
    try {
      localStorage.setItem(ACCENT_KEY, preset.name)
    } catch {
      // per-viewer convenience only; fine if it doesn't persist
    }
  }

  return (
    <div className="relative" data-color-picker>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
        title="Accent color"
      >
        Color
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 flex gap-1.5 rounded border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => choose(p)}
              title={p.name}
              className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900 ${
                selected === p.name ? 'ring-2 ring-slate-600 dark:ring-slate-300' : ''
              }`}
              style={{ backgroundColor: p.swatch }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
