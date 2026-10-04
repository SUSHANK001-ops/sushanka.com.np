/**
 * ============================================================================
 *  SITE CONFIG — single source of truth for all editable content.
 *  Update values here; component files should never hard-code content.
 * ============================================================================
 */

export interface SocialLink {
  label: string
  url: string
}

export interface Project {
  number: string
  title: string
  description: string
  /** Tech the project is built with. */
  builtWith: string[]
  /** Infrastructure the project is deployed on (optional). */
  deployedOn?: string[]
  liveUrl?: string
  githubUrl?: string
  /** Optional thumbnail (drop images in /public). Falls back to a placeholder. */
  image?: string
  /** Short one-line tagline shown in the featured list. */
  tagline?: string
}

export interface Service {
  number: string
  title: string
  description: string
  tags: string[]
  /** ASCII snippet / diagram shown when the item is expanded. */
  snippet: string
}

export interface ExperienceEntry {
  role: string
  company: string
  date: string
  description: string
}

export interface Certification {
  name: string
  issuer: string
  year: string
  verifyUrl?: string
}

/* ------------------------------------------------------------------ */
/*  Identity                                                          */
/* ------------------------------------------------------------------ */

export const identity = {
  name: 'Sushanka Lamichhane',
  handle: 'sushanka',
  role: 'DevOps Engineer & Developer',
  shortRole: 'DevOps Engineer',
  location: 'Pokhara, Nepal',
  locationFlag: '🇳🇵',
  education: 'BSc IT · Asia Pacific University',
  availability: 'Available for remote work',
  heroLines: ['DEVOPS', 'ENGINEER', '&', 'DEVELOPER'],
  heroTagline:
    'Building cloud infrastructure and web applications from Pokhara, Nepal.',
  bio: [
    "I'm a DevOps Engineer and Full-Stack Developer who builds production-grade web applications and manages the cloud infrastructure that runs them.",
    'My work spans React/Next.js frontends, Node.js/PostgreSQL backends, and full deployment pipelines on AWS and DigitalOcean using Docker, Linux, and CI/CD tooling.',
    'Red Hat Linux certified. Trained in Kubernetes, Terraform, Ansible, Jenkins, GitHub Actions, Prometheus, Grafana, and ArgoCD.',
  ],
  email: 'mail@sushanka.com.np',
  profileImage: '/profile.jpeg',
  resume: '/sushankResume.pdf',
  githubUsername: 'SUSHANK001-ops',
  blogUrl: 'https://blog.sushanka.com.np/',
}

/* ------------------------------------------------------------------ */
/*  Photos (Polaroid strip on the homepage)                           */
/*  Drop real images in /public and update src + caption below.       */
/* ------------------------------------------------------------------ */

export interface Photo {
  src: string
  caption: string
  rotate?: number
}

export const photos: Photo[] = [
  { src: '/profile.jpeg', caption: 'me, mid-deploy', rotate: -5 },
  { src: '/assests/Placeholder.png', caption: 'the homelab', rotate: 3 },
  { src: '/profile.jpeg', caption: 'coffee & configs', rotate: -2 },
  { src: '/assests/Placeholder.png', caption: 'shipping day', rotate: 4 },
]

/* ------------------------------------------------------------------ */
/*  Social links                                                      */
/* ------------------------------------------------------------------ */

export const socials: SocialLink[] = [
  { label: 'GitHub', url: 'https://github.com/SUSHANK001-ops' },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/in/lamichhane--68b754341/?skipRedirect=true' },
  { label: 'Instagram', url: 'https://www.instagram.com/the_sushank_lamichhane/' },
  { label: 'Email', url: 'mailto:mail@sushanka.com.np' },
]

/* ------------------------------------------------------------------ */
/*  Tech stack (marquee + terminal `skills`)                          */
/* ------------------------------------------------------------------ */

export const techStack: string[] = [
  'AWS', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins',
  'GitHub Actions', 'Prometheus', 'Grafana', 'ArgoCD', 'Helm', 'Linux',
  'React', 'Next.js', 'TypeScript', 'Node.js', 'Express', 'PostgreSQL',
  'MongoDB', 'TailwindCSS',
]

/** Items scrolled in the hero marquee strip. */
export const marqueeItems: string[] = [
  'AWS', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins',
  'GitHub Actions', 'Prometheus', 'Grafana', 'ArgoCD', 'Red Hat Certified',
  '10+ Projects', '1+ Years Remote Experience',
]

/** Outlined pill badges under the hero. */
export const heroBadges: string[] = ['AWS', 'Docker', 'Kubernetes', 'Red Hat ✓']

/* ------------------------------------------------------------------ */
/*  Stats                                                             */
/* ------------------------------------------------------------------ */

export const stats = [
  { value: '10+', label: 'Projects' },
  { value: '2+', label: 'Certifications' },
  { value: '1+', label: 'Years' },
  { value: '3', label: 'Deployed Apps' },
]

/* ------------------------------------------------------------------ */
/*  Services                                                          */
/* ------------------------------------------------------------------ */

export const services: Service[] = [
  {
    number: '01',
    title: 'Cloud & DevOps Engineering',
    description:
      'Deploying and managing cloud infrastructure on AWS and DigitalOcean. CI/CD pipelines with Jenkins and GitHub Actions, containerization with Docker and Kubernetes, IaC with Terraform, and monitoring with Prometheus and Grafana.',
    tags: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'],
    snippet: `$ terraform apply
  aws_instance.web      → creating...
  aws_eip.web           → creating...
  aws_route53_record    → creating...
Apply complete! Resources: 3 added, 0 changed.`,
  },
  {
    number: '02',
    title: 'Backend Development',
    description:
      'Building scalable server-side architectures with Node.js, Express, and Python. REST APIs, authentication, and database design.',
    tags: ['Node.js', 'Express', 'PostgreSQL', 'MongoDB'],
    snippet: `POST /api/auth/login   200  42ms
GET  /api/users        200  11ms
[db] pool: 8/20  latency: 3ms`,
  },
  {
    number: '03',
    title: 'Full Stack Solutions',
    description:
      'End-to-end development from database schema to deployment pipeline. One person, whole product — designed, built, shipped, and monitored.',
    tags: ['Next.js', 'Node.js', 'Docker', 'CI/CD'],
    snippet: `client ──▶ next.js ──▶ api ──▶ db
   │                        │
   └────── monitoring ◀─────┘`,
  },
  {
    number: '04',
    title: 'Frontend Development',
    description:
      'Crafting responsive, accessible interfaces with React, Next.js, and Tailwind CSS that deliver clean user experiences.',
    tags: ['React', 'Next.js', 'TypeScript', 'TailwindCSS'],
    snippet: `▲ next build
  Route (app)          Size
  ○ /                  4.2 kB
  ○ /dashboard         6.8 kB
✓ Compiled successfully`,
  },
  {
    number: '05',
    title: 'Performance & Security',
    description:
      'Optimizing Core Web Vitals, hardening deployments, rate limiting, secure auth flows, and observability across the stack.',
    tags: ['Web Vitals', 'Rate Limiting', 'Auth', 'Monitoring'],
    snippet: `$ lighthouse --only=perf
  Performance ......... 98
  Accessibility ....... 100
  Best Practices ...... 100`,
  },
]

/* ------------------------------------------------------------------ */
/*  Projects                                                          */
/* ------------------------------------------------------------------ */

export const projects: Project[] = [
  {
    number: '01',
    title: 'DevOps Project',
    tagline: 'End-to-end DevOps pipeline with CI/CD and automation.',
    description:
      'A hands-on DevOps project showcasing CI/CD pipelines, containerization, and infrastructure automation. Covers build, test, and deployment workflows with industry-standard tooling.',
    builtWith: ['Docker', 'Jenkins', 'GitHub Actions', 'Terraform', 'Ansible'],
    githubUrl: 'https://github.com/SUSHANK001-ops/Devops_Projects/tree/main/Project-1',
  },
  {
    number: '02',
    title: 'SenChat',
    tagline: 'Real-time chat with instant messaging and auth.',
    description:
      'A real-time chatting application with instant messaging, user authentication, and a sleek conversational UI. Built as a full-stack project with modern web technologies.',
    builtWith: ['MERN Stack', 'Socket.io', 'Real-time', 'Authentication'],
    liveUrl: 'https://senchat.sushanka.com.np',
  },
  {
    number: '03',
    title: 'UrlShare',
    tagline: 'File sharing with QR links and auto-expiry.',
    description:
      'A full-stack file sharing web app that allows users to upload files up to 100MB and generate public download links with QR code sharing and automatic expiration. Built with a responsive UI and cloud-based file storage.',
    builtWith: ['Next.js', 'Express', 'PostgreSQL', 'Cloudinary'],
    liveUrl: 'https://urlshare.sushanka.com.np',
    githubUrl: 'https://github.com/SUSHANK001-ops/UrlShare.git',
  },
  {
    number: '04',
    title: 'SenBlog',
    tagline: 'Full-stack blogging platform with rich editing.',
    description:
      'A full-stack blogging platform with rich text editing, user dashboards, and content management. Features responsive design, authentication, and a clean reading experience.',
    builtWith: ['MongoDB', 'Express', 'React', 'Node.js'],
    liveUrl: 'https://senblog.vercel.app/',
  },
  {
    number: '05',
    title: 'SenTools',
    description:
      'A comprehensive utility toolkit web app with multiple developer and productivity tools built into a single platform. Clean UI with intuitive navigation.',
    builtWith: ['Next.js', 'JavaScript', 'Tailwind CSS'],
    liveUrl: 'https://sentools.vercel.app/',
    githubUrl: 'https://github.com/SUSHANK001-ops/SenTOols.git',
  },
]

/* ------------------------------------------------------------------ */
/*  Experience / Journey                                              */
/* ------------------------------------------------------------------ */

export const experience: ExperienceEntry[] = [
  {
    role: 'DevOps Training',
    company: 'Udemy',
    date: '2025 – 2026',
    description:
      'Completed Decoding DevOps — 63-hour course covering Linux, AWS, Docker, Kubernetes, Terraform, Ansible, Jenkins, GitHub Actions, Prometheus, Grafana, and ArgoCD. Built and deployed multi-tier applications on cloud environments.',
  },
  {
    role: 'Web Developer Intern',
    company: 'CYBIT · Remote',
    date: 'Aug – Nov 2025',
    description:
      'Deployed and maintained web applications on cloud infrastructure. Managed API development, server-side debugging, and sprint delivery across a 4-month remote engagement.',
  },
  {
    role: 'BSc IT',
    company: 'Asia Pacific University',
    date: '2024 – 2028 (Expected)',
    description:
      'Pursuing a Bachelor\'s degree in Information Technology at Asia Pacific University, with a focus on programming, data structures, algorithms, and software engineering.',
  },
]

/* ------------------------------------------------------------------ */
/*  Certifications                                                    */
/* ------------------------------------------------------------------ */

export const certifications: Certification[] = [
  { name: 'Red Hat Linux Starter', issuer: 'Red Hat', year: '2025' },
  { name: 'Decoding DevOps', issuer: 'Udemy', year: '2025' },
  { name: 'MERN Stack', issuer: 'Digital Pathshala', year: '2025' },
  { name: 'Full-Stack Web Dev', issuer: 'OneRoadmap', year: '2025' },
  { name: 'React Developer', issuer: 'Udemy', year: '2025' },
  { name: 'Python', issuer: 'DataFlair', year: '2025' },
]

/* ------------------------------------------------------------------ */
/*  Dashboard                                                         */
/* ------------------------------------------------------------------ */

/** Editable — update as you learn new things. */
export const currentlyLearning = 'Kubernetes Advanced Patterns'

/** Tools used daily — shown as an icon/label grid on the dashboard. */
export const dailyTools: string[] = [
  'VS Code', 'Docker', 'AWS', 'Linux', 'Git', 'Postman',
  'Cursor', 'Claude AI', 'GitHub Actions',
]

/**
 * Site analytics. Update manually, or wire to an analytics API later.
 * These render as plain number stats on the dashboard.
 */
export const analytics = {
  totalViews: '12.4k',
  uniqueVisitorsThisMonth: '1.8k',
  mostVisitedPage: '/projects',
}

/**
 * Latest blog post fallback. If the RSS fetch fails, the dashboard
 * shows this. Update when you publish something new.
 */
export const latestBlogFallback = {
  title: 'Getting Started with Docker & Kubernetes',
  date: '2025-09-01',
  excerpt:
    'A practical walkthrough of containerizing an app and deploying it to a Kubernetes cluster.',
  url: 'https://blog.sushanka.com.np/',
}

/* ------------------------------------------------------------------ */
/*  Nepali quote (footer)                                             */
/* ------------------------------------------------------------------ */

export const nepaliQuote = {
  text: 'विद्या ददाति विनयम्',
  translation: 'Knowledge gives humility — Hitopadesha',
}

/* ------------------------------------------------------------------ */
/*  Pull-quote shown after the blog section on the homepage           */
/* ------------------------------------------------------------------ */

export const blogQuote = {
  lines: ['sad birds still fly'],
  attribution: '',
}
