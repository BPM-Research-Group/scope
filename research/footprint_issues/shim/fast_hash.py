# Pure-Python stand-in for the repo's Cython module fast_hash.pyx (identical logic; the
# committed binary is a Windows .pyd and cannot be loaded on macOS).
import hashlib
def compute_hash_map(eids, oids):
    groups = {}
    for eid, oid in zip(eids, oids):
        groups.setdefault(eid, set()).add(oid)
    return {eid: int(hashlib.md5(str(sorted(s)).encode("utf_8")).hexdigest(), 16) for eid, s in groups.items()}
