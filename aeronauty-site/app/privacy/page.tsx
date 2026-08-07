import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:px-10">
        <p className="eyebrow">Privacy</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="mt-4 text-sm text-stone-500">Last updated: 7 August 2026</p>

        <div className="mt-12 divide-y divide-stone-200 border-y border-stone-200 bg-white">
          {[
            [
              "What I collect",
              "If you accept analytics, Aeronauty records first-party page views and engagement summaries: page path, page title, referrer, browser user agent, approximate country/region/city from Vercel geolocation headers, Vercel execution region, viewport size, timestamp, anonymous session identifier, active dwell time, scroll depth, and which article sections or figures were visible. I do not store mouse positions, keystrokes, heatmaps, or the raw IP address; only a short HMAC hash of the IP is stored. If you log into the private lab, I also record the email address you used, whether you used Google SSO or a magic link, and which private lab pages you open.",
            ],
            [
              "Why I collect it",
              "I use this to understand which private drafts, demos, and articles people actually use, where performance problems show up, and which parts of the site are worth more server time.",
            ],
            [
              "Game Ledger",
              "If you use Game Ledger, Supabase stores your Google account identity; named people, teams, or other scoring entities; user-defined game definitions; participants; chronological score, state, note, void, and result events; and photo or short-video metadata. Each game stores a snapshot of its definition so a later template edit cannot reinterpret an old game. Reusable participant identities are archived rather than detached from old games, preserving the history behind career and matchup statistics. Your Supabase session is kept in browser local storage so sign-in survives a reload; signing out removes that local session. In the optional Tile table, groups, letters, blank assignments, and order are stored only in versioned browser local storage under a key scoped to your signed-in account; they are not sent to Supabase or synced to another device. Tile selection, full-screen mode, motion permission, and word-check state are not retained.",
            ],
            [
              "Game photos and clips",
              "Photo and short-video capture happens only after you tap a capture or file-picker control and confirm that everyone being recorded has agreed. Game Ledger does not record in the background. Chosen files are uploaded to private, account-isolated Supabase Storage and shown through short-lived signed links; they may contain faces, voices, children, home interiors, or device metadata. The current app does not send game media to an AI service. You can remove a media item from its game timeline in the app; the underlying private object is removed before its metadata is marked deleted.",
            ],
            [
              "Shake to shuffle",
              "If you explicitly enable shake-to-shuffle in the Tile table, your browser may ask for device-motion permission. Motion samples are processed only on your device to detect a shake; Game Ledger does not retain or transmit those samples. You can turn the feature off at any time and use the manual scramble controls instead.",
            ],
            [
              "Optional word check",
              "The Tile table does not generate anagrams or suggestions. If you explicitly choose to check the exact word you arranged, Game Ledger copies only that candidate to your clipboard and opens the Collins word checker in a new tab with noreferrer. Game Ledger sends no rack data to Collins automatically; Collins receives what you paste and submit there under its own privacy practices. Its result is a reference rather than an official ruling because regional word lists, tournament rules, and house rules can differ.",
            ],
            [
              "AI processing",
              "The current Game Ledger scoring, notes, photo, video, cumulative statistics, and interesting-fact flows do not invoke an AI model. History summaries are deterministic calculations over the games selected in the app and remain inside the signed-in experience. Other Aeronauty experiments may use Anthropic or OpenAI only when their own interface explicitly says so; those providers do not receive your Supabase or Google credentials.",
            ],
            [
              "Consent",
              "Analytics page views and engagement summaries are only sent after you accept the notice. Your choice is stored in browser local storage; the anonymous session identifier is stored in session storage and resets with the browser session. You can clear site data in your browser to reset both. Essential authentication cookies for the private lab are used when you sign in, and private lab access is logged as part of providing gated access.",
            ],
            [
              "Who sees it",
              "The activity log and your private Game Ledger rows and objects are for me and the signed-in account that owns them, respectively. Infrastructure providers such as Vercel, Supabase, Upstash, Resend, and Google may process data as part of hosting, storage, rate limiting, email delivery, and SSO. An AI provider processes data only in a separate feature you explicitly invoke.",
            ],
            [
              "Retention",
              "The first-party activity log keeps rolling recent records rather than an indefinite archive. Current implementation keeps up to 5,000 recent activity events and up to 5,000 recent engagement summary events. Game definitions, events, results, and media remain in your private game book until they are deleted; in-app media removal deletes the Storage object and leaves a tombstone so the timeline cannot accidentally resurrect it. The current POC does not yet offer whole-account export or deletion inside the app, so contact me for either.",
            ],
            ["Contact", "If you want me to remove activity tied to your email address, contact me directly."],
          ].map(([title, body]) => (
            <section key={title} className="p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
              <p className="mt-3 leading-8 text-stone-600">{body}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
