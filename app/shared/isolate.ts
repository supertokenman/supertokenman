// Isolated panel commands: Claude Code stays on this machine, but the Bash commands it runs go into a
// Docker container that has only the project folder mounted, no network until the person turns it on,
// no app secrets (no environment passed), no extra privileges, and limits on memory and processes.
// Idea from deer-flow's Docker sandbox; our own code.

export const DEFAULT_IMAGE = 'node:22-bookworm-slim'
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
export const containerOf = (sid: string) => `stm-iso-${sid.replace(/[^\w-]/g, '').slice(0, 40)}`

/** docker run arguments for a panel's container: the project mounted at the same path, network off. */
export function runArgs(name: string, cwd: string, image: string, user?: { uid: number; gid: number }): string[] {
  if (!/^[\w./:@-]+$/.test(image)) throw new Error('That image name has characters Docker does not use.')
  return [
    'run', '-d', '--rm', '--name', name,
    // phase 107: the app's own containers carry its label, so its Containers view finds only them
    '--label', 'stm=1', '--label', 'stm.kind=isolate',
    '--network', 'none',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '512', '--memory', '2g', '--cpus', '2',
    ...(user ? ['--user', `${user.uid}:${user.gid}`] : []),
    '-e', 'HOME=/tmp',
    '-v', `${cwd}:${cwd}`, '-w', cwd,
    image, 'sleep', 'infinity',
  ]
}

/** The Bash command Claude asked for, run in the container instead, from the same folder. */
export function wrap(name: string, cwd: string, command: string): string {
  return `docker exec -i -w ${shq(cwd)} ${name} sh -lc ${shq(command)}`
}

/** Whether a command is already wrapped (a second pass must not wrap it twice). */
export const isWrapped = (name: string, command: string) => command.startsWith(`docker exec -i -w `) && command.includes(` ${name} sh -lc `)
