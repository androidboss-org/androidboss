# Security policy

## Reporting a vulnerability

Please don't report security problems in public issues, discussions or pull requests.

Use [private vulnerability reporting](https://github.com/androidboss-org/androidboss/security/advisories/new) instead. Include what is affected, how to reproduce it and what an attacker could do with it. We aim to reply within 7 days and will keep you updated until it is fixed. With your permission, we credit you in the advisory.

## Scope

- the `androidboss` npm package (the CLI and the local stdio MCP server);
- the hosted MCP servers at `https://androidboss.info/mcp` and `https://mcp.androidboss.org/mcp`;
- the code in this repository, including the GitHub Actions workflows and the release process.

Rate limits and input caps on the hosted servers are documented; reaching them is not a vulnerability. Problems in third-party dependencies are welcome too if they affect AndroidBoss.

## Supported versions

Fixes go into the latest release of `androidboss` on npm. Please update before reporting, and check that each release you install has [npm provenance](https://docs.npmjs.com/generating-provenance-statements) from this repository.
