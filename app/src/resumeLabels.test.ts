import { describe, expect, it } from 'vitest'
import { resumeLabels } from './resumeLabels'

describe('resumeLabels', () => {
  it('counts the same folder instead of repeating it', () => expect(resumeLabels(['/Users/yujiarima', '/Users/yujiarima'])).toEqual(['yujiarima (2)']))
  it('adds the parent when two folders share a name', () => expect(resumeLabels(['/a/dev/api', '/a/old/api', '/a/dev/web'])).toEqual(['dev/api', 'old/api', 'web']))
})
