import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// This exists because of a silent breakage that cost several builds.
//
// The only way to get a WebView subclass into a Capacitor activity is to
// override the layout it inflates, by name. That worked, and then Capacitor
// renamed the file: BridgeActivity used to inflate bridge_layout_main and now
// inflates capacitor_bridge_layout_main. It still *ships* the old one, so the
// override went on merging cleanly against a file nobody reads -- the resource
// merge passed, the build passed, and the keyboard was simply never told the
// app accepts pictures again.
//
// Nothing anywhere said so. A diagnostic eventually did, after three rounds.
// This is what should have said it: read Capacitor's own source, find the name
// it actually inflates, and fail if we are not overriding that one.

const BRIDGE_ACTIVITY =
  'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java';
const OUR_LAYOUTS = 'android/app/src/main/res/layout';
const OUR_WEBVIEW = 'com.sora.austavia.ImagePasteWebView';

/** The layout name Capacitor really calls setContentView with. */
function layoutCapacitorInflates() {
  const source = readFileSync(BRIDGE_ACTIVITY, 'utf8');
  // The fallback is no_webview, which is the "something went wrong" screen and
  // not the one to follow.
  const names = [...source.matchAll(/setContentView\(R\.layout\.([a-z0-9_]+)\)/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'no_webview');
  return names[0] || null;
}

test('the layout Capacitor inflates is one we override', () => {
  const inflated = layoutCapacitorInflates();
  assert.ok(inflated, 'could not find setContentView in BridgeActivity — read it by hand');

  const ours = `${OUR_LAYOUTS}/${inflated}.xml`;
  assert.ok(
    existsSync(ours),
    `Capacitor now inflates "${inflated}" and there is no override at ${ours}. ` +
      `Without one the app uses Capacitor's plain WebView, the keyboard is never told ` +
      `the app accepts pictures, and nothing anywhere reports it. ` +
      `Copy Capacitor's own ${inflated}.xml into ${OUR_LAYOUTS} and change the WebView class.`
  );
});

test('our override of it actually names our WebView', () => {
  // An override that forgot the one line it exists for is worse than none:
  // everything still builds and the feature is gone.
  const inflated = layoutCapacitorInflates();
  const ours = readFileSync(`${OUR_LAYOUTS}/${inflated}.xml`, 'utf8');
  assert.match(ours, new RegExp(OUR_WEBVIEW.replace(/\./g, '\.')));
  assert.match(ours, /android:id="@\+id\/webview"/, 'and keeps the id the bridge looks the view up by');
});

test('every layout we override still exists in Capacitor, so none is dead weight', () => {
  // The other half of the same rot: a file we override that Capacitor has
  // dropped is doing nothing, and looks like it is doing something.
  const libraryLayouts = 'node_modules/@capacitor/android/capacitor/src/main/res/layout';
  const theirs = new Set(readdirSync(libraryLayouts));
  const ourOverrides = readdirSync(OUR_LAYOUTS).filter((name) => name !== 'activity_main.xml');

  for (const name of ourOverrides) {
    assert.ok(theirs.has(name), `${name} is not a Capacitor layout any more — it overrides nothing`);
  }
});
