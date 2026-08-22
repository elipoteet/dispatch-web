import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Guidelines",
  robots: { index: false, follow: false },
  alternates: { canonical: "/guidelines" },
};

// Full text from docs/legal-and-guidelines.md's "2. Community guidelines"
// section, verbatim, including its Enforcement subsection.
export default function GuidelinesPage() {
  return (
    <article className="legal-page">
      <h1>Community Guidelines</h1>

      <p className="legal-lead">Post under your real name and your real school.</p>
      <p>
        That is the whole premise. One account per person. Do not impersonate anyone, and do not
        create an account for someone else.
      </p>

      <p className="legal-lead">Say whether you own it.</p>
      <p>
        When you post about a specific ticker, mark whether you hold a position. It takes one
        tap, nobody else in retail research does it, and it is the difference between an argument
        and an advertisement.
      </p>

      <p className="legal-lead">Make an argument, not an announcement.</p>
      <p>
        &ldquo;NVDA to the moon&rdquo; is not a post. What you think, why you think it, and what would change
        your mind is a post. Length is not the standard; reasoning is.
      </p>

      <p className="legal-lead">Push back on the idea, not the person.</p>
      <p>
        Disagreement is the most valuable thing that happens here and it requires a reason.
        Attacking someone personally, rather than their argument, is the one thing that gets a
        post removed quickly.
      </p>

      <p className="legal-lead">Do not pump.</p>
      <p>
        Coordinated promotion, hyping a position you are about to sell, or posting about
        microcaps to move them will get the account removed permanently and without discussion.
      </p>

      <p className="legal-lead">Do not post other people&rsquo;s private information.</p>
      <p>
        Yours or anyone else&rsquo;s. No contact details, no addresses, no screenshots of private
        conversations.
      </p>

      <p className="legal-lead">No promotion.</p>
      <p>
        No affiliate links, no paid courses, no Discord invites, no newsletters you profit from.
        If you are here to sell something, you are in the wrong place.
      </p>

      <p className="legal-lead">Nothing illegal.</p>
      <p>
        No insider information, no market manipulation, no securities fraud. If you learned
        something because of your job or an internship and you are not supposed to share it, do
        not share it here.
      </p>

      <p className="legal-lead">Questions are always welcome.</p>
      <p>
        Not knowing something is not a failure of standards, it is the reason this place exists.
        Anyone treating a genuine question with contempt is the problem, not the person who
        asked.
      </p>

      <h2>Enforcement</h2>
      <p>
        Enforcement is by hand and it is a person, not a system. In order: a note, then removal
        of a post, then suspension, then a permanent removal. Impersonation, pumping, and doxxing
        skip straight to the end.
      </p>
      <p>
        Accounts removed for cause do not get their school back. Because verification runs on a
        school email and one account per address, the practical effect of a permanent removal is
        real, which is a large part of why the identity system is worth its cost.
      </p>
    </article>
  );
}
