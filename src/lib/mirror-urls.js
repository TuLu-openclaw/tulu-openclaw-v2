/**
 * Official GitHub URL helpers.
 * Release and repository links must stay on the formal GitHub source.
 */

const GITHUB_ORG = 'https://github.com/TuLu-openclaw'
const RELEASE_BASE = `${GITHUB_ORG}/tulu-openclaw-v2/releases/latest`

export async function repoUrl(repo, path = '') {
  return `${GITHUB_ORG}/${repo}${path}`
}

export function repoBothUrls(repo, path = '') {
  const github = `${GITHUB_ORG}/${repo}${path}`
  return { github }
}

export function deployCommand() {
  return {
    github: `curl -fsSL -o deploy.sh ${RELEASE_BASE}/download/deploy.sh && bash deploy.sh`,
  }
}
