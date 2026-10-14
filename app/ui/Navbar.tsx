'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import ThemeToggle from './theme/ThemeToggle'
import SoundToggle from './sound/SoundToggle'

const links = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Projects', href: '/projects' },
  { label: 'Blog', href: '/blog' },
  { label: 'Guestbook', href: '/guestbook' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Contact', href: '/contact' },
]

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      {/* Floating centered pill */}
      <nav
        className={`flex items-center gap-1 rounded-full border px-1.5 py-1.5 transition-all duration-300 ${
          scrolled
            ? 'border-border bg-surface/85 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl'
            : 'border-border/60 bg-surface/60 backdrop-blur-md'
        }`}
      >
        {/* Desktop links */}
        <ul className="hidden items-center md:flex">
          {links.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
            return (
              <li key={link.label}>
                <Link
                  href={link.href}
                  data-click-sound
                  data-active={active}
                  className={`nav-link mx-0.5 rounded-full px-3 py-1.5 text-[0.8rem] transition-colors ${
                    active
                      ? 'text-foreground'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Divider + toggles (desktop) */}
        <div className="hidden items-center gap-1 border-l border-border pl-1.5 md:flex">
          <ThemeToggle />
          <SoundToggle />
        </div>

        {/* Mobile: brand + toggles + menu */}
        <div className="flex items-center gap-1 md:hidden">
          <Link
            href="/"
            className="px-3 font-serif text-base font-medium text-foreground"
          >
            Sushanka
          </Link>
          <ThemeToggle />
          <SoundToggle />
          <button
            onClick={() => setOpen(true)}
            className="ml-0.5 rounded-full p-1.5 text-foreground"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {/* Mobile slide-in sheet */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          className={`absolute right-0 top-0 h-full w-72 border-l border-border bg-surface p-6 transition-transform duration-300 ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="mb-10 flex items-center justify-between">
            <span className="font-serif text-xl font-medium text-foreground">Sushanka</span>
            <button onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={22} className="text-foreground" />
            </button>
          </div>
          <ul className="flex flex-col gap-4">
            {links.map((link) => {
              const active =
                link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
              return (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    data-click-sound
                    className={`font-serif text-lg transition-colors ${
                      active ? 'text-foreground' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>
      </div>
    </header>
  )
}

export default Navbar
