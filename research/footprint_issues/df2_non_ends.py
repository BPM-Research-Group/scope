"""Python-only check of src/divergence_free_graph.py (DF2 graph used by the repo's miner).

Usage: python df2_non_ends.py <repo_dir> <shim_dir> <out_dir>
Log: one object o1 with trace <a, b>. The DF2 graph should have start {a} and end {b}.
"""
import sys

repo, shim, out_dir = sys.argv[1:4]
sys.path[:0] = [shim, repo, __file__.rsplit("/", 1)[0]]
import os  # noqa: E402

import pm4py  # noqa: E402
from src.divergence_free_graph import get_divergence_free_graph  # noqa: E402
from src.interaction_properties import get_interaction_patterns  # noqa: E402

from common import dump, to_ocel2_json  # noqa: E402

events = [["a", ["o1"]], ["b", ["o1"]]]
os.makedirs(out_dir, exist_ok=True)
dump(f"{out_dir}/events.json", events)
dump(f"{out_dir}/log.json", to_ocel2_json(events))
rel_df = pm4py.read_ocel2_json(f"{out_dir}/log.json").relations
div, con, rel, defi = get_interaction_patterns(rel_df)
g = get_divergence_free_graph(rel_df, div, rel)
dump(f"{out_dir}/out_python.json", {"df": sorted(map(list, g.graph)), "start": sorted(g.start_activities),
                                    "end": sorted(g.end_activities)})
