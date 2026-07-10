"""Stage 6: ingest the challenge's YouTube walkthrough into the graph.

Auto-captions -> timestamped segments -> LLM proposes video_moment nodes
linked (demonstrated_in) to existing procedure/setting/failure_mode nodes.
Output is written to data/.../video_moments.json; build_graph merges it on
the next rebuild, so the moments become first-class, citable graph nodes
with timestamp sources.

Run:  uv run python -m omnipro_pipeline.ingest_video [--subs path.json3]
"""

import argparse
import json
import subprocess
from pathlib import Path

from pydantic import BaseModel

from .build_graph import GRAPH_PATH, canonical_id
from .extract import DATA_DIR
from .llm import extract_structured
from .schema import Graph, GraphEdge, GraphNode, Source

VIDEO_ID = "kxGDoGcnhBw"
VIDEO_URL = f"https://www.youtube.com/watch?v={VIDEO_ID}"
MOMENTS_PATH = DATA_DIR.parent / "video_moments.json"
CACHE = Path(__file__).resolve().parents[1] / ".cache"
SEGMENT_SECONDS = 45


def download_subs() -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / "video"
    subs = CACHE / "video.en.json3"
    if not subs.exists():
        subprocess.run(
            ["yt-dlp", "--skip-download", "--write-auto-subs", "--sub-langs", "en",
             "--sub-format", "json3", "-o", str(out), VIDEO_URL],
            check=True, capture_output=True,
        )
    return subs


def to_segments(subs_path: Path) -> list[dict]:
    events = [e for e in json.loads(subs_path.read_text())["events"] if e.get("segs")]
    segments: list[dict] = []
    cur_start, cur_text = None, []
    for e in events:
        t = e.get("tStartMs", 0) / 1000
        text = "".join(s.get("utf8", "") for s in e["segs"]).replace("\n", " ").strip()
        if not text:
            continue
        if cur_start is None:
            cur_start = t
        cur_text.append(text)
        if t - cur_start >= SEGMENT_SECONDS:
            segments.append({"start": round(cur_start), "text": " ".join(cur_text)})
            cur_start, cur_text = None, []
    if cur_text and cur_start is not None:
        segments.append({"start": round(cur_start), "text": " ".join(cur_text)})
    return segments


class Moment(BaseModel):
    name: str
    summary: str
    timestamp_s: int
    linked_node_ids: list[str] = []


class MomentProposal(BaseModel):
    moments: list[Moment]


SYSTEM = """You extract useful moments from a hands-on video about the Vulcan OmniPro 220 welder.
A useful moment DEMONSTRATES something a manual can only describe: a setup step performed on
camera, a setting being dialed in, a weld technique, a mistake and its fix, a real-world
observation about the machine. Skip intro chatter, sponsor talk, and generic opinions.
For each moment: a concrete name ('Loading a 2lb flux-cored spool'), a 1-2 sentence summary of
what is SHOWN, the timestamp (start of the relevant segment), and ids from the provided node
catalog that this moment demonstrates (only ids from the catalog, only genuinely related ones)."""


def catalog() -> str:
    g = Graph.model_validate_json(GRAPH_PATH.read_text())
    return "\n".join(
        f"{n.id}: {n.name}"
        for n in g.nodes
        if n.type in ("procedure", "setting", "failure_mode", "component", "process")
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subs", type=Path, default=None)
    args = ap.parse_args()

    subs = args.subs or download_subs()
    segments = to_segments(subs)
    print(f"{len(segments)} transcript segments", flush=True)

    cat = catalog()
    all_moments: list[Moment] = []
    BATCH = 20
    for i in range(0, len(segments), BATCH):
        chunk = segments[i : i + BATCH]
        body = "\n\n".join(f"[t={s['start']}s] {s['text']}" for s in chunk)
        prop = extract_structured(
            SYSTEM,
            [{"type": "text", "text": f"Node catalog:\n{cat}\n\nTranscript segments:\n{body}"}],
            MomentProposal,
        )
        all_moments.extend(prop.moments)
        print(f"  segments {i + len(chunk)}/{len(segments)}: {len(prop.moments)} moments", flush=True)

    g = Graph.model_validate_json(GRAPH_PATH.read_text())
    known = {n.id for n in g.nodes}
    nodes, edges, seen = [], [], set()
    for m in all_moments:
        nid = canonical_id("video_moment", m.name)
        if nid in seen:
            continue
        seen.add(nid)
        mins, secs = divmod(m.timestamp_s, 60)
        nodes.append(
            GraphNode(
                id=nid,
                type="video_moment",
                name=m.name,
                summary=m.summary,
                data={
                    "video_id": VIDEO_ID,
                    "timestamp_s": m.timestamp_s,
                    "label": f"{mins}:{secs:02d}",
                    "url": f"https://youtu.be/{VIDEO_ID}?t={m.timestamp_s}",
                },
                sources=[Source(doc="video", timestamp=float(m.timestamp_s))],
            ).model_dump()
        )
        for target in m.linked_node_ids:
            if target in known:
                edges.append(GraphEdge(source=target, target=nid, type="demonstrated_in").model_dump())

    MOMENTS_PATH.write_text(json.dumps({"nodes": nodes, "edges": edges}, indent=1))
    print(f"{len(nodes)} video moments, {len(edges)} demonstrated_in edges -> {MOMENTS_PATH}")


if __name__ == "__main__":
    main()
