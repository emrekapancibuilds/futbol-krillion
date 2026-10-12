# Claude Code handoff

Read and follow `AGENTS.md`. The app is in `web/`; the data pipeline is in `pipeline/`.

Clone the GitHub repository into a separate directory and work on `claude/<task>`. Codex uses a different checkout and branch. Share changes through commits and pull requests, not concurrent edits to the same files.

Do not copy an older standalone one-time payment implementation over the tested subscription routes. First settle the billing model with the owner, then deliberately integrate any desired UI work.

Local environment values are intentionally excluded. Copy `web/.env.example` to an ignored file on a fresh clone and obtain credentials through the owner's local configuration. Never put them in a commit or a chat message.
