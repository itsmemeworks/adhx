package com.adhx.share.links

import androidx.annotation.DrawableRes
import com.adhx.share.R
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Reading links out of shared text, and telling which network they're from. */
object Links {

    private val LINK = Regex("""https?://[^\s<>"'`{}|\\^\[\]]+""", RegexOption.IGNORE_CASE)
    private const val TRAILING = ".,;:!?)]}>'\"…»”’"

    /** The first http(s) link in [text], without trailing punctuation. */
    fun firstLink(text: String?): String? {
        if (text.isNullOrBlank()) return null
        val match = LINK.find(text) ?: return null
        var link = match.value
        while (link.isNotEmpty() && link.last() in TRAILING) {
            // Keep a closing bracket that closes one inside the link (Wikipedia-style).
            if (link.last() == ')' && link.count { it == '(' } >= link.count { it == ')' }) break
            link = link.dropLast(1)
        }
        return link.takeIf { it.toHttpUrlOrNull() != null }
    }

    /** The link without "https://" and "www.", for showing under the post. */
    fun display(link: String): String =
        link.replaceFirst(Regex("^https?://", RegexOption.IGNORE_CASE), "")
            .removePrefix("www.")
            .trimEnd('/')

    fun host(server: String): String =
        server.toHttpUrlOrNull()?.let { url ->
            val defaultPort = if (url.isHttps) 443 else 80
            if (url.port != defaultPort) "${url.host}:${url.port}" else url.host
        } ?: display(server)

    /**
     * Guess the network from the link's host, to show its mark before the
     * server answers. Returns a platform id, or null when it isn't one we know.
     */
    fun guessPlatform(link: String): String? {
        val host = link.toHttpUrlOrNull()?.host?.lowercase()?.removePrefix("www.") ?: return null
        fun isOf(vararg domains: String) = domains.any { host == it || host.endsWith(".$it") }
        return when {
            isOf("x.com", "twitter.com") -> "twitter"
            isOf("instagram.com", "instagr.am") -> "instagram"
            isOf("tiktok.com") -> "tiktok" // incl. vm.tiktok.com and vt.tiktok.com
            isOf("youtube.com", "youtu.be", "youtube-nocookie.com") -> "youtube"
            isOf("facebook.com", "fb.watch", "fb.com") -> "facebook"
            isOf("reddit.com", "redd.it") -> "reddit"
            isOf("linkedin.com", "lnkd.in") -> "linkedin"
            isOf("vimeo.com") -> "vimeo"
            isOf("soundcloud.com") -> "soundcloud" // incl. on.soundcloud.com
            isOf("pin.it") || host.startsWith("pinterest.") || host.contains(".pinterest.") -> "pinterest"
            isOf("twitch.tv") -> "twitch"
            isOf("threads.net", "threads.com") -> "threads"
            isOf("imgur.com") -> "imgur"
            isOf("bsky.app") -> "bluesky"
            else -> null
        }
    }

    /**
     * Tidy a typed server address into an origin: adds a scheme when there's
     * none (http:// for addresses on your own network, like 192.168.1.20,
     * localhost or name.local, which rarely have a certificate; https://
     * otherwise) and drops any trailing slash. Null when it can't be a URL.
     */
    fun normalizeServer(input: String): String? {
        var text = input.trim()
        if (text.isEmpty()) return null
        if (!text.contains("://")) {
            val host = text.substringBefore('/').substringBefore(':').lowercase()
            val local = host == "localhost" || host.endsWith(".local") ||
                (host.isNotEmpty() && host.all { it.isDigit() || it == '.' })
            text = (if (local) "http://" else "https://") + text
        }
        val url = text.toHttpUrlOrNull() ?: return null
        val path = url.encodedPath.trimEnd('/')
        val defaultPort = if (url.isHttps) 443 else 80
        val port = if (url.port != defaultPort) ":${url.port}" else ""
        return "${url.scheme}://${url.host}$port$path"
    }
}

/** Display names and marks for the networks ADHX keeps posts from. */
object Networks {

    private val names = mapOf(
        "twitter" to "X",
        "instagram" to "Instagram",
        "tiktok" to "TikTok",
        "youtube" to "YouTube",
        "facebook" to "Facebook",
        "reddit" to "Reddit",
        "linkedin" to "LinkedIn",
        "vimeo" to "Vimeo",
        "soundcloud" to "SoundCloud",
        "pinterest" to "Pinterest",
        "twitch" to "Twitch",
        "threads" to "Threads",
        "imgur" to "Imgur",
        "bluesky" to "Bluesky",
    )

    fun name(platform: String?): String? = platform?.let { names[it] }

    @DrawableRes
    fun icon(platform: String?): Int = when (platform) {
        "twitter" -> R.drawable.ic_net_twitter
        "instagram" -> R.drawable.ic_net_instagram
        "tiktok" -> R.drawable.ic_net_tiktok
        "youtube" -> R.drawable.ic_net_youtube
        "facebook" -> R.drawable.ic_net_facebook
        "reddit" -> R.drawable.ic_net_reddit
        "linkedin" -> R.drawable.ic_net_linkedin
        "vimeo" -> R.drawable.ic_net_vimeo
        "soundcloud" -> R.drawable.ic_net_soundcloud
        "pinterest" -> R.drawable.ic_net_pinterest
        "twitch" -> R.drawable.ic_net_twitch
        "threads" -> R.drawable.ic_net_threads
        "imgur" -> R.drawable.ic_net_imgur
        "bluesky" -> R.drawable.ic_net_bluesky
        else -> R.drawable.ic_net_link
    }
}
