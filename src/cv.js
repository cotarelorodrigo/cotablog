// CV data cycled through by the left-side console. Each entry renders as a terminal
// "command" followed by its output block.
//
//   cmd  — the command typed after the prompt (e.g. 'cat experience/strike')
//   out  — array of output lines printed under it
//   url  — optional; makes the whole card clickable and shows a ↗ in the header
//
// Edit freely — add/remove/reorder entries or lines.

export const cvEntries = [
  {
    cmd: 'whoami',
    out: [
      'Rodrigo Cotarelo — Software Engineer',
      '8+ yrs · backend · data · full-stack',
      'Ex-CTO & founder · 30k users · VC-backed',
    ],
  },
  {
    cmd: 'cat experience/strike',
    out: [
      'Senior Software Developer · 2024 → now',
      'AI engineering for pentesting agents',
      'Auto-retest agent · deep MCP & tooling',
    ],
  },
  {
    cmd: 'cat experience/bluerabbit',
    out: [
      'CTO & Co-founder · 2021 → 2024',
      'Gamified community app → 30k users',
      '#6 App Store AR · 500Latam + Startup Chile',
    ],
    url: 'https://www.forbesargentina.com/innovacion/quienes-son-argentinos-llamaron-atencion-venture-capital-500-global-su-red-social-universidades-n22769',
  },
  {
    cmd: 'cat experience/etermax',
    out: [
      'Data Engineer · 2021',
      'Pipelines: Airflow, Spark, Python, AWS',
    ],
  },
  {
    cmd: 'cat experience/7puentes',
    out: [
      'Software Developer · 2018 → 2021',
      'ML models for Mercado Libre, Rappi, Heineken',
    ],
  },
  {
    cmd: 'cat education',
    out: ['Software Engineer — Univ. of Buenos Aires', '2020'],
  },
  {
    cmd: 'skills --list',
    out: [
      'Next.js · React/RN · Python · FastAPI',
      'GCP · Docker · Firebase · Langchain · SQL',
      'ES native · EN B2',
    ],
  },
  {
    cmd: 'contact',
    out: [
      'linkedin.com/in/rodrigo-cotarelo',
      'cotarelorodrigo@gmail.com',
      'Buenos Aires, Argentina',
    ],
    url: 'https://linkedin.com/in/rodrigo-cotarelo/',
  },
];
