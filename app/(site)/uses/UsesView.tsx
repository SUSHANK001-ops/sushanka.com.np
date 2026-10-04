'use client'
import React from 'react'
import Image from 'next/image'
import { Sparkles, FlaskConical, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useGsapReveal } from '../../ui/useGsapReveal'

/* ============================================================================
 *  USES — single source of truth. Edit this data; the layout stays untouched.
 *  `icon` is either a path to an image in /public/gear (brand/photo) or a
 *  Lucide icon component (for tools without a brand asset).
 * ========================================================================== */

type IconSrc = string | LucideIcon

interface UseItem {
  name: string
  label: string
  detail: string
  icon: IconSrc
}

interface UseCategory {
  id: string
  title: string
  /** `gear` renders photo cards; `list` renders an inline-icon list. */
  layout: 'gear' | 'list'
  items: UseItem[]
}

const categories: UseCategory[] = [
  {
    id: 'hardware',
    title: 'Hardware',
    layout: 'gear',
    items: [
      { name: 'Lenovo IdeaPad 3', label: 'Laptop', detail: 'Primary workstation.', icon: '/gear/laptop.png' },
      { name: 'R8 Wireless Mouse', label: 'Mouse', detail: 'Daily precision pointer.', icon: '/gear/mouse.png' },
      { name: 'Ugreen Wireless Keyboard', label: 'Keyboard', detail: 'Minimalist desktop setup.', icon: '/gear/keyboard.png' },
      { name: 'Wooyu Headset', label: 'Headphones', detail: 'Primary audio for focus and gaming.', icon: '/gear/headphone.png' },
      { name: 'Ultima Airpods', label: 'Earbuds', detail: 'Portable audio on the go.', icon: '/gear/airpod.png' },
      { name: 'Infinix Hot Pro +', label: 'Phone', detail: 'Main mobile device.', icon: '/gear/phone.png' },
    ],
  },
  {
    id: 'editors',
    title: 'Editors & AI Tools',
    layout: 'list',
    items: [
      { name: 'Visual Studio Code', label: 'Primary IDE', detail: 'Go-to editor for general full-stack and web development.', icon: '/gear/vscode.svg' },
      { name: 'Kiro', label: 'AI IDE', detail: 'Primary workspace for AI-assisted coding and agentic workflows.', icon: Sparkles },
      { name: 'Antigravity', label: 'Playground', detail: 'Sandbox for experimenting with new code setups and tools.', icon: FlaskConical },
    ],
  },
  {
    id: 'apps',
    title: 'Apps, Media & Productivity',
    layout: 'list',
    items: [
      { name: 'Spotify', label: 'Music & Focus', detail: 'Soundtracking long coding sessions, daily playlists, and podcasts.', icon: '/gear/spotify.svg' },
      { name: 'Notion', label: 'Productivity & Notes', detail: 'Central hub for docs, task tracking, and personal knowledge.', icon: '/gear/notion.svg' },
      { name: 'Brave', label: 'Browser', detail: 'Primary browser for privacy, speed, and ad blocking.', icon: '/gear/brave.svg' },
      { name: 'Cloudinary', label: 'Asset Management', detail: 'Cloud media storage for hosting and delivering web assets.', icon: '/gear/cloudinary.svg' },
    ],
  },
  {
    id: 'terminal',
    title: 'Terminal, OS & Virtualization',
    layout: 'list',
    items: [
      { name: 'System Terminal', label: 'Terminal', detail: 'Default shell for local commands and quick tasks.', icon: SquareTerminal },
      { name: 'Git Bash', label: 'SSH & Scripting', detail: 'Dedicated client for SSH connections and bash scripts.', icon: '/gear/gitbash.svg' },
      { name: 'VirtualBox & VMware', label: 'Virtualization', detail: 'Running isolated Linux environments (Ubuntu & Rocky Linux).', icon: '/gear/virtualbox.svg' },
    ],
  },
  {
    id: 'devops',
    title: 'DevOps & Infrastructure',
    layout: 'list',
    items: [
      { name: 'AWS', label: 'Cloud Provider', detail: 'Cloud infrastructure and hosting.', icon: '/tech/aws.svg' },
      { name: 'Docker & Kubernetes', label: 'Containers & Orchestration', detail: 'Containerizing apps and managing microservices.', icon: '/tech/docker.svg' },
      { name: 'Jenkins & Terraform', label: 'CI/CD & Provisioning', detail: 'Automated pipeline deployment and Infrastructure as Code.', icon: '/gear/jenkins.svg' },
    ],
  },
  {
    id: 'stack',
    title: 'Core Development Stack',
    layout: 'list',
    items: [
      { name: 'React · Next.js · Node · Express · TS', label: 'Frontend & Backend', detail: 'The full-stack foundation of most projects.', icon: '/tech/react.svg' },
      { name: 'Tailwind CSS · GSAP · Lenis', label: 'Styling & Motion', detail: 'Utility styling, animation, and smooth scrolling.', icon: '/gear/tailwindcss.svg' },
      { name: 'PostgreSQL · MongoDB · Mongoose · Sequelize', label: 'Databases & ORMs', detail: 'Relational and document stores with their ORMs.', icon: '/tech/postgresql.svg' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Icon renderer                                                      */
/* ------------------------------------------------------------------ */

function ToolIcon({ icon, alt, size = 22 }: { icon: IconSrc; alt: string; size?: number }) {
  if (typeof icon === 'string') {
    return (
      <Image
        src={icon}
        alt={alt}
        width={size}
        height={size}
        className="h-[22px] w-[22px] shrink-0 object-contain"
      />
    )
  }
  const Icon = icon
  return <Icon size={size} className="shrink-0 text-accent" />
}

/* ------------------------------------------------------------------ */
/*  Category sections                                                  */
/* ------------------------------------------------------------------ */

function GearGrid({ items }: { items: UseItem[] }) {
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.07 })
  return (
    <div ref={ref} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.name}
          className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/40"
        >
          <div className="relative mb-3 flex h-24 items-center justify-center rounded-lg bg-background/40">
            <Image
              src={item.icon as string}
              alt={item.name}
              width={120}
              height={96}
              className="max-h-20 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-accent">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{item.name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.detail}</p>
        </div>
      ))}
    </div>
  )
}

function ToolList({ items }: { items: UseItem[] }) {
  const ref = useGsapReveal<HTMLUListElement>({ stagger: 0.06 })
  return (
    <ul ref={ref} className="space-y-3">
      {items.map((item) => (
        <li
          key={item.name}
          className="flex items-start gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/40"
        >
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-background/40">
            <ToolIcon icon={item.icon} alt={item.name} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="font-medium text-foreground">{item.name}</p>
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-accent">
                {item.label}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Section({ category, index }: { category: UseCategory; index: number }) {
  const headRef = useGsapReveal<HTMLDivElement>({ y: 18 })
  return (
    <section className="pt-10">
      <div ref={headRef} className="mb-5 flex items-baseline gap-3">
        <span className="font-mono text-sm text-accent">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2 className="serif-title text-xl text-foreground md:text-2xl">{category.title}</h2>
      </div>
      {category.layout === 'gear' ? (
        <GearGrid items={category.items} />
      ) : (
        <ToolList items={category.items} />
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Main view                                                          */
/* ------------------------------------------------------------------ */

const UsesView = () => {
  return (
    <div className="mt-10 divide-y divide-border/60">
      {categories.map((category, i) => (
        <Section key={category.id} category={category} index={i} />
      ))}
    </div>
  )
}

export default UsesView
