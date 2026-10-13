# -*- mode: Python -*-

update_settings(k8s_upsert_timeout_secs=120)

# -------------------------------------------------------------
# 1. Operator Service (Go Controller Manager)
# -------------------------------------------------------------
local_resource(
    'operator-binary',
    cmd='CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o bin/manager-linux cmd/main.go',
    deps=['cmd/main.go', 'api', 'internal', 'pkg', 'go.mod', 'go.sum'],
    labels=['operator'],
)

docker_build(
    'controller:latest',
    '.',
    dockerfile_contents='''
FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY bin/manager-linux /manager
USER 65532:65532
ENTRYPOINT ["/manager"]
''',
    only=['bin/manager-linux'],
    live_update=[
        sync('bin/manager-linux', '/manager'),
        restart_container(),
    ],
)

# Apply kustomize default config for operator
k8s_yaml(kustomize('config/default'))

k8s_resource(
    'powder-controller-manager',
    port_forwards=['8443:8443'],
    labels=['operator'],
)

# -------------------------------------------------------------
# 2. Backend API Gateway (Go/Gin Bridge)
# -------------------------------------------------------------
local_resource(
    'gateway-binary',
    cmd='CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o bin/gateway-linux cmd/api-gateway/main.go',
    deps=['cmd/api-gateway', 'pkg/gateway', 'api'],
    labels=['gateway'],
)

docker_build(
    'api-gateway:latest',
    '.',
    dockerfile_contents='''
FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY bin/gateway-linux /api-gateway
USER 65532:65532
ENTRYPOINT ["/api-gateway"]
''',
    only=['bin/gateway-linux'],
    live_update=[
        sync('bin/gateway-linux', '/api-gateway'),
        restart_container(),
    ],
)

k8s_yaml(kustomize('config/gateway'))

k8s_resource(
    'powder-api-gateway',
    port_forwards=['8080:8080'],
    labels=['gateway'],
)

# -------------------------------------------------------------
# 3. Next.js Frontend UI (web/)
# -------------------------------------------------------------
local_resource(
    'frontend-dev',
    serve_cmd='cd web && npm run dev',
    deps=['web/src', 'web/package.json'],
    links=['http://localhost:3000'],
    labels=['frontend'],
)

# -------------------------------------------------------------
# 4. Custom Developer Action Buttons in Tilt UI
# -------------------------------------------------------------
# Trigger immediate reconciliation tick across resorts
local_resource(
    'trigger-reconcile-now',
    cmd='kubectl annotate resorttarget --all -n powder-system reconcile-trigger="$(date +%s)" --overwrite',
    auto_init=False,
    labels=['actions'],
)

# Reset fixtures to clean seeds
local_resource(
    'reset-fixtures',
    cmd='kubectl apply -f hack/manifests/seed-resorts.yaml -n powder-system',
    auto_init=False,
    labels=['actions'],
)
