import React from 'react'
import { blogQuote } from '@/data/config'

/**
 * Handwritten pull-quote shown just after the "Latest from the blog" section.
 * No background — centered handwritten lines wrapped in quote marks, framed by
 * thin dashed rules top and bottom. Content lives in data/config (blogQuote).
 */
const BlogQuote = () => {
  const lastIndex = blogQuote.lines.length - 1

  return (
    <div className="editorial-page">
      <figure className="border-y border-dashed border-border/70 py-10 text-center">
        <blockquote className="font-handwritten text-2xl leading-relaxed text-foreground/85 sm:text-3xl">
          {blogQuote.lines.map((line, i) => (
            <p key={i}>
              {i === 0 ? '\u201C' : ''}
              {line}
              {i === lastIndex ? '\u201D' : ''}
            </p>
          ))}
        </blockquote>
        {blogQuote.attribution && (
          <figcaption className="font-handwritten mt-5 text-lg text-muted sm:text-xl">
            — {blogQuote.attribution}
          </figcaption>
        )}
      </figure>
    </div>
  )
}

export default BlogQuote
