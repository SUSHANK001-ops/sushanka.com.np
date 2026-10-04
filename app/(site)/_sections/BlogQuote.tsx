import React from 'react'
import { Quote } from 'lucide-react'
import { blogQuote } from '@/data/config'

/**
 * Calm editorial pull-quote, shown just after the "Latest from the blog"
 * section on the homepage. Content lives in data/config (blogQuote).
 */
const BlogQuote = () => {
  return (
    <div className="editorial-page">
      <figure className="relative rounded-2xl border border-border bg-foreground/[0.015] px-6 py-8 sm:px-10 sm:py-10">
        <Quote
          size={22}
          className="absolute left-5 top-6 text-accent/40 sm:left-8"
          aria-hidden
        />
        <blockquote className="pl-8 sm:pl-10">
          {blogQuote.lines.map((line, i) => (
            <p
              key={i}
              className="serif-title text-xl leading-relaxed text-foreground/90 sm:text-2xl"
            >
              {line}
            </p>
          ))}
        </blockquote>
        {blogQuote.attribution && (
          <figcaption className="mt-4 pl-8 font-mono text-xs text-muted sm:pl-10">
            — {blogQuote.attribution}
          </figcaption>
        )}
      </figure>
    </div>
  )
}

export default BlogQuote
