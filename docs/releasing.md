# Releasing

Publishing runs through GitHub Actions and npm Trusted Publishing.

Trusted publisher setup is the same workflow for both npm packages:

| Package | GitHub repository | Workflow |
| --- | --- | --- |
| `cofounder-crew` | `eugeneyvt/cofounder-crew` | `publish-npm.yml` |
| `create-cofounder` | `eugeneyvt/cofounder-crew` | `publish-npm.yml` |

Release flow:

```bash
npm version <new-version> --no-git-tag-version
npm version <new-version> --workspace create-cofounder --no-git-tag-version
git add package.json package-lock.json packages/create-cofounder/package.json
git commit -m "chore: release v<new-version>"
git tag v<new-version>
git push origin main --tags
```

Then publish the GitHub release for the `vX.Y.Z` tag. The workflow checks, builds, tests, and publishes both npm packages.
