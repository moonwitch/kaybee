import { google } from 'googleapis'

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
})

const calendar = google.calendar({ version: 'v3', auth })

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  start: Date
  end: Date
  location: string
  htmlLink: string
}

/**
 * Returns upcoming events across every calendar id in `calendarIds`,
 * sorted by start time. `days` controls how far ahead to look.
 */
export async function listUpcomingEvents(
  calendarIds: string[],
  days: number = 14,
): Promise<CalendarEvent[]> {
  const now = new Date()
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const perCalendar = await Promise.all(
    calendarIds.map((id) => fetchOne(id, now, horizon)),
  )

  return perCalendar
    .flat()
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

async function fetchOne(
  calendarId: string,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  try {
    const response = await calendar.events.list({
      calendarId,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    })

    return (response.data.items ?? []).map((e) => ({
      id: e.id ?? '',
      calendarId,
      title: e.summary ?? '(no title)',
      start: parseDate(e.start?.dateTime ?? e.start?.date),
      end: parseDate(e.end?.dateTime ?? e.end?.date),
      location: e.location ?? '',
      htmlLink: e.htmlLink ?? '',
    }))
  } catch (err) {
    console.error(`[calendar] Failed to fetch ${calendarId}:`, err)
    return []
  }
}

function parseDate(s: string | null | undefined): Date {
  if (!s) return new Date(0)
  return new Date(s)
}
