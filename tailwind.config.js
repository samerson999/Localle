/** @type {import('tailwindcss').Config} */
// Tudo aponta para as variáveis de src/styles/tokens.css: cores, fontes, raios e sombras.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] }, // .font-mono ganha zero cortado em base.css
      colors: {
        canvas: 'var(--canvas)', card: { DEFAULT: 'var(--card)', 2: 'var(--card-2)' },
        surface: { hover: 'var(--surface-hover)', selected: 'var(--surface-selected)', muted: 'var(--surface-muted)' },
        track: 'var(--track)', plate: { DEFAULT: 'var(--plate-bg)', ink: 'var(--plate-ink)', off: 'var(--plate-off-bg)' }, 'switch-off': 'var(--switch-off)', avatar: 'var(--avatar)', scrim: 'var(--scrim)',
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)', hover: 'var(--line-hover)' },
        ink: { DEFAULT: 'var(--ink)', hover: 'var(--ink-hover)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        'on-dark': { DEFAULT: 'var(--on-dark)', 2: 'var(--on-dark-2)', 3: 'var(--on-dark-3)', hover: 'var(--on-dark-hover)', 'btn-hover': 'var(--on-dark-btn-hover)' },
        real: { DEFAULT: 'var(--real)', soft: 'var(--real-soft)' },
        loss: { DEFAULT: 'var(--loss)', ink: 'var(--loss-ink)', soft: 'var(--loss-soft)' },
        pos: { DEFAULT: 'var(--pos)', soft: 'var(--pos-soft)' }, warn: { DEFAULT: 'var(--warn)', ink: 'var(--warn-ink)', soft: 'var(--warn-soft)' }, crit: { DEFAULT: 'var(--crit)', ink: 'var(--crit-ink)', soft: 'var(--crit-soft)' }, prev: 'var(--prev)',
        mov: 'var(--mov)', graphite: { DEFAULT: 'var(--graphite)', soft: 'var(--graphite-soft)' }, cluster: { DEFAULT: 'var(--cluster-bg)', ink: 'var(--cluster-ink)' },
        zone: { 1: 'var(--zone-1)', 2: 'var(--zone-2)', 3: 'var(--zone-3)', 4: 'var(--zone-4)' },
        brand: { DEFAULT: 'var(--brand)', fill: 'var(--brand-fill)', 'fill-hover': 'var(--brand-fill-hover)', 'fill-press': 'var(--brand-fill-press)', 'fill-ink': 'var(--brand-fill-ink)', halo: 'var(--brand-halo)', tip: 'var(--brand-tip)', 'tip-line': 'var(--brand-tip-line)', link: 'var(--brand-link)', ring: 'var(--brand-ring)', ink: 'var(--brand-ink)', counter: 'var(--brand-counter)', 'counter-ink': 'var(--brand-counter-ink)', soft: 'var(--brand-soft)', 'soft-line': 'var(--brand-soft-line)' },
      },
      borderRadius: { card: 'var(--r-card)', panel: 'var(--r-panel)', pop: 'var(--r-pop)', dock: 'var(--r-dock)', ctl: 'var(--r-ctl)', btn: 'var(--r-btn)', tight: 'var(--r-tight)', chip: 'var(--r-chip)', pill: 'var(--r-pill)', swatch: 'var(--r-swatch)' },
      boxShadow: { card: 'var(--shadow-card)', seg: 'var(--shadow-seg)', float: 'var(--shadow-float)', dock: 'var(--shadow-dock)', pop: 'var(--shadow-pop)', panel: 'var(--shadow-panel)', modal: 'var(--shadow-modal)' },
      // escala tipográfica de tokens.css: text-display, text-kpi, text-title, text-h2, text-h3, text-body, text-small, text-caption, text-axis
      fontSize: { display: ['var(--fs-display)', { lineHeight: 'var(--lh-display)', letterSpacing: 'var(--ls-display)' }], kpi: ['var(--fs-kpi)', { lineHeight: 'var(--lh-kpi)', letterSpacing: 'var(--ls-kpi)' }], title: ['var(--fs-title)', { lineHeight: 'var(--lh-title)', letterSpacing: 'var(--ls-title)' }], h2: ['var(--fs-h2)', { lineHeight: 'var(--lh-h2)', letterSpacing: 'var(--ls-h2)' }], h3: ['var(--fs-h3)', { lineHeight: 'var(--lh-h3)', letterSpacing: 'var(--ls-h3)' }], body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)' }], small: ['var(--fs-small)', { lineHeight: 'var(--lh-small)', letterSpacing: 'var(--ls-small)' }], caption: ['var(--fs-caption)', { lineHeight: 'var(--lh-caption)' }], axis: 'var(--fs-axis)' },
      // espaçamento semântico (tokens.css › espaçamento): o nome diz onde usar. Ver components/layout.tsx.
      spacing: {
        page: 'var(--page-x)', 'page-md': 'var(--page-x-md)', 'page-top': 'var(--page-top)', 'page-top-md': 'var(--page-top-md)', 'page-head': 'var(--page-head)', 'page-end': 'var(--page-end)',
        section: 'var(--gap-section)', grid: 'var(--gap-grid)',
        card: 'var(--pad-card)', 'card-sm': 'var(--pad-card-sm)', 'card-head': 'var(--card-head)', 'card-head-sm': 'var(--card-head-sm)', 'card-foot': 'var(--card-foot)',
        stack: 'var(--gap-stack)', tight: 'var(--gap-tight)', hair: 'var(--gap-hair)',
        'kpi-title': 'var(--kpi-title)', 'kpi-meta': 'var(--kpi-meta)', 'kpi-chart': 'var(--kpi-chart)',
        cell: 'var(--cell-x)', bleed: 'var(--bleed)',
        'field-label': 'var(--field-label)', field: 'var(--gap-field)', group: 'var(--gap-group)', 'form-actions': 'var(--form-actions)',
        icon: 'var(--gap-icon)', 'icon-head': 'var(--gap-icon-head)',
        ctl: 'var(--h-ctl)', 'ctl-sm': 'var(--h-ctl-sm)', 'ctl-lg': 'var(--h-ctl-lg)', row: 'var(--h-row)', 'row-sm': 'var(--h-row-sm)',
      },
    },
  },
  plugins: [],
};
