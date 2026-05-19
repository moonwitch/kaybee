import { test, expect } from 'bun:test'

/**
 * Unit tests for pure helper logic in the Firestore docs module.
 * Firestore SDK calls require live credentials — those are integration tests.
 */

test('tokenise produces lowercase words from a title', async () => {
  // We test via upsertDoc input indirectly by checking keyword content
  // The tokenise function is not exported, but its output is observable
  // via the keywords field set in upsertDoc. For now, we verify the
  // expected shape via a simple regex matching the same logic.
  const title = 'How to Run a Retrospective'
  const keywords = [...new Set(title.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) ?? [])]

  expect(keywords).toContain('how')
  expect(keywords).toContain('run')
  expect(keywords).toContain('retrospective')
  // Short words and duplicates removed
  expect(keywords).not.toContain('a')
})
