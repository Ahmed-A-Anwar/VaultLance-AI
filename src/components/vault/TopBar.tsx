/* TopBar.tsx — 55px of chrome with a hairline under it: the way back, the
   project, and where the vault stands. */

import { Link } from "react-router-dom";
import { StatusChip } from "../shared/StatusChip";
import type { VaultStatus } from "../../lib/api";
import { ArrowLeft } from "./icons";

export function TopBar({
  project,
  freelancer,
  status,
  code,
}: {
  project: string;
  freelancer: string;
  status: VaultStatus;
  code: string;
}) {
  return (
    <header className="room-bar" data-enter="bar">
      <Link to="/dashboard" className="room-back">
        <ArrowLeft className="room-back-icon" width="16" height="16" />
        <span className="room-back-text">Back to dashboard</span>
      </Link>

      <div className="room-title-wrap">
        <h1 className="room-title">{project}</h1>
        <p className="room-sub">{freelancer}</p>
      </div>

      <div className="room-bar-right">
        <StatusChip status={status} />
        <span className="room-code">VAULT {code}</span>
      </div>
    </header>
  );
}
