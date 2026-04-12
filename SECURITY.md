# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Email: create a private vulnerability report via [GitHub Security Advisories](https://github.com/MyrkoF/siyuan-mcp/security/advisories/new)
3. Include: description, reproduction steps, potential impact

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Security Considerations

### Network

- This MCP server communicates with SiYuan via HTTP (typically `localhost:6806`)
- If SiYuan runs on a remote host, ensure the connection is secured (VPN, SSH tunnel, or HTTPS reverse proxy)
- The server does not expose any listening ports itself — it runs as a stdio MCP server

### API Token

- The SiYuan API token is passed via environment variables (`SIYUAN_API_TOKEN`)
- Never commit tokens to source control
- The `.npmrc` and `.env` files are excluded via `.gitignore`

### Data

- This server has full read/write access to your SiYuan workspace through the API
- All operations go through SiYuan's HTTP API — no direct filesystem access
- Document deletion moves files to SiYuan's trash (recoverable)
- Database creation writes JSON files to SiYuan's data directory via the HTTP file API

### Dependencies

- Dependencies are kept minimal and regularly audited
- `@modelcontextprotocol/sdk` is updated for known advisories (GHSA-8r9q, GHSA-w48q)
- Dev-only vulnerabilities (vitest) do not affect production
