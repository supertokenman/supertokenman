import { describe, expect, it } from 'vitest'
import { dockerTarget, sshHosts } from './targets'

describe('terminal targets', () => {
  it('reads concrete hosts from an ssh config and skips patterns', () => {
    const t = sshHosts(`# mine
Host prod web-1
  HostName 10.0.0.5
  User deploy
Host *
  ForwardAgent no
Host bastion
  HostName bastion.example.com
Match host x
  User nobody
Host evil;rm
`)
    expect(t.map((x) => [x.name, x.detail, x.command])).toEqual([
      ['prod', 'deploy@10.0.0.5', 'ssh prod'],
      ['web-1', 'deploy@10.0.0.5', 'ssh web-1'],
      ['bastion', 'bastion.example.com', 'ssh bastion'],
    ])
  })
  it('opens bash or sh in a container', () => {
    expect(dockerTarget({ id: 'abc123', name: 'api-db-1', image: 'postgres:16' }).command).toBe(`docker exec -it api-db-1 sh -c 'command -v bash >/dev/null && exec bash || exec sh'`)
  })
})
