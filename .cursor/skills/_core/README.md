# Core skills

Harness self-management lives here. **Do not reorganize this folder.** Other skills may depend on these paths.

| Skill | Purpose |
| --- | --- |
| `domain-registry/` | Read / update `knowledge/_meta/domains.md`. The only sanctioned mutator. |
| `knowledge-base/` | Author, update, prune KB entries per schema. |
| `drift-scan/` | Detect cross-layer drift; produce a triage report. |
| `scaffolding-author/` | Author new skills (service / domain / task) and decide on subagents. |
| `harness-audit/` | Holistic review + first-time setup. Hands off to the others. |

These skills compose:

```
/audit ──► harness-audit ──► drift-scan ──► (proposals)
                          ├─► domain-registry
                          ├─► knowledge-base
                          └─► scaffolding-author
```

Each is invocable on its own. `harness-audit` is the front door for periodic reviews and first-time setup.
