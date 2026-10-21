package com.adhx.share.main

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Changing your picture: busy while it's being sent, else what went wrong. */
data class PictureUi(val busy: Boolean = false, val error: String? = null)

/** The Gob faces' four colours (`colour` on `POST /api/app/me/avatar`), as the server draws them. */
object GobColours {
    data class Colour(val id: String, val label: String, val argb: Long)

    val all = listOf(
        Colour("blue", "Blue", 0xFF6B8CFF),
        Colour("teal", "Teal", 0xFF5FD0C8),
        Colour("coral", "Coral", 0xFFFF7A59),
        Colour("lime", "Lime", 0xFFB6E35A),
    )
}

/** The words of Change picture. */
object PictureCopy {
    const val TITLE = "Your picture"
    const val NOTE = "Your people see it on everything you save and react to."
    const val CHOOSE = "Choose a photo"
    const val CHOOSE_NOTE = "From your phone’s photos"
    const val SELFIE = "Take a selfie"
    const val SELFIE_NOTE = "With the camera, then crop it"
    const val GOB = "Use a Gob face"
    const val GOB_NOTE = "Pick a colour"
    const val X = "Use my X photo"
    const val X_NOTE = "The picture on your X account"
    const val REMOVE = "Remove picture"
    const val REMOVE_NOTE = "Back to your initial"
    const val CROP_TITLE = "Move and scale"
    const val CROP_NOTE = "Pinch to zoom, drag to move."
    const val USE = "Use photo"
    const val CANCEL = "Cancel"
    const val SAVING = "Saving your picture…"

    const val NO_X = "There’s no X photo to use yet. Connect X to your ADHX first."
    const val TOO_BIG = "That photo is too big. Try another one."
    const val BAD_TYPE = "That kind of photo can’t be used. Try another one."
    const val BUSY = "That’s a lot of new pictures. Try again in a bit."
    const val OLD_SERVER = "This ADHX can’t change pictures from the phone yet."
    const val FAILED = "Couldn’t change your picture. Try again."
    const val OFFLINE = "Can’t reach your ADHX right now."
    const val UNREADABLE = "Couldn’t open that photo. Try another one."
    const val CAMERA_DENIED = "ADHX Share needs the camera for a selfie. You can choose a photo instead."
    const val NO_CAMERA = "There’s no camera app to take a selfie with."

    fun error(status: Int, code: String?, message: String?): String = when {
        code == "no_x_picture" -> NO_X
        code == "too_big" || status == 413 -> TOO_BIG
        code == "bad_type" || code == "unreadable" || status == 415 -> BAD_TYPE
        code == "busy" || status == 429 -> message?.takeIf { it.isNotBlank() } ?: BUSY
        // An older server has no such route (Next answers a multipart POST to it with a bare 409).
        status == 404 || status == 405 || (status == 409 && code == null) -> OLD_SERVER
        else -> message?.takeIf { it.isNotBlank() } ?: FAILED
    }
}

/**
 * Where the photo sits in the square crop: how far it's zoomed in (1 = its
 * short side fills the square) and how far its centre has moved from the
 * square's centre, in screen pixels.
 */
data class CropState(val zoom: Float = 1f, val offsetX: Float = 0f, val offsetY: Float = 0f)

/** A square in the photo's pixels. */
data class CropRect(val left: Int, val top: Int, val size: Int)

/**
 * The crop's arithmetic, apart from the screen: a [width]×[height] photo
 * shown in a square [viewport] pixels across. The photo always covers the
 * square, so the crop is always inside the photo.
 */
object CropMath {
    const val MAX_ZOOM = 4f

    /** Screen pixels per photo pixel at zoom 1: the short side fills the square. */
    fun baseScale(width: Int, height: Int, viewport: Float): Float = viewport / min(width, height).coerceAtLeast(1)

    /** Zoom kept in 1–4, and the photo moved back so it covers the square. */
    fun clamp(state: CropState, width: Int, height: Int, viewport: Float): CropState {
        val zoom = state.zoom.coerceIn(1f, MAX_ZOOM)
        val scale = baseScale(width, height, viewport) * zoom
        val maxX = max(0f, (width * scale - viewport) / 2f)
        val maxY = max(0f, (height * scale - viewport) / 2f)
        return CropState(zoom, state.offsetX.coerceIn(-maxX, maxX), state.offsetY.coerceIn(-maxY, maxY))
    }

    /**
     * A pinch and drag: zoom by [zoomBy] about [centroidX], [centroidY]
     * (measured from the square's centre), then move by [panX], [panY].
     */
    fun transform(
        state: CropState,
        panX: Float,
        panY: Float,
        zoomBy: Float,
        centroidX: Float,
        centroidY: Float,
        width: Int,
        height: Int,
        viewport: Float,
    ): CropState {
        val zoom = (state.zoom * zoomBy).coerceIn(1f, MAX_ZOOM)
        val ratio = zoom / state.zoom
        val x = (state.offsetX - centroidX) * ratio + centroidX + panX
        val y = (state.offsetY - centroidY) * ratio + centroidY + panY
        return clamp(CropState(zoom, x, y), width, height, viewport)
    }

    /** The square of the photo inside the crop, in its pixels. */
    fun rect(state: CropState, width: Int, height: Int, viewport: Float): CropRect {
        val clamped = clamp(state, width, height, viewport)
        val scale = baseScale(width, height, viewport) * clamped.zoom
        val size = max(1, (min(width, height) / clamped.zoom).toInt())
        val cx = width / 2f - clamped.offsetX / scale
        val cy = height / 2f - clamped.offsetY / scale
        val left = (cx - size / 2f).roundToInt().coerceIn(0, max(0, width - size))
        val top = (cy - size / 2f).roundToInt().coerceIn(0, max(0, height - size))
        return CropRect(left, top, size)
    }

    /** The same crop as the server's `x`, `y` (the square's centre, 0–1) and `zoom`. */
    fun serverCrop(state: CropState, width: Int, height: Int, viewport: Float): Triple<Double, Double, Double> {
        val r = rect(state, width, height, viewport)
        val x = (r.left + r.size / 2.0) / width
        val y = (r.top + r.size / 2.0) / height
        return Triple(x.coerceIn(0.0, 1.0), y.coerceIn(0.0, 1.0), (min(width, height).toDouble() / r.size).coerceIn(1.0, MAX_ZOOM.toDouble()))
    }

    /** How big the sent square is: at most [max] pixels across, never blown up. */
    fun outputSize(cropSize: Int, max: Int = OUTPUT_MAX): Int = min(cropSize, max).coerceAtLeast(1)

    const val OUTPUT_MAX = 1024
}
