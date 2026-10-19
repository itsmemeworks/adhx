package com.adhx.share.net

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
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
