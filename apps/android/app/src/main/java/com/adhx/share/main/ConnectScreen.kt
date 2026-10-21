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
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
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
import kotlinx.coroutines.delay

private const val FOOTER = "The app only talks to your ADHX."

/** The ways in: an emailed code, or a pairing code from your ADHX (scanned or typed). */
private enum class ConnectMode { Email, Scan, Type }

/**
 * Connect to your ADHX (Pair.dc.html): sign in with email (a 6-digit code,
 * no website needed), or the other way in, the pairing code from Settings →
 * Phone app on your ADHX, scanned or typed.
 */
@Composable
fun ConnectScreen(vm: MainViewModel) {
    val context = LocalContext.current
    val ui by vm.connect.collectAsStateWithLifecycle()
    val email by vm.email.collectAsStateWithLifecycle()
    val removed by vm.removedNotice.collectAsStateWithLifecycle()
    val storageError by vm.storageError.collectAsStateWithLifecycle()
    var modeName by rememberSaveable { mutableStateOf(ConnectMode.Email.name) }
    val mode = ConnectMode.valueOf(modeName)
    val typing = mode == ConnectMode.Type

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

    // Back goes from the code to the email, then from a pairing way back to email.
    BackHandler(enabled = mode != ConnectMode.Email || email.step == SignInStep.Code) {
        if (mode == ConnectMode.Email) vm.emailBack() else modeName = ConnectMode.Email.name
    }

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
                    when (mode) {
                        ConnectMode.Email -> if (email.step == SignInStep.Code) EmailSignIn.sentTo(email.email) else EmailSignIn.INTRO
                        ConnectMode.Type -> "The other way in: on your computer, open your ADHX and go to Settings → Phone app. Type its address and the code under the QR code."
                        ConnectMode.Scan -> "The other way in: on your computer, open your ADHX, go to Settings → Phone app and point the camera at the code."
                    },
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    color = AdhxColors.Muted,
                )
            }
            if (removed && ui.error == null && !ui.busy && email.error == null && !email.busy) {
                Text(
                    "This phone was removed from your ADHX. Connect it again.",
                    fontSize = 14.sp,
                    color = AdhxColors.Warn,
                )
            }
            when (mode) {
                ConnectMode.Email -> {
                    if (email.step == SignInStep.Code) CodeForm(vm, email) else EmailForm(vm, email)
                    StatusLine(
                        busy = email.busy,
                        error = email.error ?: ui.error ?: storageError,
                        label = if (email.step == SignInStep.Code) EmailSignIn.SIGNING_IN else EmailSignIn.SENDING,
                    )
                }
                ConnectMode.Type -> {
                    TypeForm(vm, busy = ui.busy)
                    StatusLine(busy = ui.busy, error = ui.error ?: storageError)
                }
                ConnectMode.Scan -> {
                    ScanPanel(onClick = startScan, busy = ui.busy)
                    StatusLine(busy = ui.busy, error = ui.error ?: storageError)
                }
            }
        }

        Column(
            Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // The other ways in.
            when (mode) {
                ConnectMode.Email -> OutlineButton(
                    "Use a pairing code instead",
                    onClick = { modeName = ConnectMode.Scan.name },
                    minHeight = 48.dp,
                )
                ConnectMode.Scan, ConnectMode.Type -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlineButton(
                        EmailSignIn.TITLE,
                        onClick = { modeName = ConnectMode.Email.name },
                        minHeight = 48.dp,
                        modifier = Modifier.weight(1f),
                    )
                    OutlineButton(
                        if (typing) "Scan instead" else "Type the code",
                        onClick = { modeName = if (typing) ConnectMode.Scan.name else ConnectMode.Type.name },
                        minHeight = 48.dp,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
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

/** Sign in with email, first step: your ADHX's address and your email. */
@Composable
private fun EmailForm(vm: MainViewModel, ui: EmailSignInUi) {
    var address by rememberSaveable { mutableStateOf(ui.server ?: vm.lastServer() ?: "") }
    var email by rememberSaveable { mutableStateOf(ui.email) }
    val ready = address.isNotBlank() && EmailSignIn.cleanEmail(email) != null
    val submit = { if (!ui.busy && ready) vm.sendEmailCode(address, email) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        OutlinedTextField(
            value = address,
            onValueChange = { address = it.trim() },
            label = { Text("Your ADHX address") },
            placeholder = { Text("adhx.example.com") },
            singleLine = true,
            enabled = !ui.busy,
            shape = RoundedCornerShape(16.dp),
            colors = fieldColors(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = email,
            onValueChange = { email = it.trim() },
            label = { Text("Your email") },
            placeholder = { Text("you@example.com") },
            singleLine = true,
            enabled = !ui.busy,
            shape = RoundedCornerShape(16.dp),
            colors = fieldColors(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { submit() }),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentType = ContentType.EmailAddress },
        )
        PrimaryButton(
            EmailSignIn.SEND,
            onClick = { submit() },
            enabled = !ui.busy && ready,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Sign in with email, second step: the 6-digit code (the keyboard can fill it in from the email). */
@Composable
private fun CodeForm(vm: MainViewModel, ui: EmailSignInUi) {
    var code by rememberSaveable(ui.sentAt) { mutableStateOf("") }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    val wait = EmailSignIn.resendIn(ui.sentAt, now)
    LaunchedEffect(ui.sentAt) {
        while (EmailSignIn.resendIn(ui.sentAt, System.currentTimeMillis()) > 0) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
        now = System.currentTimeMillis()
    }
    val focus = remember { FocusRequester() }
    LaunchedEffect(ui.sentAt) { runCatching { focus.requestFocus() } }
    // A wrong code: clear it and keep the keyboard up for the next try.
    LaunchedEffect(ui.error, ui.busy) {
        if (ui.error != null && !ui.busy) {
            code = ""
            runCatching { focus.requestFocus() }
        }
    }
    val submit = { if (!ui.busy && EmailSignIn.codeReady(code)) vm.verifyEmailCode(code) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(EmailSignIn.CHECK, fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White)
        OutlinedTextField(
            value = code,
            onValueChange = { input ->
                code = EmailSignIn.cleanCode(input)
                // Six digits in (typed, pasted or filled in): sign in straight away.
                if (EmailSignIn.codeReady(code) && !ui.busy) vm.verifyEmailCode(code)
            },
            label = { Text("6-digit code") },
            placeholder = { Text("123456") },
            singleLine = true,
            // Read-only rather than disabled while checking, so the field keeps the keyboard.
            readOnly = ui.busy,
            shape = RoundedCornerShape(16.dp),
            colors = fieldColors(),
            textStyle = LocalTextStyle.current.copy(fontSize = 24.sp, letterSpacing = 6.sp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus)
                .semantics { contentType = ContentType.SmsOtpCode },
        )
        PrimaryButton(
            EmailSignIn.SIGN_IN,
            onClick = { submit() },
            enabled = !ui.busy && EmailSignIn.codeReady(code),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlineButton(
                EmailSignIn.resendLabel(wait),
                onClick = { vm.resendEmailCode() },
                enabled = wait == 0 && !ui.busy,
                minHeight = 44.dp,
                modifier = Modifier.weight(1f),
            )
            OutlineButton(
                EmailSignIn.OTHER_EMAIL,
                onClick = { vm.emailBack() },
                enabled = !ui.busy,
                minHeight = 44.dp,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
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

@Composable
private fun StatusLine(busy: Boolean, error: String?, label: String = "Connecting…") {
    when {
        busy -> Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spinner()
            Box(Modifier.width(10.dp))
            Text(label, fontSize = 14.sp, color = AdhxColors.Muted)
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
