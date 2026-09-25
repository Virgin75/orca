export type TestEnvironmentPort = {
  id: string
  /** Placeholder name, referenced as `{{NAME}}` and exported as `$NAME`. */
  name: string
}

export type TestEnvironmentEnvVar = {
  id: string
  key: string
  value: string
}

export type TestEnvironmentSetup = {
  id: string
  name: string
  env: TestEnvironmentEnvVar[]
  script: string
  /** Id of another setup in the same test env that must be ready before this one starts. */
  dependsOn?: string
  /** Port name that tells dependents this setup is ready once it accepts connections. */
  readyPort?: string
}

export type TestEnvironmentRepo = {
  id: string
  repoId: string
  setups: TestEnvironmentSetup[]
}

export type TestEnvironment = {
  id: string
  name: string
  color: string
  ports: TestEnvironmentPort[]
  repos: TestEnvironmentRepo[]
  /** May reference ports as `{{NAME}}`. */
  publicUrl: string
}

/** What the desktop tells the runtime about a test env started in a workspace. */
export type TestEnvironmentRunSummary = {
  envId: string
  envName: string
  worktreeId: string
  ports: Record<string, number>
  publicUrl: string
  startedAt: number
  setups: { setupName: string; repoName: string; cwd: string }[]
}
