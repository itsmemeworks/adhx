/**
 * The world the friends-feed design boards show, as data: five people on one
 * server, the posts they kept (with the real kept media from the boards), when
 * each of them saved what, and which topic each post is about (for the
 * synthetic vectors behind Right now).
 *
 * Everything here is hand-written from the boards. Post words are short
 * descriptions, never copied captions. Times are minutes before seeding.
 */

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

export const PEOPLE: Person[] = [
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
]

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
  inviteId: 'inv_JOBNparityJoin',
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

export const POSTS: WorldPost[] = [
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

export const post = (key: string): WorldPost => {
  const found = POSTS.find((p) => p.key === key)
  if (!found) throw new Error(`No world post ${key}`)
  return found
}

/** Posts Pete has already seen, so New says "12 you haven't seen". */
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
  keeping: 'choc', // kept already (plays everywhere), but its keep job shows "Keeping a copy"
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
}> = [
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
]

/** Pete's "Made for you" (board 6.1), stored directly for the same reason. */
export const MADE_FOR_PETE: Array<{
  slug: string
  name: string
  heroes: string[]
  fill: number
  topic: Topic
}> = [
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
]

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
