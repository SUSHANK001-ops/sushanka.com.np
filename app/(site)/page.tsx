import React from 'react'
import type { Metadata } from 'next'
import Hero from './_sections/Hero'
import AboutBento from './_sections/AboutBento'
import ProjectsGrid from './_sections/ProjectsGrid'
import Services from './_sections/Services'
import LatestBlog from './_sections/LatestBlog'
import BlogQuote from './_sections/BlogQuote'
import Experience from './_sections/Experience'

export const metadata: Metadata = {
  title: 'Sushanka Lamichhane – DevOps Engineer & Full-Stack Developer',
  description:
    'DevOps Engineer and Full-Stack Developer from Nepal. AWS · Docker · Kubernetes · Terraform · CI/CD · Red Hat Certified.',
}

// Revalidate the homepage every 60s so newly published blog posts appear in the
// "Latest from the blog" section without a full rebuild.
export const revalidate = 60

function Divider() {
  return (
    <div className="editorial-page my-14">
      <div className="wavy-divider" />
    </div>
  )
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Divider />
      <AboutBento />
      <Divider />
      <ProjectsGrid />
      <Divider />
      <Services />
      <Divider />
      <LatestBlog />
      <BlogQuote />
      <Divider />
      <Experience />
      <div className="pb-12" />
    </>
  )
}
