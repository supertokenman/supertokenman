/** "1 turn", "3 turns", "1,204 files": a count with its noun, in the right number. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}
