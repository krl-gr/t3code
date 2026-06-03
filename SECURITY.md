# Security Policy

Up.computer is alpha software, but security reports are still taken seriously.

## Reporting A Vulnerability

Please do not open a public issue with vulnerability details, exploit steps,
tokens, private logs, or user data.

Use GitHub's private vulnerability reporting flow for this repository if it is
available. If private reporting is not available, contact the maintainer through
GitHub first and ask for a private reporting channel without including sensitive
details in the public message.

When reporting, include:

- affected version or commit
- affected operating system and install method
- a concise description of the impact
- minimal reproduction steps
- any relevant logs with secrets redacted

## Scope

Security-sensitive areas include:

- provider authentication and environment handling
- local and remote command execution
- source-control credentials and tokens
- SSH, network, and paired-environment flows
- update and release artifacts
- browser/runtime policy around agent tool use

## Expectations

This project does not currently run a paid bug bounty program. Please avoid
testing against systems or accounts you do not own, and do not disclose a
vulnerability publicly before the maintainer has had time to investigate.
