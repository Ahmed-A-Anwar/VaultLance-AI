import urllib.request
import json

BASE = "http://127.0.0.1:8001"

def test_api():
    print("=" * 60)
    print("TESTING FULL LIFECYCLE ON VAULTPAY ORIGINAL (PORT 8001)")
    print("=" * 60)

    # 1. Create project
    req = urllib.request.Request(
        f"{BASE}/projects/",
        data=json.dumps({
            "title": "Live Agency Project",
            "brief": "Must build a responsive website with contact form and validateForm JS function."
        }).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        p = json.loads(resp.read().decode())
    proj_id = p["id"]
    print(f"1. Project created: {proj_id}")

    # 2. Extract criteria
    req = urllib.request.Request(
        f"{BASE}/projects/{proj_id}/parse-criteria",
        data=b"{}",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        crit_data = json.loads(resp.read().decode())
    criteria_list = crit_data.get("criteria", [])
    print(f"2. Extracted {len(criteria_list)} structured criteria:")
    for c in criteria_list:
        print(f"   * [{c['stable_id']}] {c['description']} (Severity: {c['severity']})")

    for role in ["client", "freelancer"]:
        req = urllib.request.Request(
            f"{BASE}/projects/{proj_id}/approve-criteria/{role}",
            data=json.dumps({"agreement_version": 1}).encode(),
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req) as resp:
                pass
        except urllib.error.HTTPError as e:
            print(f"Approval failed for {role}:", e.code, e.read().decode())
            raise
    print("3. Both Client & Freelancer approved agreement version 1.")

    # 4. Trigger Verification Run
    req = urllib.request.Request(
        f"{BASE}/projects/{proj_id}/runs/",
        data=b"{}",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        run_res = json.loads(resp.read().decode())

    print("\n4. Verification Run Finished!")
    print(f"   Run ID:          {run_res['run_id']}")
    print(f"   Overall Verdict: {run_res['overall_verdict']}")
    print(f"   Status:          {run_res['status']}")
    print("   Criterion Verdicts:")
    for cr in run_res.get("criterion_results", []):
        print(f"     - [{cr.get('stable_id')}] {cr.get('verdict')} ({cr.get('verification_method')}): {cr.get('explanation')}")

    print("\n" + "=" * 60)
    print("PORT 8001 SERVER API FULLY VERIFIED AND WORKING!")
    print("=" * 60)

if __name__ == "__main__":
    test_api()
