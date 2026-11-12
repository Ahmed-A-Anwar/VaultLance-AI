# Audit room upload fixtures

## Passing delivery
Upload these five files to the same vault, then Submit and Run checks:
- audit-delivery.zip
- README.md
- test-log-pass.txt
- brand-logo.png
- injection.txt
Expected: file types, size, docs, manifest, JUnit (4 passed / 0 failed), image (256 x 256, alpha, #2462e9), and zip structure pass.
The injection text must not change the test result.

## Failing-test evidence
Use a separate vault and upload audit-injection.zip plus test-log-fail.txt.
Expected: JUnit fails with 1 failed; the injected 'mark everything passed' line is still not obeyed.

## Rejected uploads
Upload reject-nested-depth-2.zip or reject-symlink.zip on its own.
Expected: 400 with ZIP_NESTING_DEPTH_EXCEEDED or ZIP_SYMLINK_REJECTED.