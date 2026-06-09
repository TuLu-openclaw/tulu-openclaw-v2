export const DOCKER_TASK_TIMEOUT_MS = 10 * 60 * 1000

export function buildDockerDispatchTargets(containers = []) {
  return (Array.isArray(containers) ? containers : [])
    .filter(item => item?.id)
    .map(item => ({
      containerId: item.id,
      containerName: item.name || item.id,
      nodeId: item.nodeId || 'local',
    }))
}

export function buildDockerInstanceSwitchContext(container = {}) {
  const containerId = String(container.containerId || container.id || '')
  const shortId = containerId.slice(0, 12)
  const port = Number.parseInt(container.port, 10)
  const gatewayPort = Number.parseInt(container.gatewayPort, 10)
  const name = container.name || `openclaw-${shortId || 'docker'}`
  return {
    instanceId: `docker-${shortId}`,
    reloadRoute: true,
    registration: {
      name,
      type: 'docker',
      endpoint: `http://127.0.0.1:${Number.isFinite(port) ? port : 1420}`,
      gatewayPort: Number.isFinite(gatewayPort) ? gatewayPort : 18789,
      containerId,
      nodeId: container.nodeId || 'local',
      note: 'Added from Docker page',
    },
  }
}
