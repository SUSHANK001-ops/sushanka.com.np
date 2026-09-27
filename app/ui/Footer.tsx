'use client'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  User, LayoutDashboard, FileText, Sparkles,
  MessageSquare, Mail, BookOpen, Wrench,
  FolderGit2, Image as ImageIcon, MessageCircle, BarChart3,
  Instagram, Github, Linkedin, Rss,
} from 'lucide-react'
import { identity, nepaliQuote } from '@/data/config'
import SpinBadge from './delight/SpinBadge'
import NptClock from './delight/NptClock'

interface FLink {
  label: string
  href: string
  icon: React.ElementType
  external?: boolean
}

const columns: FLink[][] = [
  [
    { label: 'About', href: '/about', icon: User },
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Certifications', href: '/certifications', icon: FileText },
    { label: 'Home', href: '/', icon: Sparkles },
  ],
  [
    { label: 'Guestbook', href: '/guestbook', icon: MessageSquare },
    { label: 'Contact', href: '/contact', icon: Mail },
    { label: 'Blog', href: '/blog', icon: BookOpen },
    { label: 'Projects', href: '/projects', icon: Wrench },
  ],
  [
    { label: 'Projects', href: '/projects', icon: FolderGit2 },
    { label: 'GitHub', href: 'https://github.com/SUSHANK001-ops', icon: ImageIcon, external: true },
    { label: 'Feedback', href: '/guestbook', icon: MessageCircle },
    { label: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  ],
  [
    { label: 'Instagram', href: 'https://www.instagram.com/the_sushank_lamichhane/', icon: Instagram, external: true },
    { label: 'Blog', href: identity.blogUrl, icon: Rss, external: true },
    { label: 'GitHub', href: 'https://github.com/SUSHANK001-ops', icon: Github, external: true },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/sushank001-ops/', icon: Linkedin, external: true },
  ],
]

function FooterLink({ item }: { item: FLink }) {
  const Icon = item.icon
  const cls =
    'group inline-flex items-center gap-2 text-[0.82rem] text-muted transition-colors hover:text-foreground'
  const inner = (
    <>
      <Icon size={13} className="social-pulse text-muted transition-colors group-hover:text-foreground" />
      <span className="link-quiet !text-muted group-hover:!text-foreground">{item.label}</span>
    </>
  )
  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={item.href} className={cls}>
      {inner}
    </Link>
  )
}

const Footer = () => {
  return (
    <footer className="relative border-t border-border/60">
      <div className="editorial-page pt-12 pb-8">
        {/* Link columns */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          {columns.map((col, i) => (
            <ul key={i} className="space-y-3">
              {col.map((item, j) => (
                <li key={`${i}-${j}`}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          ))}
        </div>

        {/* Nepali quote */}
        <div className="mt-10 border-t border-border pt-6">
          <p className="font-devanagari text-sm text-foreground/70">{nepaliQuote.text}</p>
          <p className="mt-1 text-xs text-muted">{nepaliQuote.translation}</p>
        </div>

        {/* Name + year · local time */}
        <div className="mt-6 flex items-center justify-between">
          <p className="font-mono text-xs text-muted">
            {identity.name} &copy; {new Date().getFullYear()}
          </p>
          <NptClock variant="inline" />
        </div>
      </div>

      {/* Flower image border + spinning badge */}
      {/* <div className="relative">
        <div className="relative h-24 w-full overflow-hidden md:h-28">
          
        </div>
        <div className="absolute bottom-3 right-4 z-10 hidden sm:block">
          <SpinBadge size={68} />
        </div>
      </div> */}
    </footer>
  )
}

export default Footer
