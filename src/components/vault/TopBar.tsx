/* TopBar.tsx — 55px of chrome with a hairline under it: the way back and the
   project. The status chip and vault code used to sit on the right; the phase
   stepper below already carries the state, so the bar stays to the title. */

import { Link } from "react-router-dom";
import { ArrowLeft } from "./icons";

export function TopBar({ project, freelancer }: { project: string; freelancer: string }) {
  return (
    <header className="room-bar" data-enter="bar">
      <Link to="/dashboard" className="room-back" aria-label="Back to dashboard">
        <ArrowLeft className="room-back-icon" width="16" height="16" />
        <span className="room-back-text">Back to dashboard</span>
      </Link>

      <div className="room-title-wrap">
        <h1 className="room-title">{project}</h1>
        <p className="room-sub">{freelancer}</p>
      </div>
    </header>
  );
}
