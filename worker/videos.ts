// Checking videos in batches small enough for one Durable Object call each
// (see CHECK_BATCH in family.ts).
import { CHECK_BATCH, type Checked } from './family'
import type { familyStub } from './auth'

export async function checkVideos(stub: ReturnType<typeof familyStub>, ids: string[]): Promise<Record<string, Checked>> {
  const unique = [...new Set(ids)]
  const out: Record<string, Checked> = {}
  for (let i = 0; i < unique.length; i += CHECK_BATCH) Object.assign(out, await stub.check(unique.slice(i, i + CHECK_BATCH)))
  return out
}
