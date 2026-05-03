import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:px-10">
        <p className="eyebrow">Privacy</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="mt-4 text-sm text-stone-500">Last updated: 3 May 2026</p>

        <div className="mt-12 divide-y divide-stone-200 border-y border-stone-200 bg-white">
          {[
            [
              "What I collect",
              "If you accept analytics, Aeronauty records first-party page views: page path, page title, referrer, browser user agent, approximate country/region/city from Vercel geolocation headers, Vercel execution region, viewport size, timestamp, and a short HMAC hash of your IP address. I do not store the raw IP address. If you log into the private lab, I also record the email address you used, whether you used Google SSO or a magic link, and which private lab pages you open.",
            ],
            [
              "Why I collect it",
              "I use this to understand which private drafts, demos, and articles people actually use, where performance problems show up, and which parts of the site are worth more server time.",
            ],
            [
              "Consent",
              "Analytics page views are only sent after you accept the notice. Your choice is stored in your browser local storage. You can clear site data in your browser to reset it. Essential authentication cookies for the private lab are used when you sign in, and private lab access is logged as part of providing gated access.",
            ],
            [
              "Who sees it",
              "The activity log is for me. Infrastructure providers such as Vercel, Upstash, Resend, and Google may process data as part of hosting, storage, email delivery, and SSO.",
            ],
            [
              "Retention",
              "The first-party activity log keeps a rolling set of recent events rather than an indefinite archive. Current implementation keeps up to 5,000 recent events.",
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
