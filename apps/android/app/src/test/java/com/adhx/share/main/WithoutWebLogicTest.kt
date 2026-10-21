package com.adhx.share.main

import com.adhx.share.feed.ReactionsCopy
import com.adhx.share.net.Invite
import com.adhx.share.net.LastReaction
import com.adhx.share.net.PhonePost
import com.adhx.share.net.ReactionSummary
import com.adhx.share.net.Saver
import com.adhx.share.ui.Me
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class WithoutWebLogicTest {

    // Crop

    @Test
    fun atZoomOneTheCropIsTheMiddleSquare() {
        // A landscape 4000×3000 photo in a 300px square: the middle 3000×3000.
        val rect = CropMath.rect(CropState(), 4000, 3000, 300f)
        assertEquals(CropRect(500, 0, 3000), rect)
        val (x, y, zoom) = CropMath.serverCrop(CropState(), 4000, 3000, 300f)
        assertEquals(0.5, x, 1e-9)
        assertEquals(0.5, y, 1e-9)
        assertEquals(1.0, zoom, 1e-9)
    }

    @Test
    fun thePhotoAlwaysCoversTheSquare() {
        // Dragged far right: stops with the photo's left edge at the square's.
        val c = CropMath.clamp(CropState(1f, 10_000f, 50f), 4000, 3000, 300f)
        assertEquals(50f, c.offsetX, 0.01f) // (4000·0.1 − 300) / 2
        assertEquals(0f, c.offsetY, 0.01f)
        assertEquals(CropRect(0, 0, 3000), CropMath.rect(c, 4000, 3000, 300f))
        // Zoom stays in 1–4.
        assertEquals(4f, CropMath.clamp(CropState(9f), 100, 100, 100f).zoom)
        assertEquals(1f, CropMath.clamp(CropState(0.2f), 100, 100, 100f).zoom)
    }

    @Test
    fun pinchingZoomsAboutTheFingers() {
        // Pinch to 2× at the top-left quarter of a square photo: that quarter stays put.
        val s = CropMath.transform(CropState(), 0f, 0f, 2f, -75f, -75f, 1000, 1000, 300f)
        assertEquals(2f, s.zoom)
        assertEquals(75f, s.offsetX, 0.01f)
        assertEquals(75f, s.offsetY, 0.01f)
        // Half the photo across; the point under the fingers (250, 250) is still 75px up-left of the centre.
        assertEquals(CropRect(125, 125, 500), CropMath.rect(s, 1000, 1000, 300f))
    }

    @Test
    fun theServerCropMatchesTheScreen() {
        // The server's cropRect (src/lib/avatar/store.ts) on our x, y, zoom gives the same square.
        val states = listOf(CropState(), CropState(2.5f, -40f, 30f), CropState(4f, 200f, -200f), CropState(1.3f, 20f, 0f))
        for ((w, h) in listOf(4000 to 3000, 1080 to 1920, 640 to 640)) {
            for (state in states) {
                val ours = CropMath.rect(state, w, h, 320f)
                val (x, y, zoom) = CropMath.serverCrop(state, w, h, 320f)
                val size = max(1, floor(min(w, h) / zoom).toInt())
                val left = (x * w - size / 2.0).coerceIn(0.0, (w - size).toDouble()).roundToInt()
                val top = (y * h - size / 2.0).coerceIn(0.0, (h - size).toDouble()).roundToInt()
                assertTrue("size $w×$h $state", abs(size - ours.size) <= 1)
                assertTrue("left $w×$h $state", abs(left - ours.left) <= 1)
                assertTrue("top $w×$h $state", abs(top - ours.top) <= 1)
            }
        }
    }

    @Test
    fun theSentSquareIsNeverBlownUp() {
        assertEquals(1024, CropMath.outputSize(3000))
        assertEquals(400, CropMath.outputSize(400))
    }

    @Test
    fun pictureErrorsSaySo() {
        assertEquals(PictureCopy.NO_X, PictureCopy.error(409, "no_x_picture", "Connect X first to use your X picture."))
        assertEquals(PictureCopy.TOO_BIG, PictureCopy.error(413, "too_big", null))
        assertEquals("That’s a lot of new pictures. Try again in a bit.", PictureCopy.error(429, "busy", null))
        assertEquals(PictureCopy.OLD_SERVER, PictureCopy.error(404, null, null))
        assertEquals(PictureCopy.OLD_SERVER, PictureCopy.error(409, null, null))
        assertEquals(PictureCopy.FAILED, PictureCopy.error(500, "failed", ""))
        assertEquals(listOf("blue", "teal", "coral", "lime"), GobColours.all.map { it.id })
    }

    // Email sign-in

    @Test
    fun emailAndCodeAreReadKindly() {
        assertEquals("ana@example.com", EmailSignIn.cleanEmail("  ana@example.com "))
        assertNull(EmailSignIn.cleanEmail("ana@example"))
        assertNull(EmailSignIn.cleanEmail("ana example.com"))
        assertEquals("123456", EmailSignIn.cleanCode("123 456"))
        assertEquals("123456", EmailSignIn.cleanCode("123-4567"))
        assertTrue(EmailSignIn.codeReady("12-34-56"))
        assertTrue(!EmailSignIn.codeReady("12345"))
    }

    @Test
    fun aNewCodeWaitsAMinute() {
        assertEquals(60, EmailSignIn.resendIn(1_000, 1_000))
        assertEquals(1, EmailSignIn.resendIn(1_000, 60_500))
        assertEquals(0, EmailSignIn.resendIn(1_000, 61_000))
        assertEquals("New code in 42s", EmailSignIn.resendLabel(42))
        assertEquals("Send a new code", EmailSignIn.resendLabel(0))
    }

    @Test
    fun signInAnswersInPlainWords() {
        assertEquals(EmailSignIn.BAD_CODE, EmailSignIn.verifyError(400, "bad_code", "That code didn’t work.", "https://a.example"))
        assertEquals(EmailSignIn.EXPIRED, EmailSignIn.verifyError(410, "expired", null, "https://a.example"))
        assertEquals(EmailSignIn.BUSY, EmailSignIn.verifyError(429, "busy", null, "https://a.example"))
        assertEquals(EmailSignIn.OLD_SERVER, EmailSignIn.verifyError(404, null, null, "https://a.example"))
        assertEquals("Can’t reach a.example. Check the address and that your phone is online.",
            EmailSignIn.verifyError(0, null, null, "https://a.example", offline = true))
        assertEquals(EmailSignIn.OLD_SERVER, EmailSignIn.sendError(404, null, null, "https://a.example"))
        assertEquals(EmailSignIn.BUSY, EmailSignIn.sendError(429, "busy", null, "https://a.example"))
        assertEquals(EmailSignIn.SEND_FAILED, EmailSignIn.sendError(500, null, null, "https://a.example"))
    }

    // Your face

    @Test
    fun yourOwnPictureWinsWhereverYouAreDrawn() {
        val me = Me.of("pete", "/api/avatars/new.jpg", "upload")
        assertEquals("/api/avatars/new.jpg", me.pictureFor("pete", isYou = false, avatarUrl = null))
        assertEquals("/api/avatars/new.jpg", me.pictureFor("@Pete", isYou = false, avatarUrl = "/api/avatars/old.jpg"))
        assertEquals("/api/avatars/new.jpg", me.pictureFor("you", isYou = true, avatarUrl = null))
        // Others keep theirs.
        assertEquals("/b.jpg", me.pictureFor("ben", isYou = false, avatarUrl = "/b.jpg"))
        assertNull(me.pictureFor("ben", isYou = false, avatarUrl = null))
    }

    @Test
    fun aLetterOnlyWhenYouReallyHaveNoPicture() {
        // Removed: the server said "generated", so an old row's picture isn't shown.
        assertNull(Me.of("pete", null, "generated").pictureFor("pete", isYou = true, avatarUrl = "/old.jpg"))
        assertNull(Me.of("pete", "/stale.jpg", "generated").pictureFor("pete", isYou = true, avatarUrl = null))
        // An older server that doesn't say: keep what the row has.
        assertEquals("/row.jpg", Me.of("pete", null, null).pictureFor("pete", isYou = true, avatarUrl = "/row.jpg"))
    }

    // Invites and reactions

    @Test
    fun inviteLines() {
        val now = Instant.parse("2026-10-21T12:00:00Z")
        val invite = Invite("a", createdAt = "2026-10-21T09:00:00Z", expiresAt = "2026-10-28T12:00:00Z", uses = 0)
        assertEquals("Made 3 h ago · ends in 7 days", InviteCopy.line(invite, now))
        assertEquals("Made just now · ends in 5 h · used once",
            InviteCopy.line(Invite("b", createdAt = "2026-10-21T12:00:00Z", expiresAt = "2026-10-21T17:00:00Z", uses = 1), now))
        assertEquals("", InviteCopy.line(Invite("c"), now))
        assertEquals("Only the admin can make invites here.", InviteCopy.createError(403, null))
        assertEquals("Come and join my ADHX: https://a/invite/x", InviteCopy.shareText("https://a/invite/x"))
    }

    @Test
    fun theReactionsRowSaysHowManyAndWho() {
        assertEquals("12 posts with reactions", ReactionsCopy.count(12, more = false))
        assertEquals("30+ posts with reactions", ReactionsCopy.count(30, more = true))
        assertEquals("1 post with reactions", ReactionsCopy.count(1, more = false))
        val post = PhonePost(
            platform = "x",
            id = "1",
            text = "A dog on a skateboard\nmore",
            reactions = ReactionSummary(2, LastReaction(emoji = "😂", saver = Saver("ben", "Ben"))),
        )
        assertEquals("Ben reacted 😂: A dog on a skateboard", ReactionsCopy.describe(post))
        val words = post.copy(reactions = ReactionSummary(1, LastReaction(text = "so good", saver = Saver("pete", isYou = true))))
        assertEquals("You reacted “so good”: A dog on a skateboard", ReactionsCopy.describe(words))
    }
}
