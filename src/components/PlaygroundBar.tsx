/* PlaygroundBar.tsx — the way back to the role switch from inside the product.
 *
 * A visitor who opens the client room or the freelancer dashboard is still in
 * the playground's tab session. This is a link, not a second identity control:
 * the switch itself stays on /playground so there is one place that explains
 * what changing roles does.
 */
import { Link, useLocation } from "react-router-dom";
import { readPlaygroundSession } from "../lib/playground";

export default function PlaygroundBar() {
  const { pathname } = useLocation();
  const session = readPlaygroundSession();

  if (!session || pathname === "/playground" || pathname.startsWith("/playground/")) return null;

  return (
    <Link className="pg-float" to="/playground" data-testid="playground-switch">
      Playground · switch role
    </Link>
  );
}
