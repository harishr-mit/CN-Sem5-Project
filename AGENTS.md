## Context \& Status Tracking (required)

Before doing anything, read till the latest record of Change log of `log.md` to get the current context and task status. While working, use `log.md` as your todo list: add tasks as `\[ ]`, mark `\[\~]` when you start, `\[x]` when done (or `\[!]` with notes if it fails), and log every change to files in this directory so later agents can diagnose and resume after a mid-run failure.

## Dependencies (strict)

Keep every dependency install local to the project: Maven/Gradle dependencies through the project build (use the committed wrapper, `./mvnw`), npm packages without `-g` (run tools with `npx`), and services through `docker compose`. Never install anything globally (`npm -g`, system packages, a JDK/Maven/Node on the machine, global PATH or registry changes) unless it is absolutely necessary, and then only after asking the user and getting explicit permission. Log any approved global install in `log.md`. Maven's shared download cache (`~/.m2`) doesn't count as a global install.

## Code Index (atomic)

Use the atomic index by default for symbol lookup, definitions, callers/callees and call-graph questions before falling back to grep. It is a SQLite database at `.claude/.atomic-index/atomic.db` (tables: `nodes`, `edges`, `files`, `unresolved_refs`, FTS table `nodes_fts`). Open it read-only (`sqlite3 -readonly` or `file:...?mode=ro`) and never write to it.

## Requirements \& Docs Sync (required)

Whenever the owner changes requirements, goals, rules, controls, scope or phase order, update every affected document in the same run, before or alongside the code: `GAMERULES.md` (gameplay rules + constants), `PHASES.md` (goals/phases/order), `README.md`, `docs/*` (`PROTOCOL`, `DEMO_SCRIPT`, `ASSUMPTIONS`), `NoBu-Shooter/assets/README.md` (assets) and the "Current Status" in `log.md`. Mark not-yet-implemented rules as planned, record the change in the `log.md` Change Log, and never leave a doc describing superseded behaviour.

## Mid-run Behavior

* Use the appropriate skills whenever possible.
* Do not use any of the mattpocock-skills without explicit permission from the user.
* Do not leave any download or dependancy artifact unhandled
* Always go through .gitignore after every install and update if necessary
* No dependany shall be tracked or pushed, unless absolutely necessary

## End of Run Behavior

At the end of the run, before the fininshing summary, please ensure the following:

* Ensure all running instances are terminated, unless explicitly requested for a running instance.
* Ensure 0 background tasks and 0 open sockets remaining.
* Review the docs related to the current task/bug and add/modify them to reflect changes/fixes made.

## User Preferences

* refer to .claude\user.md for user preferencec
* if you find out that the user prefers a certain thing a certain way, update that to the markdown file
