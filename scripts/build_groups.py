"""Build randomized picnic groups from the Luma guest CSV.

Privacy: only name / first_name / last_name are carried into the output.
Email, phone, guest_id, qr_code_url, and all other columns are dropped.

Outputs:
  data/groups.json     - plain JSON payload
  data/groups.data.js  - same object as window.PICNIC_GROUPS (works over file://)
"""

import csv
import json
import random
from pathlib import Path

CSV_PATH = Path(
    r"C:\Users\ethan\Downloads"
    r"\2nd Annual YCombinator Startup School Picnic - Guests - 2026-07-24-03-35-22.csv"
)
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

SEED = 20260724
GROUP_SIZE = 49


def load_guests(csv_path: Path) -> list[dict]:
    guests = []
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Include ALL guests regardless of approval_status (explicit choice).
            guests.append(
                {
                    "name": (row.get("name") or "").strip(),
                    "first": (row.get("first_name") or "").strip(),
                    "last": (row.get("last_name") or "").strip(),
                }
            )
    return guests


def build_groups(guests: list[dict]) -> list[dict]:
    shuffled = list(guests)
    random.Random(SEED).shuffle(shuffled)

    groups = []
    for i in range(0, len(shuffled), GROUP_SIZE):
        chunk = shuffled[i : i + GROUP_SIZE]
        # Sort within each group by last name (then first) for display.
        chunk.sort(key=lambda m: (m["last"].casefold(), m["first"].casefold()))
        gid = i // GROUP_SIZE + 1
        groups.append(
            {
                "id": gid,
                "name": f"Group {gid}",
                "size": len(chunk),
                "members": chunk,
            }
        )
    return groups


def main() -> None:
    guests = load_guests(CSV_PATH)
    groups = build_groups(guests)

    payload = {
        "seed": SEED,
        "total_guests": len(guests),
        "group_size": GROUP_SIZE,
        "groups": groups,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    json_text = json.dumps(payload, ensure_ascii=False, indent=2)
    (DATA_DIR / "groups.json").write_text(json_text + "\n", encoding="utf-8")
    (DATA_DIR / "groups.data.js").write_text(
        "window.PICNIC_GROUPS = " + json_text + ";\n", encoding="utf-8"
    )

    sizes = [g["size"] for g in groups]
    print(f"Guests: {len(guests)}")
    print(f"Groups: {len(groups)}")
    print(f"Sizes: {sizes}")
    print(f"Total members: {sum(sizes)}")


if __name__ == "__main__":
    main()
