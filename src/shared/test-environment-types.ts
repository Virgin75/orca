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
