## Context \& Status Tracking (required)

Before doing anything, read the first 90 lines of `log.md` to get the current context and task status. While working, use `log.md` as your todo list: add tasks as `\[ ]`, mark `\[\~]` when you start, `\[x]` when done (or `\[!]` with notes if it fails), and log every change to files in this directory so later agents can diagnose and resume after a mid-run failure.

At the end of the run, before the fininshing summary, please ensure the following:

* Ensure all running instances are terminated, unless explicitly requested for a running instance.
* Ensure 0 background tasks and 0 open sockets remaining.
* Review the docs related to the current task/bug and add/modify them to reflect changes/fixes made.