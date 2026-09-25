export type TestEnvironmentsApi = {
  /** Distinct free TCP ports on this machine (not valid for SSH hosts). */
  allocateLocalPorts: (count: number) => Promise<number[]>
}
