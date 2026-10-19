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
) {
    val key: String get() = "$platform:$id"

    val ref: PostRef get() = PostRef(platform, id)

    /** You saved it yourself (so the "Just for me" switch applies). */
    val yours: Boolean get() = isPrivate || savers.any { it.isYou }
}

/** One member who saved a post. `avatarUrl` may be relative; null means draw their initial. */
@Serializable
data class Saver(
    val username: String = "",
    val name: String? = null,
    val avatarUrl: String? = null,
    val savedAt: String? = null,
    val isYou: Boolean = false,
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
    val moment: LiveMoment? = null,
    @Serializable(with = LenientPostsSerializer::class)
    val items: List<PhonePost> = emptyList(),
    val watchers: List<Saver>? = null,
    /** What people tuned in have sent lately, oldest first. Read loosely. */
    @Serializable(with = LiveReactionsSerializer::class)
    val reactions: List<LiveReaction> = emptyList(),
)

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
}

/** `POST /api/app/live/{slug}/react`: `{ emoji }` or `{ text }`, and the post. */
@Serializable
data class ReactRequest(
    val emoji: String? = null,
    val text: String? = null,
    val platform: String,
    val id: String,
)
