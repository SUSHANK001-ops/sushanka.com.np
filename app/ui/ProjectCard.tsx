import React from 'react'
import { ArrowUpRight, Github } from 'lucide-react'
import type { Project } from '@/data/config'

/**
 * Calm editorial project card: quiet number, title, description, and two
 * subtle tag rows (built with / deployed on). Soft hover.
 */
const ProjectCard = ({ project }: { project: Project }) => {
  return (
    <article className="ed-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-xs text-muted">{project.number}</span>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{project.title}</h3>
        </div>
        <div className="flex items-center gap-3 pt-1">
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-click-sound
              className="text-muted transition-colors hover:text-foreground"
              aria-label={`${project.title} source`}
            >
              <Github size={17} />
            </a>
          )}
          {project.liveUrl && (
            <a
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-click-sound
              className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent"
            >
              Live <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted">{project.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {project.builtWith.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-foreground/70"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  )
}

export default ProjectCard
