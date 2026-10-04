'use client'
import React from 'react'
import Image from 'next/image'
import { Sparkles, FlaskConical, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useGsapReveal } from '../../ui/useGsapReveal'

/* ============================================================================
 *  USES — single source of truth. Edit this data; the layout stays untouched.
 *
 *  Hardware renders as photo boxes. Every other section renders as a short
 *  STORY paragraph: plain text interleaved with inline "chips" (icon + the
 *  tool name highlighted in a tone colour). A chip is written as { tool: '…' }
 *  and resolves to an entry in that category's `tools` map.
 * ========================================================================== */

type IconSrc = string | LucideIcon

/** A chip resolves to a tool: its icon + highlighted name, inline in prose. */
interface Tool {
  name: string
  icon: IconSrc
}

/** A story is a list of plain strings and chip refs, rendered in order. */
type StoryPart = string | { tool: string }

interface GearItem {
  name: string
  label: string
  detail: string
  icon: string
}

interface Category {
  id: string
  title: string
  /** Hardware uses `gear`; everything else uses a `story`. */
  gear?: GearItem[]
  tools?: Record<string, Tool>
  story?: StoryPart[]
}

const categories: Category[] = [
  {
    id: 'hardware',
    title: 'Hardware',
    gear: [
      { name: 'Lenovo IdeaPad 3', label: 'Laptop', detail: 'My primary workstation for everything from coding to deployments.', icon: '/gear/laptop.png' },
      { name: 'R8 Wireless Mouse', label: 'Mouse', detail: 'A lightweight daily pointer with just enough precision.', icon: '/gear/mouse.png' },
      { name: 'Ugreen Keyboard', label: 'Keyboard', detail: 'A clean wireless board that keeps the desk uncluttered.', icon: '/gear/keyboard.png' },
      { name: 'Wooyu Headset', label: 'Headphones', detail: 'Primary audio for deep focus and the occasional gaming break.', icon: '/gear/headphone.png' },
      { name: 'Ultima Airpods', label: 'Earbuds', detail: 'Portable audio for calls and music on the move.', icon: '/gear/airpod.png' },
      { name: 'Infinix Hot Pro +', label: 'Phone', detail: 'My main mobile device for testing and staying connected.', icon: '/gear/phone.png' },
    ],
  },
  {
    id: 'editors',
    title: 'Editors & AI Tools',
    tools: {
      vscode: { name: 'VS Code', icon: '/gear/vscode.svg' },
      kiro: { name: 'Kiro', icon: Sparkles },
      antigravity: { name: 'Antigravity', icon: FlaskConical },
    },
    story: [
      'Most days start in ', { tool: 'vscode' }, ', where I write the bulk of my full-stack and web code with a handful of extensions I trust. When I want to move faster I switch to ',
      { tool: 'kiro' }, ', my AI-first workspace for agentic coding and quick iteration. And when an idea is still half-formed, I throw it into ',
      { tool: 'antigravity' }, ' — a sandbox where I can experiment with new setups and libraries before they ever touch a real project.',
    ],
  },
  {
    id: 'apps',
    title: 'Apps, Media & Productivity',
    tools: {
      spotify: { name: 'Spotify', icon: '/gear/spotify.svg' },
      notion: { name: 'Notion', icon: '/gear/notion.svg' },
      brave: { name: 'Brave', icon: '/gear/brave.svg' },
      cloudinary: { name: 'Cloudinary', icon: '/gear/cloudinary.svg' },
    },
    story: [
      'A good session needs a good soundtrack, so ', { tool: 'spotify' }, ' is almost always running — daily playlists, lo-fi, and the odd podcast between tasks. Everything I need to remember lives in ',
      { tool: 'notion' }, ', my second brain for project docs, task tracking, and notes. I browse the web in ',
      { tool: 'brave' }, ' for its built-in privacy and ad blocking, and when a project needs images delivered fast, I lean on ',
      { tool: 'cloudinary' }, ' to host, transform, and serve them.',
    ],
  },
  {
    id: 'terminal',
    title: 'Terminal, OS & Virtualization',
    tools: {
      terminal: { name: 'System Terminal', icon: SquareTerminal },
      gitbash: { name: 'Git Bash', icon: '/gear/gitbash.svg' },
      virtualbox: { name: 'VirtualBox', icon: '/gear/virtualbox.svg' },
      vmware: { name: 'VMware', icon: '/gear/vmware.svg' },
    },
    story: [
      'For quick local work — git, dev servers, one-off commands — I stay in the ', { tool: 'terminal' }, '. When I need SSH or a proper bash script on Windows, I reach for ',
      { tool: 'gitbash' }, '. And to practise DevOps without breaking anything real, I spin up isolated Linux boxes in ',
      { tool: 'virtualbox' }, ' and ', { tool: 'vmware' }, ' — mostly Ubuntu and Rocky Linux.',
    ],
  },
  {
    id: 'devops',
    title: 'DevOps & Infrastructure',
    tools: {
      aws: { name: 'AWS', icon: '/tech/aws.svg' },
      docker: { name: 'Docker', icon: '/tech/docker.svg' },
      kubernetes: { name: 'Kubernetes', icon: '/tech/kubernetes.svg' },
      jenkins: { name: 'Jenkins', icon: '/gear/jenkins.svg' },
      terraform: { name: 'Terraform', icon: '/tech/terraform.svg' },
    },
    story: [
      'When it is time to ship, ', { tool: 'aws' }, ' is home for most of my cloud infrastructure and production workloads. I package apps into containers with ',
      { tool: 'docker' }, ' and orchestrate them as reliable services using ', { tool: 'kubernetes' }, '. Deployments run through automated pipelines in ',
      { tool: 'jenkins' }, ', and I keep every environment reproducible with Infrastructure as Code in ', { tool: 'terraform' }, '.',
    ],
  },
  {
    id: 'stack',
    title: 'Core Development Stack',
    tools: {
      react: { name: 'React', icon: '/tech/react.svg' },
      next: { name: 'Next.js', icon: '/tech/nextjs.svg' },
      node: { name: 'Node.js', icon: '/tech/nodejs.svg' },
      ts: { name: 'TypeScript', icon: '/tech/typescript.svg' },
      tailwind: { name: 'Tailwind CSS', icon: '/gear/tailwindcss.svg' },
      postgres: { name: 'PostgreSQL', icon: '/tech/postgresql.svg' },
      mongo: { name: 'MongoDB', icon: '/gear/mongodb.svg' },
    },
    story: [
      'I build websites and apps with ', { tool: 'react' }, ' and ', { tool: 'next' }, ' on the front end, backed by ',
      { tool: 'node' }, ' services — all typed end-to-end with ', { tool: 'ts' }, '. I style everything with ',
      { tool: 'tailwind' }, ', and depending on the project I store data in ', { tool: 'postgres' }, ' or ', { tool: 'mongo' }, '.',
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Tone highlights — assigned per tool so every chip has a colour.    */
/* ------------------------------------------------------------------ */

const highlightTones = [
  'bg-c-blue/15 text-c-blue',
  'bg-c-green/15 text-c-green',
  'bg-c-pink/15 text-c-pink',
  'bg-c-yellow/25 text-foreground',
]

/** Small inline brand mark / Lucide glyph sized to sit in a line of text. */
function InlineIcon({ icon, alt }: { icon: IconSrc; alt: string }) {
  if (typeof icon === 'string') {
    return (
      <Image
        src={icon}
        alt={alt}
        width={16}
        height={16}
        className="inline-block h-4 w-4 shrink-0 object-contain align-[-3px]"
      />
    )
  }
  const Icon = icon
  return <Icon size={15} className="inline-block shrink-0 text-accent align-[-3px]" />
}

/** An inline chip: icon + the tool name highlighted in its tone. */
function Chip({ tool, tone }: { tool: Tool; tone: string }) {
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 font-medium ${tone}`}>
      <span className="mr-1">
        <InlineIcon icon={tool.icon} alt={tool.name} />
      </span>
      {tool.name}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Hardware — photo boxes.                                            */
/* ------------------------------------------------------------------ */

function GearGrid({ items }: { items: GearItem[] }) {
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.07 })
  return (
    <div ref={ref} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.name}
          className="group rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/40"
        >
          <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-white">
            <Image
              src={item.icon}
              alt={item.name}
              width={120}
              height={96}
              className="max-h-20 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <p className="font-mono text-[0.62rem] uppercase tracking-widest text-accent">
            {item.label}
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{item.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{item.detail}</p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Story paragraph — plain text interleaved with chips.              */
/* ------------------------------------------------------------------ */

function Story({ parts, tools }: { parts: StoryPart[]; tools: Record<string, Tool> }) {
  // Give each distinct tool a stable tone from the palette.
  const toneFor = new Map<string, string>()
  Object.keys(tools).forEach((key, i) => {
    toneFor.set(key, highlightTones[i % highlightTones.length])
  })

  return (
    <p className="text-[1.0rem] leading-[2] text-muted">
      {parts.map((part, i) => {
        if (typeof part === 'string') return <React.Fragment key={i}>{part}</React.Fragment>
        const tool = tools[part.tool]
        if (!tool) return null
        return <Chip key={i} tool={tool} tone={toneFor.get(part.tool) ?? highlightTones[0]} />
      })}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/*  Section                                                            */
/* ------------------------------------------------------------------ */

function Section({ category, index }: { category: Category; index: number }) {
  const ref = useGsapReveal<HTMLDivElement>({ y: 16 })
  return (
    <section ref={ref} className="py-9">
      <h2 className="flex items-baseline gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-accent">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <span>{category.title}</span>
      </h2>

      <div className="mt-5">
        {category.gear ? (
          <GearGrid items={category.gear} />
        ) : category.story && category.tools ? (
          <Story parts={category.story} tools={category.tools} />
        ) : null}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Main view                                                          */
/* ------------------------------------------------------------------ */

const UsesView = () => {
  return (
    <div className="mt-8 max-w-2xl divide-y divide-border/60">
      {categories.map((category, i) => (
        <Section key={category.id} category={category} index={i} />
      ))}
    </div>
  )
}

export default UsesView
