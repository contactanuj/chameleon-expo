# Security Policy

## Supported versions

The latest release on the default branch is supported. Older versions are not
maintained.

## Reporting a vulnerability

This is an **offline, on-device** app (no backend, no network calls during play),
so its attack surface is small. The most relevant area is untrusted input from
user-created **custom topics**, which the UI HTML-escapes before rendering.

If you find a security issue (for example, a way to inject markup/script through a
custom topic, or any data-handling concern):

1. **Do not** open a public issue.
2. Use **GitHub → Security → Report a vulnerability** (private advisory), or contact
   a maintainer privately.
3. Include steps to reproduce and the affected file(s)/version.

We will acknowledge the report, investigate, and coordinate a fix and disclosure.

## Secrets

Never commit credentials. Build tokens (e.g. `EXPO_TOKEN`) belong in a local,
git-ignored `.env` or in CI secrets — see `.env.example`.
