// herdr-flow: one mod, several screens picked by props.
//   no props (mod.open:herdr-flow, ctrl-a / ctrl-;)  the leader screen
//   { screen: "<name>" }                              a popup screen (openScreen)
//   { view: "panel" }                                 the Jira side panel (layout block)
//   { role: "router" }                                empty floating block for keys.json commands
import { View, div } from "gpui-kit";
import { props, setShared, shared } from "herdr";
import { NEXT_SCREEN } from "./leader/leaderActionHelpers.js";
import { LeaderScreen } from "./leader/leaderView.js";
import { LazygitScreen } from "./git/lazygitScreen.js";
import { PullScreen } from "./git/pullScreen.js";
import { RepoScreen } from "./git/repoScreen.js";
import { JiraScreen } from "./jira/jiraScreen.js";
import { PanelView } from "./jira/sidePanelView.js";
import { BarView } from "./jira/counterBarView.js";
import { RouterView } from "./router.js";

/** @typedef {import("./types.js").Cx} Cx */
/**
 * A screen view: init(cx, props) once, then render(cx).
 * @typedef {{ init(cx: Cx, props?: Record<string, any>): void, render(cx: Cx): import("gpui-kit").Element }} Screen
 */

/**
 * Screen name -> class with init(cx, props) and render(cx).
 * @type {Record<string, new () => Screen>}
 */
const SCREENS = {
  leader: LeaderScreen,
  git: LazygitScreen,
  repo: RepoScreen,
  pull: PullScreen,
  jira: JiraScreen,
  panel: PanelView,
  bar: BarView,
  router: RouterView,
};
const NEXT_FRESH_MS = 1500; // a request older than this is stale (the popup never opened)

/** The screen asked for by openScreen() just before mod.open, once. */
function takeNextScreen() {
  const next = /** @type {any} */ (shared(NEXT_SCREEN));
  if (!next) return null;
  setShared(NEXT_SCREEN, null);
  return Date.now() - next.at < NEXT_FRESH_MS ? next : null;
}

/**
 * @param {Record<string, any>} p the mod's props
 * @returns {{ view: Screen, props: Record<string, any> } | null}
 */
function pickView(p) {
  const asked = p.role || p.view || p.screen ? null : takeNextScreen();
  const name =
    p.role ?? (p.view === "panel" ? "panel" : p.view === "bar" ? "bar" : null) ?? p.screen ?? asked?.screen ?? "leader";
  const Screen = SCREENS[name];
  return Screen ? { view: new Screen(), props: { ...p, ...asked?.props } } : null;
}

export default class HerdrFlow extends View {
  /**
   * @param {unknown} _props
   * @param {Cx} cx
   */
  init(_props, cx) {
    const picked = pickView(props() ?? {});
    /** @type {Screen | null} */
    this.view = picked?.view ?? null;
    this.view?.init(cx, picked.props);
  }

  /** @param {Cx} cx */
  render(cx) {
    return this.view ? this.view.render(cx) : div();
  }
}
