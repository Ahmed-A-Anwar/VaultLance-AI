import { describe, expect, it } from "vitest";
import { addFiles, deliveryReady, markScanned, removeFile } from "./delivery";
import { archiveProblem } from "./mockApi";

const file = (name: string, size = 500) => ({ name, size });

describe("the delivery's extension rule", () => {
  it("takes the documents the server already accepts", () => {
    for (const name of ["README.md", "test-log.txt", "spec.pdf", "site.zip", "data.json"]) {
      expect(archiveProblem(name, 500)).toBeNull();
    }
  });

  it("refuses a type outside the allowlist, and says which one", () => {
    expect(archiveProblem("setup.dmg", 500)).toBe("That file type isn’t accepted.");
    expect(archiveProblem("games.exe", 500)).toBe("That file type isn’t accepted.");
    expect(archiveProblem("README", 500)).toBe("That file type isn’t accepted.");
  });

  it("keeps the size limit and the blocked name, whichever file they arrive on", () => {
    expect(archiveProblem("huge.md", 100 * 1024 * 1024 + 1)).toBe("That delivery is over the 100 MB limit.");
    expect(archiveProblem("bomb.txt", 500)).toBe("That file failed the scan: its name is on the blocked list.");
  });
});

describe("a delivery of several files", () => {
  it("stays closed until every picked file has passed its own scan", () => {
    const readme = file("README.md");
    const log = file("test-log.txt");

    let picked = addFiles<ReturnType<typeof file>>([], [readme, log]);
    expect(deliveryReady(picked, false)).toBe(false);

    picked = markScanned(picked, readme, true);
    expect(deliveryReady(picked, false)).toBe(false);

    picked = markScanned(picked, log, true);
    expect(deliveryReady(picked, false)).toBe(true);
  });

  it("stays closed while a scan is still running, even with every earlier file passed", () => {
    const readme = file("README.md");
    const picked = markScanned(addFiles([], [readme]), readme, true);
    expect(deliveryReady(picked, true)).toBe(false);
    expect(deliveryReady(picked, false)).toBe(true);
  });

  it("stays closed on an empty delivery, and on a file whose scan failed", () => {
    expect(deliveryReady([], false)).toBe(false);

    const readme = file("README.md");
    const log = file("test-log.txt");
    const picked = markScanned(markScanned(addFiles([], [readme, log]), readme, true), log, false);
    expect(deliveryReady(picked, false)).toBe(false);
  });

  it("drops a file's verdict when the file is removed", () => {
    const readme = file("README.md");
    const log = file("test-log.txt");
    let picked = markScanned(markScanned(addFiles([], [readme, log]), readme, true), log, true);
    expect(deliveryReady(picked, false)).toBe(true);

    picked = removeFile(picked, readme);
    expect(picked.map((p) => p.file.name)).toEqual(["test-log.txt"]);
    expect(deliveryReady(picked, false)).toBe(true);

    picked = removeFile(picked, log);
    expect(deliveryReady(picked, false)).toBe(false);

    /* the same file back in the list is unverified again, not silently passed */
    picked = addFiles(picked, [readme]);
    expect(picked[0].ok).toBe(false);
    expect(deliveryReady(picked, false)).toBe(false);
  });
});
