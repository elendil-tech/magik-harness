# Harness bundle manifest

The seed installed when this template is used for a new project. Designed to be **thin** — domain folders are created on demand, not pre-populated.

## What ships

```
.
├── AGENTS.md
├── README.md
├── .gitignore
├── .cursor/
│   ├── rules/
│   │   ├── harness.mdc
│   │   ├── domains.mdc
│   │   ├── knowledge-base.mdc
│   │   ├── skills-organization.mdc
│   │   ├── scaffolding.mdc
│   │   ├── subagents.mdc
│   │   └── drift-control.mdc
│   ├── skills/
│   │   ├── _core/
│   │   │   ├── README.md
│   │   │   ├── domain-registry/SKILL.md
│   │   │   ├── knowledge-base/SKILL.md
│   │   │   ├── drift-scan/SKILL.md
│   │   │   ├── scaffolding-author/SKILL.md
│   │   │   └── harness-audit/SKILL.md
│   │   ├── _templates/
│   │   │   ├── service-skill.md
│   │   │   ├── domain-skill.md
│   │   │   ├── task-skill.md
│   │   │   └── domain-agent.md
│   │   └── services/_index.md
│   ├── commands/
│   │   ├── audit.md
│   │   ├── drift-scan.md
│   │   └── kb-add.md
│   ├── agents/        (empty — domain agents are added on demand by scaffolding-author)
│   └── hooks/         (empty)
├── knowledge/
│   ├── _index.md
│   └── _meta/
│       ├── domains.md
│       ├── subdomain-catalogue.md
│       ├── glossary.md
│       └── schemas/
│           ├── concept.md
│           ├── decision.md
│           ├── policy.md
│           ├── specification.md
│           └── fieldnote.md
├── workspace/
│   ├── .gitkeep
│   └── README.md
└── bundles/
    ├── manifest.md
    └── INSTALL.md
```

## What does **not** ship

- No pre-created project domains. The user picks during `/audit`.
- No service skills. Add as needed via `scaffolding-author`.
- No subagents. Add only when a coherent role with a measurable success signal emerges.
- No CI/CD configs at the root. Those live in `codebase/` once the user adds it.
- No hooks. Users add their own.

## Versioning

This bundle is `harness@0.1.0`. The manifest is the canonical inventory. Any divergence in the seed is a drift item against this manifest.

## Updating an installed project

If the harness evolves, users can:

1. Pull the latest manifest paths from this repo.
2. Diff against their installed harness.
3. Apply selectively — `_core/` skills are the most likely thing to receive upgrades; project-specific files (KB entries, custom skills) should never be touched by an upgrade.

A future `harness-upgrade` skill could automate this; not in scope for v0.1.0.
