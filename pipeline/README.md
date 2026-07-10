# Knowledge Pipeline

Offline pipeline that turns the Vulcan OmniPro 220 documentation (48-page owner
manual, quick-start guide, selection chart) into a typed, page-grounded
knowledge graph plus rendered pages and figure crops.

**You do not need to run this to use the app.** All outputs are committed:

- `data/products/vulcan-omnipro-220/graph.json` — the knowledge graph
  (568 nodes, ~1.4k edges; 12 node types, 10 edge types)
- `data/products/vulcan-omnipro-220/pages/*.json` — per-page structured
  extraction (verbatim text, tables as data, figure descriptions, key facts)
- `public/products/vulcan-omnipro-220/pages/*.png` — page renders (150 dpi)
- `public/products/vulcan-omnipro-220/figures/*.png` — figure crops (300 dpi)

## Design in one paragraph

Every fact in the graph is a typed node carrying `sources: [{doc, page,
figure_id}]` — the schema rejects ungrounded nodes, so citation is guaranteed
by construction. Retrieval is deterministic (alias-aware keyword matching into
graph traversal); there is intentionally **no vector index**: on a fixed
51-page corpus, embeddings add a retrieval-miss failure mode on exactly the
cross-reference questions that matter (duty cycle at a specific voltage,
polarity per process), while build-time LLM-generated aliases ("stinger" →
electrode holder) plus typed edges (`causes`, `resolved_by`,
`incompatible_with`, `differs_by`) cover recall and multi-hop reasoning.

## Stages

| Stage | Command | What it does |
|---|---|---|
| 1. Render | `uv run python -m omnipro_pipeline.render` | Pages → 150dpi PNGs; figure regions detected from vector-drawing clusters (this manual's diagrams are line art, not raster) + callout-label absorption |
| 2. Extract | `uv run python -m omnipro_pipeline.extract --all` (resume: `--missing`) | Each page (image + text layer) → Claude vision → schema-validated JSON; model bboxes snapped to detected PDF-point regions |
| 3. Crop | `uv run python -m omnipro_pipeline.crop_all` | Every figure region → committed 300dpi PNG |
| 4. Graph | `uv run python -m omnipro_pipeline.build_graph` | Deterministic base (product/process/page/figure nodes) + per-section LLM proposals (chunked, disk-cached) → canonical-id merge → alias enrichment |
| 5. Gate | `uv run python -m omnipro_pipeline.verify_landmarks` | 12 must-pass checks on the facts users will actually ask about (duty cycles per voltage, polarity inversions, aluminum-TIG incompatibility, grounding completeness) |

## Running it yourself

```bash
cd pipeline
uv sync
# .env at repo root: ANTHROPIC_API_KEY=... (or OPENROUTER_API_KEY for dev)
uv run python -m omnipro_pipeline.render
uv run python -m omnipro_pipeline.extract --all   # ~$5-10 of API usage
uv run python -m omnipro_pipeline.crop_all
uv run python -m omnipro_pipeline.build_graph     # ~$3
uv run python -m omnipro_pipeline.verify_landmarks
uv run pytest                                     # 17 tests
```

Interrupted runs resume free: extraction skips existing pages (`--missing`),
graph proposals are cached per section in `.cache/`.

## Notable honesty constraint

The landmark gate asserts only facts the documents actually contain. Example:
the manual never mentions zinc specifically — so the gate requires the general
fume-safety warning (p3) and the galvanized-steel application (selection
chart) as separate grounded nodes, and the agent composes them. A gate that
demanded a "zinc fume warning" node would be demanding a hallucination.
