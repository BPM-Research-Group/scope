"""Shared helpers: neutral tree/log format, converters, and pattern normalisation.

Neutral tree format (JSON):
  operator: {"op": "seq"|"xor"|"par"|"loop", "children": [...]}
  identity: {"op": "id", "left": "o", "right": "i", "kind": "ImpOrdered"|"Sync", "children": [child]}
  leaf:     {"act": "a" | None (tau), "rel": [...], "div": [...], "con": [...], "def": [...]}
Every node may carry "hl": true to be highlighted in the report diagram.

Neutral log format: list of [activity, [object ids]]; the object type is the
leading letters of the id (o1 -> o, i12 -> i). Event i gets timestamp t0 + i seconds.
"""
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

OP_SYMBOL = {"seq": "→", "xor": "×", "par": "∧", "loop": "↺"}


# ---------------------------------------------------------------- tree builders
def L(act, rel, div=(), con=(), def_=(), hl=False):
    return {"act": act, "rel": sorted(rel), "div": sorted(div), "con": sorted(con), "def": sorted(def_), "hl": hl}


def TAU(rel, hl=False):
    # tau leaves carry all types in every set (mirrors the repo's load_from_pt)
    return L(None, rel, rel, rel, rel, hl=hl)


def OP(op, *children, hl=False):
    return {"op": op, "children": list(children), "hl": hl}


def ID(left, right, child, kind="ImpOrdered", hl=False):
    return {"op": "id", "left": left, "right": right, "kind": kind, "children": [child], "hl": hl}


def otype(oid):
    return re.match(r"[A-Za-z_]+", oid).group(0)


# ---------------------------------------------------------------- log output
def to_ocel2_json(events):
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    objs = sorted({o for _, os in events for o in os})
    return {
        "objectTypes": [{"name": t, "attributes": []} for t in sorted({otype(o) for o in objs})],
        "eventTypes": [{"name": a, "attributes": []} for a in sorted({a for a, _ in events})],
        "objects": [{"id": o, "type": otype(o), "attributes": [], "relationships": []} for o in objs],
        "events": [
            {
                "id": f"e{i + 1}",
                "type": a,
                "time": (t0 + timedelta(seconds=i + 1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "attributes": [],
                "relationships": [{"objectId": o, "qualifier": ""} for o in os],
            }
            for i, (a, os) in enumerate(events)
        ],
    }


# ---------------------------------------------------------------- rust4pm tree (serde OCPT)
def to_rust(node):
    if "op" in node:
        if node["op"] == "id":
            op_type = {"IdentityRelation": {"left": [node["left"]], "right": [node["right"]], "kind": node["kind"]}}
        else:
            op_type = {"seq": "Sequence", "xor": "ExclusiveChoice", "par": "Concurrency", "loop": {"Loop": None}}[node["op"]]
        return {"Operator": {"uuid": str(uuid.uuid4()), "operator_type": op_type,
                             "children": [to_rust(c) for c in node["children"]]}}
    return {"Leaf": {
        "uuid": str(uuid.uuid4()),
        "activity_label": {"Activity": node["act"]} if node["act"] else "Tau",
        "related_ob_types": node["rel"], "divergent_ob_types": node["div"],
        "convergent_ob_types": node["con"], "deficient_ob_types": node["def"],
    }}


# ---------------------------------------------------------------- mermaid
def to_mermaid(tree):
    lines = ["flowchart TD"]
    hl = []
    counter = [0]

    def label(n):
        if "op" in n:
            if n["op"] == "id":
                arrow = "⇔" if n["kind"] == "Sync" else "⇒"
                return f"id: {n['left']} {arrow} {n['right']}"
            return OP_SYMBOL[n["op"]]
        name = n["act"] or "τ"
        if not n["act"]:
            return "τ"
        parts = [f"<b>{name}</b>", "rel " + ",".join(n["rel"])]
        for k in ("div", "con", "def"):
            if n[k]:
                parts.append(f"{k} " + ",".join(n[k]))
        return "<br/>".join(parts)

    def walk(n):
        nid = f"n{counter[0]}"
        counter[0] += 1
        shape = ('(("{}"))' if "op" in n and n["op"] != "id" else '["{}"]').format(label(n))
        lines.append(f"    {nid}{shape}")
        if n.get("hl"):
            hl.append(nid)
        for c in n.get("children", []):
            cid = walk(c)
            lines.append(f"    {nid} --> {cid}")
        return nid

    walk(tree)
    lines.append("    classDef hl fill:#ffe08a,stroke:#d97706,stroke-width:3px,color:#111")
    if hl:
        lines.append("    class " + ",".join(hl) + " hl")
    return "\n".join(lines)


# ---------------------------------------------------------------- normalised abstraction
# Every implementation output is normalised to:
#   {"df": {ot: [[a,b],...]}, "start": {ot: [...]}, "end": {ot: [...]},
#    "rel"|"div"|"def"|"con"|"opt": {a: [ot,...]},
#    "ident": [[ot1,ot2,a,b], ...]   # satisfied (log) / enforced (tree) implications
#   }
def dump(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, sort_keys=True, default=sorted)


def load(path):
    with open(path) as f:
        return json.load(f)
