import React from 'react'
import { blogQuote } from '@/data/config'

/**
 * Handwritten pull-quote shown just after the "Latest from the blog" section.
 * No background — centered handwritten lines wrapped in quote marks, framed by
 * a single thin dashed rule top and bottom. Content lives in data/config.
 */
const BlogQuote = () => {
  const lastIndex = blogQuote.lines.length - 1

  return (
    <div className="editorial-page mt-6">
      <figure className="border-y border-dashed border-border/60 py-8 text-center sm:py-9">
        <blockquote className="font-handwritten text-balance text-2xl leading-snug tracking-wide text-foreground/90 sm:text-[2rem]">
          {blogQuote.lines.map((line, i) => (
            <p key={i} className={i < lastIndex ? 'mb-1.5' : ''}>
              {i === 0 ? '\u201C' : ''}
              {line}
              {i === lastIndex ? '\u201D' : ''}
            </p>
          ))}
        </blockquote>
        {blogQuote.attribution && (
          <figcaption className="font-handwritten mt-4 text-xl text-muted sm:text-2xl">
            <span className="mr-1 text-muted/60">&mdash;</span>
            {blogQuote.attribution}
          </figcaption>
        )}
      </figure>
    </div>
  )
}

export default BlogQuote
