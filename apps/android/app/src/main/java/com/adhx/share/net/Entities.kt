package com.adhx.share.net

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * HTML entities in post words ("Tom &amp; Jerry"). Servers since #588 decode
 * them; older ones send them as X does, so the app decodes them too.
 */
object Entities {
    private val ENTITY = Regex("&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|amp|lt|gt|quot|apos|nbsp);")

    fun decode(text: String): String {
        if ('&' !in text) return text
        return ENTITY.replace(text) { match ->
            when (val name = match.groupValues[1]) {
                "amp" -> "&"
                "lt" -> "<"
                "gt" -> ">"
                "quot" -> "\""
                "apos" -> "'"
                "nbsp" -> " "
                else -> {
                    val code = if (name.startsWith("#x") || name.startsWith("#X")) name.drop(2).toIntOrNull(16) else name.drop(1).toIntOrNull()
                    code?.takeIf { Character.isValidCodePoint(it) && it != 0 }?.let { String(Character.toChars(it)) } ?: match.value
                }
            }
        }
    }
}

/** A post's words, with HTML entities decoded (see [Entities]). */
object EntityTextSerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor = String.serializer().descriptor
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
    override fun deserialize(decoder: Decoder): String = Entities.decode(decoder.decodeString())
}

/** [EntityTextSerializer] for words that may be missing. */
object NullableEntityTextSerializer : KSerializer<String?> {
    private val delegate = String.serializer().nullable
    override val descriptor: SerialDescriptor = delegate.descriptor
    override fun serialize(encoder: Encoder, value: String?) = delegate.serialize(encoder, value)
    override fun deserialize(decoder: Decoder): String? = delegate.deserialize(decoder)?.let(Entities::decode)
}
