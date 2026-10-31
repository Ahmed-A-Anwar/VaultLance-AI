/* SettingsPage.tsx — /dashboard/settings for the client.

   One scroll surface: a 144px header band, then the three columns the spec fixes
   (233 / 610 / 377, gap 21, centred). The nav is a list of buttons that scroll —
   never navigate — so a section change cannot trip the unsaved guard; leaving the
   page, by rail link or by reload, can.

   Everything a card saves is patched into the page's one settings object, which
   is why the summary card and the rail's chip change together. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { FX } from "../../../config/fx";
import SettingsPlaceholder from "../Settings";
import { useSession } from "../../../components/dashboard/session";
import { useDashData } from "../../../components/dashboard/data";
import { isSectionKey, listFor, type SectionKey } from "./sections";
import { useSettings } from "./useSettings";
import { useMotionPref } from "./useMotionPref";
import { SettingsNav } from "./SettingsNav";
import { AccountSummary } from "./AccountSummary";
import { ProfileCard } from "./ProfileCard";
import { NotificationsCard } from "./NotificationsCard";
import { SecurityCard } from "./SecurityCard";
import { PreferencesCard } from "./PreferencesCard";
import { DangerCard } from "./DangerCard";
import { UnsavedDialog } from "./UnsavedDialog";
import type { AccountProfile, MotionPref, NotificationPrefs } from "../../../lib/api";
import "../../../styles/settings.css";

const SCROLL_MS = 618;

/* the spec's durations only: the entrance's four beats */
const ENTER = { head: 0.382, side: 0.618, cards: 0.618, summary: 0.618 };

export default function SettingsRoute() {
  if (!FX.settingsPage) return <SettingsPlaceholder />;
  return <SettingsPage />;
}

function SettingsPage() {
  const { session, updateUser, signOut } = useSession();
  const { vaults } = useDashData();
  const { data, loading, error, reload, patch } = useSettings();
  const { hash } = useLocation();
  const navigate = useNavigate();

  const items = useMemo(() => listFor(session?.role ?? "client"), [session?.role]);

  /* ---- motion: preview instantly, commit on save ----
     "saved" is what the store holds, "preview" is the unsaved choice the page is
     showing. The difference is what makes the card dirty. */
  const savedMotion = data?.motion ?? "system";
  const [preview, setPreview] = useState<MotionPref | null>(null);
  const reduced = useMotionPref(preview ?? savedMotion);

  /* ---- which section the nav says we are in ---- */
  const [active, setActive] = useState<SectionKey>("profile");
  /* a hash landing scrolls before the observer's first callback; until that
     settles, the spy's stale view of the page must not overrule the address */
  const suppressSpy = useRef(0);

  /* ---- unsaved changes, per section ---- */
  const [dirty, setDirty] = useState<Partial<Record<SectionKey, boolean>>>({});
  const [resetSignal, setResetSignal] = useState(0);
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [guardOpen, setGuardOpen] = useState(false);
  const [live, setLive] = useState("");

  const dirtyFor = useCallback(
    (key: SectionKey) => (on: boolean) =>
      setDirty((prev) => (prev[key] === on ? prev : { ...prev, [key]: on })),
    []
  );
  const setters = useMemo(
    () => ({
      profile: dirtyFor("profile"),
      notifications: dirtyFor("notifications"),
      security: dirtyFor("security"),
      preferences: dirtyFor("preferences"),
      danger: dirtyFor("danger"),
    }),
    [dirtyFor]
  );

  const anyDirty = Object.values(dirty).some(Boolean);
  const announce = useCallback((message: string) => setLive(message), []);

  /* ---- scroll-spy ---- */
  useEffect(() => {
    if (!data) return;
    const els = items
      .map((item) => document.getElementById(item.key))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressSpy.current) return;
        const shown = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const key = shown[0]?.target.getAttribute("data-section");
        if (key && isSectionKey(key)) setActive(key);
      },
      { rootMargin: "-34px 0px -55% 0px", threshold: [0, 0.08] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [data, items]);

  /* ---- a direct load with a hash lands on that card, with no entrance ---- */
  const landed = useRef(false);
  useEffect(() => {
    if (!data || landed.current) return;
    landed.current = true;
    const id = hash.replace("#", "");
    if (!isSectionKey(id)) return;
    setActive(id);
    suppressSpy.current = Date.now() + 1000;
    const el = document.getElementById(id);
    if (!el) return;

    /* the cards above grow once their webfonts settle, so the landing spot is
       measured again on the next frames and after the fonts are ready */
    const land = () => {
      const top = el.getBoundingClientRect().top + window.scrollY - 21;
      window.scrollTo({ top, behavior: "auto" });
    };
    land();
    requestAnimationFrame(() => {
      land();
      requestAnimationFrame(land);
    });
    void document.fonts?.ready.then(land);
    /* and again on a short beat while the page settles, then stop: a direct load
       has to land on the card whatever order the content arrives in */
    let tries = 0;
    const settle = window.setInterval(() => {
      land();
      tries += 1;
      if (tries > 10) window.clearInterval(settle);
    }, 100);
    el.focus({ preventScroll: true });
    return () => window.clearInterval(settle);
  }, [data, hash]);

  /* ---- entrance, once, and never for a hash jump ---- */
  const entered = useRef(false);
  useLayoutEffect(() => {
    if (!data || reduced || entered.current || window.location.hash) return;
    entered.current = true;
    const head = document.querySelector<HTMLElement>("[data-enter='head']");
    const nav = document.querySelector<HTMLElement>("[data-enter='nav']");
    const summary = document.querySelector<HTMLElement>("[data-enter='summary']");
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".set-stack .set-card"));
    /* phones stack everything, so the sideways half of the entrance would push a
       full-width card past the viewport: there the cards rise 34px instead */
    const stacked = window.matchMedia("(max-width: 767px)").matches;
    const tl = gsap.timeline();
    if (head) tl.fromTo(head, { opacity: 0, y: 13 }, { opacity: 1, y: 0, duration: ENTER.head, ease: "power3.out" }, 0);
    if (nav) tl.fromTo(nav, { opacity: 0, x: -21 }, { opacity: 1, x: 0, duration: ENTER.side, ease: "power3.out" }, 0.236);
    if (cards.length)
      tl.fromTo(
        cards,
        { opacity: 0, y: stacked ? 34 : 21 },
        { opacity: 1, y: 0, duration: ENTER.cards, stagger: 0.0618, ease: "power3.out" },
        0.382
      );
    if (summary)
      tl.fromTo(
        summary,
        stacked ? { opacity: 0, y: 34 } : { opacity: 0, x: 21 },
        { opacity: 1, x: 0, y: 0, duration: ENTER.summary, ease: "power3.out" },
        0.5
      );
    return () => {
      tl.kill();
    };
  }, [data, reduced]);

  /* ---- leave the page with a draft open: ask first ---- */
  useEffect(() => {
    if (!anyDirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingTo(`${url.pathname}${url.search}`);
      setGuardOpen(true);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [anyDirty]);

  /* ---- a phone keyboard must not cover the field being typed in ---- */
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (window.innerWidth > 767) return;
      window.setTimeout(() => {
        el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      }, 300);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [reduced]);

  /* ---- the nav's scroll: 618ms, or none at all ---- */
  const go = (key: SectionKey) => {
    const el = document.getElementById(key);
    if (!el) return;
    setActive(key);
    window.history.replaceState(null, "", `#${key}`);
    const to = el.getBoundingClientRect().top + window.scrollY - 21;
    if (reduced) {
      window.scrollTo({ top: to, behavior: "auto" });
    } else {
      const from = window.scrollY;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / SCROLL_MS);
        /* power3.out, the dashboard's own curve */
        const eased = 1 - Math.pow(1 - p, 3);
        window.scrollTo({ top: from + (to - from) * eased, behavior: "auto" });
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    el.focus({ preventScroll: true });
  };

  const savedProfile = (next: AccountProfile) => {
    patch({ profile: next });
    updateUser({ fullName: next.fullName });
    announce("Profile saved.");
  };

  const savedNotifications = (next: NotificationPrefs) => {
    patch({ notifications: next });
    announce("Notifications saved.");
  };

  const motionSaved = (next: MotionPref) => {
    patch({ motion: next });
    setPreview(null);
    announce("Preferences saved.");
  };

  const mfaChanged = (on: boolean) => {
    patch({ mfaOn: on });
    announce(on ? "Two-factor is on." : "Two-factor is off.");
  };

  const signOutNow = () => {
    navigate("/", { replace: true });
    signOut();
  };

  return (
    <div className="set-page">
      <header className="set-head" data-enter="head">
        <h1 className="set-h1">Settings.</h1>
        <p className="set-mono">CHANGES SAVE PER SECTION</p>
      </header>

      {loading && !data && (
        <div className="set-grid" aria-busy="true" aria-label="Loading settings">
          <div className="set-nav">
            {[0, 1, 2, 3, 4].map((i) => (
              <span className="dash-skel set-skel-nav" key={i} />
            ))}
          </div>
          <div className="set-stack">
            {[0, 1, 2].map((i) => (
              <div className="set-card is-skeleton" key={i} aria-hidden="true">
                <span className="dash-skel set-skel-title" />
                <span className="dash-skel set-skel-line" />
                <span className="dash-skel set-skel-line short" />
                <span className="dash-skel set-skel-input" />
                <span className="dash-skel set-skel-input" />
              </div>
            ))}
          </div>
          <div className="set-summary is-skeleton" aria-hidden="true">
            <span className="dash-skel set-skel-figure" />
            <span className="dash-skel set-skel-line" />
            <span className="dash-skel set-skel-line short" />
          </div>
        </div>
      )}

      {error && !data && (
        <div className="dash-error set-error" role="alert">
          <p className="dash-error-h">Could not load your settings.</p>
          <p className="dash-mono dim">{error.message}</p>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={reload}>
            <span className="dash-btn-label">Retry</span>
          </button>
        </div>
      )}

      {data && (
        <div className="set-grid">
          <SettingsNav items={items} active={active} dirty={dirty} onGo={go} />

          <div className="set-stack">
            <ProfileCard
              profile={data.profile}
              onSaved={savedProfile}
              onDirty={setters.profile}
              resetSignal={resetSignal}
            />
            <NotificationsCard
              prefs={data.notifications}
              onSaved={savedNotifications}
              onDirty={setters.notifications}
              resetSignal={resetSignal}
            />
            <SecurityCard mfaOn={data.mfaOn} onMfaChange={mfaChanged} />
            <PreferencesCard
              motion={savedMotion}
              onSaved={motionSaved}
              onDirty={setters.preferences}
              resetSignal={resetSignal}
              onPreview={setPreview}
            />
            <DangerCard email={data.profile.email} onDeleted={() => navigate("/", { replace: true })} />
          </div>

          <AccountSummary
            profile={data.profile}
            vaultCount={vaults.length}
            onSignOut={signOutNow}
          />
        </div>
      )}

      <UnsavedDialog
        open={guardOpen}
        onKeep={() => {
          setGuardOpen(false);
          setPendingTo(null);
        }}
        onDiscard={() => {
          setGuardOpen(false);
          setDirty({});
          setResetSignal((n) => n + 1);
          const to = pendingTo;
          setPendingTo(null);
          if (to) navigate(to);
        }}
      />

      {/* one polite region for every save result on the page */}
      <p className="dash-sr" aria-live="polite" data-testid="settings-live">
        {live}
      </p>
    </div>
  );
}
