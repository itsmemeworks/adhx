package com.adhx.share.main

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.data.Connection
import com.adhx.share.feed.SheetHandle
import com.adhx.share.net.AvatarSource
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.GobShape
import com.adhx.share.ui.KeepUpright
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.faceColor
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.roundToInt

/** TakePicture, asking the camera app for the front camera (apps that don't know these extras ignore them). */
private class TakeSelfie : ActivityResultContracts.TakePicture() {
    override fun createIntent(context: Context, input: Uri): Intent = super.createIntent(context, input).apply {
        putExtra("android.intent.extras.CAMERA_FACING", 1)
        putExtra("android.intent.extras.LENS_FACING_FRONT", 1)
        putExtra("android.intent.extra.USE_FRONT_CAMERA", true)
    }
}

/**
 * Change picture: a sheet with Choose a photo, Take a selfie, a Gob face,
 * your X photo and Remove; a photo goes through the square crop first. Every
 * change updates your picture on this phone at once ([MainViewModel]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PictureFlow(vm: MainViewModel, connection: Connection, onChanged: () -> Unit, onClose: () -> Unit) {
    KeepUpright()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val ui by vm.picture.collectAsStateWithLifecycle()
    val source by vm.avatarSource.collectAsStateWithLifecycle()
    var cropping by remember { mutableStateOf<Bitmap?>(null) }
    var local by rememberSaveable { mutableStateOf<String?>(null) }
    var gobOpen by rememberSaveable { mutableStateOf(false) }
    val done: () -> Unit = {
        onChanged()
        onClose()
    }

    val selfieFile = remember { File(File(context.cacheDir, "camera"), "selfie.jpg") }
    val open: (Uri, Boolean) -> Unit = { uri, temporary ->
        scope.launch {
            val bitmap = PictureImage.load(context, uri)
            if (temporary) selfieFile.delete()
            if (bitmap == null) local = PictureCopy.UNREADABLE else {
                local = null
                vm.clearPictureError()
                cropping = bitmap
            }
        }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) open(uri, false)
    }
    val selfie = rememberLauncherForActivityResult(TakeSelfie()) { taken ->
        if (taken) open(Uri.fromFile(selfieFile), true) else selfieFile.delete()
    }
    val startSelfie: () -> Unit = {
        try {
            selfieFile.parentFile?.mkdirs()
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", selfieFile)
            selfie.launch(uri)
        } catch (e: ActivityNotFoundException) {
            local = PictureCopy.NO_CAMERA
        } catch (e: IllegalArgumentException) {
            local = PictureCopy.NO_CAMERA
        }
    }
    // The app declares CAMERA (for the pairing QR), so the camera app can only be asked once it's granted.
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startSelfie() else local = PictureCopy.CAMERA_DENIED
    }

    val bitmap = cropping
    if (bitmap != null) {
        CropDialog(
            bitmap = bitmap,
            busy = ui.busy,
            error = ui.error ?: local,
            onCancel = {
                if (!ui.busy) {
                    cropping = null
                    local = null
                    vm.clearPictureError()
                }
            },
            onUse = { rect ->
                scope.launch {
                    val jpeg = PictureImage.squareJpeg(bitmap, rect)
                    if (jpeg == null) local = PictureCopy.UNREADABLE
                    else vm.uploadPicture(jpeg) {
                        cropping = null
                        done()
                    }
                }
            },
        )
        return
    }

    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = { if (!ui.busy) onClose() },
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { SheetHandle(AdhxColors.Hairline) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val username = connection.username?.trim()?.trimStart('@').orEmpty()
                Avatar(username, username, connection.avatarUrl, connection.server, 56.dp, ring = faceColor(username), isYou = true)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        PictureCopy.TITLE,
                        fontFamily = SerifFamily,
                        fontSize = 30.sp,
                        lineHeight = 30.sp,
                        color = AdhxColors.White,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(PictureCopy.NOTE, fontSize = 13.sp, lineHeight = 17.sp, color = AdhxColors.Faint)
                }
                if (ui.busy) Spinner(size = 22.dp, stroke = 2.5.dp)
            }
            Column(
                Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(AdhxColors.Card),
            ) {
                ChoiceRow(Glyphs.Photo, PictureCopy.CHOOSE, PictureCopy.CHOOSE_NOTE, enabled = !ui.busy) {
                    local = null
                    pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
                RowDivider()
                ChoiceRow(Glyphs.Camera, PictureCopy.SELFIE, PictureCopy.SELFIE_NOTE, enabled = !ui.busy) {
                    local = null
                    val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                    if (granted) startSelfie() else cameraPermission.launch(Manifest.permission.CAMERA)
                }
                RowDivider()
                ChoiceRow(null, PictureCopy.GOB, PictureCopy.GOB_NOTE, enabled = !ui.busy, gob = true) { gobOpen = !gobOpen }
                if (gobOpen) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(start = 16.dp, end = 16.dp, bottom = 14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        GobColours.all.forEach { colour ->
                            GobSwatch(colour, enabled = !ui.busy) {
                                local = null
                                vm.useGob(colour.id, done)
                            }
                        }
                    }
                }
                RowDivider()
                ChoiceRow(null, PictureCopy.X, PictureCopy.X_NOTE, enabled = !ui.busy, x = true) {
                    local = null
                    vm.useXPhoto(done)
                }
                val hasPicture = source?.let { it != AvatarSource.GENERATED } ?: !connection.avatarUrl.isNullOrBlank()
                if (hasPicture) {
                    RowDivider()
                    ChoiceRow(Glyphs.Trash, PictureCopy.REMOVE, PictureCopy.REMOVE_NOTE, enabled = !ui.busy, danger = true) {
                        local = null
                        vm.removePicture(done)
                    }
                }
            }
            (ui.error ?: local)?.let {
                Text(it, fontSize = 14.sp, lineHeight = 19.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Warn)
            }
        }
    }
}

@Composable
private fun RowDivider() = HorizontalDivider(thickness = 1.dp, color = Color.White.copy(alpha = 0.06f))

@Composable
private fun ChoiceRow(
    icon: ImageVector?,
    title: String,
    note: String,
    enabled: Boolean,
    gob: Boolean = false,
    x: Boolean = false,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) {
            when {
                gob -> Box(Modifier.size(20.dp).clip(GobShape).background(AdhxColors.Accent))
                x -> Icon(
                    androidx.compose.ui.res.painterResource(com.adhx.share.R.drawable.ic_net_twitter),
                    contentDescription = null,
                    tint = AdhxColors.Cream,
                    modifier = Modifier.size(18.dp),
                )
                icon != null -> Icon(icon, contentDescription = null, tint = if (danger) AdhxColors.Warn else AdhxColors.Accent, modifier = Modifier.size(22.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = if (danger) AdhxColors.Warn else AdhxColors.White)
            Text(note, fontSize = 13.sp, color = AdhxColors.Faint)
        }
    }
}

/** One Gob colour: a Gob-shaped swatch and its name. */
@Composable
private fun GobSwatch(colour: GobColours.Colour, enabled: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .clip(RoundedCornerShape(14.dp))
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = "Use a ${colour.label.lowercase()} Gob", onClick = onClick)
            .padding(6.dp)
            .semantics(mergeDescendants = true) { contentDescription = "${colour.label} Gob" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(56.dp)
                .clip(GobShape)
                .background(Color(colour.argb)),
        )
        Text(colour.label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Muted)
    }
}

/**
 * The square crop: drag to move, pinch to zoom (1–4×), with the round face
 * it makes shown through a dimmed frame. Use sends the square.
 */
@Composable
private fun CropDialog(
    bitmap: Bitmap,
    busy: Boolean,
    error: String?,
    onCancel: () -> Unit,
    onUse: (CropRect) -> Unit,
) {
    val image = remember(bitmap) { bitmap.asImageBitmap() }
    var crop by remember(bitmap) { mutableStateOf(CropState()) }
    var viewport by remember { mutableStateOf(0f) }
    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .background(AdhxColors.Black)
                .systemBarsPadding()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    PictureCopy.CROP_TITLE,
                    fontFamily = SerifFamily,
                    fontSize = 32.sp,
                    color = AdhxColors.White,
                    modifier = Modifier.semantics { heading() },
                )
                Text(PictureCopy.CROP_NOTE, fontSize = 14.sp, color = AdhxColors.Faint)
            }
            Spacer(Modifier.weight(1f))
            BoxWithConstraints(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clipToBounds()
                    .background(AdhxColors.Surface),
            ) {
                val side = with(LocalDensity.current) { maxWidth.toPx() }
                viewport = side
                val w = bitmap.width
                val h = bitmap.height
                Canvas(
                    Modifier
                        .fillMaxSize()
                        .semantics { contentDescription = PictureCopy.CROP_NOTE }
                        .pointerInput(bitmap, side, busy) {
                            if (busy) return@pointerInput
                            detectTransformGestures { centroid, pan, zoom, _ ->
                                crop = CropMath.transform(
                                    crop,
                                    panX = pan.x,
                                    panY = pan.y,
                                    zoomBy = zoom,
                                    centroidX = centroid.x - side / 2f,
                                    centroidY = centroid.y - side / 2f,
                                    width = w,
                                    height = h,
                                    viewport = side,
                                )
                            }
                        },
                ) {
                    val c = CropMath.clamp(crop, w, h, side)
                    val scale = CropMath.baseScale(w, h, side) * c.zoom
                    val drawW = w * scale
                    val drawH = h * scale
                    drawImage(
                        image,
                        srcOffset = IntOffset.Zero,
                        srcSize = IntSize(w, h),
                        dstOffset = IntOffset((side / 2f + c.offsetX - drawW / 2f).roundToInt(), (side / 2f + c.offsetY - drawH / 2f).roundToInt()),
                        dstSize = IntSize(drawW.roundToInt(), drawH.roundToInt()),
                        filterQuality = FilterQuality.Medium,
                    )
                    // Dim everything outside the round face.
                    val face = Path().apply { addOval(Rect(0f, 0f, size.width, size.height)) }
                    clipPath(face, ClipOp.Difference) {
                        drawRect(Color.Black.copy(alpha = 0.6f))
                    }
                    drawCircle(Color.White.copy(alpha = 0.7f), radius = size.minDimension / 2f - 1.dp.toPx(), center = Offset(size.width / 2f, size.height / 2f), style = Stroke(1.5.dp.toPx()))
                }
            }
            Spacer(Modifier.weight(1f))
            if (busy) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Spinner()
                    Spacer(Modifier.width(10.dp))
                    Text(PictureCopy.SAVING, fontSize = 14.sp, color = AdhxColors.Muted)
                }
            }
            error?.let {
                Text(it, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Warn, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlineButton(PictureCopy.CANCEL, onClick = onCancel, enabled = !busy, modifier = Modifier.weight(1f))
                PrimaryButton(
                    PictureCopy.USE,
                    onClick = { if (viewport > 0f) onUse(CropMath.rect(crop, bitmap.width, bitmap.height, viewport)) },
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
