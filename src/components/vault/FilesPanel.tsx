/* FilesPanel.tsx — the left column: what was delivered, and whether it is
   yours yet. 0.618 of the room, so it stays narrow and every row is a 55px
   line with the lock on the right that the whole screen turns on. */

import { useState } from "react";
import { useToast } from "../shared/Toasts";
import { useRoom } from "./room";
import { Chevron, Download, FileIcon, Folder, Globe, Lock, LockOpen } from "./icons";

export function FilesPanel() {
  const { detail, status, unlocking } = useRoom();
  const toast = useToast();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const files = detail?.files ?? [];
  const unlocked = status === "unlocked";
  const locked = !unlocked;
  const count = files.length;

  return (
    <section className="room-panel room-files" aria-labelledby="room-files-h" data-enter="files">
      <figure className="room-figure">
        <img className="room-figure-img" src="/vault-frames/f_001.webp" alt="" aria-hidden="true" />
      </figure>

      <header className="room-files-head">
        <h2 id="room-files-h" className="room-h">
          Deliverables
        </h2>
        <span className="room-mono">{count} FILES</span>
      </header>

      <ul className="room-file-list">
        {files.map((file, i) => {
          const expanded = !!open[file.id];
          const isFolder = file.kind === "folder";
          return (
            <li key={file.id} className="room-file-wrap" style={{ "--i": i } as React.CSSProperties}>
              <div className="room-file" data-kind={file.kind}>
                <div className="room-file-main">
                  <span className="room-file-icon" aria-hidden="true">
                    {file.kind === "url" ? (
                      <Globe width="16" height="16" />
                    ) : isFolder ? (
                      <Folder width="16" height="16" />
                    ) : (
                      <FileIcon width="16" height="16" />
                    )}
                  </span>
                  <span className="room-file-body">
                    <span className="room-file-name">{file.name}</span>
                    <span className="room-file-sub">
                      {file.kind === "url" ? (
                        <span className="room-live">
                          <span className="room-live-dot" aria-hidden="true" />
                          LIVE
                        </span>
                      ) : (
                        <span className="room-file-meta">{file.meta}</span>
                      )}
                      {unlocked && file.kind === "file" && (
                        <button
                          type="button"
                          className="room-dl"
                          onClick={() => toast({ message: "Download starts in the real build." })}
                        >
                          <Download width="11" height="11" />
                          <span>Download</span>
                        </button>
                      )}
                    </span>
                  </span>
                </div>

                {isFolder && (
                  <button
                    type="button"
                    className="room-file-toggle"
                    aria-expanded={expanded}
                    aria-label={`${file.name}, ${file.meta}`}
                    onClick={() => setOpen((p) => ({ ...p, [file.id]: !p[file.id] }))}
                  >
                    <Chevron className="room-file-chevron" data-open={expanded ? "true" : undefined} width="14" height="14" />
                  </button>
                )}

                {file.kind === "url" ? (
                  <a className="room-file-link" href={file.url} target="_blank" rel="noreferrer">
                    open
                  </a>
                ) : (
                  <span
                    className="room-lock"
                    data-open={unlocked ? "true" : undefined}
                    title={locked ? "Locked until payment is captured." : "Unlocked"}
                    aria-label={locked ? "Locked" : "Unlocked"}
                    role="img"
                  >
                    {unlocked ? <LockOpen width="16" height="16" /> : <Lock width="16" height="16" />}
                  </span>
                )}

              </div>

              {isFolder && expanded && (
                <ul className="room-file-children">
                  {(file.children ?? []).map((child) => (
                    <li key={child} className="room-file-child">
                      <FileIcon width="13" height="13" />
                      <span>{child}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="room-download-all"
        disabled={locked}
        title={locked ? "Unlocks after capture." : "Download every file in this delivery."}
        onClick={() => toast({ message: "Download starts in the real build." })}
      >
        <Download width="16" height="16" />
        Download all
      </button>

      {unlocking && <span className="room-files-sweep" aria-hidden="true" />}
    </section>
  );
}
