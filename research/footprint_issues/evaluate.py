"""Loads the three outputs of a case and evaluates pattern probes uniformly."""
import itertools
import os

from common import load

IMPLS = ["python", "rust4pm", "paper"]
MULT = ["rel", "div", "def", "con", "opt"]


def norm_rust(r):
    """rust4pm abstraction (maps keyed by object type) -> normalised form keyed like Python."""
    def by_act(m):
        out = {}
        for ot, acts in m.items():
            for a in acts:
                out.setdefault(a, []).append(ot)
        return {a: sorted(v) for a, v in out.items()}

    return {
        "df": {ot: sorted(map(list, v)) for ot, v in r["directly_follows_ev_types_per_ob_type"].items()},
        "start": {ot: sorted(v) for ot, v in r["start_ev_type_per_ob_type"].items()},
        "end": {ot: sorted(v) for ot, v in r["end_ev_type_per_ob_type"].items()},
        "rel": by_act(r["related_ev_type_per_ob_type"]), "div": by_act(r["divergent_ev_type_per_ob_type"]),
        "def": by_act(r["deficient_ev_type_per_ob_type"]), "con": by_act(r["convergent_ev_type_per_ob_type"]),
        "opt": by_act(r["optional_ev_type_per_ob_type"]),
        "ident": sorted(map(list, r["ident"])),
    }


def load_case(d, literal=False):
    out = {"meta": load(f"{d}/meta.json"), "events": load(f"{d}/events.json"), "tree": load(f"{d}/tree.json")}
    py = load(f"{d}/out_python.json")
    out["python"] = py
    ru = load(f"{d}/out_rust4pm.json")
    out["rust4pm"] = {"log": norm_rust(ru["log"]), "tree": norm_rust(ru["tree"]), "conformance": ru["conformance"],
                      "tree_valid": ru["tree_valid"]}
    out["paper"] = load(f"{d}/out_paper.json")
    if os.path.exists(f"{d}/out_paper_literal.json"):
        out["paper_literal"] = load(f"{d}/out_paper_literal.json")
    return out


def impl_ident_universe(o):
    """Identity universe of the implementations: a != b, ot1 != ot2, related to both in log or tree."""
    lr, tr = o["log"]["rel"], o["tree"]["rel"]
    acts = set(lr) | set(tr)
    types = {t for v in list(lr.values()) + list(tr.values()) for t in v}
    def ok(rel, a, b, x, y):
        return all(t in rel.get(c, []) for c in (a, b) for t in (x, y))
    return {(x, y, a, b) for a, b in itertools.permutations(acts, 2) for x, y in itertools.permutations(types, 2)
            if ok(lr, a, b, x, y) or ok(tr, a, b, x, y)}


def probe(c, impl, side, p):
    """Value of pattern p on 'log' or 'tree' side: 1, 0, or '—' (not part of the pattern universe)."""
    o = c[impl]
    if "error" in o:
        return "error"
    a = o[side]
    k = p[0]
    if k == "df":
        return int([p[2], p[3]] in a["df"].get(p[1], []))
    if k in ("start", "end"):
        return int(p[2] in a[k].get(p[1], []))
    if k in MULT:
        return int(p[2] in a[k].get(p[1], []))
    if k == "ident":
        key = tuple(p[1:])
        if impl.startswith("paper"):
            ones = o["conformance"]["ident_ones"][side]
            return int(list(map(str, ("ident",) + key)) in ones)
        if key not in impl_ident_universe(o):
            return "—"
        return int(list(key) not in a["ident"])
    raise ValueError(p)


def fmt_probe(p):
    k = p[0]
    if k == "df":
        return f"df<sub>{p[1]}</sub>({p[2]}→{p[3]})"
    if k in ("start", "end"):
        return f"{k}<sub>{p[1]}</sub>({p[2]})"
    if k == "ident":
        return f"implies({p[3]},{p[4]} : {p[1]}⇒{p[2]})"
    names = {"rel": "rel", "div": "div (a>1)", "def": "def (ot<1)", "con": "con (ot>1)", "opt": "opt (a<1)"}
    return f"{names[k]}({p[1]},{p[2]})"
