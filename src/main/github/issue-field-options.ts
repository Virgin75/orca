import type { GitHubAssignableUser } from '../../shared/github/pull-request-types'
import type { IssueSourcePreference } from '../../shared/repo-types'
import type { LocalGitExecOptions } from './gh-utils'
import {
  resolveGitHubRepoExecution,
  resolveIssueGitHubApiRepositorySource
} from './github-api-repository'
import { acquire, ghExecFileAsync, release } from './gh-utils'

export async function listLabels(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string[]> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(
    repoPath,
    async () =>
      (
        await resolveIssueGitHubApiRepositorySource(
          repoPath,
          preference,
          connectionId,
          localGitOptions
        )
      ).source,
    connectionId,
    localGitOptions
  )
  if (!ownerRepo) {
    return []
  }
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '--paginate',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/labels`,
        '--jq',
        '.[].name'
      ],
      ghOptions
    )
    return stdout
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
  } catch {
    return []
  } finally {
    release()
  }
}

/** Label name → hex color (no `#`). Desktop-only companion to `listLabels`, whose
 *  string[] shape crosses the runtime RPC boundary and must stay unchanged. */
export async function listLabelColors(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<Record<string, string>> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(
    repoPath,
    async () =>
      (
        await resolveIssueGitHubApiRepositorySource(
          repoPath,
          preference,
          connectionId,
          localGitOptions
        )
      ).source,
    connectionId,
    localGitOptions
  )
  if (!ownerRepo) {
    return {}
  }
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '--paginate',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/labels`,
        '--jq',
        '.[] | [.name, .color] | @tsv'
      ],
      ghOptions
    )
    const colors: Record<string, string> = {}
    for (const line of stdout.split('\n')) {
      const [name, color] = line.split('\t')
      if (name && color && /^[0-9a-f]{6}$/i.test(color.trim())) {
        colors[name] = color.trim().toLowerCase()
      }
    }
    return colors
  } catch {
    return {}
  } finally {
    release()
  }
}

export async function listAssignableUsers(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitHubAssignableUser[]> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(
    repoPath,
    async () =>
      (
        await resolveIssueGitHubApiRepositorySource(
          repoPath,
          preference,
          connectionId,
          localGitOptions
        )
      ).source,
    connectionId,
    localGitOptions
  )
  if (!ownerRepo) {
    return []
  }
  await acquire()
  try {
    // Why: paginate through all assignable users — GraphQL's assignableUsers
    // maxes out at 100 per page and large orgs/repos silently lose assignees
    // beyond the first page. REST /assignees with --paginate walks every page;
    // --jq collapses per-page arrays into NDJSON so we don't have to stitch
    // JSON arrays that gh concatenates back-to-back.
    const { stdout } = await ghExecFileAsync(
      [
        'api',
        '--paginate',
        `repos/${ownerRepo.owner}/${ownerRepo.repo}/assignees?per_page=100`,
        '--jq',
        '.[] | {login, avatar_url}'
      ],
      ghOptions
    )
    type RESTAssignee = { login?: string; avatar_url?: string | null }
    const users: GitHubAssignableUser[] = []
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      try {
        const user = JSON.parse(trimmed) as RESTAssignee
        if (user.login) {
          users.push({
            login: user.login,
            name: null,
            avatarUrl: user.avatar_url ?? ''
          })
        }
      } catch {
        // Skip malformed NDJSON lines defensively.
      }
    }
    return users
  } catch {
    return []
  } finally {
    release()
  }
}
