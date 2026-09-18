---
name: project-docs-workflow
description: >-
  Mandatory documentation pre-check and post-change synchronization workflow.
  Use this skill before making any code modifications to read software architecture,
  README, and CHANGELOG to prevent unnecessary token consumption and ground architectural context.
  Use after code modifications to ensure CHANGELOG.md and README.md are updated.
---

# Project Documentation Pre-Check & Auto-Update Workflow

This skill enforces reading essential project documentation **before** making code changes and updating `CHANGELOG.md` and `README.md` **after** making code changes.

## Phase 1: Pre-Change Context Gathering (Token & Context Optimization)

Before initiating any source code changes, bug fixes, refactoring, or feature additions:

1. **Read Architecture Documentation**:
   - Inspect [`software_architecture.md`](file:///h:/Github/SNOC/software_architecture.md) to understand overall system topology, database schemas, component boundaries, and design principles.
2. **Read README**:
   - Inspect [`README.md`](file:///h:/Github/SNOC/README.md) to review feature descriptions, setup steps, configuration parameters, and API endpoints.
3. **Read Recent Changelog**:
   - Inspect top entries of [`CHANGELOG.md`](file:///h:/Github/SNOC/CHANGELOG.md) to understand recent versioning, recent additions, and active changes.

> **Goal**: Reading these core files first ensures full alignment with existing architectural constraints and avoids wasting tokens on redundant file searches or incompatible structural changes.

---

## Phase 2: Implementation

Proceed with the requested code changes, adhering strictly to the architecture, design principles, and patterns discovered in Phase 1.

---

## Phase 3: Post-Change Documentation Synchronization

Immediately following code changes:

1. **Update `CHANGELOG.md`**:
   - Append a concise entry under the `[Unreleased]` or latest active section in [`CHANGELOG.md`](file:///h:/Github/SNOC/CHANGELOG.md).
   - Use standard Keep a Changelog categories: `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, or `Security`.
2. **Update `README.md`**:
   - Check if [`README.md`](file:///h:/Github/SNOC/README.md) needs updates due to changes in:
     - Installation / launch scripts
     - New or modified API endpoints or UI components
     - Environment configuration / database schema changes
     - Added, modified, or deprecated features
