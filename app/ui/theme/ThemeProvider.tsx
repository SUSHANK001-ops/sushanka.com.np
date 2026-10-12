'use client'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const THEME_STORAGE_KEY = 'portfolio-theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialise from the attribute the no-flash script already set on <html>,
  // read lazily so there's no post-mount setState just to reconcile the DOM.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'light'
    return (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'light'
  })

  useEffect(() => {
    // While the user has NOT made an explicit choice, follow the OS theme live.
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = (e: MediaQueryListEvent) => {
      let saved: string | null = null
      try {
        saved = localStorage.getItem(THEME_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      if (saved !== 'light' && saved !== 'dark') {
        const next: Theme = e.matches ? 'dark' : 'light'
        document.documentElement.setAttribute('data-theme', next)
        setThemeState(next)
      }
    }
    mql.addEventListener('change', onSystemChange)
    return () => mql.removeEventListener('change', onSystemChange)
  }, [])

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t)
    } catch {
      /* ignore storage errors */
    }
    setThemeState(t)
  }, [])

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, applyTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: applyTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/**
 * Inline script injected in <head> before paint to set data-theme — prevents
 * a light/dark flash on load.
 *
 * Resolution order:
 *   1. A saved choice in localStorage (the user picked it before — remember it).
 *   2. Otherwise the OS/browser system preference (prefers-color-scheme).
 *   3. Falling back to light if neither is available.
 */
export const themeInitScript = `
(function () {
  try {
    var k = '${THEME_STORAGE_KEY}';
    var t = localStorage.getItem(k);
    if (t !== 'light' && t !== 'dark') {
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark'
        : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`
