import type { CalendarEvent } from '../../calendar/client.ts'
import { layout } from '../partials/layout.ts'
import { topbar } from '../partials/topbar.ts'
import { footer } from '../partials/footer.ts'
import { hero } from '../partials/hero.ts'
import { escHtml } from '../lib/html.ts'

export function renderCalendar(events: CalendarEvent[]): string {
  const body = `
${topbar()}

<main class="container">

  ${hero({
    eyebrowLeft: 'Calendar',
    eyebrowRight: String(new Date().getFullYear()),
    titleHtml: `What's <em>coming up</em>.`,
    metaHtml: [
      `<b>${events.length || '—'}</b> upcoming event${events.length === 1 ? '' : 's'}`,
    ],
  })}

  <section class="section">
    ${
      events.length === 0
        ? `<p class="empty">No upcoming events.</p>`
        : `<div class="grid-3">${events.map(eventCard).join('')}</div>`
    }
  </section>

</main>

${footer()}`

  return layout({ title: 'Calendar', body })
}

function eventCard(event: CalendarEvent): string {
  const { dateLabel, timeLabel } = formatRange(event.start, event.end)
  return `<a class="doc-card" href="${escHtml(event.htmlLink)}" target="_blank" rel="noopener noreferrer">
  <div class="top">
    <span class="tag tag-blue">${escHtml(dateLabel)}</span>
  </div>
  <h3>${escHtml(event.title)}</h3>
  <p class="excerpt">
    <time datetime="${event.start.toISOString()}">${escHtml(timeLabel)}</time>${event.location ? ' · ' + escHtml(event.location) : ''}
  </p>
  <div class="foot">
    <small>Open in Calendar →</small>
  </div>
</a>`
}

function formatRange(start: Date, end: Date): { dateLabel: string; timeLabel: string } {
  const dateLabel = start.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const timeLabel = `${start.toLocaleTimeString('en-GB', opts)} – ${end.toLocaleTimeString('en-GB', opts)}`
  return { dateLabel, timeLabel }
}
