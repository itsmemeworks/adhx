package com.adhx.share.net

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

// Decoders for the parts of the friends feed API that are still settling: they
// take whatever shape arrives and keep what they can read.

private fun JsonElement.text(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

private fun JsonObject.firstText(vararg keys: String): String? = keys.firstNotNullOfOrNull { this[it]?.text() }

/**
 * A line of text that may be missing or not text at all (a saver's `note`
 * on a server that doesn't have notes yet, or sends something else): a
 * non-empty string, else null. Never fails the post.
 */
object LooseTextSerializer : KSerializer<String?> {
    override val descriptor: SerialDescriptor = String.serializer().nullable.descriptor

    override fun serialize(encoder: Encoder, value: String?) = encoder.encodeString(value ?: "")

    override fun deserialize(decoder: Decoder): String? {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeString().trim().takeIf { it.isNotEmpty() }
        return when (element) {
            is JsonPrimitive -> element.text()
            is JsonObject -> element.firstText("text", "note")
            else -> null
        }
    }
}

/** `why`: "Saved together", or ["…", "…"], or [{ text }], or { reasons: […] }. */
object ReasonsSerializer : KSerializer<List<String>> {
    private val delegate = ListSerializer(String.serializer())
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: List<String>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): List<String> {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return delegate.deserialize(decoder)
        return reasons(element)
    }

    fun reasons(element: JsonElement): List<String> = when (element) {
        is JsonNull -> emptyList()
        is JsonPrimitive -> listOfNotNull(element.text())
        is JsonArray -> element.flatMap { reasons(it) }
        is JsonObject -> element.firstText("text", "label", "reason", "line")?.let { listOf(it) }
            ?: (element["reasons"] ?: element["lines"])?.let { reasons(it) }
            ?: emptyList()
    }.distinct()
}

/** `whyReasons`: like `why`, keeping each reason's `kind` and `username` when it's an object. */
object WhyReasonsSerializer : KSerializer<List<WhyReason>> {
    private val delegate = ListSerializer(WhyReason.serializer())
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: List<WhyReason>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): List<WhyReason> {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return delegate.deserialize(decoder)
        return reasons(element).distinctBy { it.text }
    }

    private fun reasons(element: JsonElement): List<WhyReason> = when (element) {
        is JsonNull -> emptyList()
        is JsonPrimitive -> listOfNotNull(element.text()?.let { WhyReason(it) })
        is JsonArray -> element.flatMap { reasons(it) }
        is JsonObject -> element.firstText("text", "label", "reason", "line")
            ?.let { listOf(WhyReason(it, element["kind"]?.text(), element["username"]?.text(), reasonPost(element["post"]))) }
            ?: (element["reasons"] ?: element["lines"])?.let { reasons(it) }
            ?: emptyList()
    }
}

/** A reason's `post` (`{ platform, id, posterUrl }`), or null when it's missing or can't be opened. */
private fun reasonPost(element: JsonElement?): ReasonPost? {
    val obj = element as? JsonObject ?: return null
    val platform = obj.firstText("platform") ?: return null
    val id = obj.firstText("id") ?: (obj["id"] as? JsonPrimitive)?.contentOrNull ?: return null
    return ReasonPost(platform, id, obj.firstText("posterUrl", "thumbnailUrl", "poster"))
}

/**
 * `covers`: absolute-path picture addresses, or posts (a cover is then their
 * poster, or their first photo). Anything else is skipped.
 */
object CoversSerializer : KSerializer<List<String>> {
    private val delegate = ListSerializer(String.serializer())
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: List<String>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): List<String> {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return delegate.deserialize(decoder)
        val list = element as? JsonArray ?: return emptyList()
        return list.mapNotNull(::cover)
    }

    private fun cover(element: JsonElement): String? = when (element) {
        is JsonPrimitive -> element.text()
        is JsonObject -> element.firstText("url", "posterUrl", "thumbnailUrl", "cover", "image")
            ?.takeUnless { isVideoFile(element, it) }
            ?: (element["post"] as? JsonObject)?.let(::cover)
            ?: (element["media"] as? JsonArray)?.firstNotNullOfOrNull { m ->
                (m as? JsonObject)?.let { it.firstText("posterUrl", "thumbnailUrl") ?: it.takeIf { o -> o["kind"]?.text() != "video" }?.firstText("url") }
            }
        else -> null
    }

    // A post object's own `url` is its video, not a picture.
    private fun isVideoFile(element: JsonObject, url: String): Boolean =
        element["url"]?.text() == url && element["kind"]?.text() == "video" && element["posterUrl"]?.text() == null
}

/**
 * Lists of [PhonePost], one item at a time: an item that doesn't read is
 * dropped instead of failing the whole page, and `{ post, … }` wrappers (the
 * web's moment items) are unwrapped.
 */
object LenientPostsSerializer : KSerializer<List<PhonePost>> {
    private val delegate = ListSerializer(PhonePost.serializer())
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: List<PhonePost>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): List<PhonePost> {
        val json = decoder as? JsonDecoder ?: return delegate.deserialize(decoder)
        val list = json.decodeJsonElement() as? JsonArray ?: return emptyList()
        return list.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val inner = (obj["post"] as? JsonObject)?.let { post ->
                // Keep the wrapper's `why` and `savers` when the post has none.
                JsonObject(post + obj.filterKeys { it != "post" && it !in post })
            } ?: obj
            try {
                json.json.decodeFromJsonElement(PhonePost.serializer(), inner).takeIf { it.platform.isNotBlank() && it.id.isNotBlank() }
            } catch (e: SerializationException) {
                null
            } catch (e: IllegalArgumentException) {
                null
            }
        }
    }
}

/**
 * `reactions` on a moment: each with an `emoji` or `text`, and who sent it,
 * either flat (`username`, `name`, `avatarUrl`, `isYou`) or under `by`,
 * `saver`, `user`, `from` or `who`. Ones with nothing to show are skipped.
 */
object LiveReactionsSerializer : KSerializer<List<LiveReaction>> {
    private val delegate = ListSerializer(LiveReaction.serializer())
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: List<LiveReaction>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): List<LiveReaction> {
        val json = decoder as? JsonDecoder ?: return delegate.deserialize(decoder)
        val list = json.decodeJsonElement() as? JsonArray ?: return emptyList()
        return list.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val emoji = obj.firstText("emoji")
            val text = obj.firstText("text", "message")?.take(Reaction.MAX_TEXT)
            if (emoji == null && text == null) return@mapNotNull null
            val person = listOf("by", "saver", "user", "from", "who").firstNotNullOfOrNull { obj[it] as? JsonObject } ?: obj
            val username = person.firstText("username", "handle")
            val who = username?.let {
                Saver(
                    username = it,
                    name = person.firstText("name", "displayName"),
                    avatarUrl = person.firstText("avatarUrl", "avatar"),
                    isYou = (person["isYou"] as? JsonPrimitive)?.contentOrNull == "true",
                )
            }
            val at = obj.firstText("at", "createdAt", "sentAt")
            val key = obj.firstText("id", "key")
                ?: (obj["id"] as? JsonPrimitive)?.contentOrNull
                ?: listOf(username, emoji, text, at).joinToString("|")
            LiveReaction(key = key, emoji = emoji, text = text, who = who, at = at)
        }
    }
}

/**
 * `hidden` on a feed page: `{ text: 4, article: 1 }`, or `[{ type, count }]`.
 * Unknown kinds and non-numbers are skipped.
 */
object HiddenSerializer : KSerializer<Map<String, Int>> {
    private val delegate = kotlinx.serialization.builtins.MapSerializer(String.serializer(), Int.serializer())
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: Map<String, Int>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): Map<String, Int> {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return delegate.deserialize(decoder)
        val pairs: List<Pair<String, Int?>> = when (element) {
            is JsonObject -> element.map { (k, v) -> k to (v as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.toInt() }
            is JsonArray -> element.mapNotNull { e ->
                val o = e as? JsonObject ?: return@mapNotNull null
                val type = o.firstText("type", "kind") ?: return@mapNotNull null
                type to (o["count"] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.toInt()
            }
            else -> emptyList()
        }
        return pairs.mapNotNull { (k, v) -> if (k in MediaType.all && v != null && v > 0) k to v else null }.toMap()
    }
}

/** A list of [T] read one item at a time: an item that doesn't read is dropped. */
abstract class LenientListSerializer<T>(private val element: KSerializer<T>) : KSerializer<List<T>> {
    private val delegate = ListSerializer(element)
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: List<T>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): List<T> {
        val json = decoder as? JsonDecoder ?: return delegate.deserialize(decoder)
        val list = json.decodeJsonElement() as? JsonArray ?: return emptyList()
        return list.mapNotNull { item ->
            if (item !is JsonObject) return@mapNotNull null
            try {
                json.json.decodeFromJsonElement(element, item).takeIf(::keep)
            } catch (e: SerializationException) {
                null
            } catch (e: IllegalArgumentException) {
                null
            }
        }
    }

    /** Whether a decoded item has enough to show. */
    protected open fun keep(item: T): Boolean = true
}

object LenientPeopleSerializer : LenientListSerializer<Person>(Person.serializer()) {
    override fun keep(item: Person) = item.username.isNotBlank()
}

object LenientJoinRequestsSerializer : LenientListSerializer<JoinRequest>(JoinRequest.serializer()) {
    override fun keep(item: JoinRequest) = item.id.isNotBlank()
}

object LenientDoingItemsSerializer : LenientListSerializer<DoingItem>(DoingItem.serializer()) {
    override fun keep(item: DoingItem) = item.platform.isNotBlank() && item.id.isNotBlank()
}

object LenientFormingSerializer : LenientListSerializer<FormingMoment>(FormingMoment.serializer()) {
    override fun keep(item: FormingMoment) = item.title.isNotBlank()
}

object LenientSaversSerializer : LenientListSerializer<Saver>(Saver.serializer()) {
    override fun keep(item: Saver) = item.username.isNotBlank()
}

object LenientSendPeopleSerializer : LenientListSerializer<SendPerson>(SendPerson.serializer()) {
    override fun keep(item: SendPerson) = item.username.isNotBlank()
}

object LenientAlertsSerializer : LenientListSerializer<LiveAlert>(LiveAlert.serializer()) {
    override fun keep(item: LiveAlert) = item.id.isNotBlank() && item.slug.isNotBlank()
}

/** A kept channel (`{ tag, url }`), or null when it's missing or has no tag. */
object KeptChannelSerializer : KSerializer<KeptChannel?> {
    override val descriptor: SerialDescriptor = KeptChannel.serializer().nullable.descriptor

    override fun serialize(encoder: Encoder, value: KeptChannel?) {
        if (value != null) KeptChannel.serializer().serialize(encoder, value) else encoder.encodeNull()
    }

    override fun deserialize(decoder: Decoder): KeptChannel? {
        val json = decoder as? JsonDecoder ?: return null
        val element = json.decodeJsonElement() as? JsonObject ?: return null
        val tag = element.firstText("tag", "slug") ?: return null
        return KeptChannel(tag, element.firstText("url"))
    }
}

/** A friend's note, or null when it's missing, empty or not an object with `text`. */
object FriendNoteSerializer : KSerializer<FriendNote?> {
    override val descriptor: SerialDescriptor = FriendNote.serializer().nullable.descriptor

    override fun serialize(encoder: Encoder, value: FriendNote?) {
        if (value != null) FriendNote.serializer().serialize(encoder, value) else encoder.encodeNull()
    }

    override fun deserialize(decoder: Decoder): FriendNote? {
        val json = decoder as? JsonDecoder ?: return null
        val element = json.decodeJsonElement() as? JsonObject ?: return null
        val text = element.firstText("text", "note") ?: return null
        return FriendNote(
            text = text,
            platform = element.firstText("platform").orEmpty(),
            id = element.firstText("id").orEmpty(),
            savedAt = element.firstText("savedAt"),
        )
    }
}

/** `weights`: `{ "ana": 1, "ben": -1 }`; anything but -1 or 1 is left out. */
object WeightsSerializer : KSerializer<Map<String, Int>> {
    private val delegate = kotlinx.serialization.builtins.MapSerializer(String.serializer(), Int.serializer())
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: Map<String, Int>) = delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): Map<String, Int> {
        val json = decoder as? JsonDecoder ?: return delegate.deserialize(decoder)
        val element = json.decodeJsonElement() as? JsonObject ?: return emptyMap()
        return element.mapNotNull { (name, value) ->
            val w = (value as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.toInt()
            if (w == 1 || w == -1) name to w else null
        }.toMap()
    }
}
