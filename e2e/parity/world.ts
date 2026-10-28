/**
 * The world the friends-feed design boards show, as data: five people on one
 * server, the posts they kept (with the real kept media from the boards), when
 * each of them saved what, and which topic each post is about (for the
 * synthetic vectors behind Right now).
 *
 * Everything here is hand-written from the boards. Post words are short
 * descriptions, never copied captions. Times are minutes before seeding.
 */

import { demoLead, renameChannels, reskin, showcaseEnabled } from './showcase'

export type PersonKey = 'pete' | 'ana' | 'ben' | 'mum' | 'jo'

export interface Person {
  key: PersonKey
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
  /** Phones paired through the real pairing code flow; the first goes in credentials.json. */
  phones: string[]
  /** Visible saves this person should have in total (heroes + filler), from the boards. */
  totalSaves: number
}

export const PEOPLE: Person[] = demoLead([
  {
    key: 'pete',
    id: 'u_parity_pete',
    username: 'pete',
    displayName: 'Pete',
    role: 'admin',
    phones: ["Pete's iPhone"],
    totalSaves: 212,
  },
  {
    key: 'ana',
    id: 'u_parity_ana',
    username: 'ana',
    displayName: 'Ana',
    role: 'user',
    phones: ["Ana's iPhone", "Ana's iPad"],
    totalSaves: 96,
  },
  {
    key: 'ben',
    id: 'u_parity_ben',
    username: 'ben',
    displayName: 'Ben',
    role: 'user',
    phones: ["Ben's Pixel"],
    totalSaves: 212,
  },
  {
    key: 'mum',
    id: 'u_parity_mum',
    username: 'mum',
    displayName: 'Mum',
    role: 'user',
    phones: ["Mum's iPhone"],
    totalSaves: 54,
  },
  {
    key: 'jo',
    id: 'u_parity_jo',
    username: 'jo',
    displayName: 'Jo',
    role: 'user',
    phones: ["Jo's Pixel"],
    totalSaves: 31,
  },
])

export const person = (key: PersonKey): Person => PEOPLE.find((p) => p.key === key)!

/**
 * Board 8.1's join request: "Ben · invited by Jo · 10 min ago" while Who can
 * invite is "Anyone, I approve". The member Ben must stay a member (his phone
 * key and saves are on every other board), so the request is a second account
 * whose display name is Ben.
 */
export const PENDING = {
  id: 'u_parity_pending_ben',
  username: 'benji',
  displayName: 'Ben',
  invitedBy: 'jo' as PersonKey,
  minutesAgo: 10,
  inviteId: 'inv_M2XDparityJoin',
}

/** Settings → Your people → Pending invites (codes are the id's first four characters). */
export const INVITES = [
  { id: 'inv_7KQ4parityAAAA', by: 'pete' as PersonKey, minutesAgo: 2, expiresInDays: 7 },
  { id: 'inv_R9TBparityBBBB', by: 'ana' as PersonKey, minutesAgo: 24 * 60, expiresInDays: 6 },
]

export const m = (n: number) => n
export const h = (n: number) => n * 60
export const d = (n: number) => n * 24 * 60

export type Topic =
  | 'babies'
  | 'food'
  | 'synths'
  | 'space'
  | 'animals'
  | 'oldnet'
  | 'style'
  | 'places'
  | 'joke'
  | 'work'

/** One axis per topic for the synthetic vectors (Right now groups by these). */
export const TOPIC_AXIS: Record<Topic, number> = {
  babies: 0,
  food: 1,
  synths: 2,
  space: 3,
  animals: 4,
  oldnet: 5,
  style: 6,
  places: 7,
  joke: 8,
  work: 9,
}

/**
 * Where a kept file comes from. `copy` takes a file from the media source
 * (`PARITY_MEDIA_SRC/{platform}/{postDir}/{file}`); `still` loops a picture
 * into a video of that many seconds (the source only kept a thumbnail);
 * `frame` grabs a still from a source video at a time. Without the source,
 * every slot becomes a generated placeholder.
 */
export type MediaSpec =
  | { slot: string; copy: { platform: string; id: string; file: string } }
  | { slot: string; still: { platform: string; id: string; file: string }; seconds: number }
  | { slot: string; frame: { platform: string; id: string; file: string }; at: number }

export interface Save {
  who: PersonKey
  minutesAgo: number
  private?: boolean
  /** Their note on the save (boards j1-2, j2-3, j3-1, j3-2, j6-2). */
  note?: string
}

export interface WorldPost {
  key: string
  platform: string
  id: string
  author: string
  authorName: string | null
  /** First line is the title the app shows; the rest is the caption. */
  text: string
  category: 'video' | 'photo' | 'text' | 'tweet'
  shape: 'portrait' | 'landscape' | 'square'
  topic: Topic
  media: MediaSpec[]
  saves: Save[]
  /** Words "said in the video" / "on screen" (post_extracted_text). */
  speech?: string
  screen?: string
}

const src = (platform: string, id: string, file: string) => ({ platform, id, file })

const YT_ZOO = 'jNQXAC9IVRw'
const YT_CHARLIE = '_OBlgSz8sSM'
const YT_RICK = 'dQw4w9WgXcQ'
const REDDIT_HAMSTER = '6rrwyj'
const IG_CHOC = 'DbaFQ90SWzo'
const PIN_STEAK = '368450813289543786'
const TT_BIRD = '7672947535488503062'
const X_SYNTH = '2110463147911860349'
const X_LOAFERS = '2091475617438957808'
/** One X post whose photos are a pub bar (2) and a bridge at sunset (3). */
const X_PUB_BRIDGE = '2110414696037716372'
const SC_FORSS = 'forss~flickermood'
const VIMEO_PLANE = '76979871'
const THREADS_NASA = 'Decc755lYhC'
const LI_RESET = '7513319742594560000'
const FB_NASA = '4007941182848761'
const TWITCH_CHART = 'BrightUglyPresidentPupper-v_5eas1RabtzXWRn'

const copyVideo = (platform: string, id: string): MediaSpec[] => [
  { slot: 'video-1', copy: src(platform, id, 'video-1.mp4') },
  { slot: 'poster', copy: src(platform, id, 'poster.jpg') },
]

const WORLD_POSTS: WorldPost[] = [
  {
    key: 'zoo',
    platform: 'youtube',
    id: YT_ZOO,
    author: 'jawed',
    authorName: 'jawed',
    text: 'Me at the zoo\n\nAll right, so here we are in front of the elephants',
    category: 'video',
    shape: 'landscape',
    topic: 'oldnet',
    media: copyVideo('youtube', YT_ZOO),
    saves: [
      { who: 'pete', minutesAgo: h(3) },
      { who: 'ana', minutesAgo: h(5) },
      { who: 'jo', minutesAgo: h(20) },
      { who: 'mum', minutesAgo: d(2) },
    ],
    speech: 'All right, so here we are in front of the elephants.',
  },
  {
    key: 'charlie',
    platform: 'youtube',
    id: YT_CHARLIE,
    author: 'HDCYT',
    authorName: 'HDCYT',
    text: 'Charlie bit my finger\n\nCharlie bit my finger, again. The home video that taught the whole internet to say ouch.',
    category: 'video',
    shape: 'landscape',
    topic: 'babies',
    media: [
      { slot: 'video-1', still: src('youtube', YT_CHARLIE, 'photo-1.jpg'), seconds: 56 },
      { slot: 'poster', copy: src('youtube', YT_CHARLIE, 'photo-1.jpg') },
    ],
    saves: [
      { who: 'pete', minutesAgo: h(2) },
      { who: 'ben', minutesAgo: d(1) },
      { who: 'ana', minutesAgo: d(3), note: 'the original and still the best' },
    ],
    speech: 'Charlie bit me… ouch, Charlie. Charlie, that really hurt.',
  },
  {
    key: 'charlieFull',
    platform: 'youtube',
    id: 'parityChrlF',
    author: 'HDCYT',
    authorName: 'HDCYT',
    text: 'The original, in full\n\nThe whole home video, finger and all.',
    category: 'video',
    shape: 'landscape',
    topic: 'babies',
    media: [
      { slot: 'video-1', still: src('youtube', YT_CHARLIE, 'photo-1.jpg'), seconds: 56 },
      { slot: 'poster', copy: src('youtube', YT_CHARLIE, 'photo-1.jpg') },
    ],
    saves: [{ who: 'ben', minutesAgo: m(7) }],
  },
  {
    key: 'remix',
    platform: 'tiktok',
    id: '7600000000000000101',
    author: 'tiktok',
    authorName: null,
    text: 'The remix, with a beat drop',
    category: 'video',
    shape: 'portrait',
    topic: 'babies',
    media: [
      { slot: 'video-1', still: src('youtube', YT_CHARLIE, 'photo-1.jpg'), seconds: 24 },
      { slot: 'poster', copy: src('youtube', YT_CHARLIE, 'photo-1.jpg') },
    ],
    saves: [{ who: 'pete', minutesAgo: d(6), private: true }],
  },
  {
    key: 'hamster',
    platform: 'reddit',
    id: REDDIT_HAMSTER,
    author: 'videos',
    authorName: null,
    text: 'A baby meets a talking hamster\n\nThe hamster repeats everything he says. He has not made peace with this.',
    category: 'video',
    shape: 'portrait',
    topic: 'babies',
    media: [
      { slot: 'video-1', copy: src('reddit', REDDIT_HAMSTER, 'video-1.mp4') },
      { slot: 'poster', frame: src('reddit', REDDIT_HAMSTER, 'video-1.mp4'), at: 1 },
    ],
    saves: [
      { who: 'jo', minutesAgo: m(10) },
      { who: 'mum', minutesAgo: h(1) },
    ],
  },
  {
    key: 'hamster2',
    platform: 'reddit',
    id: 'parityhmstr2',
    author: 'videos',
    authorName: null,
    text: 'Same baby, same hamster, round two\n\nNegotiations with the hamster continue.',
    category: 'video',
    shape: 'portrait',
    topic: 'babies',
    media: [
      { slot: 'video-1', copy: src('reddit', REDDIT_HAMSTER, 'video-1.mp4') },
      { slot: 'poster', frame: src('reddit', REDDIT_HAMSTER, 'video-1.mp4'), at: 6 },
    ],
    saves: [{ who: 'ana', minutesAgo: m(4) }],
  },
  {
    key: 'rick',
    platform: 'youtube',
    id: YT_RICK,
    author: 'RickAstley',
    authorName: 'Rick Astley',
    text: 'Never Gonna Give You Up\n\nBen swears it isn’t a Rickroll.',
    category: 'video',
    shape: 'landscape',
    topic: 'joke',
    media: copyVideo('youtube', YT_RICK),
    saves: [
      { who: 'ben', minutesAgo: m(15), note: 'you’re welcome' },
      { who: 'ana', minutesAgo: d(2) },
    ],
  },
  {
    key: 'choc',
    platform: 'instagram',
    id: IG_CHOC,
    author: 'instagram',
    authorName: null,
    text: 'Trying dark chocolate for the first time',
    category: 'video',
    shape: 'portrait',
    topic: 'food',
    media: copyVideo('instagram', IG_CHOC),
    saves: [
      { who: 'pete', minutesAgo: m(1), note: 'this is so you, Ben' },
      { who: 'ben', minutesAgo: d(3) },
    ],
    screen: 'Trying dark chocolate for the first time',
  },
  {
    key: 'choc2',
    platform: 'instagram',
    id: 'ParityChoc2',
    author: 'instagram',
    authorName: null,
    text: 'Dark chocolate, round two\n\nThat face, though.',
    category: 'video',
    shape: 'portrait',
    topic: 'food',
    media: [
      { slot: 'video-1', copy: src('instagram', IG_CHOC, 'video-1.mp4') },
      { slot: 'poster', frame: src('instagram', IG_CHOC, 'video-1.mp4'), at: 12 },
    ],
    saves: [
      { who: 'ben', minutesAgo: h(5) },
      { who: 'pete', minutesAgo: d(4) },
    ],
  },
  {
    key: 'steak',
    platform: 'pinterest',
    id: PIN_STEAK,
    author: 'pinterest',
    authorName: null,
    text: 'It’s all about the sauce\n\nPan steak, butter and thyme, spooned over until it looks like that. The sauce recipe is the whole point.',
    category: 'video',
    shape: 'portrait',
    topic: 'food',
    media: copyVideo('pinterest', PIN_STEAK),
    saves: [
      { who: 'mum', minutesAgo: h(1), note: 'making this Sunday' },
      { who: 'pete', minutesAgo: d(2) },
    ],
    screen: 'it’s all about the sauce',
  },
  {
    key: 'bird',
    platform: 'tiktok',
    id: TT_BIRD,
    author: 'tiktok',
    authorName: null,
    text: 'A cormorant with opinions\n\nA very loud bird.',
    category: 'video',
    shape: 'portrait',
    topic: 'animals',
    media: copyVideo('tiktok', TT_BIRD),
    saves: [{ who: 'ana', minutesAgo: h(4) }],
  },
  {
    key: 'synth',
    platform: 'twitter',
    id: X_SYNTH,
    author: 'x',
    authorName: null,
    text: 'A patch that sounds like rain',
    category: 'video',
    shape: 'portrait',
    topic: 'synths',
    media: copyVideo('twitter', X_SYNTH),
    saves: [
      { who: 'jo', minutesAgo: m(6) },
      { who: 'ben', minutesAgo: d(1) },
      { who: 'ana', minutesAgo: d(2) },
    ],
  },
  {
    key: 'loafers',
    platform: 'twitter',
    id: X_LOAFERS,
    author: 'x',
    authorName: null,
    text: 'Black loafers, white socks',
    category: 'photo',
    shape: 'square',
    topic: 'style',
    media: [
      { slot: 'photo-1', copy: src('twitter', X_LOAFERS, 'photo-1.jpg') },
      { slot: 'photo-2', copy: src('twitter', X_LOAFERS, 'photo-2.jpg') },
    ],
    saves: [{ who: 'pete', minutesAgo: d(1) }],
  },
  {
    key: 'loafersAna',
    platform: 'twitter',
    id: '1900000000000000102',
    author: 'x',
    authorName: null,
    text: 'Loafers, white socks, no notes',
    category: 'photo',
    shape: 'square',
    topic: 'style',
    media: [
      { slot: 'photo-1', copy: src('twitter', X_LOAFERS, 'photo-2.jpg') },
      { slot: 'photo-2', copy: src('twitter', X_LOAFERS, 'photo-1.jpg') },
    ],
    saves: [{ who: 'ana', minutesAgo: h(5) }],
  },
  {
    key: 'bridge',
    platform: 'twitter',
    id: '1900000000000000103',
    author: 'x',
    authorName: null,
    text: 'Under the bridge at sunset',
    category: 'photo',
    shape: 'square',
    topic: 'places',
    media: [{ slot: 'photo-1', copy: src('twitter', X_PUB_BRIDGE, 'photo-3.jpg') }],
    saves: [
      { who: 'pete', minutesAgo: d(2) },
      { who: 'mum', minutesAgo: d(3) },
    ],
  },
  {
    key: 'bridgeAna',
    platform: 'twitter',
    id: '1900000000000000104',
    author: 'x',
    authorName: null,
    text: 'Under the bridge, golden hour',
    category: 'photo',
    shape: 'square',
    topic: 'places',
    media: [{ slot: 'photo-1', copy: src('twitter', X_PUB_BRIDGE, 'photo-3.jpg') }],
    saves: [{ who: 'ana', minutesAgo: h(2) }],
  },
  {
    key: 'pub',
    platform: 'twitter',
    id: '1900000000000000105',
    author: 'x',
    authorName: null,
    text: 'The last proper pub\n\nStill does a proper roast.',
    category: 'photo',
    shape: 'square',
    topic: 'food',
    media: [{ slot: 'photo-1', copy: src('twitter', X_PUB_BRIDGE, 'photo-2.jpg') }],
    saves: [
      { who: 'pete', minutesAgo: d(4) },
      { who: 'ana', minutesAgo: d(5) },
      { who: 'mum', minutesAgo: h(20) },
    ],
  },
  {
    key: 'forss',
    platform: 'soundcloud',
    id: SC_FORSS,
    author: 'forss',
    authorName: 'forss',
    text: 'forss · soulhack',
    category: 'video',
    shape: 'square',
    topic: 'synths',
    media: [
      { slot: 'audio-1', copy: src('soundcloud', SC_FORSS, 'audio-1.m4a') },
      { slot: 'poster', copy: src('soundcloud', SC_FORSS, 'poster.jpg') },
    ],
    saves: [
      { who: 'pete', minutesAgo: d(3) },
      { who: 'ana', minutesAgo: d(4) },
    ],
  },
  {
    key: 'plane',
    platform: 'vimeo',
    id: VIMEO_PLANE,
    author: 'vimeo',
    authorName: null,
    text: 'Paper planes, animated',
    category: 'video',
    shape: 'square',
    topic: 'synths',
    media: [
      { slot: 'video-1', still: src('vimeo', VIMEO_PLANE, 'photo-1.jpg'), seconds: 108 },
      { slot: 'poster', copy: src('vimeo', VIMEO_PLANE, 'photo-1.jpg') },
    ],
    saves: [{ who: 'pete', minutesAgo: d(5), private: true }],
  },
  {
    key: 'planeAna',
    platform: 'vimeo',
    id: '900000101',
    author: 'vimeo',
    authorName: null,
    text: 'Paper plane, the long way round',
    category: 'video',
    shape: 'square',
    topic: 'synths',
    media: [
      { slot: 'video-1', still: src('vimeo', VIMEO_PLANE, 'photo-1.jpg'), seconds: 108 },
      { slot: 'poster', copy: src('vimeo', VIMEO_PLANE, 'photo-1.jpg') },
    ],
    saves: [{ who: 'ana', minutesAgo: m(40) }],
  },
  {
    key: 'threads',
    platform: 'threads',
    id: THREADS_NASA,
    author: 'nasa',
    authorName: 'NASA',
    text: 'A thread on NASA’s next launch',
    category: 'photo',
    shape: 'square',
    topic: 'space',
    media: [{ slot: 'photo-1', copy: src('threads', THREADS_NASA, 'photo-1.jpg') }],
    saves: [{ who: 'pete', minutesAgo: d(7) }],
  },
  {
    key: 'reset',
    platform: 'linkedin',
    id: LI_RESET,
    author: 'linkedin',
    authorName: null,
    text: 'Let’s Reset',
    category: 'video',
    shape: 'square',
    topic: 'work',
    media: copyVideo('linkedin', LI_RESET),
    saves: [{ who: 'pete', minutesAgo: d(8) }],
  },
  {
    key: 'nasa',
    platform: 'facebook',
    id: FB_NASA,
    author: 'NASA',
    authorName: 'NASA',
    text: 'Inside mission control',
    category: 'video',
    shape: 'landscape',
    topic: 'space',
    media: copyVideo('facebook', FB_NASA),
    saves: [
      { who: 'ana', minutesAgo: h(18) },
      { who: 'ben', minutesAgo: h(22) },
    ],
  },
  {
    key: 'chart',
    platform: 'twitch',
    id: TWITCH_CHART,
    author: 'twitch',
    authorName: null,
    text: 'Watching the chart like it owes me money',
    category: 'video',
    shape: 'landscape',
    topic: 'joke',
    media: copyVideo('twitch', TWITCH_CHART),
    saves: [{ who: 'ben', minutesAgo: d(3) }],
  },
  // Only on "What your ADHX is doing": no kept media.
  {
    key: 'igPrivate',
    platform: 'instagram',
    id: 'ParityIgPrv',
    author: 'instagram',
    authorName: null,
    text: 'Instagram post',
    category: 'photo',
    shape: 'square',
    topic: 'style',
    media: [],
    saves: [{ who: 'mum', minutesAgo: m(20) }],
  },
  {
    key: 'igSlow',
    platform: 'instagram',
    id: 'ParityIgSlw',
    author: 'instagram',
    authorName: null,
    text: 'Instagram Reel',
    category: 'video',
    shape: 'portrait',
    topic: 'animals',
    media: [],
    saves: [{ who: 'ben', minutesAgo: m(3) }],
  },
]

/** The posts; in showcase mode each wears a post credited on adhx.com (showcase.ts). */
export const POSTS: WorldPost[] = showcaseEnabled() ? reskin(WORLD_POSTS) : WORLD_POSTS

export const post = (key: string): WorldPost => {
  const found = POSTS.find((p) => p.key === key)
  if (!found) throw new Error(`No world post ${key}`)
  return found
}

/** Posts Pete has already seen, so New says "12 you haven't seen". */
/**
 * "Pete sent you this" (send straight to your people): Ana sent Pete her
 * bridge photo a few minutes ago, so New leads with "Ana sent you this".
 */
export const SENT_TO_PETE = { from: 'ana' as PersonKey, post: 'bridgeAna', minutesAgo: 3 }

/**
 * A forming group on Right now (boards j7-1, j7-3): once Next is up,
 * `parity:serve` has Ben and then Jo save two synth posts they hadn't saved
 * (forss and Ana's paper plane). Forming groups are made only from saves that
 * land while the engine runs, so they can't be seeded before it starts. These
 * two posts keep the week's visible synth posts at three, under the four a
 * regroup needs to make a moment of them, so the group stays forming.
 */
export const FORMING_SAVES: { who: PersonKey; post: string }[] = [
  { who: 'ben', post: 'forss' },
  { who: 'jo', post: 'planeAna' },
]

export const PETE_SEEN = [
  'charlieFull',
  'choc2',
  'bridge',
  'pub',
  'forss',
  'chart',
  'igPrivate',
  'igSlow',
]

/**
 * /doing (board 8.3): which post is in which state. Keep states need
 * KEEP_MEDIA on; the parity server pins the backfill cutoff in the far future
 * so the keep worker never downloads anything.
 */
export const DOING = {
  keeping: 'choc', // its keep job is running at 62%: "Keeping a copy" on /doing, "Getting it ready" in the theater
  converting: 'synth', // keep job converting → "Making it play everywhere"
  listening: 'hamster2', // speech queued → "Listening to what's said · plays now"
  needsYou: 'igPrivate', // keep gave up: private on Instagram
  waiting: 'igSlow', // keep failed once, retrying → "attempt 2 of 4"
  ready: 'rick', // kept, everything learned
}

/** "From everyone" channels (board 6.1), stored directly: naming them needs the model. */
export const GROUP_CHANNELS: Array<{
  slug: string
  name: string
  size: number
  heroes: string[]
  /** Who saves this channel's filler posts. */
  fillBy: PersonKey[]
  topic: Topic
}> = renameChannels([
  {
    slug: 'cats-with-opinions',
    name: 'Cats with opinions',
    size: 38,
    heroes: ['bird', 'zoo', 'loafersAna', 'chart'],
    fillBy: ['ana', 'ben', 'jo'],
    topic: 'animals',
  },
  {
    slug: 'food-youll-cook-one-day',
    name: 'Food you’ll cook one day',
    size: 41,
    heroes: ['steak', 'choc', 'pub', 'choc2', 'bridge'],
    fillBy: ['mum', 'pete'],
    topic: 'food',
  },
  {
    slug: 'kitchen-synths',
    name: 'Kitchen synths',
    size: 17,
    heroes: ['synth', 'forss', 'planeAna'],
    fillBy: ['jo', 'ben'],
    topic: 'synths',
  },
  {
    slug: 'babies-vs-objects',
    name: 'Babies vs objects',
    size: 26,
    heroes: ['hamster', 'charlie', 'charlieFull', 'hamster2'],
    fillBy: ['ana', 'ben', 'jo', 'pete'],
    topic: 'babies',
  },
])

/** Pete's "Made for you" (board 6.1), stored directly for the same reason. */
export const MADE_FOR_PETE: Array<{
  slug: string
  name: string
  heroes: string[]
  fill: number
  topic: Topic
}> = renameChannels([
  {
    slug: 'space-mostly-control-rooms',
    name: 'Space, mostly control rooms',
    heroes: ['threads'],
    fill: 9,
    topic: 'space',
  },
  {
    slug: 'the-old-internet',
    name: 'The old internet',
    heroes: ['zoo', 'charlie'],
    fill: 12,
    topic: 'oldnet',
  },
  {
    slug: 'saves-that-are-definitely-a-joke',
    name: 'Saves that are definitely a joke',
    heroes: ['remix'],
    fill: 8,
    topic: 'joke',
  },
  {
    slug: 'things-you-meant-to-finish',
    name: 'Things you meant to finish',
    heroes: ['reset', 'forss'],
    fill: 6,
    topic: 'work',
  },
])

/**
 * Pictures filler posts borrow (a hero post's kept still, by topic), so
 * channel grids and search tiles look like the boards' media walls rather
 * than walls of text.
 */
export const FILLER_STILLS: Record<Topic, Array<{ post: string; slot: string }>> = {
  animals: [
    { post: 'bird', slot: 'poster' },
    { post: 'zoo', slot: 'poster' },
  ],
  food: [
    { post: 'steak', slot: 'poster' },
    { post: 'choc2', slot: 'poster' },
    { post: 'pub', slot: 'photo-1' },
  ],
  synths: [
    { post: 'synth', slot: 'poster' },
    { post: 'forss', slot: 'poster' },
    { post: 'planeAna', slot: 'poster' },
  ],
  babies: [
    { post: 'hamster', slot: 'poster' },
    { post: 'charlie', slot: 'poster' },
    { post: 'hamster2', slot: 'poster' },
  ],
  space: [
    { post: 'nasa', slot: 'poster' },
    { post: 'threads', slot: 'photo-1' },
  ],
  oldnet: [
    { post: 'zoo', slot: 'poster' },
    { post: 'charlieFull', slot: 'poster' },
  ],
  style: [
    { post: 'loafers', slot: 'photo-1' },
    { post: 'loafers', slot: 'photo-2' },
  ],
  places: [
    { post: 'bridge', slot: 'photo-1' },
    { post: 'pub', slot: 'photo-1' },
  ],
  joke: [
    { post: 'rick', slot: 'poster' },
    { post: 'chart', slot: 'poster' },
  ],
  work: [{ post: 'reset', slot: 'poster' }],
}

/**
 * Filler posts (old, already seen by Pete) that bring save counts and
 * channel sizes up to the boards'. Each topic's text is a subject + a twist,
 * so posts don't repeat. Kept clear of the boards' search words (baby,
 * finger, brother, dark, chocolate, first, time) and of apostrophes:
 * search splits “brother’s” into a lone “s”, which matches every “’s”.
 */
export const FILLER_WORDS: Record<Topic, { subjects: string[]; twists: string[] }> = {
  animals: {
    subjects: [
      'This cat',
      'A goose',
      'Our dog',
      'A seagull',
      'The cat next door',
      'A heron',
      'One very small pug',
      'A crow',
    ],
    twists: [
      'has filed a complaint about the hoover',
      'refuses to let anyone use the path',
      'sits on the one bit of paper you need',
      'heard the word walk from three rooms away',
      'has a clear plan for your chips',
      'knocks the glass off and keeps eye contact',
    ],
  },
  food: {
    subjects: [
      'Ten-minute flatbreads',
      'Roast potatoes',
      'Miso butter',
      'A proper ragu',
      'Crispy rice',
      'Lemon drizzle',
      'Green sauce',
      'Pickled onions',
    ],
    twists: [
      'with no yeast at all',
      'the only method that matters',
      'on literally anything',
      'four hours and worth it',
      'the bottom-of-the-pan bit',
      'like the one from the school fete',
    ],
  },
  synths: {
    subjects: [
      'A tape loop',
      'A kettle bassline',
      'A generative patch',
      'An old drum machine',
      'A train recording',
      'A single chord',
    ],
    twists: [
      'slowly falling apart',
      'that never repeats',
      'through a spring reverb',
      'pitched way down',
      'that sounds like a sunrise',
      'for twenty minutes straight',
    ],
  },
  babies: {
    subjects: [
      'A toddler',
      'Twins',
      'A very small child',
      'Our niece',
      'A two-year-old',
      'The little one',
    ],
    twists: [
      'versus the automatic door',
      'meets a balloon',
      'discovers the echo in the hallway',
      'negotiating with a sock',
      'laughing at torn paper for ten minutes',
      'explaining a film nobody saw',
    ],
  },
  space: {
    subjects: [
      'Mission control',
      'Every launch from one pad',
      'A rover',
      'The inside of a capsule',
      'A night launch',
      'The station',
    ],
    twists: [
      'on landing night',
      'sped up',
      'on a quiet day',
      'as a sound recording',
      'from the beach',
      'passing overhead',
    ],
  },
  oldnet: {
    subjects: [
      'A dancing figure',
      'The hamster dance',
      'A web ring',
      'An old forum',
      'A flash game',
      'A guestbook',
    ],
    twists: [
      'rendered in 1996',
      'the full original page',
      'still up after all these years',
      'archived forever',
      'nobody remembers the rules of',
      'with a visitor counter',
    ],
  },
  style: {
    subjects: [
      'Workwear jackets',
      'The perfect white T-shirt',
      'Sashiko repairs',
      'Old leather boots',
      'A good flat cap',
    ],
    twists: [
      'that last forever',
      'does not exist',
      'on worn-out jeans',
      'brought back to life',
      'worth the money',
    ],
  },
  places: {
    subjects: [
      'Concrete car parks',
      'An empty lido',
      'Underground stations',
      'A seaside shelter',
      'A tower block',
    ],
    twists: [
      'at golden hour',
      'with no one in it',
      'ranked by their tiles',
      'in the rain',
      'from the top deck',
    ],
  },
  joke: {
    subjects: [
      'This is not a Rickroll',
      'A cat on the keyboard',
      'Typing quietly',
      'The office printer',
      'A meeting',
    ],
    twists: [
      '(it is)',
      'mid-presentation',
      'so the bug does not hear',
      'has chosen violence',
      'that could have been an email',
    ],
  },
  work: {
    subjects: [
      'How to actually finish',
      'A desk setup',
      'Notes on doing less',
      'A to-do list',
      'The calendar',
    ],
    twists: [
      'a side project',
      'with one cable',
      'to read later',
      'that fits on a sticky note',
      'with nothing in it',
    ],
  },
}

/**
 * The admin boards ("10 · Admin"), on top of the friends-feed world. Figures
 * are the boards' where the data allows (e2e/parity/seed-admin.ts). Dates are
 * days before seeding; the boards were drawn on 20 October.
 */
export const ADMIN = {
  people: {
    pete: {
      joinedDaysAgo: 69,
      lastSeenMinutesAgo: null,
      invitedBy: null,
      admin: true,
      notes: 4,
      sends: 12,
      reactions: 52,
      favourite: 'laughing',
      favouriteShare: 0.3,
    },
    ana: {
      joinedDaysAgo: 67,
      lastSeenMinutesAgo: 6,
      invitedBy: 'pete',
      admin: true,
      notes: 6,
      sends: 9,
      reactions: 88,
      favourite: 'crying',
      favouriteShare: 0.45,
    },
    ben: {
      joinedDaysAgo: 48,
      lastSeenMinutesAgo: 60,
      invitedBy: 'ana',
      admin: false,
      notes: 3,
      sends: 18,
      reactions: 104,
      favourite: 'laughing',
      favouriteShare: 0.3,
    },
    mum: {
      joinedDaysAgo: 41,
      lastSeenMinutesAgo: 26 * 60,
      invitedBy: 'pete',
      admin: false,
      notes: 4,
      sends: 2,
      reactions: 41,
      favourite: 'heart',
      favouriteShare: 0.3,
    },
    jo: {
      joinedDaysAgo: 20,
      lastSeenMinutesAgo: 49 * 60,
      invitedBy: 'ana',
      admin: false,
      notes: 1,
      sends: 6,
      reactions: 27,
      favourite: 'fire',
      favouriteShare: 0.3,
    },
  } satisfies Record<
    PersonKey,
    {
      joinedDaysAgo: number
      lastSeenMinutesAgo: number | null
      invitedBy: PersonKey | null
      admin: boolean
      notes: number
      sends: number
      reactions: number
      favourite: string
      favouriteShare: number
    }
  >,
  /** Pete's Just for me saves beyond the two hero posts (board: 14 Just for me). */
  petePrivateFiller: 12,
  noteWords: ['so good', 'watch to the end', 'this one', 'remember this?', 'for later', 'ha'],
  /** Where older saves came from (bookmarks.source), weighted like board 10.6. */
  sources: [
    { source: 'phone_app', weight: 138 },
    { source: 'manual', weight: 38 },
    { source: 'sync', weight: 23 },
    { source: 'channel_keep', weight: 15 },
  ],
  /** Members' channels: 23, six public (412 views, 9 keeps). Pete has none. */
  channels: [
    {
      who: 'jo',
      tag: 'kitchen-synths',
      match: 'synth',
      posts: 17,
      public: true,
      views: 160,
      keeps: 4,
      madeDaysAgo: 3,
    },
    {
      who: 'jo',
      tag: 'old-internet',
      match: 'net',
      posts: 8,
      public: true,
      views: 40,
      keeps: 0,
      madeDaysAgo: 12,
    },
    {
      who: 'jo',
      tag: 'rainy-day',
      match: 'rain',
      posts: 5,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 15,
    },
    {
      who: 'jo',
      tag: 'weird-tunes',
      match: 'tune',
      posts: 4,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 16,
    },
    {
      who: 'jo',
      tag: 'for-mum',
      match: 'cook',
      posts: 3,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 17,
    },
    {
      who: 'jo',
      tag: 'later',
      match: '',
      posts: 6,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 18,
    },
    {
      who: 'jo',
      tag: 'patches',
      match: 'patch',
      posts: 4,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 19,
    },
    {
      who: 'jo',
      tag: 'loops',
      match: 'loop',
      posts: 3,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 19,
    },
    {
      who: 'ben',
      tag: 'ben-swears-good',
      match: 'good',
      posts: 22,
      public: true,
      views: 120,
      keeps: 0,
      madeDaysAgo: 2,
    },
    {
      who: 'ben',
      tag: 'food-wins',
      match: 'food',
      posts: 9,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 20,
    },
    {
      who: 'ben',
      tag: 'gym',
      match: 'gym',
      posts: 4,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 30,
    },
    {
      who: 'ben',
      tag: 'cars',
      match: 'car',
      posts: 3,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 33,
    },
    {
      who: 'ben',
      tag: 'memes',
      match: 'joke',
      posts: 7,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 35,
    },
    {
      who: 'ana',
      tag: 'cats-opinions',
      match: 'cat',
      posts: 12,
      public: true,
      views: 52,
      keeps: 2,
      madeDaysAgo: 5,
    },
    {
      who: 'ana',
      tag: 'babies',
      match: 'baby',
      posts: 9,
      public: true,
      views: 40,
      keeps: 3,
      madeDaysAgo: 9,
    },
    {
      who: 'ana',
      tag: 'travel',
      match: 'place',
      posts: 5,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 25,
    },
    {
      who: 'ana',
      tag: 'recipes',
      match: 'food',
      posts: 6,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 26,
    },
    {
      who: 'ana',
      tag: 'outfits',
      match: 'style',
      posts: 4,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 27,
    },
    {
      who: 'ana',
      tag: 'funny',
      match: 'joke',
      posts: 8,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 28,
    },
    {
      who: 'mum',
      tag: 'sunday-roast',
      match: 'sauce',
      posts: 8,
      public: true,
      views: 0,
      keeps: 0,
      madeDaysAgo: 6,
    },
    {
      who: 'mum',
      tag: 'garden',
      match: 'garden',
      posts: 4,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 36,
    },
    {
      who: 'mum',
      tag: 'recipes',
      match: 'food',
      posts: 9,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 37,
    },
    {
      who: 'mum',
      tag: 'grandkids',
      match: 'baby',
      posts: 5,
      public: false,
      views: 0,
      keeps: 0,
      madeDaysAgo: 38,
    },
  ] satisfies {
    who: PersonKey
    tag: string
    match: string
    posts: number
    public: boolean
    views: number
    keeps: number
    madeDaysAgo: number
  }[],
  /** Kinds a reaction is drawn from, about as often as board 10.4's bars. */
  reactionMix: [
    'laughing',
    'laughing',
    'laughing',
    'laughing',
    'laughing',
    'laughing',
    'fire',
    'fire',
    'fire',
    'crying',
    'crying',
    'skull',
    'skull',
    'heart',
    'eyes',
    'text',
    'text',
  ],
  /** This week's moments, most watched first (board 10.5), and their alerts. */
  moments: [
    {
      slug: 'babies-vs-objects-m',
      title: 'Babies vs objects',
      daysAgo: 0,
      tuneIns: 14,
      peak: 4,
      reactions: 64,
      alerts: 5,
      opened: 4,
    },
    {
      slug: 'dark-chocolate-first-time',
      title: 'Dark chocolate, first time',
      daysAgo: 1,
      tuneIns: 9,
      peak: 3,
      reactions: 52,
      alerts: 4,
      opened: 3,
    },
    {
      slug: 'rickrolled-again',
      title: 'Rickrolled again',
      daysAgo: 2,
      tuneIns: 7,
      peak: 3,
      reactions: 41,
      alerts: 3,
      opened: 3,
    },
    {
      slug: 'cats-with-opinions-m',
      title: 'Cats with opinions',
      daysAgo: 3,
      tuneIns: 6,
      peak: 2,
      reactions: 22,
      alerts: 0,
      opened: 0,
    },
    {
      slug: 'kitchen-synths-m',
      title: 'Kitchen synths',
      daysAgo: 4,
      tuneIns: 5,
      peak: 2,
      reactions: 18,
      alerts: 0,
      opened: 0,
    },
  ],
  /** Tune-ins per day, last 14 days, oldest first (board 10.4). */
  tuneInsByDay: [2, 0, 3, 5, 1, 4, 7, 3, 2, 6, 4, 9, 5, 8],
  /** Moments 15–28 days ago, so the month holds 31. */
  olderMoments: 18,
  /** App opens per day, last 30 days, oldest first (board 10.6). */
  opensByDay: [
    31, 28, 40, 36, 30, 44, 52, 41, 38, 47, 43, 55, 39, 42, 58, 49, 45, 53, 47, 61, 66, 50, 57, 44,
    52, 60, 68, 55, 49, 62,
  ],
  filesSent: 91,
  /** Files sent through the share sheet (they also count as a share). */
  filesShared: 31,
  linksShared: 47,
  /** Plays and keeps of shared channels this week (board 10.4). */
  channelPlays: [
    { surface: 'group', ref: 'food-youll-cook-one-day', plays: 186, keeps: 3 },
    { surface: 'channel', ref: 'jo/kitchen-synths', plays: 142, keeps: 0 },
    { surface: 'group', ref: 'babies-vs-objects', plays: 133, keeps: 2 },
    { surface: 'group', ref: 'cats-with-opinions', plays: 97, keeps: 1 },
    { surface: 'channel', ref: 'ben/ben-swears-good', plays: 88, keeps: 0 },
    { surface: 'group', ref: 'kitchen-synths', plays: 40, keeps: 1 },
  ],
  /** Posts the plays land on. */
  playedPosts: [
    'zoo',
    'charlie',
    'rick',
    'choc',
    'hamster',
    'steak',
    'synth',
    'bird',
    'forss',
    'bridge',
  ],
  anaWatched: 312,
  /** Hidden by an admin: not any board's posts, pictured with a hero's still. */
  hidden: [
    {
      id: '1999990000000000001',
      author: 'chartguy',
      title: 'Crypto chart screenshot',
      still: 'chart',
      reason: 'Spam',
      by: 'pete',
      daysAgo: 17,
    },
    {
      id: '1999990000000000002',
      author: 'someone',
      title: 'A post with a stranger’s address',
      still: 'reset',
      reason: 'Personal info',
      by: 'ana',
      daysAgo: 22,
    },
  ] satisfies {
    id: string
    author: string
    title: string
    still: string
    reason: string
    by: PersonKey
    daysAgo: number
  }[],
  /** The admin log, newest first (board 10.8). */
  audit: [
    {
      by: 'pete',
      action: 'hide_post',
      target: { platform: 'twitter', bookmarkId: '1999990000000000001' },
      daysAgo: 17,
    },
    { by: 'pete', action: 'approve_join', target: { username: 'jo' }, daysAgo: 20 },
    {
      by: 'ana',
      action: 'hide_post',
      target: { platform: 'twitter', bookmarkId: '1999990000000000002' },
      daysAgo: 22,
    },
    {
      by: 'ana',
      action: 'clear_note',
      target: { platform: 'youtube', bookmarkId: 'dQw4w9WgXcQ', notesCleared: 1 },
      daysAgo: 29,
    },
    { by: 'pete', action: 'make_admin', target: { username: 'ana' }, daysAgo: 29.5 },
  ] satisfies { by: PersonKey; action: string; target: Record<string, unknown>; daysAgo: number }[],
  /** The Mac helper's name, from a conversion it finished. */
  convertedBy: { post: 'zoo', worker: `${PEOPLE[0].displayName}s MacBook Pro` },
} as const
