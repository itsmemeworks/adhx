package com.adhx.share.main

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.ui.AdhxBrand
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.Spinner
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

private const val FOOTER = "The app only talks to your ADHX."

/** Connect to your ADHX (Pair.dc.html): scan the code, or type the address and code. */
@Composable
fun ConnectScreen(vm: MainViewModel) {
    val context = LocalContext.current
    val ui by vm.connect.collectAsStateWithLifecycle()
    val removed by vm.removedNotice.collectAsStateWithLifecycle()
    var typing by rememberSaveable { mutableStateOf(false) }

    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let(vm::pairFromLink)
    }
    val scanOptions = ScanOptions()
        .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
        .setPrompt("Point the camera at the code on your ADHX")
        .setBeepEnabled(false)
        .setOrientationLocked(false)
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            scanLauncher.launch(scanOptions)
        } else {
            vm.showError("ADHX Share needs the camera to read the code. You can type the address instead.")
        }
    }
    val startScan = {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) scanLauncher.launch(scanOptions) else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    if (typing) BackHandler { typing = false }

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .systemBarsPadding()
            .imePadding()
            .padding(horizontal = 24.dp, vertical = 16.dp),
    ) {
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(top = 24.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            AdhxBrand(markSize = 34.dp)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Connect to your ADHX", style = MaterialTheme.typography.displaySmall, color = AdhxColors.White)
                Text(
                    if (typing) {
                        "On your computer, open your ADHX and go to Settings → Phone app. Type its address and the code under the QR code."
                    } else {
                        "On your computer, open your ADHX, go to Settings → Phone app and point the camera at the code."
                    },
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    color = AdhxColors.Muted,
                )
            }
            if (removed && ui.error == null && !ui.busy) {
                Text(
                    "This phone was removed from your ADHX. Connect it again.",
                    fontSize = 14.sp,
                    color = AdhxColors.Warn,
                )
            }
            if (typing) {
                TypeForm(vm, busy = ui.busy)
            } else {
                ScanPanel(onClick = startScan, busy = ui.busy)
            }
            StatusLine(busy = ui.busy, error = ui.error)
        }

        Column(
            Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlineButton(
                if (typing) "Scan the code instead" else "Type the address instead",
                onClick = { typing = !typing },
                minHeight = 48.dp,
            )
            Text(FOOTER, fontSize = 12.sp, color = AdhxColors.Faint, textAlign = TextAlign.Center)
        }
    }
}

/** The camera box from the design: yellow corners and a button that opens the scanner. */
@Composable
private fun ScanPanel(onClick: () -> Unit, busy: Boolean) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(340.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(AdhxColors.Surface)
            .clickable(enabled = !busy, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Corners()
        PrimaryButton("Scan the code", onClick = onClick, enabled = !busy)
    }
}

@Composable
private fun Corners() {
    Canvas(Modifier.size(200.dp)) {
        val arm = 44.dp.toPx()
        val radius = 16.dp.toPx()
        val stroke = 4.dp.toPx()
        val inset = stroke / 2
        val path = Path().apply {
            moveTo(inset, arm)
            lineTo(inset, inset + radius)
            cubicTo(inset, inset + radius * 0.45f, inset + radius * 0.45f, inset, inset + radius, inset)
            lineTo(arm, inset)
        }
        for (turn in 0 until 4) {
            rotate(degrees = 90f * turn, pivot = Offset(size.width / 2, size.height / 2)) {
                drawPath(path, color = AdhxColors.Accent, style = Stroke(width = stroke, cap = StrokeCap.Butt))
            }
        }
    }
}

@Composable
private fun TypeForm(vm: MainViewModel, busy: Boolean) {
    var address by rememberSaveable { mutableStateOf(vm.lastServer() ?: "") }
    var code by rememberSaveable { mutableStateOf("") }
    val codeReady = code.count { it.isLetterOrDigit() } == 8
    val submit = { if (!busy && address.isNotBlank() && codeReady) vm.pair(address, code) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = AdhxColors.White,
        unfocusedTextColor = AdhxColors.White,
        focusedContainerColor = AdhxColors.Surface,
        unfocusedContainerColor = AdhxColors.Surface,
        focusedBorderColor = AdhxColors.Accent,
        unfocusedBorderColor = AdhxColors.Hairline,
        focusedLabelColor = AdhxColors.Accent,
        unfocusedLabelColor = AdhxColors.Muted,
        focusedPlaceholderColor = AdhxColors.Faint,
        unfocusedPlaceholderColor = AdhxColors.Faint,
        cursorColor = AdhxColors.Accent,
    )

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        OutlinedTextField(
            value = address,
            onValueChange = { address = it.trim() },
            label = { Text("Your ADHX address") },
            placeholder = { Text("adhx.example.com") },
            singleLine = true,
            enabled = !busy,
            shape = RoundedCornerShape(16.dp),
            colors = fieldColors,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = code,
            onValueChange = { input ->
                code = input.uppercase().filter { it.isLetterOrDigit() || it == '-' || it == ' ' }.take(11)
            },
            label = { Text("Code") },
            placeholder = { Text("ABCD-EFGH") },
            singleLine = true,
            enabled = !busy,
            shape = RoundedCornerShape(16.dp),
            colors = fieldColors,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                keyboardType = KeyboardType.Ascii,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            modifier = Modifier.fillMaxWidth(),
        )
        PrimaryButton(
            "Connect",
            onClick = { submit() },
            enabled = !busy && address.isNotBlank() && codeReady,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun StatusLine(busy: Boolean, error: String?) {
    when {
        busy -> Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spinner()
            Box(Modifier.width(10.dp))
            Text("Connecting…", fontSize = 14.sp, color = AdhxColors.Muted)
        }
        error != null -> Text(
            error,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = AdhxColors.Warn,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
