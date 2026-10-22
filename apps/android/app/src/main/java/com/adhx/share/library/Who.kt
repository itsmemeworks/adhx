package com.adhx.share.library

import com.adhx.share.net.Saver
import com.adhx.share.net.WhoResponse
import com.adhx.share.ui.Copy
import java.time.Instant

/**
 * One face in the "who's on it" row (board 15.9): saved it (a bookmark
 * sticker, bottom-right), watched it (an eye, bottom-left) and their newest
 * emoji (top-right). [said] is their newest words, for a screen reader only:
 * words float up over the post.
 */
data class WhoFace(
    val saver: Saver,
    val saved: Boolean,
    val watched: Boolean,
    val emoji: String? = null,
    val said: String? = null,
)

/** Who's on a post: the bottom row's first face, and the row it opens. */
object Who {
    /** The face in the bottom row: the earliest save, else the newest (the server sends newest first). */
    fun firstSaver(savers: List<Saver>): Saver? =
        savers.withIndex().minWithOrNull(compareBy({ millis(it.value.savedAt) ?: Long.MAX_VALUE }, { it.index }))?.value
            ?.takeIf { millis(it.savedAt) != null } ?: savers.firstOrNull()

    /** "+2" on the face when others saved it too. */
    fun badge(savers: List<Saver>): String? = (savers.size - 1).takeIf { it > 0 }?.let { "+$it" }

    /** "Who's on this one: Ana and 1 more". */
    fun buttonLabel(savers: List<Saver>): String {
        val first = firstSaver(savers) ?: return "Who’s on this one"
        val others = savers.size - 1
        return "Who’s on this one: ${name(first)}" + if (others > 0) " and $others more" else ""
    }

    /** Savers, first saver first then in the order they saved; untimed ones after, as the server sent them. */
    fun saversInOrder(savers: List<Saver>): List<Saver> {
        val first = firstSaver(savers) ?: return emptyList()
        val rest = savers.filter { it !== first }
            .withIndex()
            .sortedWith(compareBy({ millis(it.value.savedAt) ?: Long.MAX_VALUE }, { it.index }))
            .map { it.value }
        return listOf(first) + rest
    }

    /**
     * One face per person: savers first, then watchers (newest first), then
     * anyone who only reacted. Each carries their newest emoji and words.
     */
    fun faces(who: WhoResponse): List<WhoFace> {
        val emoji = HashMap<String, String>()
        val said = HashMap<String, String>()
        // Oldest first, so the last one wins.
        who.reactions.forEach { r ->
            val person = r.who?.username?.let(::id) ?: return@forEach
            r.emoji?.takeIf { it.isNotBlank() }?.let { emoji[person] = it }
            r.text?.takeIf { it.isNotBlank() }?.let { said[person] = it }
        }
        val out = LinkedHashMap<String, WhoFace>()
        saversInOrder(who.savers).forEach { s ->
            val key = id(s.username)
            if (key !in out) out[key] = WhoFace(s, saved = true, watched = false, emoji = emoji[key], said = said[key])
        }
        who.watched.forEach { w ->
            val key = id(w.username)
            if (key.isNotEmpty()) {
                out[key] = out[key]?.copy(watched = true)
                    ?: WhoFace(w.asSaver(), saved = false, watched = true, emoji = emoji[key], said = said[key])
            }
        }
        who.reactions.forEach { r ->
            val s = r.who ?: return@forEach
            val key = id(s.username)
            if (key.isNotEmpty() && key !in out) out[key] = WhoFace(s, saved = false, watched = false, emoji = emoji[key], said = said[key])
        }
        return out.values.toList()
    }

    /** Before `/api/app/who` answers (or when it can't): the savers on the post. */
    fun faces(savers: List<Saver>): List<WhoFace> = saversInOrder(savers).map { WhoFace(it, saved = true, watched = false) }

    /** "Ben saved it and reacted 😂", "Ana saved it first", "Mum watched it", "You watched it". */
    fun label(face: WhoFace, firstOfSeveral: Boolean = false): String {
        val parts = buildList {
            if (face.saved) add(if (firstOfSeveral) "saved it first" else "saved it")
            if (face.watched) add("watched it")
            face.emoji?.let { add("reacted $it") }
            face.said?.let { add("said “$it”") }
        }
        val who = name(face.saver)
        return when (parts.size) {
            0 -> who
            1 -> "$who ${parts[0]}"
            else -> "$who ${parts.dropLast(1).joinToString(", ")} and ${parts.last()}"
        }
    }

    private fun name(saver: Saver) = if (saver.isYou) Copy.YOU else saver.label

    private fun id(username: String) = username.trim().removePrefix("@").lowercase()

    private fun millis(iso: String?): Long? = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
}
