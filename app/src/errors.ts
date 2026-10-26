// Errors as people read them: the IPC wrapper removed, and the common failures said plainly with
// what to do next. Anything not recognized is shown as it came.

const RULES: [RegExp, string][] = [
  [/GitHub answered 401/i, 'GitHub did not accept the token. Add a valid GITHUB_PERSONAL_ACCESS_TOKEN in Connections, or run gh auth login.'],
  [/GitHub answered 403.*rate limit|API rate limit exceeded/i, 'GitHub rate limit reached. A token in Connections raises it.'],
  [/GitHub answered 404/i, 'GitHub could not find it, or the token cannot see this repository.'],
  [/CREDENTIALS_MISSING|gcloud auth login|Reauthentication required/i, 'not signed in on this Mac. Run gcloud auth login to see your projects.'],
  [/Unable to locate credentials|ExpiredToken|InvalidClientTokenId/i, 'not signed in on this Mac. Run aws configure or aws sso login.'],
  [/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|fetch failed|network/i, 'No connection right now. Check the network and try again.'],
  [/ENOENT.*(gh|gcloud|aws|docker|doctl|flyctl)\b|command not found/i, 'The command line tool is not installed on this Mac.'],
]

export function friendly(text = ''): string {
  const t = text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  for (const [re, say] of RULES) {
    if (!re.test(t)) continue
    // keep a leading "Provider:" so the message says whose login it is
    const who = /^([A-Z][\w .]+): /.exec(t)?.[1]
    return who && !say.startsWith(who) && /^[a-z]/.test(say) ? `${who}: ${say}` : say.charAt(0).toUpperCase() + say.slice(1)
  }
  return t
}

export const clean = (e: unknown) => friendly(e instanceof Error ? e.message : String(e))
