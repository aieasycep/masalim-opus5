# Getting Masalım onto a phone

> **Read this first — what is verified here and what is not.**
>
> Everything in this document about *this repository* — commands, file paths,
> environment-variable names, what the code does — was checked against the code
> and is reliable. Every name was diffed against
> `apps/api/src/core/config/config.schema.ts`.
>
> Everything about *the hosting provider* — free-tier limits, prices, sleep and
> pause behaviour, which features are paid, quoted documentation — was written
> without access to the provider's site: this repository is built in a sandbox
> whose network policy blocks those domains, verified by a 403 on every attempt.
> Those parts come from prior knowledge, they are undated, and provider free
> tiers change often. **Check each one against the provider's current
> documentation before you depend on it**, especially anything that decides
> whether you will be charged.



Two ways to hold this app in your hand without paying anyone. Both assume the API
is already deployed and reachable over HTTPS — see
[`render.md`](./render.md). Neither of them is a store release.

**Fastest result: Expo Go.** If you have a computer, a phone and ten minutes, use
Route 1. Nothing is compiled, nothing is queued, and you can change the API URL by
restarting one command.

|                       | Route 1 — Expo Go                                          | Route 2 — APK from EAS Build                                     |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Time to first launch  | ~10 min, almost all of it `pnpm install`                    | ~20–60 min, mostly waiting in a queue you do not control           |
| Accounts needed       | none                                                        | a free Expo account                                                |
| What you end up with  | the app running inside someone else's shell, on your Wi-Fi  | a real `.apk` file you can send to someone                          |
| Survives closing it?  | no — it needs the dev server on your laptop                 | yes — it is installed on the phone                                  |
| iOS                   | only if the App Store's Expo Go matches SDK 54 (see below)  | not free: needs a paid Apple Developer account                      |
| Changing the API URL  | edit one file, restart the dev server                       | rebuild, and wait in the queue again                                |
| Repeatable            | yes, unlimited                                              | no — the free plan allows a limited number of builds per month      |

Everything below was checked against this repository and against Expo's
documentation on **18 August 2026**. Provider limits move; the parts I could not
verify are called out where they appear.

---

## Before either route: the API has to be up

The phone talks to a public HTTPS URL. Get that first, and prove it:

```bash
curl -s https://masalim-api.onrender.com/health/ready
```

Substitute your own host — read the real URL off the Render dashboard rather than
assuming the service name became the hostname. You want a 200 with `database` and
`redis` both `up`. If that call fails, nothing on the phone will work either, and
you will waste a build finding out.

On a free Render instance the service sleeps after about 15 minutes without
traffic. The first request after a sleep takes tens of seconds, so the app's very
first screen may sit on a spinner and then time out. Hit `/health` in a browser
once to wake it before you open the app.

You also need the repository, Node 22+ and pnpm 10 on your machine:

```bash
git clone <this repository> masalim
cd masalim
corepack enable
pnpm install
pnpm exec turbo run build --filter='@masalim/mobile^...'
```

That last line is easy to skip and not optional. The app imports
`@masalim/types`, `@masalim/validation` and `@masalim/localization`, whose
`package.json` files point at a `dist/` directory that `pnpm install` does not
produce. Without it Metro bundles for ten seconds and then fails with *Unable to
resolve "@masalim/validation"* — which reads like a missing dependency rather
than an unbuilt one.

---

## Route 1 — Expo Go

Expo Go is a pre-built app you install from a store. It contains a fixed set of
native modules and a JavaScript engine; `npx expo start` serves your app's
JavaScript to it over the network. No compilation happens on your machine, which
is exactly why it is fast — and also the source of its one hard rule.

### The rule: the SDK versions have to match

An Expo Go binary speaks exactly one Expo SDK version. This app is on **SDK 54**:

```
apps/mobile/package.json   "expo": "~54.0.12"          → resolves to 54.0.36
                           "react-native": "0.81.4"
```

So you need an Expo Go built for SDK 54. If you point Expo Go at a project it does
not match, it refuses with a message along the lines of *"Project is incompatible
with this version of Expo Go"* — it does not half-work.

As of 18 August 2026 the `expo` package on npm publishes `latest` as **57.0.14**
(released 17 August 2026) and `sdk-54` as 54.0.37. SDK 54 is three releases behind
the current one. **I could not confirm which SDK the App Store and Play Store
copies of Expo Go currently ship** — expo.dev is blocked from the machine these
notes were written on, and the published accounts of Expo's 2026 changes to Expo
Go distribution contradict each other. Assume you may need a specific build rather
than whatever the store hands you.

Getting a matching Expo Go:

- **Android, and the easiest path by far.** Connect a phone over USB with
  developer mode and USB debugging on (or start an emulator), then press `a` in
  the `npx expo start` terminal. Expo CLI looks up the Expo Go version registered
  for the project's SDK and offers to install exactly that one — see
  `ExpoGoInstaller` in `@expo/cli`, which resolves `androidClientVersion` for the
  project's SDK and downloads the matching client. Answer yes to the prompt.
- **Android without a cable.** Install Expo Go from the Play Store, scan the QR
  code, and if it complains about the SDK, use the USB path above instead. Expo
  also publishes per-SDK Expo Go builds at `expo.dev/go`, though that page could
  not be opened from the machine these notes were written on.
- **iOS Simulator on a Mac.** Press `i`. The same installer resolves the SDK-54
  Simulator build of Expo Go.
- **A physical iPhone.** You get whatever the App Store gives you. If that is not
  SDK 54, there is no free way to put a different Expo Go on an unmodified iPhone
  — that route needs TestFlight, which needs a paid Apple Developer account. Use
  Android, or a Mac's Simulator, or go to Route 2.

### Will this app actually run in Expo Go?

Expo Go only contains the native modules Expo ships in it. Anything else in
`package.json` is present as JavaScript in the bundle but has no native half, and
blows up the moment that JavaScript runs.

Going through `apps/mobile/package.json` dependency by dependency against SDK 54's
module set (`expo/bundledNativeModules.json`, the list `npx expo install` pins
against), exactly **one** package with native code is not part of that set:

```
@react-native-google-signin/google-signin   ^13.2.0
```

Everything else is either pure JavaScript (`@tanstack/react-query`,
`react-hook-form`, `zod`, `zustand`, `@hookform/resolvers`, the
`@expo-google-fonts/*` packages) or a module SDK 54 pins a version for
(`expo-*`, `@shopify/flash-list`, `react-native-webview`,
`react-native-gesture-handler`, `react-native-screens`,
`react-native-safe-area-context`, `@react-native-async-storage/async-storage`,
`@expo/vector-icons`).

Three of those pinned modules — `expo-notifications`, `expo-image-picker` and
`expo-linking` — are declared as dependencies but are not imported anywhere under
`apps/mobile/app` or `apps/mobile/src`. Metro only bundles what something reaches,
so they never load, and whatever Expo Go does or does not support for them is
beside the point here.

**The Google button will not work — and it will not take anything else down with
it.** Both social providers are reached through a deferred import in
`apps/mobile/src/components/SocialAuthButtons.tsx`:

```ts
// line 60
const AppleAuthentication = await import('expo-apple-authentication');
// line 98
const GoogleSignIn = await import('@react-native-google-signin/google-signin');
```

Metro keeps both modules in the bundle — export the app and you will find the
string `RNGoogleSignin` in the compiled output — but it defers the `require` to
the moment the promise is created, that is, to the moment someone taps the button,
not to app startup. When it does run,
`@react-native-google-signin/google-signin`'s entry point pulls in
`lib/commonjs/spec/NativeGoogleSignin.js`, whose first statement is
`TurboModuleRegistry.getEnforcing('RNGoogleSignin')`. With no native module
present that throws immediately. The throw lands in the `try/catch` around the
tap handler, goes through `errorCopy`, which maps anything that is not an API
error to `INTERNAL_ERROR`, and the parent sees the generic Turkish error sentence
under the buttons. The app does not crash and no other screen is affected.

Apple is different, and worth knowing before you chase it:
`expo-apple-authentication` **is** available in Expo Go — Expo's own documentation
for the library says "You can test this library in Expo Go on iOS without following any of
the instructions above", with the caveat that "the identifiers and values you
receive will likely be different than what you'll receive in standalone apps". So
the sheet opens, and then the API rejects the result. `verifyApple` in
`apps/api/src/modules/auth/social-verifier.service.ts` verifies the identity
token's audience against `APPLE_BUNDLE_ID` and `APPLE_SERVICE_ID`; a token minted
inside Expo Go carries Expo Go's bundle identifier, which is neither. Expect a
`SOCIAL_AUTH_FAILED`.

Use email sign-up. `app/(auth)/sign-up.tsx` and `sign-in.tsx` need no native
provider at all, and that is the whole journey: sign up, add a child, generate a
story, listen to it.

**One more thing that runs at startup and is worth knowing about.**
`app/_layout.tsx` imports `GestureHandlerRootView` from
`react-native-gesture-handler`. That package's index reaches
`handlers/gestures/reanimatedWrapper.js`, which does
`require('react-native-reanimated')` inside a `try/catch` specifically so that a
project without Reanimated keeps working. Reanimated 4 in turn loads
`react-native-worklets`, which constructs its native module eagerly
(`WorkletsModule/NativeWorklets.native.js`, `export const WorkletsModule = new
NativeWorklets()`) and, in a development bundle, calls `checkCppVersion()` — which
**throws** when the JavaScript and native major/minor versions differ.

In this workspace the resolved copy is `react-native-worklets@0.8.3`, while SDK 54
pins `0.5.1`; Reanimated resolves to 4.1.7 against SDK 54's `~4.1.1`. If the Expo
Go you install carries the 0.5.x native side, that version check will throw — and
be swallowed by the `try/catch` it happens inside, leaving Reanimated undefined.
Nothing in this app imports Reanimated directly (there is no
`react-native-reanimated` import anywhere under `app/` or `src/`; only the Babel
plugin is configured), so the app should still start. This is a reading of the
code, not a run: **Expo Go could not be launched from the machine these notes were
written on.** If the app dies at startup with a Worklets version error, that is
the cause, and the fix is to align the versions in `apps/mobile/package.json` with
SDK 54's set.

### The commands

Point the app at your deployed API. `apps/mobile/app.config.ts` reads
`process.env.EXPO_PUBLIC_API_URL` when Expo CLI evaluates the config, and Expo CLI
loads `.env` before that happens, so a file is the least error-prone way:

```bash
cd apps/mobile
cat > .env <<'EOF'
EXPO_PUBLIC_API_URL=https://masalim-api.onrender.com
EXPO_PUBLIC_APP_ENV=staging
EOF
```

`.env` and `.env.*` are ignored by the repository's root `.gitignore`, so this
will not be committed. `EXPO_PUBLIC_APP_ENV` is optional — it only ends up as the
`app_env` property on analytics events — but it keeps a staging run labelled
honestly.

Check the value actually arrived before you start scanning things:

```bash
npx expo config --type public
```

Look at the `extra` block in the output. `apiUrl` must be your URL. If it says
`http://localhost:3000`, the `.env` file is not being read — you are probably in
the wrong directory.

Then start the dev server:

```bash
npx expo start
```

It prints a QR code. Scan it with the phone's camera on iOS, or from inside Expo
Go on Android. The phone and the computer must be on the same Wi-Fi, because the
bundle is served from your laptop over the LAN. If they cannot be (guest Wi-Fi
with client isolation, a corporate network, a phone on mobile data), use:

```bash
npx expo start --tunnel
```

which routes through a public relay instead. The first `--tunnel` run installs
`@expo/ngrok`, and it is noticeably slower to load.

To restart against a different API, edit `.env`, stop the server and start it
again. The config is evaluated at start-up, so an edit alone is not enough.

### What you will and will not be able to do

Works: email sign-up and sign-in, onboarding a child, generating a story, the
library, the reader, narration playback, recording your own voice (Expo Go will
ask for the microphone), the illustrated book view.

Does not work: the Google button (no native module), the Apple button (the API
rejects an Expo Go-issued token). Nothing is installed on the phone — close Expo
Go or stop the dev server and it is gone.

---

## Route 2 — an APK from EAS Build

EAS Build compiles the app on Expo's machines and hands back an installable file.
The free plan queues you behind paying customers but it does build, and an APK is
a real artefact you can hand to someone who is not sitting next to your laptop.

### What the free plan gives you

Expo's own documentation describes it as "free access to a limited quantity of
low-priority builds on EAS Build and free updates with EAS Update. These limits
reset monthly." It deliberately does not put the numbers in the docs; they live on
the pricing page, **which I could not open** — expo.dev is blocked from the machine
these notes were written on. Third-party write-ups from 2026 report 15 Android and
15 iOS builds per month on the free plan and no overage billing (you are stopped,
not charged). Treat those two numbers as unconfirmed and check
`expo.dev/pricing` yourself before planning around them.

"Low-priority" is the part you will feel. A free Android build waits in a shared
queue; the wait is unpredictable and can be far longer than the build itself.
Budget an hour of wall-clock time for your first one, and do not schedule a demo
around a build you have not started yet.

Because both the build count and your patience are finite, do Route 1 first. Prove
the API works from the phone in Expo Go, and only then spend a build turning that
same configuration into an APK.

### The API URL is compiled into the APK

This is the single most important thing to understand before you build, because
getting it wrong costs you a build from a monthly allowance and an hour of queue.

The chain is entirely static:

1. `apps/mobile/eas.json` sets `EXPO_PUBLIC_API_URL` in the build profile's `env`.
2. EAS evaluates `apps/mobile/app.config.ts` on the build machine with that
   environment; line 81 puts it into `extra.apiUrl`.
3. `apps/mobile/src/config/env.ts` reads `Constants.expoConfig.extra.apiUrl` into
   `env.apiUrl`.
4. `apps/mobile/src/lib/api.ts` constructs the HTTP client with
   `baseUrl: env.apiUrl` when the module first loads.

By the time the APK exists, the URL is a string inside it. There is no setting,
no environment file on the phone, nothing to change. You can watch it happen
locally — `pnpm --filter @masalim/mobile export` writes a bundle to
`apps/mobile/dist/`, and with no `EXPO_PUBLIC_API_URL` set the literal
`localhost:3000` from the fallback in `app.config.ts` is sitting in the compiled
output:

```bash
grep -ac 'localhost:3000' apps/mobile/dist/_expo/static/js/android/entry-*.hbc
```

The `.env` file from Route 1 does not help here either. It is git-ignored, so it is
not uploaded with the project, and EAS uses `eas.json` instead. Deploy the API,
confirm its final URL, put that URL in `eas.json`, then build.

### From an empty machine

**1. Node and the repository.**

```bash
git clone <this repository> masalim
cd masalim
corepack enable
pnpm install
```

On EAS the same workspace build is handled for you: `apps/mobile/package.json`
declares an `eas-build-post-install` script that runs it on the builder, because
`dist/` is not committed and the builder starts from the repository as git has
it.

**2. Install the EAS CLI.** Version 22.0.0 was current on 14 August 2026.

```bash
npm install --global eas-cli
eas --version
```

**3. Create an Expo account and sign in.** `eas login` opens a browser by default;
sign up there if you do not have an account. The free plan needs no card.

```bash
eas login
eas whoami
```

**4. Create the EAS project.**

```bash
cd apps/mobile
eas init
```

This registers the app on Expo's servers and prints a project ID. It will also
tell you it cannot write the ID into your config: this app uses `app.config.ts`,
a dynamic config, and EAS CLI only edits static `app.json` files. Add it yourself,
inside the existing `extra` object in `apps/mobile/app.config.ts`:

```ts
  extra: {
    eas: { projectId: '<the id eas init printed>' },
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    // ...the rest of the block, unchanged
  },
```

The ID belongs to your Expo account, which is why it is not committed here.

**5. Point the build at your API.** The `preview` profile in
`apps/mobile/eas.json` currently carries this project's intended staging hostname,
`https://api.staging.masalim.app`, which is not where a free-tier deploy lands.
Replace it with the URL you verified at the top of this document:

```json
    "preview": {
      "extends": "base",
      "distribution": "internal",
      "channel": "preview",
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_APP_ENV": "staging",
        "EXPO_PUBLIC_API_URL": "https://masalim-api.onrender.com"
      },
      "android": { "buildType": "apk" }
    },
```

The two lines that decide whether you get something installable are already
correct in this file, and both are worth understanding rather than copying.
EAS defaults an Android build to an `.aab` app bundle, which is a Play Store
upload format and cannot be opened on a phone. Expo's documentation names several
things that switch it to an APK, and this profile sets two of them:
`"distribution": "internal"`, which asks for direct distribution rather than a
store submission, and `"android": { "buildType": "apk" }`, which says it outright.
Keeping the explicit `buildType` means the profile still produces an APK if
someone later changes the distribution.

`autoIncrement: true` bumps the Android `versionCode` on every build. With
`appVersionSource: "remote"` at the top of the file, EAS keeps that counter, so
each new APK installs cleanly over the one already on the phone instead of being
refused as a downgrade — which matters here, because moving the API means
rebuilding.

Do not reach for the `development` profile. It points at `http://localhost:3000`,
and it sets `developmentClient: true`, which requires `expo-dev-client` — not a
dependency of this app.

**6. Build.**

```bash
eas build --platform android --profile preview
```

The first Android build asks whether to generate a keystore. Say yes; EAS
generates and stores it, and every later build is signed with the same one, which
is what lets a rebuilt APK install over the old one. The command prints a URL for
the build page and then follows the logs. You can close it — the build continues
on Expo's machines, and `eas build:list` shows where it got to.

**7. Get the file onto a phone.** When the build finishes, the build page has a
QR code and a download button. Scanning the QR code from the phone downloads the
APK directly; opening it prompts to install, and Android will ask you to allow
installs from whichever app did the downloading. Otherwise download the `.apk` on
your computer, copy it across, and open it in the phone's file manager.

From the terminal, `eas build:list --platform android --limit 1` shows the most
recent Android build, and `eas build:view <build-id>` prints its details including
where the artefact lives.

### Rebuilding

Any change to the API URL, the app icon, a native permission or an SDK version
means a new build and a new trip through the queue. Changes to JavaScript alone
would normally be shippable over the air with EAS Update, but `expo-updates` is
not a dependency of this app, so the `channel` field in `eas.json` has nothing to
act on and every change needs a rebuild. (If a build ever complains about
`channel`, that is why; deleting the line from the profile is harmless until
someone installs `expo-updates`.)

### iOS is not free

There is no free path to an iOS app on a physical iPhone. Expo's documentation is
blunt about the ad hoc route internal distribution uses: it "requires a paid Apple
Developer account and that account will only be able to use this method to
distribute to at most 100 iPhones per year", and you need each device's UDID
registered with `eas device:create` first. The Apple Developer Program is
99 USD/year.

If you have a Mac, an iOS Simulator build is free — add `"ios": { "simulator":
true }` to a build profile and build for iOS. It runs on the Simulator only and
cannot be installed on a real device. Otherwise, iOS means Expo Go.

### When the build fails

**Install step fails on dependencies.** This is a pnpm workspace: `pnpm-lock.yaml`
is `lockfileVersion: '9.0'`, and the root `package.json` pins
`"packageManager": "pnpm@10.33.0"`. EAS installs its own pnpm unless the build
profile sets `"corepack": true`. Both pnpm 9 and 10 read a 9.0 lockfile, so this
usually just works; if the install step fails on a lockfile or package-manager
version, `corepack: true` is the field to try, though it has a history of
misbehaving with pnpm on EAS — check the current state of
`github.com/expo/eas-cli` issues before leaning on it.

**Build succeeds, app shows a network error on every screen.** The URL was wrong
at build time. Check the `env` block of the profile you built, and confirm the API
answers `/health/ready` from outside your network. Remember the Render free
instance sleeps: a cold start can look exactly like an outage.

**"Project is incompatible with this version of Expo Go"** is a Route 1 problem,
not Route 2 — see the SDK section above.

---

## Where the API URL comes from, in one place

| Route            | Value read from                                                    | When                              | Changeable afterwards      |
| ---------------- | ------------------------------------------------------------------ | --------------------------------- | -------------------------- |
| Expo Go          | `apps/mobile/.env` (or your shell) → `app.config.ts`                | each time `npx expo start` runs   | yes — restart the server   |
| EAS Build        | `env` in the `eas.json` build profile → `app.config.ts` on the builder | once, during the build          | no — rebuild               |
| Neither          | the `?? 'http://localhost:3000'` fallback in `app.config.ts:81`      | when nothing else was set         | —                          |

Only `EXPO_PUBLIC_`-prefixed variables reach the bundle, and Expo's documentation
is explicit that they end up in plain text inside the app: "Do not store sensitive
info, such as private keys, in `EXPO_PUBLIC_` variables." An API base URL is
exactly the kind of value that belongs there. Nothing else does.
