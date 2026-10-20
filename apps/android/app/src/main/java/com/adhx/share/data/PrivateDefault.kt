package com.adhx.share.data

/** Preference ownership survives a kill between durable pairing and best-effort old-state cleanup. */
internal data class PrivateDefault(
    val value: Boolean?,
    val server: String? = null,
    val username: String? = null,
) {
    fun forAccount(connection: Connection?, allowLegacy: Boolean): Boolean? {
        if (connection == null) return null
        if (server == null && username == null) return value.takeIf { allowLegacy }
        return value.takeIf { server == connection.server && username == connection.username }
    }

    companion object {
        fun capture(value: Boolean?, connection: Connection?): PrivateDefault =
            if (value == null || connection == null) PrivateDefault(null)
            else PrivateDefault(value, connection.server, connection.username)
    }
}
