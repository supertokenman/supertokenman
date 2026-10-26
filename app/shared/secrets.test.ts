import { describe, expect, it } from 'vitest'
import { findSecrets, mask, redact } from './secrets'

describe('secrets', () => {
  it('finds known formats and names them', () => {
    const text = `use sbp_${'a1'.repeat(20)} and ghp_${'X'.repeat(36)} with postgres://app:hunter2pass@db.neon.tech/main`
    expect(findSecrets(text).map((f) => f.name)).toEqual(['SUPABASE_ACCESS_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'DATABASE_URL'])
  })

  it('finds NAME=value assignments by the name', () => {
    expect(findSecrets('CLOUDFLARE_API_TOKEN=abcdEFGH1234ijkl5678 npx wrangler deploy')).toMatchObject([{ name: 'CLOUDFLARE_API_TOKEN', value: 'abcdEFGH1234ijkl5678' }])
    expect(findSecrets('SOME_FLAG=true and PORT=8080')).toEqual([])
  })

  it('finds saved credentials by value, whatever their format', () => {
    expect(findSecrets('curl -H "x-key: q9w8e7r6t5y4"', [{ name: 'MY_API', value: 'q9w8e7r6t5y4' }])).toMatchObject([{ kind: 'Saved credential', name: 'MY_API' }])
  })

  it('masks the middle of each value', () => {
    expect(mask('sbp_0123456789abcdef')).toBe('sbp_••••••••cdef')
    const r = redact(`token sk-ant-${'z'.repeat(30)} here`)
    expect(r.text).toBe('token sk-a••••••••zzzz here')
    expect(r.found).toHaveLength(1)
  })

  it('leaves ordinary text alone', () => {
    expect(findSecrets('run npm test and check src/my_secret_utils.ts, commit a1b2c3d4e5f6')).toEqual([])
  })
})
