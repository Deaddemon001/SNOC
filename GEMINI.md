# Workspace Rules & Policy

## Documentation Workflow Mandate

1. **Pre-Change Documentation Review (Token & Context Guard)**:
   - BEFORE undertaking any source code modifications, bug fixes, refactoring, or feature development, you MUST read the project documentation:
     - [`software_architecture.md`](file:///h:/Github/SNOC/software_architecture.md)
     - [`README.md`](file:///h:/Github/SNOC/README.md)
     - [`CHANGELOG.md`](file:///h:/Github/SNOC/CHANGELOG.md)
   - Adhere strictly to the [`project-docs-workflow`](file:///h:/Github/SNOC/.agents/skills/project-docs-workflow/SKILL.md) skill instructions. Do not start code edits without completing this context ground check.

2. **Post-Change Documentation Synchronization**:
   - WHENEVER code modifications are completed:
     - Update [`CHANGELOG.md`](file:///h:/Github/SNOC/CHANGELOG.md) with a clear summary of changes under `[Unreleased]` or the active version block (following `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security` categories).
     - Audit and update [`README.md`](file:///h:/Github/SNOC/README.md) if installation steps, features, configuration, or APIs were modified.
