package com.adhx.share.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// The JSON shapes of the ADHX phone app API (docs/specs/phone-app.md).

@Serializable
data class PairRequest(val code: String, val name: String? = null)

@Serializable
data class PairResponse(
    val key: String,
    val name: String? = null,
    val username: String? = null,
)

@Serializable
data class MeResponse(
    val username: String? = null,
    val name: String? = null,
)

@Serializable
data class SaveRequest(
    val url: String,
    /** "Just for me": no one else sees, counts or is told about it. Left out when false. */
    @SerialName("private") val isPrivate: Boolean? = null,
    val deferPublish: Boolean = false,
    val requestId: String? = null,
)

@Serializable
data class QueuedPrivacyRequest(
    val id: String,
    @SerialName("private") val isPrivate: Boolean? = null,
    val intentVersion: Long? = null,
)

@Serializable
data class SaveResponse(
    val platform: String = "",
    val network: String? = null,
    val id: String = "",
    val author: String? = null,
    val authorName: String? = null,
    val text: String? = null,
    val category: String? = null,
    val posterUrl: String? = null,
    val openPath: String? = null,
    val alreadySaved: Boolean = false,
    val savedAt: String? = null,
    /** Your save is "Just for me". */
    val isPrivate: Boolean = false,
)

/** 202 to `POST /api/app/save` with `Prefer: respond-async`: queued, not read yet. */
@Serializable
data class QueuedBody(
    val queued: Boolean = false,
    val id: String = "",
    val state: String = QueuedState.WAITING,
)

/** `GET /api/app/save?id=`: how a queued link is going. */
@Serializable
data class QueuedSave(
    val id: String = "",
    /** waiting · saving · saved · failed — see [QueuedState]. */
    val state: String = QueuedState.WAITING,
    /** The same answer as a 200 to the save itself, once `saved`. */
    val post: SaveResponse? = null,
    /** not_a_post · unavailable · failed, once `failed`. */
    val code: String? = null,
    val error: String? = null,
)

object QueuedState {
    const val WAITING = "waiting"
    const val SAVING = "saving"
    const val SAVED = "saved"
    const val FAILED = "failed"
}

@Serializable
data class Kept(
    val videos: Int = 0,
    val photos: Int = 0,
    val audio: Int = 0,
)

@Serializable
data class StatusResponse(
    val platform: String = "",
    val id: String = "",
    /** waiting · keeping · kept · retrying · unavailable · off */
    val status: String = KeepStatus.WAITING,
    val percent: Int? = null,
    val quality: String? = null,
    val kept: Kept? = null,
)

/** A saved post as the player shows it (`PhonePost` in docs/specs/phone-app.md). */
@Serializable
data class PhonePost(
    val platform: String = "",
    val id: String = "",
    /** video · audio · photo · article · text — see [PostKind]. */
    val kind: String = PostKind.TEXT,
    val author: PhoneAuthor = PhoneAuthor(),
    val text: String = "",
    val postedAt: String? = null,
    val savedAt: String? = null,
    /** The post on its own network ("Open original"). */
    val sourceUrl: String? = null,
    /** The post on this ADHX (relative). */
    val openPath: String? = null,
    val media: List<PhoneMedia> = emptyList(),
    val article: PhoneArticle? = null,
    /** Why a search found it. Only on search results. */
    val match: PhoneMatch? = null,
    /** Its picture or video isn't understood yet, so it matched on words. */
    val learning: Boolean = false,
    /** The members who saved it, newest first (your own save has `isYou`). */
    val savers: List<Saver> = emptyList(),
    /** Your save is "Just for me". */
    val isPrivate: Boolean = false,
    /**
     * Why the feed picked it ("Ana and Ben saved this"). Only on `/api/app/feed`.
     * Read loosely: a line, a list of lines, or objects with a `text`.
     */
    @Serializable(with = ReasonsSerializer::class)
    val why: List<String> = emptyList(),
    /**
     * Every reason the feed had (`[{ kind, text, username? }]`), for Why this
     * one. Only on `/api/app/feed`; read as loosely as [why].
     */
    @Serializable(with = WhyReasonsSerializer::class)
    val whyReasons: List<WhyReason> = emptyList(),
) {
    val key: String get() = "$platform:$id"

    /** The reason for the why chip: the feed's headline, else its first reason. */
    val headline: String? get() = why.firstOrNull() ?: whyReasons.firstOrNull()?.text

    /** What kind of reason the headline is (together · more · like · close · fresh · yours), when the server says. */
    val whyKind: String? get() = whyReasons.firstOrNull()?.kind

    /** All the reasons, for Why this one: the full list when the server sends one, else [why]. */
    val reasons: List<String> get() = whyReasons.map { it.text }.ifEmpty { why }

    val ref: PostRef get() = PostRef(platform, id)

    /** You saved it yourself (so the "Just for me" switch applies). */
    val yours: Boolean get() = isPrivate || savers.any { it.isYou }
}

/** One of the feed's reasons for a post: its words, and what kind of reason it is. */
@Serializable
data class WhyReason(
    val text: String = "",
    /** together · more · like · close · fresh · yours */
    val kind: String? = null,
    val username: String? = null,
)

/** One member who saved a post. `avatarUrl` may be relative; null means draw their initial. */
@Serializable
data class Saver(
    val username: String = "",
    val name: String? = null,
    val avatarUrl: String? = null,
    val savedAt: String? = null,
    val isYou: Boolean = false,
    /** A short note they left with their save ("you're welcome"), up to 140 characters. Older servers send none. */
    @Serializable(with = LooseTextSerializer::class)
    val note: String? = null,
) {
    /** What to call them: their name, else their username. */
    val label: String get() = name?.trim()?.takeIf { it.isNotEmpty() } ?: username
}

@Serializable
data class PhoneAuthor(
    val handle: String = "",
    val name: String? = null,
    val avatarUrl: String? = null,
)

/** A video (or sound) or a photo. `url` and `posterUrl` are relative to the server. */
@Serializable
data class PhoneMedia(
    /** video · photo */
    val kind: String = "photo",
    val url: String = "",
    val posterUrl: String? = null,
    val width: Double? = null,
    val height: Double? = null,
    val durationMs: Double? = null,
)

@Serializable
data class PhoneArticle(
    val title: String? = null,
    val description: String? = null,
    val url: String? = null,
)

@Serializable
data class PhoneMatch(
    /** strong · good · related */
    val strength: String = "related",
    val on: List<String> = emptyList(),
)

object PostKind {
    const val VIDEO = "video"
    const val AUDIO = "audio"
    const val PHOTO = "photo"
    const val ARTICLE = "article"
    const val TEXT = "text"

    fun plays(kind: String): Boolean = kind == VIDEO || kind == AUDIO
}

@Serializable
data class SavesResponse(
    val items: List<PhonePost> = emptyList(),
    val total: Int = 0,
    val nextOffset: Int? = null,
    /** Saves still being downloaded: not in `items` or `total` yet. */
    val preparing: Int = 0,
)

@Serializable
data class SavedPostResponse(val item: PhonePost)

@Serializable
data class SearchResponse(
    val items: List<PhonePost> = emptyList(),
    val total: Int = 0,
    /** false: meaning isn't ready on this server; these matched on exact words. */
    val understood: Boolean = true,
    /** false: nothing matched closely; these are the nearest. */
    val close: Boolean = true,
    val nextOffset: Int? = null,
)

@Serializable
data class ReasonBody(val reason: String? = null)

@Serializable
data class ErrorBody(
    val error: String? = null,
    val code: String? = null,
)

object KeepStatus {
    const val WAITING = "waiting"
    const val KEEPING = "keeping"
    const val KEPT = "kept"
    const val RETRYING = "retrying"
    const val UNAVAILABLE = "unavailable"
    const val OFF = "off"

    /** Not part of the API: `/api/app/status` answered 404 not_saved. */
    const val NOT_SAVED = "not_saved"

    fun isFinal(status: String?): Boolean =
        status == KEPT || status == UNAVAILABLE || status == OFF || status == NOT_SAVED
}

// The friends feed (docs/specs/friends-feed.md → Phone API additions). Parts of
// it are newer than some servers, so everything here decodes loosely.

@Serializable
data class PostRef(val platform: String, val id: String)

/** `POST /api/app/private`. */
@Serializable
data class PrivateRequest(
    val platform: String,
    val id: String,
    @SerialName("private") val isPrivate: Boolean,
)

@Serializable
data class PrivateResponse(@SerialName("private") val isPrivate: Boolean = false)

/** The feed's modes: what you haven't seen, everyone's, your friends' only, or yours. */
object FeedMode {
    const val NEW = "new"
    const val EVERYONE = "everyone"
    const val FRIENDS = "friends"
    const val MINE = "mine"
}

/** `GET /api/app/feed?mode&cursor`. */
@Serializable
data class FeedResponse(
    @Serializable(with = LenientPostsSerializer::class)
    val items: List<PhonePost> = emptyList(),
    val nextCursor: String? = null,
    /** `new` ran out of things you haven't seen. */
    val caughtUp: Boolean = false,
    /** Nobody has saved anything you could see yet: not caught up, just empty. */
    val nothingYet: Boolean = false,
    /**
     * Posts the type filter left out, by [MediaType] (`{ text: 4 }`). Read
     * loosely; absent on servers that don't say.
     */
    @Serializable(with = HiddenSerializer::class)
    val hidden: Map<String, Int> = emptyMap(),
)

/** The kinds of post the feed filter picks between (`types=` on `/api/app/feed`). */
object MediaType {
    const val VIDEO = "video"
    const val PHOTO = "photo"
    const val TEXT = "text"
    const val ARTICLE = "article"

    val all = listOf(VIDEO, PHOTO, TEXT, ARTICLE)

    /** Videos and photos; words are opt-in. */
    val DEFAULT: Set<String> = setOf(VIDEO, PHOTO)

    /** Which filter a post falls under (a sound plays like a video). */
    fun of(kind: String): String = when (kind) {
        PostKind.VIDEO, PostKind.AUDIO -> VIDEO
        PostKind.PHOTO -> PHOTO
        PostKind.ARTICLE -> ARTICLE
        else -> TEXT
    }

    /** Known types only, in order; the default when nothing usable is left. */
    fun clean(types: Collection<String>): Set<String> =
        all.filter { it in types }.toSet().ifEmpty { DEFAULT }
}

/** `GET/PUT /api/app/feed/types`. */
@Serializable
data class FeedTypesBody(val types: List<String> = emptyList())

/** `POST /api/app/seen` (at most 50). */
@Serializable
data class SeenRequest(val posts: List<PostRef>)

/** Search scopes: everyone's saves on this server, or yours. */
object SearchScope {
    const val EVERYONE = "everyone"
    const val MINE = "mine"
}

/** A channel made from everyone's saves ("Cats with opinions"). */
@Serializable
data class GroupChannel(
    val slug: String = "",
    val name: String = "",
    val size: Int = 0,
    @Serializable(with = CoversSerializer::class)
    val covers: List<String> = emptyList(),
    val savers: List<Saver> = emptyList(),
    /** Posts in it you haven't seen ("3 new"). */
    val newCount: Int = 0,
)

/** One friend's saves. */
@Serializable
data class FriendChannel(
    val username: String = "",
    val name: String? = null,
    val avatarUrl: String? = null,
    val size: Int = 0,
    /** Saves of theirs you haven't seen. */
    val newCount: Int = 0,
    @Serializable(with = CoversSerializer::class)
    val covers: List<String> = emptyList(),
) {
    val label: String get() = name?.trim()?.takeIf { it.isNotEmpty() } ?: username
    val asSaver: Saver get() = Saver(username = username, name = name, avatarUrl = avatarUrl)
}

/** Made for you, from what you keep, or one of your own channels. */
@Serializable
data class MineChannel(
    val slug: String = "",
    val name: String = "",
    val size: Int = 0,
    @Serializable(with = CoversSerializer::class)
    val covers: List<String> = emptyList(),
)

/** `GET /api/app/channels`. */
@Serializable
data class ChannelsResponse(
    val group: List<GroupChannel> = emptyList(),
    val friends: List<FriendChannel> = emptyList(),
    val mine: List<MineChannel> = emptyList(),
)

/** The three kinds of channel in `/api/app/channels/{kind}/{slug}`. */
object ChannelKind {
    const val GROUP = "group"
    const val FRIEND = "friend"
    const val MINE = "mine"
}

/** `GET /api/app/channels/{kind}/{slug}`. */
@Serializable
data class ChannelItemsResponse(
    @Serializable(with = LenientPostsSerializer::class)
    val items: List<PhonePost> = emptyList(),
)

/** A moment: something your lot are saving right now. The field set is tentative. */
@Serializable
data class LiveMoment(
    val slug: String = "",
    val name: String? = null,
    /** The web's moments call it `title`. */
    val title: String? = null,
    /** How many people saved into it. */
    val people: Int = 0,
    val posts: Int? = null,
    val savers: List<Saver> = emptyList(),
    /** How many are tuned in now. */
    val watching: Int = 0,
    val watchers: List<Saver> = emptyList(),
    @Serializable(with = CoversSerializer::class)
    val covers: List<String> = emptyList(),
    val live: Boolean = true,
) {
    val label: String get() = name?.takeIf { it.isNotBlank() } ?: title?.takeIf { it.isNotBlank() } ?: slug
}

/** `GET /api/app/live`. */
@Serializable
data class LiveResponse(val moments: List<LiveMoment> = emptyList())

/** `GET /api/app/live/{slug}`. */
@Serializable
data class LiveDetail(
    val removedKeys: List<String> = emptyList(),
    val saverUpdates: List<LiveSaverUpdate> = emptyList(),
    val moment: LiveMoment? = null,
    @Serializable(with = LenientPostsSerializer::class)
    val items: List<PhonePost> = emptyList(),
    val watchers: List<Saver>? = null,
    /** What people tuned in have sent lately, oldest first. Read loosely. */
    @Serializable(with = LiveReactionsSerializer::class)
    val reactions: List<LiveReaction> = emptyList(),
)

/** Compact privacy/name refresh for older posts already held by the player. */
@Serializable
data class LiveSaverUpdate(val key: String, val savers: List<Saver> = emptyList(), val isPrivate: Boolean = false)

/** One reaction someone sent while tuned in: an emoji, or a few words. */
@Serializable
data class LiveReaction(
    /** Tells one reaction from another across polls. */
    val key: String = "",
    val emoji: String? = null,
    val text: String? = null,
    val who: Saver? = null,
    val at: String? = null,
)

/** The quick reactions in the React picker, and what a screen reader calls each. */
object Reaction {
    val emoji = listOf("😂", "🔥", "😭", "👀", "💀", "❤️")
    val names = mapOf("😂" to "laughing", "🔥" to "fire", "😭" to "crying", "👀" to "eyes", "💀" to "skull", "❤️" to "heart")

    /** The most a typed reaction can say. */
    const val MAX_TEXT = 40
    fun clip(text: String): String {
        val points = text.codePoints().limit(MAX_TEXT.toLong()).toArray()
        return String(points, 0, points.size)
    }
    fun length(text: String): Int = text.codePointCount(0, text.length)
}

/** `POST /api/app/live/{slug}/react`: `{ emoji }` or `{ text }`, and the post. */
@Serializable
data class ReactRequest(
    val emoji: String? = null,
    val text: String? = null,
    val platform: String,
    val id: String,
)

// Settings: your people and join approvals (`/api/app/people`), and what
// your ADHX is doing (`/api/app/doing`). Read loosely, like the feed.

/** One member, as Settings → Your people lists them. Never an account id. */
@Serializable
data class Person(
    val username: String = "",
    val name: String? = null,
    val avatarUrl: String? = null,
    /** Their saves you can see. */
    val saves: Int = 0,
    val lastSavedAt: String? = null,
    /** owner · admin · member — see [PersonRole]. */
    val role: String = PersonRole.MEMBER,
    /** Only admins are sent banned members. */
    val banned: Boolean = false,
    val isYou: Boolean = false,
) {
    val label: String get() = name?.trim()?.takeIf { it.isNotEmpty() } ?: username
    val asSaver: Saver get() = Saver(username = username, name = name, avatarUrl = avatarUrl, isYou = isYou)
}

object PersonRole {
    const val OWNER = "owner"
    const val ADMIN = "admin"
    const val MEMBER = "member"
}

/** Someone a member invited, waiting for an admin to let them in. */
@Serializable
data class JoinRequest(
    /** The invite they joined with: the handle for deciding. */
    val id: String = "",
    val username: String = "",
    val name: String? = null,
    /** When they joined (ISO). */
    val askedAt: String? = null,
    val invitedBy: Inviter? = null,
    val snoozedUntil: String? = null,
) {
    val label: String get() = name?.trim()?.takeIf { it.isNotEmpty() } ?: username
}

@Serializable
data class Inviter(val username: String = "", val name: String? = null) {
    val label: String get() = name?.trim()?.takeIf { it.isNotEmpty() } ?: username
}

/** `GET /api/app/people`: the web's `GET /api/people`. `requests` for admins only. */
@Serializable
data class PeopleResponse(
    @Serializable(with = LenientPeopleSerializer::class)
    val members: List<Person> = emptyList(),
    val isAdmin: Boolean = false,
    val canInvite: Boolean = false,
    /** admin · approve · anyone */
    val inviteMode: String = "admin",
    @Serializable(with = LenientJoinRequestsSerializer::class)
    val requests: List<JoinRequest> = emptyList(),
) {
    val you: Person? get() = members.firstOrNull { it.isYou }
    val owner: Person? get() = members.firstOrNull { it.role == PersonRole.OWNER }
}

/** An admin's answer to a join request. */
object JoinDecision {
    const val APPROVE = "approve"
    const val NOT_NOW = "not_now"
    const val DECLINE = "decline"
}

/** `POST /api/app/people/requests/{id}`. */
@Serializable
data class JoinDecisionRequest(val decision: String)

/** What the account is now: approved · pending (Not now) · declined. */
@Serializable
data class JoinDecisionResponse(val approval: String? = null)

/** Where a post is on its way: working · waiting · needs_you · ready. */
object DoingStatus {
    const val WORKING = "working"
    const val WAITING = "waiting"
    const val NEEDS_YOU = "needs_you"
    const val READY = "ready"
}

/** "Trying again, 2 of 5", and when. */
@Serializable
data class RetryInfo(val attempt: Int = 0, val of: Int = 0, val at: String? = null)

/** One post on its way, stuck, or just finished (`DoingItem` in `src/lib/processing/doing.ts`). */
@Serializable
data class DoingItem(
    val platform: String = "",
    val id: String = "",
    val title: String = "",
    /** "Instagram video" */
    val network: String = "",
    /** Relative to the server, or null. */
    val thumbnail: String? = null,
    val openPath: String? = null,
    val savers: List<Saver> = emptyList(),
    val savedAt: String? = null,
    /** 1–[steps]; [stepLabel] says it in words. */
    val step: Int = 1,
    val stepLabel: String = "",
    val steps: Int = 7,
    /** 0–100 while a step reports it, else null. */
    val percent: Double? = null,
    /** See [DoingStatus]. */
    val status: String = DoingStatus.WORKING,
    /** It plays already, even while it's still being learned. */
    val playable: Boolean = false,
    /** Plain words for a failure or a wait, else null. */
    val reason: String? = null,
    val retryInfo: RetryInfo? = null,
    val quality: String? = null,
    val learned: List<String> = emptyList(),
    /** You saved it, so you may press Retry. */
    val retry: Boolean = false,
    val keepLinkOnly: Boolean = false,
    val finishedAt: String? = null,
) {
    val key: String get() = "$platform:$id"
    val ref: PostRef get() = PostRef(platform, id)
    val needsYou: Boolean get() = status == DoingStatus.NEEDS_YOU
    val ready: Boolean get() = status == DoingStatus.READY
}

@Serializable
data class DoingSummary(
    /** Still on their way: working, waiting or needing you. */
    val onTheirWay: Int = 0,
    val keeping: Int = 0,
    val learning: Int = 0,
    val needsYou: Int = 0,
    val ready: Int = 0,
    val freeBytes: Double? = null,
    /** local · remote (a Mac helper does the learning). */
    val processing: String = "local",
    val remoteConnected: Boolean? = null,
)

/** `GET /api/app/doing?scope=all|mine|needs`. */
@Serializable
data class DoingResponse(
    @Serializable(with = LenientDoingItemsSerializer::class)
    val items: List<DoingItem> = emptyList(),
    val summary: DoingSummary = DoingSummary(),
)

object DoingScope {
    const val ALL = "all"
    const val MINE = "mine"
    const val NEEDS = "needs"
}

/** `POST /api/app/doing/retry` → `{ retried }`: false when it was already on its way. */
@Serializable
data class RetryResponse(val retried: Boolean = false)
