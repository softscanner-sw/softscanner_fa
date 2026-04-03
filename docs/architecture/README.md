# Architecture Diagrams

PlantUML diagrams modeling the current system and B5 dependency structure.
Grounded in `docs/paper/approach.md`, `docs/ROADMAP.md`, and `CLAUDE.md`.

## Diagram Set

| File | Purpose |
|---|---|
| `01-artifact-pipeline.puml` | Artifact/dataflow dependencies across Phase A and Phase B. Shows which phase produces each artifact and which later stages consume it. |
| `02-term-relationships.puml` | Semantic relationships between core terms (workflow, test, plan, manifest, oracle, coverage, observability). |
| `03A-pipeline-logging.puml` | Contract A: Framework/system pipeline JSONL logs. CLIs → JSONL files → Developer/CI. |
| `03B-runtime-observability.puml` | Contract B: Per-test B5.0 runtime execution logs and screenshots. B2 emission → B3 runtime → logs/screenshots → visualization. |
| `03C-determinism-summaries.puml` | Contract C: Canonical stage-summary JSON artifacts and determinism verification scripts. |
| `04A-b5-dependency-graph.puml` | B5.0–B5.6 strict dependency DAG. Hard dependencies only. |
| `04B-b5-impact-mapping.puml` | B5 substage → subsystem impact. Which substages require changes in A1, B1, B2, B3, B4, or spec. |

## Rendering

```bash
# Local (requires Java + plantuml.jar):
java -jar plantuml.jar docs/architecture/*.puml

# Online:
# Paste .puml content at https://www.plantuml.com/plantuml/uml/
```

## Grounding

All concepts, numbering, and relationships are derived from the current authoritative docs:
- `docs/paper/approach.md` — normative spec (B5.0–B5.6 definitions, evidence classes, oracle tiers)
- `docs/ROADMAP.md` — work sequencing (Stage 5/6 status)
- `CLAUDE.md` — implementation discipline (logging architecture, phase isolation)
