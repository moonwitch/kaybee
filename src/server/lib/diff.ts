/**
 * Minimal line-based diff for the version history view.
 * Classic LCS over lines, with common prefix/suffix trimming so typical
 * doc edits (a few changed paragraphs) stay cheap. No dependencies.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  line: string
}

/** Guards the O(n·m) DP table — beyond this the middle is shown as replaced. */
const MAX_DP_CELLS = 4_000_000

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')

  // Trim common prefix.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++

  // Trim common suffix (never overlapping the prefix).
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)

  const out: DiffLine[] = []
  for (let i = 0; i < start; i++) out.push({ type: 'same', line: a[i]! })
  out.push(...diffMiddle(midA, midB))
  for (let i = endA; i < a.length; i++) out.push({ type: 'same', line: a[i]! })
  return out
}

function diffMiddle(a: string[], b: string[]): DiffLine[] {
  if (a.length === 0) return b.map((line) => ({ type: 'add' as const, line }))
  if (b.length === 0) return a.map((line) => ({ type: 'del' as const, line }))

  if (a.length * b.length > MAX_DP_CELLS) {
    // Degenerate fallback for enormous edits: whole middle replaced.
    return [
      ...a.map((line) => ({ type: 'del' as const, line })),
      ...b.map((line) => ({ type: 'add' as const, line })),
    ]
  }

  // LCS lengths. lcs[i][j] = LCS of a[i..] and b[j..]
  const w = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!)
    }
  }

  // Walk the table emitting ops.
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', line: a[i]! })
      i++
      j++
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      out.push({ type: 'del', line: a[i]! })
      i++
    } else {
      out.push({ type: 'add', line: b[j]! })
      j++
    }
  }
  while (i < a.length) out.push({ type: 'del', line: a[i++]! })
  while (j < b.length) out.push({ type: 'add', line: b[j++]! })
  return out
}

export interface DiffStats {
  added: number
  removed: number
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'del') removed++
  }
  return { added, removed }
}
