# Codex Bootstrap Prompt

Copy this into Codex from the project directory where you want Cofounder Crew installed.

```text
Set up Cofounder Crew in this project and explain each meaningful action as you go.

Use https://github.com/eugeneyvt/cofounder-crew as the reference if you need more context. Work from the current project cwd. Do not commit, push, publish, or overwrite existing AGENTS.md or .cofounder files without asking.

Goal:
- install the current Cofounder npm package when this project has package.json
- initialize or repair the project-local Cofounder setup
- install or repair the Codex MCP entry
- verify the setup
- tell me exactly how to start using the team from Codex

Process:

1. Inspect the current state first.
   Check:
   - current cwd
   - node --version and npm --version
   - codex --version
   - whether package.json exists
   - whether package.json already contains cofounder-crew in dependencies or devDependencies
   - whether .cofounder/team.yaml exists
   - whether AGENTS.md exists
   - whether AGENTS.md contains the Cofounder Crew bridge
   - whether this is a Git repo
   - whether Git HEAD exists
   - whether Codex MCP server "cofounder" exists and points to:
     npx -y --package cofounder-crew -- cofounder serve mcp

2. Install the package before using the local CLI when package.json exists.
   - If package.json exists, run:
     npm install --save-dev cofounder-crew@latest
   - If package.json does not exist, do not create package.json just for Cofounder. Use npm create or npx with --package instead.
   - Do not install Cofounder globally.
   - If npx cofounder cannot resolve after install, use:
     npx -y --package cofounder-crew@latest -- cofounder <command>

3. Initialize or repair with the CLI.
   - If .cofounder/team.yaml is missing and package.json exists, run:
     npx cofounder start --setup-codex --yes
   - If .cofounder/team.yaml is missing and package.json does not exist, run:
     npm create cofounder@latest -- --setup-codex --yes
   - If .cofounder/team.yaml already exists, do not re-run init. Run the safe updater instead:
     npx cofounder update --setup-codex --yes
     or, without a local dependency:
     npx -y --package cofounder-crew@latest -- cofounder update --setup-codex --yes
   - Use --template worktree only if I explicitly asked for isolated worktrees or this repo clearly already uses that workflow. Worktree mode requires a Git repo with at least one commit.

4. Preserve user-owned files.
   - Do not overwrite AGENTS.md.
   - If AGENTS.md exists but the Cofounder bridge is missing, show me the exact bridge block and explain that I should add it for proactive delegation.
   - Do not overwrite existing member prompts, member settings, memory files, or project-owned MCP files.
   - Do not add root .gitignore entries automatically. Only report recommended ignore entries if they are missing.

5. Verify before claiming success.
   Run:
   - npx cofounder doctor
   - codex mcp get cofounder, if Codex CLI is available
   - npm ls cofounder-crew --depth=0, if package.json exists

6. Final response format.
   Tell me:
   - what package/version is installed or selected
   - which files were created or changed
   - whether AGENTS.md needs a manual bridge block
   - whether I need to restart Codex
   - the first message to send after restart:
     Use the Cofounder team. Show me who is available.
   - the 3 most useful follow-up commands:
     cofounder add
     cofounder doctor
     cofounder team

Do not stop after printing commands unless a command would be unsafe. Actually perform the safe setup steps, then report the result.
If a verification step fails, do not say the setup is complete. Explain the failure and the next command or manual step needed.
```
