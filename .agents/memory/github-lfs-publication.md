---
name: GitHub LFS publication
description: Publishing Git LFS objects when Replit's GitHub API connection is available but its Git transport cannot authenticate.
---

Use an interactive GitHub CLI device sign-in in the Replit shell before attempting a Git LFS upload when the connected GitHub integration can call the repository API but Git or Git LFS rejects its HTTPS credential.

**Why:** The Replit GitHub connector can successfully perform authenticated repository API operations without providing a credential accepted by GitHub's Git/LFS batch transport. Git Data API calls also have practical payload limits for large base64 blobs, so they are not an LFS-upload substitute.

**How to apply:** Keep the branch and its LFS pointer files intact, ask the user to complete `gh auth login` through the shell's device flow without sharing a credential in chat, then run `git lfs push <remote> <branch>` and validate with a clean clone plus `git lfs pull`.