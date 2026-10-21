package com.adhx.share.main

import com.adhx.share.links.Links

/** Where "Sign in with email" is: typing the address and email, or the emailed code. */
enum class SignInStep { Email, Code }

/** Connect → Sign in with email. [sentAt] is when the last code went (for "Send a new code"). */
data class EmailSignInUi(
    val step: SignInStep = SignInStep.Email,
    val server: String? = null,
    val email: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val sentAt: Long = 0L,
)

/** The pure parts of signing in with email: what's typed, when to resend, and the words for each answer. */
object EmailSignIn {
    const val CODE_LENGTH = 6
    const val RESEND_MS = 60_000L

    const val TITLE = "Sign in with email"
    const val INTRO = "Type your ADHX’s address and the email you sign in with. We’ll email you a 6-digit code."
    const val CHECK = "Check your email for a 6-digit code"
    const val SEND = "Email me a code"
    const val SIGN_IN = "Sign in"
    const val RESEND = "Send a new code"
    const val OTHER_EMAIL = "Use another email"
    const val SENDING = "Sending…"
    const val SIGNING_IN = "Signing in…"

    const val BAD_EMAIL = "That email doesn’t look right."
    const val BAD_ADDRESS = "That address doesn’t look right."
    const val BAD_CODE = "That code didn’t work. Check the email and try again."
    const val EXPIRED = "That code has run out. Send a new one."
    const val BUSY = "That’s a lot of tries. Wait a minute, then try again."
    const val OLD_SERVER = "This ADHX can’t send sign-in codes yet. Use the code in Settings → Phone app on it instead."
    const val SEND_FAILED = "Couldn’t send a code just now. Try again."
    const val VERIFY_FAILED = "Couldn’t sign in just now. Try again."

    private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    /** The email as it'll be sent (trimmed), or null when it isn't one. */
    fun cleanEmail(input: String): String? = input.trim().takeIf { it.length <= 254 && EMAIL.matches(it) }

    /** Only the digits, at most six (a pasted "123 456" or "123-456" reads). */
    fun cleanCode(input: String): String = input.filter { it in '0'..'9' }.take(CODE_LENGTH)

    fun codeReady(input: String): Boolean = cleanCode(input).length == CODE_LENGTH

    /** Seconds until a new code may be sent (0: now). */
    fun resendIn(sentAt: Long, now: Long): Int {
        val left = sentAt + RESEND_MS - now
        return if (left <= 0) 0 else ((left + 999) / 1000).toInt()
    }

    /** "Send a new code", or "New code in 42s" while it has to wait. */
    fun resendLabel(wait: Int): String = if (wait > 0) "New code in ${wait}s" else RESEND

    /** "We sent it to ana@example.com." */
    fun sentTo(email: String): String = "We sent it to $email. It works for 15 minutes."

    /** What to say when asking for a code failed ([status] 0 with [offline]: no answer). */
    fun sendError(status: Int, code: String?, message: String?, server: String?, offline: Boolean = false): String = when {
        offline -> unreachable(server)
        status == 404 || status == 405 -> OLD_SERVER
        status == 429 || code == "busy" -> BUSY
        else -> message?.takeIf { it.isNotBlank() } ?: SEND_FAILED
    }

    /** What to say when the code didn't sign in. */
    fun verifyError(status: Int, code: String?, message: String?, server: String?, offline: Boolean = false): String = when {
        offline -> unreachable(server)
        code == "bad_code" -> BAD_CODE
        code == "expired" || status == 410 -> EXPIRED
        code == "busy" || status == 429 -> BUSY
        status == 404 || status == 405 -> OLD_SERVER
        status == 400 -> BAD_CODE
        else -> message?.takeIf { it.isNotBlank() } ?: VERIFY_FAILED
    }

    private fun unreachable(server: String?): String =
        if (server == null) "Can’t reach your ADHX. Check the address and that your phone is online."
        else "Can’t reach ${Links.host(server)}. Check the address and that your phone is online."
}
