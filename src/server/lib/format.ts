export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export function mimeLabel(mimeType: string | undefined): string {
  switch (mimeType) {
    case 'application/vnd.google-apps.document': return 'Doc'
    case 'application/vnd.google-apps.spreadsheet': return 'Sheet'
    case 'application/vnd.google-apps.presentation': return 'Slides'
    case 'application/vnd.google-apps.form': return 'Form'
    default: return ''
  }
}

/**
 * Native Google edit URL for a Drive file, picked by mime type.
 * Falls back to drive.google.com/open which redirects to the right app.
 */
export function driveEditUrl(mimeType: string | undefined, id: string): string {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return `https://docs.google.com/document/d/${id}/edit`
    case 'application/vnd.google-apps.spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${id}/edit`
    case 'application/vnd.google-apps.presentation':
      return `https://docs.google.com/presentation/d/${id}/edit`
    case 'application/vnd.google-apps.form':
      return `https://docs.google.com/forms/d/${id}/edit`
    default:
      return `https://drive.google.com/open?id=${id}`
  }
}
