/** Isolated e2e server — never the owner's `pnpm dev` on :3001 or `data/adhdone.db`. */
export const E2E_ORIGIN = 'http://localhost:3002'
export const E2E_PORT = 3002
export const E2E_FX_PORT = 3998
export const E2E_FX_ORIGIN = `http://127.0.0.1:${E2E_FX_PORT}`
export const E2E_SESSION_SECRET = 'e2e-test-secret'
export const E2E_DB_RELATIVE = 'data/e2e.db'

export const E2E_USER_ID = 'e2e-user-1'
export const E2E_USERNAME = 'e2euser'

/** Second account — owns a public playlist the e2e user can clone. */
export const E2E_CURATOR_ID = 'e2e-curator-1'
export const E2E_CURATOR_USERNAME = 'e2ecurator'

export const PLAYLIST_TAG = 'e2e-pl'
export const ONE_ITEM_TAG = 'e2e-one'
export const PRIVATE_TAG = 'e2e-priv'
export const CLONE_TAG = 'e2e-clone'
export const TMP_TAG = 'e2etmp'

export type E2ePost = {
  id: string
  author: string
  authorName: string
  text: string
}

export const POST = {
  preview: {
    id: '9000000000000000001',
    author: 'e2ealice',
    authorName: 'E2E Alice',
    text: 'E2E-PREVIEW',
  },
  alpha: {
    id: '9000000000000000101',
    author: 'e2ealice',
    authorName: 'E2E Alice',
    text: 'E2E-ALPHA',
  },
  bravo: {
    id: '9000000000000000102',
    author: 'e2ebob',
    authorName: 'E2E Bob',
    text: 'E2E-BRAVO',
  },
  charlie: {
    id: '9000000000000000103',
    author: 'e2ecara',
    authorName: 'E2E Cara',
    text: 'E2E-CHARLIE',
  },
  delta: {
    id: '9000000000000000104',
    author: 'e2edee',
    authorName: 'E2E Dee',
    text: 'E2E-DELTA',
  },
  echo: {
    id: '9000000000000000105',
    author: 'e2eeve',
    authorName: 'E2E Eve',
    text: 'E2E-ECHO',
  },
  foxtrot: {
    id: '9000000000000000106',
    author: 'e2efay',
    authorName: 'E2E Fay',
    text: 'E2E-FOXTROT',
  },
  golf: {
    id: '9000000000000000107',
    author: 'e2egia',
    authorName: 'E2E Gia',
    text: 'E2E-GOLF',
  },
  hotel: {
    id: '9000000000000000108',
    author: 'e2ehal',
    authorName: 'E2E Hal',
    text: 'E2E-HOTEL',
  },
  india: {
    id: '9000000000000000201',
    author: 'e2eira',
    authorName: 'E2E Ira',
    text: 'E2E-INDIA',
  },
  juliet: {
    id: '9000000000000000202',
    author: 'e2ejay',
    authorName: 'E2E Jay',
    text: 'E2E-JULIET',
  },
  /** Video + quote — Read/Watch on the shared theater. Not in the collection. */
  quoted: {
    id: '9000000000000000401',
    author: 'e2equote',
    authorName: 'E2E Quote',
    text: 'E2E-QUOTE-PARENT',
  },
} as const satisfies Record<string, E2ePost>

export const QUOTED_INNER = {
  id: '9000000000000000402',
  author: 'e2equoted',
  authorName: 'E2E Quoted',
  text: 'E2E-QUOTED-INNER',
} as const

/** Posts the curator owns and the e2e user does not — clone must copy these. */
export const CURATOR_POSTS: E2ePost[] = [POST.india, POST.juliet]

/** Same numeric id as ALPHA — different platform. Pins (platform, id) isolation. */
export const TIKTOK_TWIN = {
  id: POST.alpha.id,
  author: 'e2etik',
  authorName: 'E2E Tik',
  text: 'E2E-TIKTOK',
}

/** Preview-page fixtures — not saved in the e2e user's collection. */
export const PREVIEW_IG = {
  id: 'e2eReel01',
  author: 'e2eig',
  authorName: 'E2E Ig',
  text: 'E2E-REEL',
}

export const PREVIEW_TT = {
  id: '9000000000000000301',
  author: 'e2etiktok',
  authorName: 'E2E TikTok',
  text: 'E2E-TT-PREV',
}

export const PREVIEW_YT = {
  id: 'e2eShorts01',
  author: 'e2eyt',
  authorName: 'E2E YT',
  text: 'E2E-SHORT',
}

export const COLLECTION_POSTS: E2ePost[] = [
  POST.alpha,
  POST.bravo,
  POST.charlie,
  POST.delta,
  POST.echo,
  POST.foxtrot,
  POST.golf,
  POST.hotel,
]

export const LIVE_POSTS: E2ePost[] = [
  POST.preview,
  POST.alpha,
  POST.bravo,
  POST.charlie,
  POST.delta,
  POST.echo,
  POST.foxtrot,
  POST.golf,
  POST.hotel,
]

/** Posts added during cross-tab theater e2e — not in the seed collection. */
export const ADD_TEXT: E2ePost = {
  id: '9000000000000000801',
  author: 'e2eadd',
  authorName: 'E2E Add',
  text: 'E2E-ADD-TEXT',
}

export const ADD_VIDEO: E2ePost = {
  id: '9000000000000000802',
  author: 'e2eaddvid',
  authorName: 'E2E Add Vid',
  text: 'E2E-ADD-VIDEO',
}

export const ADD_VIDEO_B: E2ePost = {
  id: '9000000000000000803',
  author: 'e2eaddvidb',
  authorName: 'E2E Add Vid B',
  text: 'E2E-ADD-VIDEO-B',
}
