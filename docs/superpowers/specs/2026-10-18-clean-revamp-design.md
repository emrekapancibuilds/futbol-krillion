# Clean revamp: a sleek, simple Futkrill, and the ball drop

User request (2026-10-18), with a mockup of the home screen: "I want to completely revamp the site to look more sleek
and simple, no need for these crazy animations. The home screen should look like this, but make it navy blue (just a
bit darker than rn) instead of blue. Also, for the animations, it shouldn't be the tunnel, it should be the ball, and
however far it drops is how many points (kind of like the dive from krillion). So it should drop and hit the floor at
some point."

Decisions (user, 2026-10-18): a full-screen drop; clean flat versions of all the pixel art; navy **#0F1F4B**.

## Look
- Light theme on every page (home, rounds, results, end screens, Unlimited, Niche-o-meter, billing and legal pages,
  pop-ups). One sans-serif family (Plus Jakarta Sans); the wordmark in its heaviest weight.
- Colours: navy #0F1F4B for FUT, primary buttons and headings; gold #F2B705 for KRILL, points and the streak; slate
  greys for text; white cards with soft shadows and rounded corners on a faint, static stadium backdrop (vector).
- Header: a white bar, the two-tone FUTKRILL wordmark on the left, Unlimited and Niche-o-meter, and a pill with a
  calendar icon showing the date and score.
- Home, as the mockup: a big two-tone FUTKRILL, "DAILY" spaced out in grey, "7 prompts, 30 seconds each · rarer
  answers score more.", a navy KICK OFF button and a white NICHE-O-METER button (both with an arrow), and the ball on
  the centre spot below them.
- No pixel art and no busy animation: the live stadium scene, the tunnel, crowd moods and the pixel logo, mascot, tier
  icons and flame go. Replacements are flat vectors: the wordmark, a ball (also the favicon), seven tier badges in
  their own colours, and a flame. Motion is limited to short fades and the ball drop.

## The ball drop (replaces the tunnel)
After an accepted answer the screen follows a ball dropping through seven levels, one per tier, from World Cup
Bandwagon (5) at the top to Jobless (200) at the bottom. Each level is a band, darker the deeper it is (Krillion's
dive), labelled with the tier's name and points. The ball falls under gravity, so it falls longer the rarer the
answer, and hits the floor of the answer's level: it squashes, kicks up dust, bounces twice and settles. Then that
level lights up and a card shows the tier badge, name, points and any streak bonus. A tap or a key skips to the
landing; with Reduced Motion the drop starts landed. The timing lives in `lib/reveal/drop.ts` (pure, tested).
